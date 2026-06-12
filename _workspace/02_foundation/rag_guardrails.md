# RAG Guardrails — 환각 방지·refuse 정책 (Foundation)

> 작성: rag-architect · Phase 2 (Foundation) Wave 2
> 기반: `jha-rag-design` SKILL 가드레일 + safety 확정 명세(refuse 임계·인용의무·경계셀 자동확정 금지).
> 목적: "출처 없이는 답하지 않는다" 원칙을 코드로 강제하는 검증·거절·재생성 규약 SSOT. backend가 구현하는 후처리 가드레일.

---

## 1. 가드레일 위치 (파이프라인 매핑)

```
STAGE 4 검색 게이트 (LLM 호출 전)
  └ G1 검색 0건 → no_match (LLM 미호출)
  └ G2 score 미달 → low_confidence 경고
  └ G3 갭 영역 탐지 → refuse 분기
STAGE 6 LLM 호출
STAGE 7 응답 후처리 (LLM 호출 후)
  └ G4 JSON 스키마 검증 → 1회 재생성
  └ G5 인용 검증(citations ⊆ retrieved) → 1회 재생성 → 거절
  └ G6 인용 의무 검증(필수 조문) → 1회 재생성
  └ G7 등급 재계산·경계셀 자동확정 금지 강제
  └ G8 비작업 입력 사후 차단
```

---

## 2. G1~G3 — 검색단 가드레일 (LLM 호출 전, 비용 절감)

| ID | 조건 | 동작 |
|----|------|------|
| **G1** | 검색 결과 0건 (prefilter 후 후보 없음 포함) | **LLM 호출 안 함**. `result_type="no_match"` + "관련 표준 데이터가 없습니다. 안전관리자에게 문의하십시오." |
| **G2** | BM25: top1 매칭토큰 0개 또는 top1_score < 5.0 (dense: 모든 cosine<0.5) | `result_type="low_confidence"`. LLM 호출하되 응답에 "유사 사례는 있으나 정확 매칭 아님" 경고 + 검색 후보(인용 포함) 표시 |
| **G3** | 입력에 갭 영역 키워드 탐지 | 분기: full refuse 영역(석면)→ LLM 미호출 정형 refuse. partial(밀폐공간 등)→ 호출하되 갭 위험 대책 생성 차단 플래그 전달 |

### G3 갭 영역 정의 (legal_citation_matrix §4)
| 영역 | 키워드(예) | refuse 범위 | 처리 |
|------|----------|:----------:|------|
| 밀폐공간/질식 절차 | 밀폐공간, 맨홀 내부, E/V PIT, 산소결핍, 환기 | partial | 조문 §619~ 표시, 절차 대책 생성 금지, 경고 |
| 화학물질/MSDS | MSDS, 유기용제, 유해화학물질 | partial→대책금지 | 산안법 §110~ 표시, refuse |
| 석면 해체 | 석면, 석면 함유, 슬레이트 해체 | **full** | LLM 미호출. 석면안전관리법·§123 표시, 안내 |
| 작업환경측정 | 작업환경측정 | 대책금지 | §125 표시 |

> 갭 영역이라도 응답 가능한 일반 위험(예: 밀폐공간 작업의 '추락')은 검색 근거가 있으면 인용으로 채운다(partial). 갭 고유 위험(질식 절차)만 차단.

---

## 3. G4 — JSON 스키마 검증

```
LLM 응답 파싱:
  스키마 위반(필수 필드 누락/타입 불일치/enum 위반) 발견
    → 1회 재생성 (스키마 첨부 강조 재호출)
    → 재실패 → raw text 반환 + parse_error=true 플래그 (frontend 안전 표시)
```
- enum 검증: accident_type(21종), risk_grade(상/중/하), result_type(4종).
- 필수: result_type, classification, hazards, critical_register, human_review_flags, source_rows.

---

## 4. G5 — 인용 검증 (핵심: citations ⊆ retrieved)

**"출처 없이는 답하지 않는다"의 코드 강제.**

```
retrieved_ids = {STAGE 5에 주입된 top_k_final 청크의 chunk_id}
for hazard in response.hazards:
    if hazard.citations == [] :
        violation = "인용 누락"
    for cid in hazard.citations:
        if cid not in retrieved_ids:
            violation = "외부(미검색) 인용 = 환각"
처리:
  1차 위반 → "응답에 인용 검증 실패 — 재생성합니다" + 1회 재호출
  재실패  → result_type 거절 + 원본 검색 결과(raw 청크) 만 표시 (LLM 추천 폐기)
```
- `source_rows`는 citations chunk_id → metadata.source_row 역추적으로 **백엔드가 재산출**(LLM 값 신뢰 안 함).
- dedup: 동일 source_row 중복 인용은 정리(`rag_chunking_spec §B3`).

---

## 5. G6 — 인용 의무 검증 (필수 조문)

