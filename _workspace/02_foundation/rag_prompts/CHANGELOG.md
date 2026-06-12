# RAG Prompts — 변경 이력 (CHANGELOG)

> 모든 프롬프트 변경은 본 파일에 누적 기록(날짜·변경·사유·예상 영향·승인자).
> 프롬프트 변경은 평가 영향이 크다 → 변경 시 eval-engineer에게 동시 통지·회귀 평가 요청 필수.
> 대상 파일: `system_prompt.md`, `jha_generation_template.md`, `fewshot_examples.jsonl`.

---

## v1.0 — 2026-06-10 (Phase 2 Foundation Wave 2)

**작성자/승인**: rag-architect

**변경 내용 (최초 작성)**
- `system_prompt.md` v1.0 신규: jha-rag-design SKILL 템플릿 기반에 확정 명세 inline 반영.
  - KRAS 강도·빈도 정의(1~5) 및 산정 가이드.
  - **확정 임계곱** 등급 규칙: 하≤9 / 중10~15 / 상≥16 (safety_risk_matrix_spec §2).
  - **경계셀 규칙**: 곱16(강도4×빈도4) 자동확정 금지·기본 '상'·boundary_cell·human_review_required (matrix_spec §3).
  - **중점등록 종속규칙**: O ⇔ 등급 상, 곱16→"O (잠정)", 법정대상 등급 중/하→legal_critical_candidate (matrix_spec §5).
  - **법적 인용 의무** 요약 inline: 재해형태·작업·속성별 필수/권장 조문 (safety_legal_citation_matrix §1~3).
  - **데이터 갭 refuse 분기**: 밀폐공간·화학물질·석면·작업환경측정 (legal_citation_matrix §4).
  - 재해형태 혼동 쌍 구분(추락/낙하/비래, 전도/도괴/붕괴, 협착/말림, 질식/질환) (safety_taxonomy_review §2).
  - 인용 형식 `[R00042]`(chunk_id), 환각 금지·원본 등급 복사 금지 명시.
- `jha_generation_template.md` v1.0 신규: SKILL 출력 스키마 + `human_review_flags`(boundary_cell·human_review_required·legal_critical_candidate·data_gap·gap_areas·low_citation_confidence) 필드 추가. backend 재계산·검증 계약 명시.
- `fewshot_examples.jsonl` v1.0 신규: gold set에서 7건 선택.
  - 분포: 상2(FS-01 타워크레인해체, FS-02 교각경계셀) / 중3(FS-03 감전, FS-04 붕괴, FS-05 낙하) / 하1(FS-06 전도) / refuse1(FS-07 석면).
  - **경계셀 1건 포함**(FS-02, 곱16).
  - 감전 과대평가 금지(FS-03, R5), 법정후보 플래그(FS-04), full refuse(FS-07) 학습 신호 포함.

**확정 파라미터**
- 모델: 기본 claude-sonnet-4-6(temperature=0) / 모호 케이스 claude-opus-4-7(temperature 미전송·adaptive thinking·effort=low).
- prompt caching: breakpoint 1=system 끝, breakpoint 2=few-shot 끝.
- 출력 강제: output_config.format json_schema (prefill 금지 — 4.6/4.7 400).

**예상 영향**
- 베이스라인 평가의 기준선. 분류 정확도·hazard coverage·citation recall·grade alignment·refuse appropriateness 전 메트릭에 직접 작용.
- 경계셀·중점등록·인용의무가 코드 후처리와 이중 검증되므로, 프롬프트와 후처리 규칙 불일치 시 회귀 발생 가능 → 동시 통지 필수.

**후속 통지**
- eval-engineer: 본 v1.0로 베이스라인 회귀 평가 데이터셋 구성 요청.
- backend-engineer: 모델별 temperature 분기·후처리 검증 규약 반영 확인.
