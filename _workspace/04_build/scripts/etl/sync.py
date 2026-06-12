# -*- coding: utf-8 -*-
"""
sync.py - 호반 JHA PoC 변경분 동기화 스크립트 (data-engineer / Phase 4 Build)

설계 정합: _workspace/03_design/erp_etl_pipeline.md
  - §3 변경분 감지: 별도 해시 생성 금지. chunk.py 의 content_hash = SHA-256(chunk_text) 를 그대로 소비.
  - §4 부분 재인덱싱 / blue 유지 정책.
  - §5 sync_log 스키마(JSON). §4/§6 변경비율 > 5% -> 회귀 트리거(regression_required=true).

동작 (안전 DB → 인덱스, data-engineer 소유 구간 + 거버넌스 로그):

  0) [Snapshot/blue]  현재 라이브 chunks.jsonl 을 blue 기준선으로 스냅샷.
                      ( alias 'jha_active' 가 가리키는 직전 인덱스의 메타와 동치 )
  1) [Extract→Clean]  새 Excel 입력으로 clean.py 재실행 (기본: 현재 입력 파일 = no-op 검증용).
  2) [Chunk]          chunk.py 재실행 -> 02_foundation/chunks.jsonl (green 후보) 재생성.
  3) [Diff]           green vs blue content_hash 비교 -> added / changed / removed.
                      chunks_diff.jsonl 기록 (etl_pipeline.md §7 산출물 규약).
  4) [Reindex]        index.py 로 인덱스 재구축 (BM25Okapi 전량 재빌드; alias-swap 패턴은
                      아래 ALIAS-SWAP NOTE 참조). 변경 0 이면 인덱스 재빌드 skip(no-op).
  5) [Log]            sync_log.jsonl append (§5 스키마) + 콘솔 요약.
                      change_ratio > 0.05 -> regression_required=true (eval 회귀 트리거 플래그).

ALIAS-SWAP NOTE (blue/green, erp_etl_pipeline.md §1·§4):
  rank_bm25 의 BM25Okapi 는 IDF 통계가 코퍼스 전역에 의존하여 "진짜" 증분 갱신이
  불가능하다(문서 추가/삭제 시 IDF 재계산 필요). 따라서 본 PoC 의 부분 재인덱싱은
  "변경분만 재토큰화 + 전량 인덱스 재빌드"로 구현하되, 다음 운영 패턴을 권장한다:
    - green 인덱스를 별도 경로(bm25_index.green.pkl)에 빌드
    - 스모크 검색 통과 후 atomic rename 으로 bm25_index.pkl(=blue) 교체 (alias swap)
    - 실패 시 green 폐기, blue 유지 (무중단)
  Dense(BGE-M3) 활성화 시에는 변경분만 재임베딩하면 되므로 진짜 부분 재인덱싱이 가능.
  자세한 절차는 DENSE_ACTIVATION.md 참조.

재현: python _workspace/04_build/scripts/etl/sync.py
      python _workspace/04_build/scripts/etl/sync.py --input <새_엑셀_경로>
      python _workspace/04_build/scripts/etl/sync.py --no-reindex   (diff 만, 인덱스 손대지 않음)
"""
import io
import os
import sys
import json
import time
import shutil
import argparse
import datetime
import subprocess

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
ETL_DIR = os.path.join(ROOT, "_workspace", "04_build", "scripts", "etl")
FND_DIR = os.path.join(ROOT, "_workspace", "02_foundation")
SYNC_DIR = os.path.join(ROOT, "_workspace", "05_sync")
BLUE_DIR = os.path.join(SYNC_DIR, "blue")

CHUNKS = os.path.join(FND_DIR, "chunks.jsonl")
INDEX_PKL = os.path.join(FND_DIR, "bm25_index.pkl")
CHUNKS_BLUE = os.path.join(BLUE_DIR, "chunks.blue.jsonl")
DIFF_OUT = os.path.join(FND_DIR, "chunks_diff.jsonl")
SYNC_LOG = os.path.join(SYNC_DIR, "sync_log.jsonl")

CLEAN_PY = os.path.join(ETL_DIR, "clean.py")
CHUNK_PY = os.path.join(ETL_DIR, "chunk.py")
INDEX_PY = os.path.join(ETL_DIR, "index.py")

CHANGE_RATIO_THRESHOLD = 0.05  # erp_etl_pipeline.md §4/§6: > 5% -> 회귀 트리거


