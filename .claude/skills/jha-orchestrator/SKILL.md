---
name: jha-orchestrator
description: "호반그룹 LLM/RAG 기반 작업위험성평가(JHA) 지원 에이전트 PoC의 전체 워크플로우 오케스트레이터. 7개 전문가 에이전트(safety/data/rag/backend/frontend/eval/erp)와 7개 도메인 스킬을 6 Phase(Discovery → Foundation → Design → Build → Eval → Integration)에 걸쳐 협업·조율한다. 사용자가 호반 JHA PoC, 작업위험성평가 에이전트 구축, EHS RAG, ERP 연동, JHA 평가, 자연어 위험성평가 같은 요청을 하면 반드시 이 스킬을 사용한다. '다시 실행'·'업데이트'·'특정 단계만'·'재실행' 같은 후속 작업도 본 스킬로 처리한다."
---

# JHA Orchestrator — 호반 EHS PoC 통합 워크플로우

## 트리거 조건

다음 키워드/표현 중 하나라도 등장하면 본 스킬을 사용:
- "호반 JHA"·"작업위험성평가 에이전트"·"EHS RAG"·"JHA Agent"
- "위험성평가 자동화"·"자연어로 작업 입력"
- "전사 하위공종 위험요인" 데이터 활용
- "ERP 연동된 JHA"·"안전 DB 벡터화"
- 후속 요청: "다시 실행", "재실행", "업데이트", "수정", "{Phase}만 다시", "특정 에이전트만"

## Phase 0: 컨텍스트 확인 (모든 실행 진입점)

워크플로우 시작 시 다음을 확인:

1. **`_workspace/` 존재 여부**
   - 없음 → **초기 실행** (Phase 1부터)
   - 있음 → 사용자 의도 확인
     - 부분 수정 요청 (특정 Phase·에이전트만) → **부분 재실행**
     - 새 입력 제공 (다른 데이터·다른 도메인) → 기존을 `_workspace_prev_{YYYYMMDD}/`로 이동 후 **새 실행**
     - 단순 후속 (이전 결과 개선) → 영향 받는 Phase만 재실행

2. **데이터 입력 확인**
   - `_workspace/00_input/전사 하위공종 위험요인_20260518.xlsx` 존재 → 확인
   - 없으면 사용자에게 경로 확인 요청

3. **CLAUDE.md 변경 이력 확인**
   - 마지막 변경 시점과 현재 작업의 관계 파악

## 실행 모드: 하이브리드

Phase별 모드:
- **Phase 1 (Discovery)**: 서브 에이전트 — 독립 자료 수집 병렬
- **Phase 2 (Foundation)**: 에이전트 팀 — 4명(safety/data/rag/eval) 합의 기반
- **Phase 3 (Design)**: 에이전트 팀 — 4명(backend/frontend/erp + safety 자문) 계약 합의
- **Phase 4 (Build)**: 에이전트 팀 — 전원 + 평가 병행
- **Phase 5 (Eval)**: 서브 에이전트 — eval-engineer 단독 독립 평가
- **Phase 6 (Integration)**: 에이전트 팀 — 전원 통합 검증

각 Phase 시작 시 모드를 명시하고 진입.

## Phase 1: Discovery (병렬 수집)

**실행 모드:** 서브 에이전트 (병렬)

병렬 실행:
1. `safety-domain-expert` → `_workspace/01_discovery/safety_scope.md`
2. `data-engineer` → `_workspace/01_discovery/data_profile.md`
3. `erp-integration-engineer` → `_workspace/01_discovery/erp_interface_inventory.md`

각 에이전트는 `model: "opus"`로 호출. 결과 산출물을 파일로 저장하고 반환 메시지로 요약만.

**완료 게이트**: 3개 산출물 파일 존재 + 사용자 검토(옵션).

## Phase 2: Foundation (도메인·데이터·RAG·평가 기반)

**실행 모드:** 에이전트 팀

`TeamCreate("jha-foundation", members=[safety-domain-expert, data-engineer, rag-architect, eval-engineer])`

