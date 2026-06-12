# -*- coding: utf-8 -*-
"""
profile.py - 호반 JHA PoC 데이터 프로파일링 스크립트 (data-engineer / Phase 1 Discovery)

입력 : _workspace/00_input/전사 하위공종 위험요인_20260518.xlsx (Sheet1, 헤더 1행, A열 빈 컬럼)
출력 : _workspace/01_discovery/data_profile.md  (수치 기반 진단 보고서)

진단 항목:
  1. 컬럼별 결측 / 카디널리티
  2. 완전 중복 행
  3. 강도/빈도 1~5 범위 위반 + 비정수
  4. 위험등급 비표준 값 (상/중/하 외)
  5. 중점등록 비표준 값 (O/X 외)
  6. 재해형태 분포
  7. 강도×빈도 곱 vs 등급 정합성 (경계 임계곱 역산 + 모순 행 카운트)
  8. 위험요인/개선대책 텍스트 길이 분포 (min/median/p95/max)
  9. 인코딩/제어문자 이상 (cp949 잔재, 제어문자, 치환문자 U+FFFD 등)
 10. 동일 (중공종, 세부항목, 위험요인) 중복 검사
 11. 텍스트 노이즈 패턴 (선행 불릿, 다중 공백, 줄바꿈)

재현: python _workspace/04_build/scripts/etl/profile.py
"""
import io
import os
import sys
import re
import statistics
import unicodedata
from collections import Counter, defaultdict

# Windows UTF-8 stdout
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import openpyxl

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
INPUT = os.path.join(ROOT, "_workspace", "00_input", "전사 하위공종 위험요인_20260518.xlsx")
OUT = os.path.join(ROOT, "_workspace", "01_discovery", "data_profile.md")

# 데이터 컬럼 정의 (A열은 빈 컬럼 → 인덱스 0 스킵, 1~10이 데이터)
# values_only 튜플 인덱스: 0=빈, 1=대공종, 2=중공종, 3=세부항목, 4=위험요인,
#                          5=재해형태, 6=강도, 7=빈도, 8=위험등급, 9=중점등록, 10=개선대책
COLS = {
    "major": 1, "sub": 2, "detail": 3, "hazard": 4, "accident": 5,
    "severity": 6, "frequency": 7, "grade": 8, "critical": 9, "controls": 10,
}
COL_KR = {
    "major": "대공종", "sub": "중공종", "detail": "세부항목", "hazard": "위험요인",
    "accident": "재해형태", "severity": "강도", "frequency": "빈도",
    "grade": "위험등급", "critical": "중점등록", "controls": "개선대책",
}

VALID_GRADE = {"상", "중", "하"}
VALID_CRITICAL = {"O", "X"}


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


def text_len(v):
    return len(str(v).strip()) if not is_blank(v) else 0


def dist(values):
    if not values:
        return (0, 0, 0, 0)
    vs = sorted(values)
    n = len(vs)
    mn = vs[0]
    md = statistics.median(vs)
    p95 = vs[min(n - 1, int(round(0.95 * (n - 1))))]
    mx = vs[-1]
    return (mn, md, p95, mx)


def has_control_chars(s):
    # 탭/개행 외 제어문자 (cat C/Cc) 탐지
    for ch in s:
        if ch in ("\t", "\n", "\r"):
            continue
        if unicodedata.category(ch).startswith("C"):
            return True
    return False