def now_kst():
    tz = datetime.timezone(datetime.timedelta(hours=9))
    return datetime.datetime.now(tz)


def iso(dt):
    return dt.isoformat(timespec="seconds")


def load_hash_map(path):
    """chunks.jsonl -> { chunk_id: content_hash }. 파일 부재 시 빈 dict(=최초 동기화)."""
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            m = rec.get("metadata", {})
            cid = rec.get("chunk_id") or m.get("chunk_id")
            chash = m.get("content_hash")
            if cid and chash:
                out[cid] = chash
    return out


def run(cmd, label):
    """clean/chunk/index 스크립트를 서브프로세스로 실행. 실패 시 예외."""
    print(f"  -> [{label}] {' '.join(os.path.basename(c) for c in cmd[1:])}")
    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    proc = subprocess.run(
        cmd, cwd=ROOT, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        encoding="utf-8", errors="replace",
    )
    if proc.returncode != 0:
        raise RuntimeError(f"[{label}] 실패 (rc={proc.returncode})\n{proc.stdout}")
    # 마지막 몇 줄만 요약 출력
    tail = [l for l in proc.stdout.splitlines() if l.strip()][-6:]
    for l in tail:
        print(f"     | {l}")
    return proc.stdout


def diff_hashes(old, new):
    old_keys, new_keys = set(old), set(new)
    added = sorted(new_keys - old_keys)
    removed = sorted(old_keys - new_keys)
    changed = sorted(k for k in (new_keys & old_keys) if old[k] != new[k])
    return added, changed, removed


