# -*- coding: utf-8 -*-
"""
chunk.py - 호반 JHA PoC 청킹 스크립트 (data-engineer / Phase 2 Foundation)

입력 : _workspace/02_foundation/data_cleaned.parquet (없으면 .csv)
출력 : _workspace/02_foundation/chunks.jsonl  (행 단위 청크: text + 전체 메타데이터)

청크 포맷 (jha-data-prep SKILL 단계 4 — 행 단위, 메타데이터 inline):
  [대공종: {major} / 중공종: {sub} / 세부항목: {detail} / 재해형태: {accident}]
  [등급: {grade} (강도 {sev} × 빈도 {freq}) / 중점등록: {critical}]
  위험요인:
  {hazard}
  개선대책:
  {controls}

  - chunk_id   : R{source_row:05d}
  - content_hash: SHA-256(text)
  - 중복 청크(content_hash 동일) 첫 번째만 유지, 나머지 dup_content_of 기록

재현: python _workspace/04_build/scripts/etl/chunk.py  (clean.py 선행 필요)
"""
import io
import os
import sys
import json
import hashlib

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
OUT_DIR = os.path.join(ROOT, "_workspace", "02_foundation")
PARQUET = os.path.join(OUT_DIR, "data_cleaned.parquet")
CSV = os.path.join(OUT_DIR, "data_cleaned.csv")
CHUNKS = os.path.join(OUT_DIR, "chunks.jsonl")

# 외부 LLM 화이트리스트 (data_security_policy.md 와 동기) — 청크 text 에 들어가는 필드만 의미 보존
WHITELIST_FIELDS = {
    "major_type", "sub_type", "detail_item", "accident_type",
    "severity", "frequency", "risk_grade", "critical_register",
    "hazard_text", "controls",
}


def sha256(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def build_text(rec):
    return (
        f"[대공종: {rec['major_type']} / 중공종: {rec['sub_type']} / "
        f"세부항목: {rec['detail_item']} / 재해형태: {rec['accident_type']}]\n"
        f"[등급: {rec['risk_grade']} (강도 {rec['severity']} × 빈도 {rec['frequency']}) / "
        f"중점등록: {rec['critical_register']}]\n"
        f"위험요인:\n{rec['hazard_text']}\n"
        f"개선대책:\n{rec['controls']}"
    )


def load_rows():
    try:
        import pandas as pd
        if os.path.exists(PARQUET):
            df = pd.read_parquet(PARQUET, engine="pyarrow")
            src = PARQUET
        else:
            df = pd.read_csv(CSV, encoding="utf-8-sig")
            src = CSV
        recs = df.to_dict(orient="records")
        # JSON 문자열로 저장된 list 컬럼 복원
        for r in recs:
            for k in ("hazard_items", "controls_items"):
                if isinstance(r.get(k), str):
                    try:
                        r[k] = json.loads(r[k])
                    except Exception:
                        r[k] = []
        return recs, src
    except Exception as e:
        raise SystemExit(f"[FATAL] data_cleaned 로드 실패: {e}. clean.py 를 먼저 실행하세요.")


def main():
    recs, src = load_rows()

    seen_hash = {}      # content_hash -> 최초 chunk_id
    chunks = []
    dup_content = 0

    for rec in recs:
        sr = int(rec["source_row"])
        chunk_id = f"R{sr:05d}"
        text = build_text(rec)
        chash = sha256(text)

        dup_of = ""
        if chash in seen_hash:
            dup_of = seen_hash[chash]
            dup_content += 1
        else:
            seen_hash[chash] = chunk_id

        meta = {
            "chunk_id": chunk_id,
            "content_hash": chash,
            "source_row": sr,
            "major_type_id": rec["major_type_id"],
            "major_type": rec["major_type"],
            "sub_type_id": rec["sub_type_id"],
            "sub_type": rec["sub_type"],
            "detail_item_id": rec["detail_item_id"],
            "detail_item": rec["detail_item"],
            "accident_type": rec["accident_type"],
            "severity": int(rec["severity"]),
            "frequency": int(rec["frequency"]),
            "risk_product": int(rec["risk_product"]),
            "risk_grade": rec["risk_grade"],
            "expected_grade": rec["expected_grade"],
            "grade_inconsistent": bool(rec["grade_inconsistent"]),
            "critical_register": rec["critical_register"],
            "hazard_text": rec["hazard_text"],
            "hazard_items": rec.get("hazard_items", []),
            "controls": rec["controls"],
            "controls_items": rec.get("controls_items", []),
            "legal_refs": [],  # safety-domain-expert 법령 매핑 연동 시 채움 (Phase 후속)
            "dup_group": rec.get("dup_group", "") or "",
            "dup_content_of": dup_of,
            "last_modified": "2026-05-18T00:00:00+09:00",  # 원본 파일 기준일
        }

        chunks.append({"chunk_id": chunk_id, "text": text, "metadata": meta})

    with open(CHUNKS, "w", encoding="utf-8") as fh:
        for c in chunks:
            fh.write(json.dumps(c, ensure_ascii=False) + "\n")

    # 검증
    assert all("source_row" in c["metadata"] for c in chunks), "source_row 누락 청크 존재"

    print("=== CHUNK SUMMARY ===")
    print(f"source              = {src}")
    print(f"input_rows          = {len(recs)}")
    print(f"chunks_written      = {len(chunks)}")
    print(f"unique_content_hash = {len(seen_hash)}")
    print(f"dup_content(flagged)= {dup_content}")
    print(f"all_have_source_row = {all('source_row' in c['metadata'] for c in chunks)}")
    print(f"sample chunk_id     = {chunks[0]['chunk_id']} .. {chunks[-1]['chunk_id']}")
    print(f"output              = {CHUNKS}")
    print(f"whitelist_fields    = {sorted(WHITELIST_FIELDS)}")


if __name__ == "__main__":
    main()
