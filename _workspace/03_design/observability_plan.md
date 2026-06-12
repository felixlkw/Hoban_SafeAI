# Observability Plan — 로그·메트릭·트레이싱·비용 (Phase 3 Design)

> 작성: backend-engineer · Phase 3 (Design)
> 목적: 구조화 로그·Prometheus 메트릭·비용 추적·OTel span의 SSOT. 비용·캐시 적중·가드레일 가시화.

---

## 1. 구조화 로그 스키마 (JSON, request_id 트레이싱)

모든 로그는 한 줄 JSON. 공통 필드 + phase별 확장. PII·화이트리스트 외 필드는 로그에도 미기록.

### 공통 필드
```json
{
  "ts": "2026-06-10T09:00:00.123Z",
  "level": "INFO|WARN|ERROR",
  "request_id": "req_...",
  "trace_id": "otel_...",
  "session_id": "uuid",
  "user_id": "...",
  "role": "worker|safety_manager|admin",
  "endpoint": "POST /v1/jha/sessions/{id}/assess",
  "phase": "claude_call",
  "latency_ms": 1820
}
```

### phase별 확장 필드
| phase | 추가 필드 |
|-------|-----------|
| `kb_search` | `prefilter_applied`, `sub_type_ids`, `top_k_retrieval`, `hits`, `top1_score`, `search_mode(bm25/dense)` |
| `claude_call` | `model`, `temperature_sent(bool)`, `thinking_used`, `input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`, `cost_usd`, `stop_reason` |
| `guardrail` | `guardrail_id(G1~G9)`, `outcome(pass/regenerate/refuse)`, `result_type`, `regeneration_count` |
| `grade_recalc` | `hazard_index`, `severity`, `frequency`, `llm_grade`, `recalc_grade`, `boundary_cell`, `overridden(bool)` |
| `state_transition` | `from_state`, `to_state`, `actor` |
| `erp_register` | `outbox_id`, `attempt`, `erp_id`, `erp_outcome(ok/retry/fatal)` |
| `security_gate` | `whitelist_outcome(pass/blocked)`, `masked_field_count` (값은 미기록) |

> 보안: SECURITY_* 위반(화이트리스트 누락)은 ERROR 로그 + 보안팀 알림. **마스킹 대상 원문 절대 미기록**.

---

## 2. Prometheus 메트릭

### 요청·지연
- `jha_request_total{endpoint, status}` — counter
- `jha_request_latency_seconds{endpoint}` — histogram
- `jha_rag_search_latency_seconds{search_mode}` — histogram
- `jha_claude_latency_seconds{model, phase}` — histogram

### Claude·캐시·비용
- `jha_claude_tokens_total{model, kind=input|output|cache_creation|cache_read}` — counter
- `jha_claude_cache_hit_ratio{model}` — gauge (cache_read/(cache_read+input)). **목표 ≥0.70**, 0.70 미만 지속 시 알림 → rag-architect
- `jha_cost_estimated_usd{model}` — counter (토큰×모델별 단가, caching 할인 반영)
- `jha_claude_calls_total{model, outcome=ok|retry|5xx|429|circuit_open}` — counter

### 가드레일·품질
- `jha_result_type_total{result_type}` — counter (ok/low_confidence/no_match/refused_partial/refused_full)
- `jha_guardrail_total{guardrail_id, outcome}` — counter (재생성·거절 빈도)
- `jha_regeneration_total{guardrail_id}` — counter (G4/G5/G6 재생성)
- `jha_boundary_cell_total` — counter (곱16 발생 → human_review 진입)
- `jha_grade_override_total` — counter (LLM 등급 ≠ 코드 재계산)

### 세션·ERP
- `jha_session_state{state}` — gauge (상태별 활성 세션 수)
- `jha_erp_register_failures_total{reason}` — counter
- `jha_outbox_depth` — gauge (큐 적체)
- `jha_circuit_breaker_state{dependency}` — gauge (0 closed / 1 open)

---

## 3. 비용 추적

| 항목 | 산식 | 노출 |
|------|------|------|
| 호출당 비용 | input×단가 + output×단가 + cache_creation×1.25 + cache_read×0.1 (모델별 단가표) | 로그 `cost_usd` |
| 모델별 누적 | `jha_cost_estimated_usd{model}` | Grafana |
| 세션당 비용 | 세션 내 전 호출 합산 | SessionDetail audit |
| 캐시 절감액 | (cache_read×정상단가) − (cache_read×0.1) | 대시보드 패널 |

> 단가는 config의 `MODEL_PRICING` 테이블(env override). 모델 추가 시 단가 미등록이면 cost=null + WARN.
> 정확한 모델별 단가는 claude-api 스킬 참조(구현 시 확정).

---

## 4. OpenTelemetry Span 트리

```
span: http.request {endpoint, request_id, user_id, role}
  ├─ span: session.create | classify | assess | review | finalize
  │   ├─ span: kb.search {search_mode, hits, top1_score}
  │   ├─ span: security.gate {whitelist_outcome}
  │   ├─ span: claude.call {model, tokens, cache_hit, cost_usd}    ← 비용·토큰 attribute
  │   ├─ span: guardrail.postprocess {guardrails_run, regenerations, result_type}
  │   │    ├─ span: guardrail.G5_citation_check
  │   │    └─ span: guardrail.G7_grade_recalc
  │   └─ span: session.transition {from_state, to_state}
  └─ (finalize) span: outbox.append {outbox_id}

(비동기) span: erp.outbox_worker {outbox_id, attempt, erp_outcome, erp_id}
```

- trace_id를 응답 헤더·로그·메트릭 exemplar로 전파(request_id ↔ trace_id 상호 참조).
- 샘플링: 에러·refuse·boundary_cell·grade_override는 **항상 샘플(100%)**, 정상은 10%.

---

## 5. 알림 규칙 (요약)

| 조건 | 심각도 | 대상 |
|------|--------|------|
| SECURITY_* 화이트리스트 위반 | critical | 보안팀(즉시) |
| circuit breaker open(claude/kb) | high | backend on-call |
| cache_hit_ratio < 0.70 (15분 지속) | medium | rag-architect |
| outbox_depth 임계 초과 / ERP fatal | high | erp-integration |
| regeneration_total 급증(G5/G6) | medium | rag-architect(인용 품질) |

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | v1.0. 로그 phase 스키마·Prometheus 메트릭(캐시적중·비용·가드레일·경계셀)·OTel span·알림 | Phase 3 Design |