def main():
    wb = openpyxl.load_workbook(INPUT, read_only=True, data_only=True)
    ws = wb["Sheet1"]

    rows = []  # (excel_row_no, dict)
    raw_iter = ws.iter_rows(min_row=2, values_only=True)
    for ridx, r in enumerate(raw_iter, start=2):
        rec = {k: r[idx] if idx < len(r) else None for k, idx in COLS.items()}
        rec["_row"] = ridx
        rows.append(rec)

    n = len(rows)

    # ---- 1. 결측 / 카디널리티 ----
    missing = {}
    cardinality = {}
    for k in COLS:
        vals = [rec[k] for rec in rows]
        missing[k] = sum(1 for v in vals if is_blank(v))
        cardinality[k] = len(set(str(v).strip() for v in vals if not is_blank(v)))

    # ---- 2. 완전 중복 행 (10개 데이터 컬럼 전체 동일) ----
    full_keys = Counter()
    for rec in rows:
        key = tuple(str(rec[k]).strip() if not is_blank(rec[k]) else "" for k in COLS)
        full_keys[key] += 1
    full_dup_groups = {k: c for k, c in full_keys.items() if c > 1}
    full_dup_extra = sum(c - 1 for c in full_dup_groups.values())

    # ---- 3. 강도/빈도 범위 위반 ----
    sev_bad, freq_bad = [], []
    sev_nonint, freq_nonint = [], []
    for rec in rows:
        s = to_int_or_none(rec["severity"])
        f = to_int_or_none(rec["frequency"])
        if s is None and not is_blank(rec["severity"]):
            sev_nonint.append(rec["_row"])
        elif s is not None and not (1 <= s <= 5):
            sev_bad.append((rec["_row"], s))
        if f is None and not is_blank(rec["frequency"]):
            freq_nonint.append(rec["_row"])
        elif f is not None and not (1 <= f <= 5):
            freq_bad.append((rec["_row"], f))

    # ---- 4. 위험등급 비표준 ----
    grade_counter = Counter()
    grade_bad = []
    for rec in rows:
        g = str(rec["grade"]).strip() if not is_blank(rec["grade"]) else None
        grade_counter[g] += 1
        if g is not None and g not in VALID_GRADE:
            grade_bad.append((rec["_row"], g))

    # ---- 5. 중점등록 비표준 ----
    crit_counter = Counter()
    crit_bad = []
    for rec in rows:
        c = str(rec["critical"]).strip() if not is_blank(rec["critical"]) else None
        crit_counter[c] += 1
        if c is not None and c not in VALID_CRITICAL:
            crit_bad.append((rec["_row"], c))

    # ---- 6. 재해형태 분포 ----
    acc_counter = Counter()
    for rec in rows:
        a = str(rec["accident"]).strip() if not is_blank(rec["accident"]) else "(결측)"
        acc_counter[a] += 1

    # ---- 7. 강도×빈도 곱 vs 등급 정합성 ----
    # 곱(product)별 등급 분포를 집계해 임계곱을 역산
    prod_grade = defaultdict(Counter)  # product -> Counter({grade: n})
    valid_pairs = []
    for rec in rows:
        s = to_int_or_none(rec["severity"])
        f = to_int_or_none(rec["frequency"])
        g = str(rec["grade"]).strip() if not is_blank(rec["grade"]) else None
        if s and f and 1 <= s <= 5 and 1 <= f <= 5 and g in VALID_GRADE:
            p = s * f
            prod_grade[p][g] += 1
            valid_pairs.append((rec["_row"], s, f, p, g))

    # 각 곱값의 다수결 등급(majority) 산정
    majority = {}
    for p in sorted(prod_grade):
        majority[p] = prod_grade[p].most_common(1)[0][0]

    # 임계곱 역산: 곱이 커질수록 등급이 하→중→상으로 단조 증가한다는 가정의 경계
    grade_rank = {"하": 0, "중": 1, "상": 2}
    sorted_p = sorted(majority)
    low_mid_boundary = None  # 하->중 전환 임계곱
    mid_high_boundary = None  # 중->상 전환 임계곱
    prev_rank = None
    for p in sorted_p:
        r = grade_rank[majority[p]]
        if prev_rank is not None:
            if prev_rank == 0 and r >= 1 and low_mid_boundary is None:
                low_mid_boundary = p
            if prev_rank <= 1 and r == 2 and mid_high_boundary is None:
                mid_high_boundary = p
        prev_rank = r

    # 다수결 룰 기준 모순 행 카운트
    contradiction = []
    for (row, s, f, p, g) in valid_pairs:
        if majority.get(p) and majority[p] != g:
            contradiction.append((row, s, f, p, g, majority[p]))

    # ---- 8. 텍스트 길이 분포 ----
    hazard_lens = [text_len(rec["hazard"]) for rec in rows if not is_blank(rec["hazard"])]
    controls_lens = [text_len(rec["controls"]) for rec in rows if not is_blank(rec["controls"])]
    hz_dist = dist(hazard_lens)
    ct_dist = dist(controls_lens)

    # ---- 9. 인코딩/제어문자 이상 ----
    repl_char_rows = []   # U+FFFD 치환문자
    ctrl_rows = []        # 비표준 제어문자
    nbsp_rows = []        # NBSP 등 비표준 공백
    for rec in rows:
        for k in ("hazard", "controls", "major", "sub", "detail", "accident"):
            v = rec[k]
            if is_blank(v):
                continue
            s = str(v)
            if "�" in s:
                repl_char_rows.append((rec["_row"], k))
            if has_control_chars(s):
                ctrl_rows.append((rec["_row"], k))
            if " " in s or "　" in s:
                nbsp_rows.append((rec["_row"], k))

    # ---- 10. (중공종, 세부항목, 위험요인) 중복 ----
    triple = Counter()
    triple_rows = defaultdict(list)
    for rec in rows:
        key = (
            str(rec["sub"]).strip() if not is_blank(rec["sub"]) else "",
            str(rec["detail"]).strip() if not is_blank(rec["detail"]) else "",
            str(rec["hazard"]).strip() if not is_blank(rec["hazard"]) else "",
        )
        triple[key] += 1
        triple_rows[key].append(rec["_row"])
    triple_dups = {k: c for k, c in triple.items() if c > 1}
    triple_dup_extra = sum(c - 1 for c in triple_dups.values())

    # ---- 11. 텍스트 노이즈 패턴 ----
    lead_bullet = 0
    multi_space = 0
    has_newline = 0
    inner_bullet = 0  # 내부 다중 "- " 구분 (한 셀에 여러 항목)
    for rec in rows:
        for k in ("hazard", "controls"):
            v = rec[k]
            if is_blank(v):
                continue
            s = str(v)
            if re.match(r"^\s*[-·•▪]\s", s):
                lead_bullet += 1
            if re.search(r"  +", s):
                multi_space += 1
            if "\n" in s or "\r" in s:
                has_newline += 1
            if len(re.findall(r"\s-\s", s)) >= 1:
                inner_bullet += 1

    # ================= 보고서 작성 =================
    L = []
    w = L.append
    w("# 데이터 진단 보고서 — 전사 하위공종 위험요인")
    w("")
    w("> 작성: data-engineer (Phase 1 · Discovery)  |  생성 스크립트: `_workspace/04_build/scripts/etl/profile.py`")
    w(">")
    w(f"> 입력: `_workspace/00_input/전사 하위공종 위험요인_20260518.xlsx` (Sheet1, 헤더 1행, A열 빈 컬럼)")
    w("")
    w("## 0. 개요")
    w("")
    w(f"- 총 데이터 행: **{n:,}행** (Excel row 2~{n+1})")
    w(f"- 데이터 컬럼: **10개** (A열은 빈 컬럼으로 스킵)")
    w(f"- 시트: 단일 `Sheet1`")
    w("")

    # 1
    w("## 1. 컬럼별 결측 · 카디널리티")
    w("")
    w("| # | 컬럼 | 결측 | 결측률 | 고유값(카디널리티) |")
    w("|---|------|------|--------|--------------------|")
    for i, k in enumerate(COLS, 1):
        mr = missing[k] / n * 100
        w(f"| {i} | {COL_KR[k]} | {missing[k]:,} | {mr:.2f}% | {cardinality[k]:,} |")
    w("")
    w("- 분류 3계층 카디널리티: "
      f"대공종 {cardinality['major']} / 중공종 {cardinality['sub']} / 세부항목 {cardinality['detail']}")
    w(f"- 재해형태 카디널리티: {cardinality['accident']}")
    w("")

    # 2
    w("## 2. 완전 중복 행 (10개 데이터 컬럼 전체 동일)")
    w("")
    w(f"- 중복 그룹 수: **{len(full_dup_groups):,}개**")
    w(f"- 중복으로 제거 가능한 잉여 행: **{full_dup_extra:,}행**")
    if full_dup_groups:
        w("")
        w("샘플 (상위 5개 그룹, 중공종/세부항목/위험요인 일부):")
        w("")
        w("| 반복수 | 중공종 | 세부항목 | 위험요인(앞 30자) |")
        w("|--------|--------|----------|-------------------|")
        for key, c in sorted(full_dup_groups.items(), key=lambda x: -x[1])[:5]:
            sub_v, det_v, haz_v = key[1], key[2], key[3]
            w(f"| {c} | {sub_v[:14]} | {det_v[:14]} | {haz_v[:30]} |")
    w("")

    # 3
    w("## 3. 강도 · 빈도 값 유효성 (1~5 정수)")
    w("")
    w("| 항목 | 비정수/파싱불가 | 범위(1~5) 위반 |")
    w("|------|------------------|-----------------|")
    w(f"| 강도(severity) | {len(sev_nonint)} | {len(sev_bad)} |")
    w(f"| 빈도(frequency) | {len(freq_nonint)} | {len(freq_bad)} |")
    if sev_bad or freq_bad:
        w("")
        w("범위 위반 샘플(최대 10건):")
        for r in (sev_bad + freq_bad)[:10]:
            w(f"  - row {r[0]}: 값={r[1]}")
    w("")

    # 4
    w("## 4. 위험등급 값 분포 / 비표준 값")
    w("")
    w("| 등급 | 행수 |")
    w("|------|------|")
    for g, c in sorted(grade_counter.items(), key=lambda x: -x[1]):
        label = g if g is not None else "(결측)"
        flag = "" if (g in VALID_GRADE or g is None) else " ⚠️비표준"
        w(f"| {label}{flag} | {c:,} |")
    w("")
    w(f"- 비표준 등급 행: **{len(grade_bad)}행** (표준 = 상/중/하)")
    w("")

    # 5
    w("## 5. 중점등록 값 분포 / 비표준 값")
    w("")
    w("| 값 | 행수 |")
    w("|----|------|")
    for c_v, cnt in sorted(crit_counter.items(), key=lambda x: -x[1]):
        label = c_v if c_v is not None else "(결측)"
        flag = "" if (c_v in VALID_CRITICAL or c_v is None) else " ⚠️비표준"
        w(f"| {label}{flag} | {cnt:,} |")
    w("")
    w(f"- 비표준 중점등록 행: **{len(crit_bad)}행** (표준 = O/X)")
    w("")

    # 6
    w("## 6. 재해형태 분포")
    w("")
    w(f"- 고유 재해형태: **{cardinality['accident']}종**")
    w("")
    w("| 재해형태 | 행수 | 비율 |")
    w("|----------|------|------|")
    for a, c in sorted(acc_counter.items(), key=lambda x: -x[1]):
        w(f"| {a} | {c:,} | {c/n*100:.1f}% |")
    w("")

    # 7
    w("## 7. 강도 × 빈도 곱 vs 위험등급 정합성")
    w("")
    w("KRAS 5×5 매트릭스 가정 하에 곱(severity×frequency)별 등급 다수결을 역산하여 임계곱을 추정.")
    w("")
    w("| 곱(S×F) | 하 | 중 | 상 | 다수결 등급 |")
    w("|---------|----|----|----|-------------|")
    for p in sorted(prod_grade):
        cc = prod_grade[p]
        w(f"| {p} | {cc.get('하',0)} | {cc.get('중',0)} | {cc.get('상',0)} | **{majority[p]}** |")
    w("")
    w("**역산된 등급 경계 (다수결 기준):**")
    w("")
    w(f"- 하 → 중 전환 임계곱: **{low_mid_boundary}** (곱 ≥ {low_mid_boundary} 부터 '중' 다수)")
    w(f"- 중 → 상 전환 임계곱: **{mid_high_boundary}** (곱 ≥ {mid_high_boundary} 부터 '상' 다수)")
    w("")
    w(f"- 다수결 룰과 **모순되는 행**: **{len(contradiction):,}행** "
      f"({len(contradiction)/len(valid_pairs)*100:.2f}% of {len(valid_pairs):,} 유효 행)")
    if contradiction:
        w("")
        w("모순 샘플(최대 12건):")
        w("")
        w("| Excel row | 강도 | 빈도 | 곱 | 표기 등급 | 다수결 등급 |")
        w("|-----------|------|------|----|-----------|-------------|")
        for (row, s, f, p, g, mg) in contradiction[:12]:
            w(f"| {row} | {s} | {f} | {p} | {g} | {mg} |")
    w("")

    # 8
    w("## 8. 텍스트 길이 분포 (글자 수)")
    w("")
    w("| 컬럼 | min | median | p95 | max | 비결측 행수 |")
    w("|------|-----|--------|-----|-----|-------------|")
    w(f"| 위험요인 | {hz_dist[0]} | {hz_dist[1]:.0f} | {hz_dist[2]} | {hz_dist[3]} | {len(hazard_lens):,} |")
    w(f"| 개선대책 | {ct_dist[0]} | {ct_dist[1]:.0f} | {ct_dist[2]} | {ct_dist[3]} | {len(controls_lens):,} |")
    w("")
    w(f"- 위험요인 빈(0자) 행: {sum(1 for x in hazard_lens if x==0) + missing['hazard']}")
    w(f"- 개선대책 빈(0자) 행: {sum(1 for x in controls_lens if x==0) + missing['controls']}")
    w("")

    # 9
    w("## 9. 인코딩 · 제어문자 이상")
    w("")
    w("| 이상 유형 | 발생 (컬럼·행 단위) |")
    w("|-----------|---------------------|")
    w(f"| 치환문자 U+FFFD (인코딩 손상 의심) | {len(repl_char_rows)} |")
    w(f"| 비표준 제어문자 (탭/개행 제외) | {len(ctrl_rows)} |")
    w(f"| 비표준 공백 (NBSP/전각공백) | {len(nbsp_rows)} |")
    w("")
    if repl_char_rows:
        w("치환문자 샘플: " + ", ".join(f"row{r[0]}({COL_KR[r[1]]})" for r in repl_char_rows[:8]))
        w("")
    if nbsp_rows:
        w("비표준 공백 샘플: " + ", ".join(f"row{r[0]}({COL_KR[r[1]]})" for r in nbsp_rows[:8]))
        w("")

    # 10
    w("## 10. (중공종, 세부항목, 위험요인) 의미 중복")
    w("")
    w(f"- 중복 트리플 그룹: **{len(triple_dups):,}개**")
    w(f"- 잉여 행: **{triple_dup_extra:,}행**")
    if triple_dups:
        w("")
        w("샘플(상위 5개):")
        w("")
        w("| 반복수 | 중공종 | 세부항목 | 위험요인(앞 30자) | 행번호들 |")
        w("|--------|--------|----------|-------------------|----------|")
        for key, c in sorted(triple_dups.items(), key=lambda x: -x[1])[:5]:
            rws = ",".join(str(x) for x in triple_rows[key][:6])
            w(f"| {c} | {key[0][:12]} | {key[1][:12]} | {key[2][:30]} | {rws} |")
    w("")
    w("> 주: 완전중복(§2)은 개선대책·등급까지 동일한 행. 트리플중복(§10)은 개선대책이 다를 수 있어 "
      "별개 위험요인일 수 있으므로 단순 제거 금지 — 도메인 검토 필요.")
    w("")

    # 11
    w("## 11. 텍스트 노이즈 패턴 (위험요인+개선대책 셀 기준)")
    w("")
    w("| 패턴 | 발생 셀 수 |")
    w("|------|------------|")
    w(f"| 선행 불릿 (`- `, `· `, `• ` 시작) | {lead_bullet:,} |")
    w(f"| 다중 공백 (2칸 이상) | {multi_space:,} |")
    w(f"| 셀 내 줄바꿈 | {has_newline:,} |")
    w(f"| 내부 ` - ` 구분자(복수 항목 한 셀) | {inner_bullet:,} |")
    w("")

    # 12 권고
    w("## 12. 정제 단계 권고 사항 (Phase 2 적용)")
    w("")
    w("아래 규칙을 `scripts/etl/clean.py`로 자동화한다. 수동 편집 금지, 원본 보존.")
    w("")
    w("### A. 텍스트 정규화 (위험요인·개선대책)")
    w(f"1. **선행 불릿 제거** — `^\\s*[-·•▪]\\s*` 패턴 제거 (대상 {lead_bullet:,} 셀). 불릿 유무는 의미 없음.")
    w(f"2. **다중 공백 단일화** — `  +` → ` ` (대상 {multi_space:,} 셀).")
    w("3. **셀 내 복수 항목 분리** — ` - ` 구분자로 분할 후 `·`(중점) 또는 `\\n`으로 정규화. "
      "한 셀에 여러 개선대책/위험요인이 묶인 경우 청크 텍스트에서 가독성·검색 recall 확보 (rag-architect 합의 필요).")
    w(f"4. **비표준 공백 치환** — NBSP(U+00A0)/전각공백(U+3000) → 일반 공백 (대상 {len(nbsp_rows)} 셀).")
    w("5. **양끝 trim** — 모든 텍스트 컬럼 strip.")
    w("")
    w("### B. 분류 정규화")
    w("6. **분류 ID 부여** — 대공종/중공종/세부항목 정규명 → 안정 ID "
      f"(`MJ###`/`SB###`/`DT####`). taxonomy_lookup CSV 3종 생성.")
    w("7. **표기 통일** — 영문 약어/한자 정규형 사전 적용 (safety-domain-expert 동의어 가이드 연동). "
      "예: `T/C`·`T형`·`Tower Crane` → `타워크레인(T형)`.")
    w("")
    w("### C. 코드값 검증·보정")
    w(f"8. **강도/빈도** — 비정수 {len(sev_nonint)+len(freq_nonint)}건 / 범위위반 {len(sev_bad)+len(freq_bad)}건. "
      "→ float 정수화·범위 클램프 금지, 위반 행은 `data_quarantine.jsonl` 격리 후 safety-domain-expert 보고.")
    w(f"9. **위험등급** — 비표준 {len(grade_bad)}건은 `[도메인 검증 필요]` 태그 (임의 보정 금지).")
    w(f"10. **중점등록** — 비표준 {len(crit_bad)}건 동일 처리. 'O'/'X' 외 값은 격리.")
    w("")
    w("### D. 정합성 처리")
    w(f"11. **등급 정합성** — 다수결 룰(하→중 임계곱 {low_mid_boundary}, 중→상 임계곱 {mid_high_boundary}) "
      f"기준 모순 {len(contradiction):,}행에 `risk_grade_check=true` 메타 플래그 부여 + safety-domain-expert에게 "
      "원본값 유지/보정 판단 요청 (KRAS 매트릭스 실제 경계와 대조).")
    w("")
    w("### E. 중복 처리")
    w(f"12. **완전중복** — {full_dup_extra:,}행은 첫 행만 유지, 중복 chunk_id를 메타에 기록(재발추적).")
    w(f"13. **트리플중복** — {triple_dup_extra:,}행은 개선대책 상이 가능 → 자동 제거 금지. "
      "개선대책까지 동일하면 §12와 합류, 다르면 병합(개선대책 `·` 결합) 후보로 safety-domain-expert 검토.")
    w("")
    w("### F. 결측 처리")
    miss_lines = [f"{COL_KR[k]} {missing[k]}" for k in COLS if missing[k] > 0]
    if miss_lines:
        w(f"14. **결측 행** — {', '.join(miss_lines)}. 핵심 컬럼(대/중공종·위험요인) 결측 시 "
          "`[미분류]`/`data_quarantine` 격리, 비핵심 결측은 빈 문자열 표준화.")
    else:
        w("14. **결측 없음** — 모든 데이터 컬럼 결측 0. 결측 처리 불필요.")
    w("")
    w("### G. 인코딩")
    if repl_char_rows:
        w(f"15. **인코딩 손상** — U+FFFD {len(repl_char_rows)}건 발견. 원본 재확인·cp949 재디코딩 시도, "
          "실패 시 `data_quarantine.jsonl` 격리.")
    else:
        w("15. **인코딩 정상** — U+FFFD 치환문자 0건. openpyxl(UTF-8) 정상 디코딩 확인. 추가 변환 불필요.")
    w("")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")

    # 콘솔 요약
    print("=== PROFILE SUMMARY ===")
    print(f"rows={n}")
    print(f"missing(any)={sum(missing.values())}  per-col={missing}")
    print(f"cardinality={cardinality}")
    print(f"full_dup_extra={full_dup_extra}  triple_dup_extra={triple_dup_extra}")
    print(f"sev_bad={len(sev_bad)} sev_nonint={len(sev_nonint)} "
          f"freq_bad={len(freq_bad)} freq_nonint={len(freq_nonint)}")
    print(f"grade_bad={len(grade_bad)} crit_bad={len(crit_bad)}")
    print(f"grade_dist={dict(grade_counter)}")
    print(f"crit_dist={dict(crit_counter)}")
    print(f"accident_types={cardinality['accident']}")
    print(f"low_mid_boundary={low_mid_boundary} mid_high_boundary={mid_high_boundary} "
          f"contradiction={len(contradiction)}/{len(valid_pairs)}")
    print(f"hazard_len(min/med/p95/max)={hz_dist}")
    print(f"controls_len(min/med/p95/max)={ct_dist}")
    print(f"repl_char={len(repl_char_rows)} ctrl={len(ctrl_rows)} nbsp={len(nbsp_rows)}")
    print(f"noise: lead_bullet={lead_bullet} multi_space={multi_space} "
          f"newline={has_newline} inner_bullet={inner_bullet}")
    print(f"\n[OK] report -> {OUT}")


if __name__ == "__main__":
    main()