`TaskCreate`로 작업 분배:
- safety: taxonomy 검토, gold set 30~50건, 루브릭, 인용 매트릭스
- data: 정제 스크립트, 메타 스키마, 청크 jsonl, 인덱스 구축
- rag: 검색 spec, 임베딩 선정, 시스템 프롬프트, few-shot, 가드레일
- eval: 평가 데이터셋 흡수, 메트릭 정의, runner skeleton

팀원은 `SendMessage`로 직접 통신 (예: data ↔ rag 청크 단위 합의, safety ↔ eval 루브릭 합의).

**완료 게이트**: `_workspace/02_foundation/`에 다음 파일 존재:
- safety_taxonomy_review.md, safety_risk_matrix_spec.md, safety_rubric.md, safety_gold_set.jsonl, safety_legal_citation_matrix.md
- data_schema.json, taxonomy_lookup/, data_cleaned.parquet, chunks.jsonl, data_security_policy.md
- rag_architecture.md, rag_embedding_choice.md, rag_chunking_spec.md, rag_retrieval_spec.md, rag_prompts/*, rag_guardrails.md
- eval_plan.md, eval_rubrics.md

팀 해체: `TeamDelete("jha-foundation")`.

## Phase 3: Design (API·UI·ERP 계약)

**실행 모드:** 에이전트 팀

`TeamCreate("jha-design", members=[backend-engineer, frontend-engineer, erp-integration-engineer, safety-domain-expert])`

safety-domain-expert는 도메인 자문 역할 (계약에 도메인 필드 누락 점검).

병행 작업:
- backend: OpenAPI 3.1 스펙, 세션 상태 머신, 관측성 설계
- frontend: 사용자 여정, 와이어프레임, 컴포넌트 명세, 접근성 가이드
- erp: 접근 전략 결정, 마스터 매핑, 등록 흐름, ETL 파이프라인, 보안

상호 메시지:
- backend ↔ frontend: API 스펙 협상
- backend ↔ erp: 어댑터 인터페이스 합의
- safety → 모두: 도메인 필드 검토

**완료 게이트**: `_workspace/03_design/`에 핵심 파일들 (api_openapi.yaml, backend_architecture.md, ux_user_journey.md, ux_wireframes.md, ux_components.md, erp_master_mapping.md, erp_register_flow.md, erp_etl_pipeline.md, erp_security.md).

## Phase 4: Build (구현)

**실행 모드:** 에이전트 팀 (전원)

`TeamCreate("jha-build", members=[backend-engineer, frontend-engineer, data-engineer, rag-architect, erp-integration-engineer, eval-engineer])`

병행 구현:
- data: ETL 스크립트, 인덱스 구축 실행
- backend: FastAPI 구현, Claude 통합, Outbox 워커
- frontend: Next.js 구현, 컴포넌트 + e2e
- erp: 어댑터(Mock + 실제 stub) + ETL 워커
- eval: runner.py, regression_gates.yaml, smoke 데이터셋

각 에이전트는 자기 디렉토리(`_workspace/04_build/{backend,frontend,scripts,integrations,eval}/`)에 구현.

**점진 QA**: 각 모듈 완성 직후 eval-engineer가 smoke 평가 실행 (incremental QA 원칙).

**완료 게이트**: 각 디렉토리에 코드 + 테스트 통과 + smoke 평가 통과.

## Phase 5: Eval (정량 평가)

**실행 모드:** 서브 에이전트 (단독)

`eval-engineer` 단독으로 전체 gold set 평가 실행:
- baseline 측정
- 변형(prompt v2, rerank on/off, embedding swap) A/B 실행
- 메트릭 보고서 생성

산출물: `_workspace/04_build/eval/reports/{date}_baseline.md` 외 변형별.

회귀 발견 시 `Agent` 호출로 rag-architect 또는 해당 변경 주체에게 actionable 피드백 전달.

## Phase 6: Integration (통합 검증)

**실행 모드:** 에이전트 팀 (전원)

`TeamCreate("jha-integration", members=[safety-domain-expert, backend-engineer, frontend-engineer, erp-integration-engineer, eval-engineer])`

작업:
- safety: 산출물 최종 도메인 검수 (`safety_final_review.md`)
- backend·frontend: end-to-end 시연 시나리오 통과 확인
- erp: Mock 어댑터로 등록 흐름 시연
- eval: 최종 종합 보고서 (`eval_final_report.md`)

**완료 게이트**: `_workspace/05_integration/` 에 통합 보고서 + 시연 스크립트.

## 데이터 전달 프로토콜

- **태스크 기반 (조율)**: TaskCreate/TaskUpdate로 의존·진행 관리
- **메시지 기반 (실시간)**: SendMessage로 합의·검토 요청
- **파일 기반 (산출물)**:
  - 작업 디렉토리: `_workspace/`
  - 파일명: `{phase_num}_{agent_short}_{artifact}.{ext}` 또는 Phase별 디렉토리(`02_foundation/safety_*` 등)
  - 최종 산출물은 사용자가 지정한 경로(없으면 `_workspace/05_integration/`)
  - 중간 파일은 보존 (감사 추적)
- **반환값 기반**: Phase 1과 5(서브 에이전트 모드)에서 요약 반환

## 에러 핸들링

### 에이전트 작업 실패
- 1회 재시도 (지수 백오프)
- 재실패 시 해당 산출물 누락 + 보고서에 명시 ("Phase 2 - safety_gold_set.jsonl: 작성 실패, 사유: ...")
- 다음 Phase는 가능한 부분만 진행 (cascade 방지)

### 산출물 충돌 (예: safety와 data가 동의어 사전 불일치)
- **삭제 금지** + 출처 병기
- 양측 결과 모두 보존하고 통합 보고서에 "충돌 사례" 섹션 추가
- 사용자 결정 위임

### 평가 회귀
- variant 채택 보류 + 변경 주체에게 알림
- baseline 유지

### ERP/외부 의존 실패
- PoC 모드는 Mock으로 fallback
- 실 ERP 사용 시 큐잉 + 알림

## 후속 작업 모드

### 부분 재실행 (예: "프롬프트만 다시")
1. 영향 분석: 프롬프트 변경 → rag-architect + eval-engineer
2. 해당 에이전트만 호출
3. 변경 후 자동 회귀 평가

### 새 입력 (예: "데이터 v2로 업데이트")
1. `_workspace`를 `_workspace_prev_{YYYYMMDD}/`로 이동
2. 새 데이터로 Phase 1부터 재시작
3. 이전 결과는 보존, 비교 가능

### 단일 에이전트 직접 호출 (예: "safety 분석만 다시")
1. 해당 에이전트만 `Agent` 호출 (model: "opus")
2. 변경된 산출물만 갱신
3. 영향 받는 다른 에이전트에게 메시지 전달

## 팀 크기·재구성

- Phase 1: 3명 서브 (병렬)
- Phase 2: 4명 팀
- Phase 3: 4명 팀
- Phase 4: 6명 팀 (전원)
- Phase 5: 1명 서브
- Phase 6: 5명 팀

각 Phase 종료 시 `TeamDelete` 후 다음 Phase 팀 생성 (혹은 멤버 재구성).

## 테스트 시나리오

### 정상 흐름
입력: "호반 JHA Agent PoC 구축해줘"
→ Phase 0 확인 (`_workspace/` 없음) → Phase 1~6 순차
→ 산출물: `_workspace/` 전체 + `_workspace/05_integration/` 최종 보고서

### 부분 재실행
입력: "프롬프트만 v2로 업데이트하고 평가 다시"
→ Phase 0 확인 (`_workspace/` 존재) → rag-architect 호출 (prompt 갱신) → eval-engineer 호출 (회귀 평가) → CLAUDE.md 변경 이력 추가

### 에러 흐름
data-engineer가 인덱스 구축 실패
→ 1회 재시도 → 재실패 시 Phase 2 보고서에 누락 명시
→ Phase 3은 청크 미존재 가정으로 진행 가능한 부분만
→ 사용자에게 보고 + 수동 개입 요청

## 변경 이력 기록 의무

모든 Phase 완료 후 CLAUDE.md 변경 이력 테이블에 기록:
- 날짜·변경 내용·대상·사유
- 예: "2026-06-12 / Phase 2 재실행 / rag_prompts v2 / 평가 점수 +5pt 목표"

## references/

- `references/phase_decision_matrix.md` — 어떤 변경이 어느 Phase 재실행을 트리거하는가
- `references/workspace_layout.md` — `_workspace/` 디렉토리 표준 구조