legal_citation_matrix §1~3의 **필수(MUST)** 영역에서 legal_refs 누락 시:
```
필수 영역 판정:
  - 재해형태 ∈ {추락,낙하,비래,붕괴,감전,협착,화재,폭발,질식} → 해당 §
  - 위험등급=="상" 또는 critical_register=="O" → 산안법 시행규칙 §43
  - 곱16 경계셀 → 상 기준 §43 + 경계셀 주석
누락 시 → 1회 재생성(필수 조문 강조)
  재실패 → 응답 유지하되 human_review_flags 강조 + warnings에 "필수 인용 누락 — 안전관리자 확인" + eval citation recall 차감 신호
```
- 권장(SHOULD) 영역 누락은 무벌점(재생성 안 함).
- 감전: 등급 낮아도 §301~ 필수(부록 감전 등급 역설).

---

## 6. G7 — 등급 재계산·경계셀 자동확정 금지 (강제)

LLM 등급을 신뢰하지 않고 코드가 결정적으로 재계산·검증한다.

```
for hazard in hazards:
    s,f = hazard.severity, hazard.frequency   # 범위 검증 1~5
    prod = s*f
    # 결정적 재계산 (matrix_spec §2.1)
    if prod <= 9:   grade = "하"
    elif prod<=15:  grade = "중"
    else:           grade = "상"
    # 경계셀 자동확정 금지 (matrix_spec §3) — 핵심 강제
    if s==4 and f==4:               # 곱16
        grade = "상"                 # 보수적 기본(고위험 과소평가 회피 R1)
        hazard.boundary_cell = True
        flags.boundary_cell = True
        flags.human_review_required = True
        warnings += "경계 셀(강도4×빈도4) — 안전관리자 확인 필요(자동 확정 불가)"
    hazard.risk_grade = grade        # LLM 값 덮어쓰기(코드 우선)
```

### 경계셀 자동확정 금지 강제 방법 (3중)
1. **등급 산정 단계**: 곱16이면 grade 잠정 '상' + boundary_cell·human_review 플래그 무조건 set(LLM이 끄려 해도 코드가 강제).
2. **중점등록 단계**: 곱16이면 critical_register="O (잠정)" + human_review_required=true (확정 O 아님).
3. **ERP 등록 게이트**: human_review_required=true 레코드는 **안전관리자 확인 전 ERP 등록 차단**(erp-integration 송신). 사람 확인 없이 자동 확정·등록 불가.

> 곱16 외 모든 셀은 결정적 → 자동 확정 가능. eval은 곱16 케이스 상·중 양쪽 부분정답 허용(matrix_spec §3.2-4).

---

## 7. G8 — 비작업 입력 사후 차단

검색단 G3에서 못 거른 비작업 입력(잡담·질문·무관)을 LLM이 result_type="no_match"/"refuse"로 표시하거나, 분류 confidence가 비정상(전 hazard 인용 0건)일 때 거절 확정.

---

## 8. 재생성 정책 요약 (1회 한정)

| 가드레일 | 재생성 | 재실패 시 |
|---------|:-----:|----------|
| G4 JSON 스키마 | 1회 | raw text + parse_error |
| G5 인용 검증 | 1회 | 거절 + 원본 검색결과만 |
| G6 인용 의무 | 1회 | 응답 유지 + human_review 강조 + recall 차감 |

> 재생성은 각 가드레일당 **최대 1회**(무한루프·비용 폭주 방지). 동시 다중 위반 시 한 번의 재생성에 모든 위반 사항을 첨부.

---

## 9. 인덱스 장애 fallback

| 상황 | 처리 |
|------|------|
| dense 인덱스 접근 실패(Phase 4) | BM25 단독 fallback + 로그 |
| BM25 인덱스 접근 실패 | (dense 있으면) dense 단독, 둘 다 실패 → 시스템 다운 신호 → backend-engineer 보고 + 사용자에게 "일시적 점검" 정형 응답 |

---

## 10. 컴포넌트별 송신

| 대상 | 송신 |
|------|------|
| **backend-engineer** | G1~G9 전체 구현. 특히 G5 인용검증·G7 등급재계산·경계셀 3중 강제·재생성 1회 정책 |
| **eval-engineer** | refuse appropriateness(G1·G3·G8), citation precision/recall(G5·G6), faithfulness(G5), 경계셀 부분정답(G7) 메트릭 |
| **frontend-engineer** | low_confidence 경고 UI, 경계셀 "안전관리자 확인 필요" 배지, parse_error 안전 표시, 갭 영역 분리 응답 |
| **erp-integration** | human_review_required 게이트(곱16·갭 미확인 등록 차단), 필수 인용 누락 등록 차단 |

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | v1.0 작성. G1~G9 가드레일(인용검증 citations⊆retrieved, 등급 재계산, 경계셀 자동확정 금지 3중 강제, refuse 갭영역, 재생성 1회) | Phase 2 Foundation Wave 2 |
