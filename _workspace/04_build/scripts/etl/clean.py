# -*- coding: utf-8 -*-
"""
clean.py - 호반 JHA PoC 데이터 정제 스크립트 (data-engineer / Phase 2 Foundation)

입력 : _workspace/00_input/전사 하위공종 위험요인_20260518.xlsx (Sheet1, 헤더 1행, A열 빈 컬럼)
출력 :
  - _workspace/02_foundation/data_cleaned.parquet  (pyarrow; 실패 시 .csv 대체)
  - _workspace/02_foundation/taxonomy_lookup/{major,sub,detail}.csv
  - _workspace/02_foundation/data_quarantine.jsonl  (격리 행; 정상 시 빈 파일)

정제 규칙 (data_profile.md §12 + safety_scope.md 확정사항 반영):
  A. 텍스트 정규화 (위험요인·개선대책)
     1) 선행 불릿 제거  ^\\s*[-·•▪]\\s*
     2) 다중 공백 단일화  "  +" -> " "
     3) 셀 내 복수 항목 분리 " - " 구분 -> 리스트(items) + "·" 결합 표시(text_norm)
     4) 비표준 공백(NBSP/전각) -> 일반 공백
     5) 양끝 trim
  B. 분류 ID 부여  대공종 MJ### / 중공종 SB### / 세부항목 DT####  (정렬 안정 ID)
  C. 코드값 검증   강도/빈도 1~5 / 등급 상중하 / 중점등록 O/X. 위반 행 격리.
  D. 정합성 처리   등급 임계곱(하<=9 / 중10~15 / 상>=16) 모순 -> grade_inconsistent=true 플래그(보정 금지)
  E. 중복 처리     트리플(중공종,세부항목,위험요인) 중복 -> dup_group ID 부여(유지)
                  완전중복(전 컬럼 동일) -> 첫 행만 dup_full_master=true, 나머지 dup_full_dropped 기록

원본 보존: 원본 xlsx는 절대 수정하지 않음. 본 스크립트는 읽기 전용으로만 접근.
재현: python _workspace/04_build/scripts/etl/clean.py
"""
import io
import os
import re
import sys
import json
import hashlib
from collections import Counter, defaultdict, OrderedDict

# Windows UTF-8 stdout
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import openpyxl

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
# 기본 입력은 원본 파일. sync.py 등 ETL 호출 시 env JHA_INPUT_XLSX 로 새 입력 교체 가능
# (원본 보존 원칙 유지: 본 스크립트는 입력을 읽기 전용으로만 접근).
INPUT = os.environ.get(
    "JHA_INPUT_XLSX",
    os.path.join(ROOT, "_workspace", "00_input", "전사 하위공종 위험요인_20260518.xlsx"),
)
OUT_DIR = os.path.join(ROOT, "_workspace", "02_foundation")
TAX_DIR = os.path.join(OUT_DIR, "taxonomy_lookup")
QUAR = os.path.join(OUT_DIR, "data_quarantine.jsonl")

# A열은 빈 컬럼 -> 1~10이 데이터 (profile.py 와 동일 규약)
COLS = {
    "major": 1, "sub": 2, "detail": 3, "hazard": 4, "accident": 5,
    "severity": 6, "frequency": 7, "grade": 8, "critical": 9, "controls": 10,
}
VALID_GRADE = {"상", "중", "하"}
VALID_CRITICAL = {"O", "X"}

# safety_scope.md §3.4 확정 등급 임계곱 (실데이터 역산 기준)
#   하: 곱 <= 9 / 중: 10~15 / 상: >= 16
def expected_grade(prod):
    if prod >= 16:
        return "상"
    if prod >= 10:
        return "중"
    return "하"


def is_blank(v):
    return v is None or (isinstance(v, str) and v.strip() == "")


def to_int_or_none(v):
    if v is None:
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v) if v == int(v) else None
    s = str(v).strip()
    if re.fullmatch(r"-?\d+", s):
        return int(s)
    return None


