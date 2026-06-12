# Backend Architecture — JHA Agent FastAPI 시스템 (Phase 3 Design)

> 작성: backend-engineer · Phase 3 (Design)
> 기반: jha-backend-design SKILL + rag_guardrails(G1~G9) + jha_generation_template + rag_retrieval_spec.
> 목적: API 구현·RAG 오케스트레이션·모델 분기·prompt caching·복구 정책의 SSOT.

---

## 1. 컴포넌트 구조

```
                         ┌─────────────────────────────────────────┐
   frontend (Next.js) ──▶│  API Gateway / FastAPI (app/main.py)     │
   ERP (등록 결과 콜백)   │  middleware: auth · request_id · rate    │
                         │             limit · structured log · OTel │
                         └───────────────┬───────────────────────────┘
                                         │
            ┌────────────────────────────┼────────────────────────────┐
            ▼                            ▼                            ▼
   routes/sessions.py          routes/citations.py          routes/feedback.py
            │                            │                            │
            ▼                            ▼                            ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │ services/                                                              │
   │  rag_pipeline.py  ─ 오케스트레이터(STAGE 1~7)                          │
   │  llm_client.py    ─ LLM 공급자 추상화(OpenAI 기본·Anthropic 레거시·Mock)│
   │  guardrails.py    ─ G1~G9 검증·재생성(인용검증·등급재계산·경계셀 3중)  │
   │  domain_postprocess.py ─ 등급·중점등록 일관성·human_review set         │
   │  session_store.py ─ 상태머신(Redis TTL7일 + PostgreSQL audit)          │
   │  security_gate.py ─ 화이트리스트 필터·PII 마스킹(외부 LLM 전)          │
   └──────────────┬──────────────────────────┬───────────────┬────────────┘
                  ▼                          ▼               ▼
        adapters/kb_client.py      LLM API (외부)       adapters/erp_adapter.py
        (data-engineer 인덱스)     OpenAI 기본/Anthropic (erp-integration)
        BM25 / dense stub                                      │
                                                               ▼
                                                  outbox/ (worker + 재시도 큐)
```

레이어드 단방향 의존: `routes → services → adapters`. 역방향 호출 금지(순환 의존 차단).

### 디렉토리 (04_build/backend/app/)
```
main.py
routes/      sessions.py · citations.py · feedback.py · health.py
services/    rag_pipeline.py · llm_client.py · guardrails.py
             domain_postprocess.py · session_store.py · security_gate.py
adapters/    kb_client.py · erp_adapter.py
schemas/     (Pydantic — OpenAPI 스키마 1:1)
middleware/  auth.py · logging.py · rate_limit.py · request_id.py
outbox/      worker.py · store.py
config.py    (env: 모델 ID·하이퍼파라미터·타임아웃)
```

---

## 2. RAG 파이프라인 시퀀스 (assess 엔드포인트)

```
client            rag_pipeline      kb_client      security_gate    claude_client    guardrails    session_store
  │  POST assess     │                 │                │              │                │              │
  │─────────────────▶│                 │                │              │                │              │
  │           STAGE1 의도추출·prefilter 필터 빌드        │              │                │              │
  │                  │ taxonomy_lookup → sub_type_id IN[]·accident 가중 신호             │              │
  │           STAGE2 hybrid_search(BM25 단독, top_k=20) │              │                │              │
  │                  │────────────────▶│                │              │                │              │
  │                  │◀── chunks(20) ──│                │              │                │              │
  │           STAGE3 dedup → top_k_final=5 (rerank OFF) │              │                │              │
  │           STAGE4 검색 게이트 ───────────────────────────────────── G1/G2/G3        │              │
  │                  │  G1 0건 → no_match (LLM 미호출, 즉시 반환)       │                │              │
  │                  │  G3 full(석면) → refused_full (LLM 미호출)       │                │              │
  │                  │  G2 약매칭 → low_confidence 플래그 (호출은 진행)  │                │              │
  │           화이트리스트·PII 마스킹  │───────────────▶│              │                │              │
  │                  │◀── safe_chunks ─────────────────│              │                │              │
  │           STAGE5/6 context 구성 + Claude 호출       │              │                │              │
  │                  │─────────────────────────────────────────────▶│ 모델분기·caching│              │
  │                  │◀──────────────────────── JSON 응답 ──────────│                │              │
  │           STAGE7 후처리 ────────────────────────────────────────────────────────▶ G4~G8         │
  │                  │  G4 스키마검증(실패→1회 재생성)                                 │              │
  │                  │  G5 인용검증 citations⊆retrieved(실패→재생성→거절)             │              │
  │                  │  G6 인용의무(필수조문 누락→재생성)                              │              │
  │                  │  G7 등급 코드 재계산 + 곱16 경계셀 3중 강제                     │              │
  │                  │  G8 비작업 사후 차단                                           │              │
  │                  │  source_rows = chunk_id→source_row 역추적(백엔드 재산출)        │              │
  │           상태 전이 ASSESSED 또는 PENDING_REVIEW(곱16)──────────────────────────────────────────▶│
  │◀── AssessmentResult ──────────────────────────────────────────────────────────────────────────│
```

