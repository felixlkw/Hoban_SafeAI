# RAG Chunking Spec — 청크 구성 규격 (Foundation)

> 작성: rag-architect · Phase 2 (Foundation) Wave 2
> 상태: **data-engineer 행 단위 청크 포맷 공식 승인** + RAG 관점 보완 명시.
> 근거: `etl_pipeline.md §4` (chunk.py) + `data_schema.json` + `chunks.jsonl` 실측 + `jha-rag-design` SKILL 청킹 전략.
> 목적: 검색·인용·등급 lineage가 의존하는 청크 텍스트/메타 규격 SSOT. 변경 시 재인덱싱 비용 명시.

---

## 1. 승인 결정 — 행 단위 청크 채택 (확정)

data-engineer가 구축한 **행(source_row) 단위 청크**를 RAG 표준 청크 단위로 **공식 승인**한다.

근거:
- 각 행이 **자기충족적 작업단위**(대/중/세부 + 단일 재해형태 + 위험요인 + 개선대책 + 등급)다. 청크 1개로 hazard 추천·인용·등급 산정에 필요한 정보 완결.
- 인용 추적성 100%: `chunk_id`(R{source_row:05d}) → source_row 역추적이 결정적.
- BGE-M3 8192 토큰 한계 대비 평균 53.9 토큰/문서로 여유. 분할 불요.
- BM25 검색 테스트 통과(`etl_pipeline.md §6`).

> SKILL이 제시한 "옵션: 동일 세부항목 위험요인 묶음" 청킹은 **PoC에서 채택하지 않는다**. 이유: 묶음 청킹은 인용 단위가 흐려지고(어느 행이 근거인지 모호), 등급/중점등록이 행마다 다를 수 있어(예: 동일 세부항목에 곱8 '하'와 곱20 '상' 공존, GS-0013·GS-0016) 단일 청크로 묶으면 등급 산정 신호가 오염된다. 행 단위가 인용·등급 결정성에 유리.

---

## 2. 청크 텍스트 포맷 (실물 인용)

data-engineer `chunk.py` 포맷을 그대로 승인한다. 메타데이터 inline으로 청크 단독 의미 보존:

```
[대공종: {major} / 중공종: {sub} / 세부항목: {detail} / 재해형태: {accident}]
[등급: {grade} (강도 {sev} × 빈도 {freq}) / 중점등록: {critical}]
위험요인:
{hazard_text}
개선대책:
{controls}
```

### 실물 샘플 (chunks.jsonl R00002)
```
[대공종: 가설공사 / 중공종: 타워크레인(T형) / 세부항목: 작업 전 준비 / 재해형태: 기타]
[등급: 중 (강도 3 × 빈도 4) / 중점등록: X]
위험요인:
미승인 작업팀 작업
개선대책:
중점위험작업 사전작업 승인 여부 확인 · 사전 승인된 작업팀에 의한 작업여부 확인 · 해당교육 이수 및 자격 여부 확인
```

### 실물 샘플 (R00004 — 충돌/하)
```
[대공종: 가설공사 / 중공종: 타워크레인(T형) / 세부항목: 자재 반입 및 하역 / 재해형태: 충돌]
[등급: 하 (강도 3 × 빈도 3) / 중점등록: X]
위험요인:
자재 하역구간 통제 미실시로 자재 및 차량 충돌
개선대책:
동선계획 수립 및 통제라인 설정 · 작업반경 내 출입금지 조치 상태 확인
```

---

## 3. RAG 관점 보완 사항 (승인 조건)

행 단위 포맷을 승인하되, 검색·후처리 품질을 위해 다음을 명시한다.

| # | 보완 | 내용 | 영향 |
|---|------|------|------|
| B1 | **등급 inline 텍스트 = 원본 표기** | 텍스트의 "[등급: 중 …]"은 원본 `risk_grade`다. **검색 신호용**일 뿐, 최종 등급은 백엔드가 (severity,frequency)로 재계산(임계곱). 곱16 모순 35행은 텍스트상 '중'이나 코드 산정은 '상' → 후처리에서 분리. LLM은 텍스트 등급을 답으로 복사하지 말 것(프롬프트에 명시) | 검색·표시용/산정용 분리 |
| B2 | **메타 필드 prefilter 키 보존** | 청크 metadata에 major_type_id·sub_type_id·accident_type·risk_grade·critical_register + `is_classification_candidate`·`classification_priority`·`expected_grade`·`grade_inconsistent`·`boundary_cell` 동등 플래그 유지 | prefilter·도메인 후처리 의존 |
| B3 | **dup_group / dup_content_of 유지** | 트리플 중복(7그룹 14행)·완전중복(content_hash 2행) 청크는 색인 유지하되 메타 표식. 검색 시 동일 위험 중복 노출 → 후처리에서 (chunk_id 기준) dedup하여 인용 목록 정리 | 중복 인용 방지 |
| B4 | **'재해 사례' 청크 모드별 가시성** | `is_classification_candidate=false` 청크(재해 사례 133행)는 **분류 추천 모드 prefilter에서 배제**, **근거/few-shot 검색 모드에서는 포함**(중대재해 7건 고가치 근거). 청크 자체는 전수 색인 | taxonomy_review §1.3 정합 |
| B5 | **hazard_items / controls_items 활용** | 셀 내 복수 항목 분리 리스트는 LLM 응답의 controls 배열 매핑·인용 정밀도에 사용. 텍스트는 '·' 결합 유지 | citation precision |

---

## 4. 청크 ID·lineage 규약 (인용 계약)

| 키 | 규약 | 용도 |
|----|------|------|
| `chunk_id` | `R{source_row:05d}` (R00002~R04470) | LLM citations 필드·인용 표시 단위. **citations ⊆ retrieved chunk_id** 검증 키 |
| `source_row` | 원본 Excel 행번호 | 최종 출처 역추적. ERP 등록·감사 추적 |
| `content_hash` | SHA-256(text) | 재인덱싱 차분 검출 |

> 프롬프트·응답의 인용 형식은 `[R00042]`(chunk_id) 표기를 표준으로 한다(`system_prompt.md`). 표시 시 source_row 병기 권장(frontend).

---

## 5. 청크 변경 시 재인덱싱 비용 (강제 경고)

청크 **텍스트 포맷 변경**은 모든 content_hash 변동 → **전체 재토큰화(BM25) + 전체 재임베딩(dense)** 을 유발한다. 비용 큼.

강제 절차(`etl_pipeline.md §7` 정합):
1. rag-architect 합의 + **eval 회귀 필수**.
2. 텍스트 포맷 무변경·메타만 추가 → BM25 재토큰화 불요(텍스트 동일), 메타 인덱스만 갱신(저비용).
3. dense 활성화 이후 텍스트 변경 → BGE-M3 전체 재임베딩(고비용) → data-engineer 재인덱싱 task.
4. blue/green alias로 다운타임 0. 변경 비율 >5% 시 자동 회귀 트리거.

**결론**: 본 승인으로 텍스트 포맷은 **동결(freeze)**한다. 이후 변경은 §3 보완(메타 추가) 위주로 한정하여 재임베딩 비용을 회피한다.

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | v1.0 행 단위 청크 포맷 공식 승인 + RAG 보완(등급 표시/산정 분리·모드별 가시성·dedup·lineage) + 포맷 동결 | Phase 2 Foundation Wave 2 |