# ---- 텍스트 정규화 ----
LEAD_BULLET = re.compile(r"^\s*[-·•▪○●*]\s*")
MULTI_SPACE = re.compile(r"[ \t]{2,}")
SPLIT_SEP = re.compile(r"\s+-\s+")  # 셀 내 복수 항목 구분자 " - "


def norm_space(s):
    # 비표준 공백 -> 일반 공백
    s = s.replace(" ", " ").replace("　", " ")
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    return s


def clean_text(raw):
    """
    반환: (text_norm, items)
      items   : 셀 내 복수 항목 리스트 (각 항목 불릿제거·공백정리·trim)
      text_norm: items 를 "·" 로 결합한 정규화 표시 문자열
    """
    if is_blank(raw):
        return "", []
    s = norm_space(str(raw)).strip()
    # 줄바꿈도 항목 구분으로 흡수
    s = s.replace("\n", " - ")
    # 선두 불릿 1회 제거 후 " - " 분리
    s = LEAD_BULLET.sub("", s)
    parts = SPLIT_SEP.split(s)
    items = []
    for p in parts:
        p = LEAD_BULLET.sub("", p)
        p = MULTI_SPACE.sub(" ", p).strip()
        if p:
            items.append(p)
    text_norm = " · ".join(items)
    return text_norm, items