핵심: **등급·중점등록·source_rows·human_review는 코드가 권위**. LLM 값은 신뢰하지 않고 재계산/재검증한다.

---

## 3. 모델 분기 (LLM 공급자 추상화 — 기본 OpenAI)

LLM 호출은 `services/llm_client.py` 의 **공급자 추상화**(`LLMClient`)를 통한다.
기본 공급자는 **OpenAI**(`OpenAIClient`), 레거시로 **Anthropic**(`AnthropicClient`),
키 부재 시 **Mock**(`MockLLMClient`). `LLM_PROVIDER` env 로 전환한다.

| 단계 | 트리거 | 모델(기본·OpenAI) | temperature | 비고 |
|------|--------|------|:-----------:|------|
| classify (기본) | 항상 | `gpt-4.1` | **0** | 결정적 분류 + json_schema |
| classify (모호) | confidence<0.7 | `gpt-4.1`(`JHA_MODEL_COMPLEX`) | **0** | 2차 재분류(상위/reasoning 모델로 교체 가능) |
| assess (기본) | 항상 | `gpt-4.1` | **0** | 위험요인·등급·대책 + json_schema |
| assess (복잡) | data_gap or 다중공종 모호 | `gpt-4.1`(`JHA_MODEL_COMPLEX`) | **0** | 보수적 추론 |
| judge (eval) | eval 모드 | `gpt-4.1`(`JUDGE_MODEL`) | **0** | eval-engineer 호출 |

> **OpenAI 경로**: Chat Completions + **Structured Outputs(`response_format=json_schema`)** 로
> JHA JSON 스키마를 강제하고 `temperature=0` 으로 결정성을 확보한다. 프롬프트 캐싱은 OpenAI 가
> 자동 처리하므로 `cache_control` 마킹/4블록 로직이 없다. 모호 케이스(extended thinking 대응)는
> OpenAI reasoning 모델 또는 동일 모델 유지로 단순화 — 기본은 `gpt-4.1` 유지(env 로 교체).
>
> **Anthropic 경로(레거시)**: `temperature` 분기(opus 계열 미전송 + adaptive thinking)와
> prompt caching 4블록은 `AnthropicClient` 에만 보존된다(`LLM_PROVIDER=anthropic`).

```python
# OpenAIClient.complete — 공급자 무관 시그니처 유지
params = {
    "model": model_id,
    "max_tokens": MAX_TOKENS,
    "temperature": 0,
    "messages": [{"role": "system", ...}, {"role": "user", ...}],
    "response_format": {"type": "json_schema", "json_schema": JHA_JSON_SCHEMA},
}
```

모델 ID·기본값(`gpt-4.1`)은 전부 env 오버라이드 가능(ID 변경 시 코드 수정 불필요, 조직 가용
모델로 교체 가능): `JHA_MODEL_CLASSIFY` · `JHA_MODEL_ASSESS` · `JHA_MODEL_COMPLEX` ·
`JHA_MODEL_JUDGE`(eval: `JUDGE_MODEL`).

---

## 4. Prompt Caching

