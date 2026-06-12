# Session State Machine — JHA 다단계 워크플로우 (Phase 3 Design)

> 작성: backend-engineer · Phase 3 (Design)
> 목적: 세션 상태·전이·권한·차단 게이트의 SSOT. frontend 워크플로우 UI·ERP 등록 게이트 계약.
> 저장: Redis(TTL 7일, 활성 상태) + PostgreSQL(audit·전이 이력 영구).

---

## 1. 상태 다이어그램

```
        POST /sessions
              │
              ▼
        ┌──────────┐
        │ CREATED  │
        └────┬─────┘
             │ POST /classify  (worker+)
             ▼
        ┌──────────┐
        │CLASSIFIED│◀──┐ POST /classify (재분류 멱등 갱신)
        └────┬─────┘   │
             └─────────┘
             │ POST /assess  (worker+, 분류 확정)
             ▼
        ┌──────────┐        곱16 경계셀 / human_review_required=true
        │ ASSESSED │───────────────────────┐
        └────┬─────┘                       ▼
             │ (review 불필요)        ┌───────────────┐
             │                        │PENDING_REVIEW │
             │                        └──────┬────────┘
             │                               │ POST /review (safety_manager 전용)
             │                               ▼
             │                        ┌──────────┐
             │                        │ REVIEWED │
             │                        └────┬─────┘
             │                             │
             ▼                             ▼
        ┌─────────────────────────────────────┐
        │ POST /finalize (safety_manager+)     │
        │  게이트: human_review 미확정 → 409   │
        │         REVIEW_REQUIRED              │
        └────────────────┬────────────────────┘
                         ▼
                   ┌───────────┐
                   │ FINALIZED │ (Outbox append)
                   └─────┬─────┘
                         │ 즉시 전이
                         ▼
                   ┌─────────────┐  ERP fatal   ┌──────────────────┐
                   │ REGISTERING │─────────────▶│ REGISTER_FAILED  │
                   └──────┬──────┘              └────────┬─────────┘
                          │ ERP OK                       │ POST /finalize
                          ▼                              │ (재시도, safety_manager+)
                   ┌───────────┐                         │
                   │ COMPLETED │                         ▼
                   └───────────┘                   [REGISTERING]
```

### 전이 원칙
- **단방향 전진** — rollback 금지(잘못된 결과는 새 세션). 예외: REGISTER_FAILED → REGISTERING(재시도)만 역방향 허용.
- **분기**: ASSESSED에서 human_review_required로 PENDING_REVIEW / 직행 finalize 가능 여부 갈림.
- **REGISTERING 진입은 finalize 직후 자동**(Outbox 워커가 비동기 처리).

---

## 2. 전이 표 (트리거·조건·권한)

| # | from | to | 트리거 | 조건/게이트 | 권한 |
|---|------|----|--------|-------------|------|
| T1 | (없음) | CREATED | POST /sessions | work_description valid | worker, safety_manager, admin |
| T2 | CREATED | CLASSIFIED | POST /classify | 검색 결과(no_match도 전이) | worker+ |
| T3 | CLASSIFIED | CLASSIFIED | POST /classify | 재분류(멱등 갱신) | worker+ |
| T4 | CLASSIFIED | ASSESSED | POST /assess | 곱16 없음 & human_review_required=false | worker+ |
| T5 | CLASSIFIED | PENDING_REVIEW | POST /assess | 곱16 경계셀 또는 human_review_required=true | worker+ |
| T6 | ASSESSED | ASSESSED | POST /assess | 재평가(멱등) | worker+ |
| T7 | PENDING_REVIEW | REVIEWED | POST /review | decisions 완비(모든 review 대상 확정) | **safety_manager, admin 전용** |
| T8 | ASSESSED | FINALIZED | POST /finalize | site_id 존재 & human_review_required=false | safety_manager, admin |
| T9 | REVIEWED | FINALIZED | POST /finalize | site_id 존재 | safety_manager, admin |
| T10 | FINALIZED | REGISTERING | 자동(Outbox append) | — | system |
| T11 | REGISTERING | COMPLETED | Outbox 워커 ERP OK | erp_id 수신 | system |
| T12 | REGISTERING | REGISTER_FAILED | Outbox 워커 ErpFatal | 재시도 소진 또는 비재시도 오류 | system |
| T13 | REGISTER_FAILED | REGISTERING | POST /finalize(재시도) | — | safety_manager, admin |

### 차단(409) 규칙
| 시도 | 현재 상태 | 결과 | code |
|------|----------|------|------|
| finalize | PENDING_REVIEW (human_review 미확정) | **409 차단** | SESSION_REVIEW_REQUIRED |
| finalize | CREATED / CLASSIFIED | 409 | SESSION_INVALID_STATE_TRANSITION |
| review | ASSESSED(곱16 아님) / 기타 | 409 (PENDING_REVIEW 아님) | SESSION_INVALID_STATE_TRANSITION |
| review | 권한 worker | 403 | AUTH_INSUFFICIENT_ROLE |
| classify | ASSESSED 이후 | 409 | SESSION_INVALID_STATE_TRANSITION |
| assess | CREATED | 409 | SESSION_INVALID_STATE_TRANSITION |

> **핵심 안전 게이트**: 곱16 경계셀("O (잠정)") 또는 필수인용 누락 레코드는
> PENDING_REVIEW에 머문다. safety_manager가 /review로 등급·중점등록을 확정(T7)해
> REVIEWED가 되기 전에는 finalize가 409 REVIEW_REQUIRED로 ERP 등록을 차단한다.
> "사람 확인 없이 자동 확정·등록 불가"(rag_guardrails G7 3중 강제 중 ERP 게이트).

---

## 3. 상태별 저장·TTL

| 상태 | Redis | PostgreSQL audit | TTL |
|------|:-----:|:----------------:|-----|
| CREATED~REVIEWED | 활성 캐시(결과 JSON) | 전이 이벤트 append | 7일 |
| FINALIZED~REGISTERING | 활성 + outbox 참조 | append | 7일 |
| COMPLETED | 캐시(조회용) | 영구(erp_id 매핑) | 7일 후 만료(PG 영구) |
| REGISTER_FAILED | 활성(재시도 대상) | append + 알림 로그 | 만료 안 함(수동 해소까지) |

- 모든 전이는 `(session_id, from_state, to_state, actor_user_id, role, ts, request_id)` audit 레코드 기록.
- 멱등: Idempotency-Key 헤더로 동일 finalize/create 중복 방지(Outbox 중복 등록 차단).

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | v1.0. PENDING_REVIEW/REVIEWED 분기·곱16 finalize 409 게이트·전이 권한표·REGISTER_FAILED 재시도 | Phase 3 Design |
