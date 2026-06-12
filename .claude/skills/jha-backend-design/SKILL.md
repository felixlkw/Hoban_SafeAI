---
name: jha-backend-design
description: "JHA Agent의 백엔드(FastAPI) 설계·구현 워크플로우. OpenAPI 3.1 계약 우선 설계, LLM 공급자 추상화 통합(기본 OpenAI: structured outputs·자동 캐싱·streaming·tool use, Anthropic 레거시), 세션 상태 머신, 인증·관측성·비용 추적, RAG 파이프라인 오케스트레이션, ERP 어댑터 호출, 에러 복구·circuit breaker·Outbox 패턴까지 정의한다. backend-engineer가 API 설계·구현·배포 시 반드시 이 스킬을 사용한다."
---

# JHA Backend Design — FastAPI + LLM 통합 워크플로우

## 언제 사용하는가

- API 엔드포인트·스키마를 신규 설계·수정할 때
- LLM API 호출 패턴(공급자 추상화·자동 캐싱·structured outputs·tools·streaming)을 구현할 때
- 세션 상태 머신을 설계할 때
- 인증·권한·rate limit·관측성을 추가할 때
- ERP 어댑터 호출·재시도·트랜잭션 경계를 설계할 때

## 단계 1: API 엔드포인트 (OpenAPI 3.1)

```yaml
openapi: 3.1.0
info: {title: Hoban JHA Agent API, version: 0.1.0}
paths:
  /v1/jha/sessions:
    post:
      summary: 새 JHA 세션 생성 (자연어 작업 입력)
      requestBody: {required: true, content: {application/json: {schema: {$ref: '#/components/schemas/SessionCreate'}}}}
      responses: {201: {content: {application/json: {schema: {$ref: '#/components/schemas/Session'}}}}}
  /v1/jha/sessions/{id}/classify:
    post:
      summary: 분류 추천 (대/중/세부)
      responses: {200: {content: {application/json: {schema: {$ref: '#/components/schemas/ClassificationResult'}}}}}
  /v1/jha/sessions/{id}/assess:
    post:
      summary: 분류 확정 후 위험요인·등급·대책 생성
      responses: {200: {content: {application/json: {schema: {$ref: '#/components/schemas/AssessmentResult'}}}}}
  /v1/jha/sessions/{id}/finalize:
    post:
      summary: 최종 확정 → ERP 등록 큐잉
      responses: {202: {content: {application/json: {schema: {$ref: '#/components/schemas/FinalizationResult'}}}}}
  /v1/jha/citations/{source_row}:
    get:
      summary: 인용 원문 조회
  /v1/jha/feedback:
    post:
      summary: 사용자 피드백 수집
  /v1/health:
    get:
      summary: 헬스 체크
```

스키마는 `_workspace/03_design/api_openapi.yaml`에 전문. frontend·ERP가 병렬 작업 시 계약으로 사용.

## 단계 2: 세션 상태 머신

```
[CREATED]
   │ POST classify
   ▼
[CLASSIFIED]
   │ POST assess (분류 확정)
   ▼
[ASSESSED]
   │ POST finalize (사용자 검토 완료)
   ▼
[REGISTERING] ──fail──> [REGISTER_FAILED] ──retry──> [REGISTERING]
   │ ERP 응답 OK
   ▼
[COMPLETED]
```

상태 변경은 단방향(rollback 금지, 새 세션으로). 저장: Redis (TTL 7일) + PostgreSQL audit.

## 단계 3: LLM API 통합 패턴 (공급자 추상화 — 기본 OpenAI)

LLM 호출은 `services/llm_client.py` 의 **공급자 추상화**(`LLMClient`)로 격리한다.
호출 시그니처(`complete(model_id, system_block, fewshot_block, reference_block, user_content)`)는
공급자 무관이라 `rag_pipeline` 은 변경되지 않는다. 공급자는 `LLM_PROVIDER`(`openai`|`anthropic`|`mock`).