**OpenAI(기본)**: 프롬프트 캐싱이 **자동**이다(별도 `cache_control` 마킹 불필요). 정적 prefix
(system + 레퍼런스 + few-shot)를 user 가변 입력보다 앞에 두면 OpenAI 가 자동 캐싱한다.
적중률은 `usage.prompt_tokens_details.cached_tokens`(관측 키 `cache_read_input_tokens` 로 매핑)로
노출된다.

**Anthropic(레거시)**: `cache_control` 4블록 마킹(system / few-shot / 정적 레퍼런스 / 가변 미캐시)을
`AnthropicClient` 에 보존.

- 적중률 목표 ≥70%. <70% 지속 시 rag-architect와 프롬프트 구조(정적 prefix 순서·경계) 재검토.
- caching 토큰(`cache_read`/`cache_creation`)은 모든 호출 로깅 + 비용 메트릭 반영.

---

## 5. Timeout · 재시도 · Circuit Breaker 매트릭스

| 외부 호출 | timeout | 재시도 | 백오프 | circuit breaker | 실패 시 |
|-----------|:-------:|:------:|--------|-----------------|---------|
| kb_client.hybrid_search | 2s | 1회 | 즉시 | 5연속 실패 → open 30s | BM25↔dense fallback(가드레일 §9). 둘 다 실패 → 503 "일시 점검" |
| Claude messages.create | 30s | 1회(5xx) | 지수(1s→2s) | 5연속 실패 → open 60s | 502 LLM_UPSTREAM_ERROR / open 시 503 LLM_CIRCUIT_OPEN |
| Claude 429 | — | 큐잉 | Retry-After 존중 | — | Retry-After 헤더 에코 |
| LLM JSON 파싱(G4) | — | 1회 재생성 | 즉시 | — | parse_error=true + raw_text |
| 인용검증(G5) | — | 1회 재생성 | 즉시 | — | 거절(원본 청크만 표시) |
| erp_adapter.register | 5s | Outbox 비동기 | 지수(워커) | — | 즉시 202 응답 + 백그라운드 재시도 큐 |
| session_store(Redis) | 1s | 1회 | 즉시 | — | PostgreSQL audit fallback 조회 |

### 복구 규칙 요약
- **Claude 5xx**: 1회 재시도 → 재실패 502 + breaker 카운트. open 시 503 + Retry-After.
- **Claude 429**: 재시도 안 하고 큐잉, Retry-After 헤더 존중·에코.
- **RAG 0건**: 5xx 아님 — 200 + `result_type=no_match`.
- **ERP 실패**: 사용자 응답 낙관적 즉시 반환. 워커 재시도, fatal 시 REGISTER_FAILED + 알림.
- **PII 마스킹 실패(화이트리스트 누락)**: 외부 전송 **중단**, 즉시 500 SECURITY_* + 보안팀 알림. 절대 외부 미전송.

---

## 6. 데이터 보안 게이트 (외부 LLM 호출 전)

```
chunks → security_gate.whitelist_filter(allowed_fields)  # data_security_policy.md
       → PII 의심 필드 마스킹(작업자명·연락처·주민번호 패턴)
       → 화이트리스트 누락 필드 탐지 시 raise SecurityViolation → 500(외부 미전송)
```

화이트리스트 통과 필드만 Claude 컨텍스트에 진입. 사용자 입력(work_description)도 동일 게이트 통과.

---

## 7. 결정적 응답 보장

- OpenAI(기본): `temperature=0` + `response_format=json_schema`. 동일 입력→동일(또는 근사) 응답.
- Anthropic opus(레거시): temperature 미지원이라 adaptive thinking effort=low로 변동 최소화.
- 공통: 후처리 코드(G7 등급 재계산)가 등급·중점등록을 결정적으로 고정한다.
- eval 배치 모드: 시드/요청 메타 로깅으로 재현성 추적.

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | v1.0. 컴포넌트·RAG 시퀀스(G1~G9)·모델분기(opus temperature 미전송)·caching 4블록·복구 매트릭스 | Phase 3 Design |
| 2026-06-12 | LLM 공급자 추상화(기본 OpenAI: json_schema·자동 캐싱·temperature=0). Anthropic 레거시·Mock 폴백. 모델 기본값 gpt-4.1(env 교체 가능) | LLM OpenAI 전환 |