def sha256(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(TAX_DIR, exist_ok=True)

    wb = openpyxl.load_workbook(INPUT, read_only=True, data_only=True)
    ws = wb["Sheet1"]

    raw_rows = []
    for ridx, r in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        rec = {k: (r[idx] if idx < len(r) else None) for k, idx in COLS.items()}
        rec["_row"] = ridx
        raw_rows.append(rec)
    wb.close()

    quarantine = []

    # ---------- B. 분류 ID 부여 (등장 순서 안정 ID) ----------
    major_order, sub_order, detail_order = OrderedDict(), OrderedDict(), OrderedDict()
    # 소속관계 추적: sub -> major, detail -> (major, sub)
    sub_parent = {}
    detail_parent = {}
    major_rowcount = Counter()
    sub_rowcount = Counter()
    detail_rowcount = Counter()

    for rec in raw_rows:
        mj = str(rec["major"]).strip() if not is_blank(rec["major"]) else "[미분류]"
        sb = str(rec["sub"]).strip() if not is_blank(rec["sub"]) else "[미분류]"
        dt = str(rec["detail"]).strip() if not is_blank(rec["detail"]) else "[미분류]"
        if mj not in major_order:
            major_order[mj] = f"MJ{len(major_order)+1:03d}"
        # 중공종/세부항목은 (상위, 명칭) 복합 키로 고유화 (동명 세부항목이 다른 공종에 존재)
        sb_key = (mj, sb)
        if sb_key not in sub_order:
            sub_order[sb_key] = f"SB{len(sub_order)+1:03d}"
            sub_parent[sb_key] = mj
        dt_key = (mj, sb, dt)
        if dt_key not in detail_order:
            detail_order[dt_key] = f"DT{len(detail_order)+1:04d}"
            detail_parent[dt_key] = (mj, sb)
        major_rowcount[mj] += 1
        sub_rowcount[sb_key] += 1
        detail_rowcount[dt_key] += 1

    # ---------- E. 중복 처리: 트리플 + 완전중복 그룹핑 ----------
    triple_groups = defaultdict(list)  # (sub,detail,hazard) -> [row_idx_in_list]
    for i, rec in enumerate(raw_rows):
        key = (
            str(rec["sub"]).strip() if not is_blank(rec["sub"]) else "",
            str(rec["detail"]).strip() if not is_blank(rec["detail"]) else "",
            str(rec["hazard"]).strip() if not is_blank(rec["hazard"]) else "",
        )
        triple_groups[key].append(i)
    # dup_group ID 부여 (2개 이상만)
    dup_group_id = {}      # list_index -> DG###
    dgc = 0
    for key, idxs in triple_groups.items():
        if len(idxs) > 1:
            dgc += 1
            gid = f"DG{dgc:03d}"
            for i in idxs:
                dup_group_id[i] = gid

    # 완전중복(10개 컬럼 전체 동일) 그룹
    full_groups = defaultdict(list)
    for i, rec in enumerate(raw_rows):
        fkey = tuple(str(rec[k]).strip() if not is_blank(rec[k]) else "" for k in COLS)
        full_groups[fkey].append(i)
    full_master = {}   # list_index -> bool(첫행)
    full_dropped = {}  # list_index -> master source_row
    for fkey, idxs in full_groups.items():
        if len(idxs) > 1:
            master_i = idxs[0]
            for j, i in enumerate(idxs):
                full_master[i] = (j == 0)
                if j > 0:
                    full_dropped[i] = raw_rows[master_i]["_row"]

    # ---------- 행 단위 정제 ----------
    cleaned = []
    grade_inconsistent_count = 0
    for i, rec in enumerate(raw_rows):
        row = rec["_row"]

        mj = str(rec["major"]).strip() if not is_blank(rec["major"]) else "[미분류]"
        sb = str(rec["sub"]).strip() if not is_blank(rec["sub"]) else "[미분류]"
        dt = str(rec["detail"]).strip() if not is_blank(rec["detail"]) else "[미분류]"
        sb_key, dt_key = (mj, sb), (mj, sb, dt)

        acc = str(rec["accident"]).strip() if not is_blank(rec["accident"]) else ""
        sev = to_int_or_none(rec["severity"])
        freq = to_int_or_none(rec["frequency"])
        grade = str(rec["grade"]).strip() if not is_blank(rec["grade"]) else ""
        crit = str(rec["critical"]).strip() if not is_blank(rec["critical"]) else ""

        # C. 코드값 검증 -> 위반 시 격리 (임의 보정 금지)
        problems = []
        if sev is None or not (1 <= sev <= 5):
            problems.append(f"severity={rec['severity']!r}")
        if freq is None or not (1 <= freq <= 5):
            problems.append(f"frequency={rec['frequency']!r}")
        if grade not in VALID_GRADE:
            problems.append(f"grade={rec['grade']!r}")
        if crit not in VALID_CRITICAL:
            problems.append(f"critical={rec['critical']!r}")
        if mj == "[미분류]" or sb == "[미분류]":
            problems.append("classification_missing")
        if problems:
            quarantine.append({
                "source_row": row, "reason": problems,
                "raw": {k: (None if is_blank(rec[k]) else str(rec[k])) for k in COLS},
            })
            continue  # 격리 행은 cleaned/청크에서 제외

        # A. 텍스트 정규화
        hazard_norm, hazard_items = clean_text(rec["hazard"])
        controls_norm, controls_items = clean_text(rec["controls"])

        # D. 등급 정합성 플래그 (보정 금지, 플래그만)
        prod = sev * freq
        exp = expected_grade(prod)
        grade_inconsistent = (exp != grade)
        if grade_inconsistent:
            grade_inconsistent_count += 1

        out = {
            "source_row": row,
            "major_type_id": major_order[mj],
            "major_type": mj,
            "sub_type_id": sub_order[sb_key],
            "sub_type": sb,
            "detail_item_id": detail_order[dt_key],
            "detail_item": dt,
            "accident_type": acc,
            "severity": sev,
            "frequency": freq,
            "risk_product": prod,
            "risk_grade": grade,
            "expected_grade": exp,
            "grade_inconsistent": grade_inconsistent,
            "critical_register": crit,
            "hazard_text": hazard_norm,
            "hazard_items": hazard_items,
            "controls": controls_norm,
            "controls_items": controls_items,
            "dup_group": dup_group_id.get(i, ""),
            "dup_full_master": full_master.get(i, True),
            "dup_full_of": full_dropped.get(i, ""),
        }
        cleaned.append(out)

    # ---------- 산출물 1: taxonomy_lookup CSV ----------
    import csv
    with open(os.path.join(TAX_DIR, "major.csv"), "w", encoding="utf-8-sig", newline="") as fh:
        wtr = csv.writer(fh)
        wtr.writerow(["major_type_id", "major_type", "row_count"])
        for mj, mid in major_order.items():
            wtr.writerow([mid, mj, major_rowcount[mj]])

    with open(os.path.join(TAX_DIR, "sub.csv"), "w", encoding="utf-8-sig", newline="") as fh:
        wtr = csv.writer(fh)
        wtr.writerow(["sub_type_id", "sub_type", "major_type_id", "major_type", "row_count"])
        for (mj, sb), sid in sub_order.items():
            wtr.writerow([sid, sb, major_order[mj], mj, sub_rowcount[(mj, sb)]])

    with open(os.path.join(TAX_DIR, "detail.csv"), "w", encoding="utf-8-sig", newline="") as fh:
        wtr = csv.writer(fh)
        wtr.writerow(["detail_item_id", "detail_item", "sub_type_id", "sub_type",
                      "major_type_id", "major_type", "row_count"])
        for (mj, sb, dt), did in detail_order.items():
            wtr.writerow([did, dt, sub_order[(mj, sb)], sb, major_order[mj], mj,
                          detail_rowcount[(mj, sb, dt)]])

    # ---------- 산출물 2: data_quarantine.jsonl ----------
    with open(QUAR, "w", encoding="utf-8") as fh:
        for q in quarantine:
            fh.write(json.dumps(q, ensure_ascii=False) + "\n")

    # ---------- 산출물 3: data_cleaned.parquet (실패 시 csv) ----------
    out_path = None
    fmt = None
    try:
        import pandas as pd
        df = pd.DataFrame(cleaned)
        # list 컬럼은 parquet 직렬화 위해 JSON 문자열로 보관 (재현 가능)
        df["hazard_items"] = df["hazard_items"].map(lambda x: json.dumps(x, ensure_ascii=False))
        df["controls_items"] = df["controls_items"].map(lambda x: json.dumps(x, ensure_ascii=False))
        out_path = os.path.join(OUT_DIR, "data_cleaned.parquet")
        df.to_parquet(out_path, engine="pyarrow", index=False)
        fmt = "parquet"
    except Exception as e:
        print(f"[WARN] parquet 저장 실패 ({e}); CSV로 대체")
        try:
            import pandas as pd
            df = pd.DataFrame(cleaned)
            df["hazard_items"] = df["hazard_items"].map(lambda x: json.dumps(x, ensure_ascii=False))
            df["controls_items"] = df["controls_items"].map(lambda x: json.dumps(x, ensure_ascii=False))
            out_path = os.path.join(OUT_DIR, "data_cleaned.csv")
            df.to_csv(out_path, index=False, encoding="utf-8-sig")
            fmt = "csv (parquet 실패 대체)"
        except Exception as e2:
            # pandas 자체 부재 시 순수 csv 기록
            out_path = os.path.join(OUT_DIR, "data_cleaned.csv")
            keys = list(cleaned[0].keys())
            with open(out_path, "w", encoding="utf-8-sig", newline="") as fh:
                wtr = csv.DictWriter(fh, fieldnames=keys)
                wtr.writeheader()
                for c in cleaned:
                    cc = dict(c)
                    cc["hazard_items"] = json.dumps(cc["hazard_items"], ensure_ascii=False)
                    cc["controls_items"] = json.dumps(cc["controls_items"], ensure_ascii=False)
                    wtr.writerow(cc)
            fmt = f"csv (pandas 부재: {e2})"

    # ---------- 콘솔 요약 ----------
    print("=== CLEAN SUMMARY ===")
    print(f"raw_rows            = {len(raw_rows)}")
    print(f"cleaned_rows        = {len(cleaned)}")
    print(f"quarantined_rows    = {len(quarantine)}")
    print(f"major/sub/detail    = {len(major_order)}/{len(sub_order)}/{len(detail_order)}")
    print(f"dup_groups(triple)  = {dgc}  (rows tagged = {sum(1 for v in dup_group_id)})")
    print(f"full_dup_dropped    = {len(full_dropped)}")
    print(f"grade_inconsistent  = {grade_inconsistent_count}")
    print(f"output              = {out_path}  [{fmt}]")
    print(f"taxonomy            = {TAX_DIR}")
    print(f"quarantine          = {QUAR}")


if __name__ == "__main__":
    main()
