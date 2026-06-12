# -*- coding: utf-8 -*-
"""
ERP 마스터 매핑 CSV 생성기 (erp-integration-engineer, Phase 3)
입력: _workspace/02_foundation/taxonomy_lookup/{major,sub,detail}.csv
출력: _workspace/03_design/erp_mapping/{major_map,sub_map,detail_map}.csv

ERP 코드 체계 (가상 — [검증 필요-가상코드]):
  대공종  : HBC-MJ-### (### = MJ 일련번호, 001~020)
  중공종  : HBC-SB-#### (#### = SB 일련번호, 0001~0254)
  세부항목: HBC-DT-##### (##### = DT 복합키 일련번호, 00001~01430)
  ※ 세부항목은 ERP 코드화 여부 미확정([검증 필요]). PoC는 본 PoC 내부코드로
    가상 ERP 코드를 부여하되 erp_detail_codeable 플래그로 '중공종까지만 등록' 경로를 표기.

매핑 상태(map_status):
  MAPPED        : ERP 코드 확정(가상). PoC 데모/등록 사용 가능.
  UNMAPPED      : ERP 코드 미부여 → 검색 제외 + 등록 보류.
  PENDING_VERIFY: 가상코드 부여했으나 실 ERP 검증 대기(본 PoC 전 행 기본값).
"""
import csv, io, sys, os

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(BASE, "..", "..", "02_foundation", "taxonomy_lookup"))

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

HEADER_NOTE = "# [검증 필요-가상코드] 모든 erp_code 는 실 ERP 코드가 아닌 PoC 가상 코드다. 운영 전환 전 ERP 마스터 추출로 교체 필수."

def read_csv(path):
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))

# ---------- major_map.csv ----------
majors = read_csv(os.path.join(SRC, "major.csv"))
with open(os.path.join(BASE, "major_map.csv"), "w", encoding="utf-8", newline="") as f:
    f.write(HEADER_NOTE + "\n")
    w = csv.writer(f)
    w.writerow(["jha_major_type_id", "erp_major_code", "major_type_norm",
                "row_count", "map_status", "note"])
    for m in majors:
        seq = m["major_type_id"][2:]          # MJ001 -> 001
        erp = f"HBC-MJ-{seq}"
        w.writerow([m["major_type_id"], erp, m["major_type"],
                    m["row_count"], "PENDING_VERIFY", "1:1 수작업 확정 후보(20종)"])
print(f"major_map.csv: {len(majors)} rows")

# ---------- sub_map.csv ----------
subs = read_csv(os.path.join(SRC, "sub.csv"))
with open(os.path.join(BASE, "sub_map.csv"), "w", encoding="utf-8", newline="") as f:
    f.write(HEADER_NOTE + "\n")
    w = csv.writer(f)
    w.writerow(["jha_sub_type_id", "erp_sub_code", "sub_type_norm",
                "jha_major_type_id", "erp_major_code", "major_type_norm",
                "row_count", "map_status", "note"])
    for s in subs:
        seq = s["sub_type_id"][2:]            # SB001 -> 001
        erp = f"HBC-SB-{seq}"
        mj_seq = s["major_type_id"][2:]
        erp_mj = f"HBC-MJ-{mj_seq}"
        w.writerow([s["sub_type_id"], erp, s["sub_type"],
                    s["major_type_id"], erp_mj, s["major_type"],
                    s["row_count"], "PENDING_VERIFY",
                    "표기흔들림 정규화 필요(예: 타워크레인(T형))"])
print(f"sub_map.csv: {len(subs)} rows")

# ---------- detail_map.csv ----------
details = read_csv(os.path.join(SRC, "detail.csv"))
with open(os.path.join(BASE, "detail_map.csv"), "w", encoding="utf-8", newline="") as f:
    f.write(HEADER_NOTE + "\n")
    f.write("# [검증 필요] 세부항목 ERP 코드화 여부 미확정. erp_detail_codeable=N 이면 ERP 등록은 중공종 코드까지만 전송 + 세부는 detail_text 필드로.\n")
    w = csv.writer(f)
    w.writerow(["jha_detail_item_id", "erp_detail_code", "detail_item_norm",
                "jha_sub_type_id", "erp_sub_code", "sub_type_norm",
                "jha_major_type_id", "erp_major_code",
                "row_count", "erp_detail_codeable", "map_status", "note"])
    for d in details:
        seq = d["detail_item_id"][2:]         # DT0001 -> 0001
        erp = f"HBC-DT-{seq}"
        sb_seq = d["sub_type_id"][2:]
        mj_seq = d["major_type_id"][2:]
        w.writerow([d["detail_item_id"], erp, d["detail_item"],
                    d["sub_type_id"], f"HBC-SB-{sb_seq}", d["sub_type"],
                    d["major_type_id"], f"HBC-MJ-{mj_seq}",
                    d["row_count"], "PENDING_VERIFY", "PENDING_VERIFY",
                    "복합키 기반 내부코드. ERP 미코드화 시 중공종까지만 등록"])
print(f"detail_map.csv: {len(details)} rows")
print("DONE")