### 추상 인터페이스
```python
class LLMClient(ABC):
    @abstractmethod
    def complete(self, model_id, system_block, fewshot_block,
                 reference_block, user_content) -> LlmResponse: ...

def get_llm() -> LLMClient:  # 팩토리: provider 분기 + 키 부재 시 Mock 폴백
    ...
```

### OpenAIClient (기본) — Structured Outputs
```python
from openai import OpenAI
client = OpenAI()  # OPENAI_API_KEY env

resp = client.chat.completions.create(
    model="gpt-4.1",                # JHA_MODEL_* env 로 교체 가능
    max_tokens=4096,
    temperature=0,                  # 결정성
    messages=[
        {"role": "system", "content": SYSTEM + REFERENCE + FEWSHOT},  # 정적 prefix(자동 캐싱)
        {"role": "user", "content": user_prompt_with_context},        # 가변 입력
    ],
    response_format={"type": "json_schema",
                     "json_schema": JHA_JSON_SCHEMA},  # JHA JSON 스키마 강제
)
```
- 프롬프트 캐싱은 OpenAI 가 **자동**(cache_control 마킹 불필요). 적중은 `cached_tokens` 로 노출.
- 모호 케이스(extended thinking 대응)는 상위 모델(`JHA_MODEL_COMPLEX`) 분기 또는 reasoning 모델로
  단순화(기본은 동일 모델 유지).

### AnthropicClient (레거시 옵션)
`LLM_PROVIDER=anthropic` 시 사용. prompt caching 4블록(`cache_control`) + opus temperature 예외
(`thinking={"type":"adaptive"}`) 경로를 이 클라이언트에만 보존한다(`pip install anthropic`).

### Streaming (분류·평가 응답)
긴 응답은 stream으로 frontend에 점진 전달(SSE/chunked). 공급자별 stream API 차이는 클라이언트가 흡수.

### Tool Use (옵션, 평가 후 도입)
공급자 공통 function/tool calling: `search_jha_kb` · `get_legal_citation` · `classify_work_type`.

### 모델 ID 환경변수 (전부 env 교체 가능 — 조직 가용 모델로)
- `JHA_MODEL_CLASSIFY` (기본 `gpt-4.1`)
- `JHA_MODEL_ASSESS` (기본 `gpt-4.1`)
- `JHA_MODEL_COMPLEX` (모호 케이스 2차, 기본 `gpt-4.1`)
- `JHA_MODEL_JUDGE` / `JUDGE_MODEL` (eval, 기본 `gpt-4.1`)

## 단계 4: RAG 파이프라인 오케스트레이션

```python
async def assess(session_id, classification):
    # 1) 의도 추출 + 메타 필터
    filters = build_filters(classification)
    # 2) 인덱스 검색 (data-engineer 클라이언트)
    chunks = await kb_client.hybrid_search(query, filters=filters, top_k=20)
    # 3) 보안 화이트리스트 검증
    safe_chunks = whitelist_filter(chunks)
    # 4) Claude 호출 (prompt caching)
    response = await claude_call(system, fewshot, safe_chunks, user_query)
    # 5) JSON 파싱 + 인용 검증
    result = parse_and_validate(response, safe_chunks)
    # 6) 도메인 후처리 (등급·중점등록 일관성 체크)
    result = domain_postprocess(result)
    # 7) 세션 상태 업데이트
    await session_store.update(session_id, "ASSESSED", result)
    return result
```

각 단계 timeout (예: 검색 2s, Claude 30s, ERP 5s) + 재시도(지수 백오프) + circuit breaker.

## 단계 5: 인증·권한

### PoC
- OIDC (호반 SSO) 또는 JWT 발급 엔드포인트
- 역할(role): `worker`, `safety_manager`, `admin`
- 권한 매트릭스:
  - `worker`: sessions 생성·classify·assess 가능, finalize 불가
  - `safety_manager`: 전체 가능 + 다른 사용자 세션 조회
  - `admin`: + 평가 트리거·통계 조회

### 보안 헤더
- `X-Request-ID` 강제
- CORS 화이트리스트 (frontend 도메인만)
- rate limit: 사용자별 60 req/min, 세션 생성 10/min