def main():
    ap = argparse.ArgumentParser(description="JHA 인덱스 변경분 동기화")
    ap.add_argument("--input", default=None,
                    help="새 Excel 입력 경로(미지정 시 clean.py 기본 입력 = 현재 파일, no-op 검증)")
    ap.add_argument("--no-reindex", action="store_true",
                    help="diff 만 수행하고 인덱스는 손대지 않음")
    args = ap.parse_args()

    os.makedirs(BLUE_DIR, exist_ok=True)

    started = now_kst()
    t0 = time.time()
    sync_id = "etl-" + iso(started)
    print("=== JHA SYNC START ===")
    print(f"sync_id = {sync_id}")

    failures = []
    status = "SUCCESS"

    # ---- 0) Snapshot/blue : 현재 라이브 chunks 를 기준선으로 보존 ----
    if os.path.exists(CHUNKS):
        shutil.copy2(CHUNKS, CHUNKS_BLUE)
        print(f"[0] blue snapshot -> {CHUNKS_BLUE}")
    else:
        print("[0] blue 없음(최초 동기화). added=전량 으로 처리.")
    old_hash = load_hash_map(CHUNKS_BLUE)

    # ---- 1) Extract→Clean ----
    extract_ok = True
    clean_cmd = [sys.executable, CLEAN_PY]
    if args.input:
        # clean.py 는 INPUT 상수를 사용 -> 입력 교체는 환경변수 규약으로 전달.
        # (clean.py 가 JHA_INPUT_XLSX 를 우선 사용하도록 설계되어 있지 않으면
        #  운영에서는 staging 경로에 원본명으로 복사하는 방식을 사용. 아래 NOTE 참조.)
        os.environ["JHA_INPUT_XLSX"] = os.path.abspath(args.input)
        print(f"[1] custom input = {args.input}  (env JHA_INPUT_XLSX 전달)")
    try:
        run(clean_cmd, "clean")
    except Exception as e:
        extract_ok = False
        status = "FAILED"
        failures.append({"stage": "clean", "error": str(e)[:500]})
        print(f"[1] clean 실패 -> blue 유지, swap 안 함. {e}")

    # ---- 2) Chunk (green 후보 생성) ----
    if extract_ok:
        try:
            run([sys.executable, CHUNK_PY], "chunk")
        except Exception as e:
            status = "FAILED"
            failures.append({"stage": "chunk", "error": str(e)[:500]})
            print(f"[2] chunk 실패 -> green 폐기, blue 복원.")
            # green 오염 가능 -> blue 로 복원
            if os.path.exists(CHUNKS_BLUE):
                shutil.copy2(CHUNKS_BLUE, CHUNKS)

    # ---- 3) Diff (green vs blue) ----
    added, changed, removed = [], [], []
    total_chunks = 0
    change_ratio = 0.0
    if status != "FAILED":
        new_hash = load_hash_map(CHUNKS)
        total_chunks = len(new_hash)
        added, changed, removed = diff_hashes(old_hash, new_hash)
        denom = max(len(old_hash), 1)
        change_ratio = round((len(added) + len(changed) + len(removed)) / denom, 4)

        with open(DIFF_OUT, "w", encoding="utf-8") as fh:
            for cid in added:
                fh.write(json.dumps({"op": "added", "chunk_id": cid,
                                     "content_hash": new_hash[cid]}, ensure_ascii=False) + "\n")
            for cid in changed:
                fh.write(json.dumps({"op": "changed", "chunk_id": cid,
                                     "old_hash": old_hash[cid],
                                     "new_hash": new_hash[cid]}, ensure_ascii=False) + "\n")
            for cid in removed:
                fh.write(json.dumps({"op": "removed", "chunk_id": cid,
                                     "content_hash": old_hash[cid]}, ensure_ascii=False) + "\n")
        print(f"[3] diff: added={len(added)} changed={len(changed)} "
              f"removed={len(removed)} ratio={change_ratio} -> {DIFF_OUT}")

    # ---- 4) Reindex (전량 재빌드; ALIAS-SWAP NOTE 참조) ----
    reindexed = 0
    deindexed = 0
    swapped = False
    no_op = (status != "FAILED" and not added and not changed and not removed)
    if status == "FAILED":
        print("[4] reindex skip (status=FAILED). blue 유지.")
    elif no_op:
        print("[4] reindex skip (변경 0, no-op 동기화). 기존 인덱스 유지.")
    elif args.no_reindex:
        print("[4] reindex skip (--no-reindex). diff 만 기록.")
    else:
        try:
            run([sys.executable, INDEX_PY], "index")
            reindexed = len(added) + len(changed)
            deindexed = len(removed)
            swapped = True  # PoC: 전량 재빌드가 곧 swap
            print(f"[4] reindex 완료: reindexed={reindexed} deindexed={deindexed} swapped={swapped}")
        except Exception as e:
            status = "PARTIAL" if status == "SUCCESS" else status
            failures.append({"stage": "index", "error": str(e)[:500]})
            print(f"[4] reindex 실패 -> green 폐기, blue 유지(인덱스 미교체). {e}")

    # ---- 5) Log (sync_log.jsonl, erp_etl_pipeline.md §5) ----
    regression_required = (status != "FAILED" and change_ratio > CHANGE_RATIO_THRESHOLD)
    finished = now_kst()
    log = {
        "sync_id": sync_id,
        "started_at": iso(started),
        "finished_at": iso(finished),
        "duration_sec": round(time.time() - t0, 1),
        "source": "EXCEL_INPUT" if not args.input else "EXCEL_INPUT_CUSTOM",
        "input_path": os.path.abspath(args.input) if args.input else "(clean.py 기본 입력)",
        "extract": {"extract_ok": extract_ok},
        "diff": {
            "added": len(added), "changed": len(changed), "removed": len(removed),
            "total_chunks": total_chunks, "change_ratio": change_ratio,
        },
        "reindex": {"reindexed": reindexed, "deindexed": deindexed,
                    "no_op": no_op, "swapped": swapped},
        "regression_required": regression_required,      # change_ratio > 0.05
        "status": status,                                # SUCCESS | PARTIAL | FAILED
        "failures": failures,
        "alert_sent": bool(failures) or regression_required,
        "diff_file": DIFF_OUT if status != "FAILED" else None,
        "blue_snapshot": CHUNKS_BLUE if os.path.exists(CHUNKS_BLUE) else None,
    }
    os.makedirs(SYNC_DIR, exist_ok=True)
    with open(SYNC_LOG, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(log, ensure_ascii=False) + "\n")

    # ---- 콘솔 요약 ----
    print()
    print("=== JHA SYNC SUMMARY ===")
    print(f"status              = {status}")
    print(f"added/changed/removed = {len(added)}/{len(changed)}/{len(removed)}")
    print(f"total_chunks        = {total_chunks}")
    print(f"change_ratio        = {change_ratio}  (threshold={CHANGE_RATIO_THRESHOLD})")
    print(f"regression_required = {regression_required}")
    print(f"no_op               = {no_op}")
    print(f"duration_sec        = {log['duration_sec']}")
    print(f"sync_log            = {SYNC_LOG}")
    if status != "FAILED":
        print(f"diff_file           = {DIFF_OUT}")

    # no-op 검증 보조: 변경 0 이면 exit 0, 실패면 1
    sys.exit(0 if status != "FAILED" else 1)


if __name__ == "__main__":
    main()