## 단계 6: 관측성

### 로그 (구조화 JSON)
```json
{
  "ts": "...", "level": "INFO", "request_id": "...", "session_id": "...",
  "phase": "claude_call", "model": "claude-sonnet-4-6",
  "input_tokens": 1234, "output_tokens": 567,
  "cache_creation_tokens": 800, "cache_read_tokens": 1100,
  "latency_ms": 1820, "user_id": "..."
}
```

### 메트릭 (Prometheus)
- `jha_request_total{endpoint, status}`
- `jha_claude_latency_seconds{model, phase}`
- `jha_claude_cache_hit_ratio{model}`
- `jha_rag_search_latency_seconds`
- `jha_erp_register_failures_total`
- `jha_cost_estimated_usd{model}` (토큰×단가)

### 트레이싱
OpenTelemetry. spans: `session_create` → `classify` → `kb_search` → `claude_call` → `parse` → `assess` → `finalize` → `erp_register`.

## 단계 7: ERP 어댑터 호출

```python
# Outbox 패턴
async def finalize(session_id):
    result = await session_store.get(session_id)
    outbox_id = await outbox.append({"session_id": session_id, "payload": result})
    await session_store.update(session_id, "REGISTERING")
    return {"status": "queued", "outbox_id": outbox_id}

# 백그라운드 워커
async def outbox_worker():
    while True:
        entry = await outbox.dequeue()
        try:
            erp_id = await erp_adapter.register(entry.payload, idempotency_key=entry.id)
            await session_store.update(entry.session_id, "COMPLETED", erp_id=erp_id)
        except ErpRetryable as e:
            await outbox.requeue(entry, delay=backoff(entry.attempts))
        except ErpFatal as e:
            await session_store.update(entry.session_id, "REGISTER_FAILED", error=str(e))
            await alert.send("erp_register_fatal", entry)
```

## 단계 8: 에러 응답 표준

```json
{"error": {"code": "RAG_NO_MATCH","message": "관련 표준 데이터를 찾지 못했습니다.","details": {...},"request_id": "..."}}
```

코드 체계:
- `AUTH_*` (4xx)
- `VALIDATION_*` (4xx)
- `RAG_*` (200 + result_type 또는 5xx)
- `LLM_*` (5xx, 재시도 가능 여부 명시)
- `ERP_*` (202 큐잉 또는 5xx)
- `INTERNAL_*` (5xx)

## 단계 9: 디렉토리 구조

```
_workspace/04_build/backend/
├─ app/
│  ├─ main.py
│  ├─ routes/
│  │   ├─ sessions.py
│  │   ├─ citations.py
│  │   └─ feedback.py
│  ├─ services/
│  │   ├─ llm_client.py (공급자 추상화: OpenAI 기본·Anthropic 레거시·Mock)
│  │   ├─ claude_client.py (레거시 호환 shim → llm_client)
│  │   ├─ rag_pipeline.py
│  │   ├─ session_store.py
│  │   └─ domain_postprocess.py
│  ├─ adapters/
│  │   ├─ kb_client.py (data-engineer 인덱스)
│  │   └─ erp_adapter.py (erp-integration-engineer)
│  ├─ schemas/ (Pydantic)
│  ├─ middleware/ (auth, logging, rate_limit)
│  └─ outbox/ (worker)
├─ tests/ (pytest)
├─ Dockerfile
├─ pyproject.toml
└─ README.md
```

## 적용 우선순위

1. **계약 우선** (OpenAPI 먼저)
2. **결정적 응답** (temperature=0 기본)
3. **모든 호출 로깅** (토큰·비용 가시화)
4. **외부 호출 = 재시도 + circuit breaker**
5. **ERP는 비동기 큐잉 (사용자 응답 지연 방지)**

## references/

- `references/openapi_full_spec.yaml` — 전체 OpenAPI (길어서 분리)
- `references/claude_caching_patterns.md` — (레거시) Claude caching 패턴. 기본 경로 OpenAI 는 자동 캐싱.
- `references/observability_dashboards.md` — Grafana 대시보드 템플릿
