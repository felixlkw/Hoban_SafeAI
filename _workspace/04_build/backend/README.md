# Hoban JHA Agent — Backend (FastAPI)

호반그룹 LLM/RAG 기반 작업위험성평가(JHA) 지원 에이전트 PoC 백엔드.
계약 우선(`_workspace/03_design/api_openapi.yaml`)으로 구현된 FastAPI 서비스.

## 구성

```
app/
  main.py                  FastAPI 앱 조립 + 전역 예외 핸들러
  config.py                환경 설정(모델 ID·경로·하이퍼파라미터)
  errors.py                도메인 예외 → HTTP 매핑
  schemas/models.py        Pydantic v2 스키마(OpenAPI 정합)
  routes/
    sessions.py            세션 워크플로우(create/classify/assess/review/finalize/get)
    citations.py           인용 원문 조회(GET /citations/{source_row})
    feedback.py            사용자 피드백 수집(eval 연계)
    health.py              헬스 체크(의존성 포함)
  services/
    rag_pipeline.py        RAG 오케스트레이션(의도추출→prefilter→BM25→LLM→후처리)
    llm_client.py          LLM 공급자 추상화(OpenAI 기본·Anthropic 레거시·Mock)
    claude_client.py       레거시 호환 shim → llm_client 재노출
    domain_postprocess.py  G4~G8 도메인 후처리(등급 재계산·인용검증·경계셀)
    security_gate.py       화이트리스트 필터 + PII 마스킹
    session_store.py       세션 저장소 + 상태머신(인메모리, Redis 호환)
  adapters/
    kb_client.py           BM25 인덱스 로드·검색(bm25_index.pkl)
    erp_adapter.py         ERP 어댑터 추상 + MockErpAdapter(7 시나리오)
  outbox/worker.py         Outbox 패턴(백오프 재시도·idempotency)
  middleware/
    auth.py                간이 JWT 역할(worker/safety_manager/admin)
    logging.py             request_id 트레이싱 + 구조화 로그
tests/                     pytest 단위·통합 테스트(35건)
```

## 설치

```bash
cd _workspace/04_build/backend
pip install fastapi uvicorn pydantic rank-bm25 openai
# 선택(권장): 인덱스와 동일 형태소 토크나이저
pip install kiwipiepy
# 선택: 레거시 Anthropic 공급자(LLM_PROVIDER=anthropic 일 때만)
pip install anthropic
# 테스트
pip install pytest httpx
```

## LLM 공급자

기본 공급자는 **OpenAI**. `LLM_PROVIDER` 환경변수로 전환한다(`openai`|`anthropic`|`mock`).
키 부재 시 자동 **Mock 폴백**(외부 호출 없이 전체 플로우 동작).

- **OpenAI(기본)**: Chat Completions + **Structured Outputs(json_schema)** 로 JHA JSON
  스키마를 강제. `temperature=0`. 프롬프트 캐싱은 OpenAI 가 자동 처리(별도 마킹 불필요).
- **Anthropic(레거시)**: `LLM_PROVIDER=anthropic` + `pip install anthropic` 시 사용.
  기존 prompt caching 4블록 + opus temperature 예외 경로 보존.
- **Mock**: 키 부재 또는 `JHA_FORCE_MOCK=true` 시. 검색 청크 메타로 결정적 JSON 생성.

`.env` 는 `backend/.env` 위치. `.env.example` 복사 후 키 입력:

```bash
cp .env.example .env
# .env: OPENAI_API_KEY=sk-...
```

## 실행

```bash
# Mock 모드(OPENAI_API_KEY 미설정) — 외부 호출 없이 전체 플로우 동작
uvicorn app.main:app --reload --port 8000

# 실 OpenAI 모드
export OPENAI_API_KEY=sk-...
uvicorn app.main:app --port 8000
```

문서: http://localhost:8000/docs (Swagger UI)

### 주요 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `LLM_PROVIDER` | openai | `openai`\|`anthropic`\|`mock` |
| `OPENAI_API_KEY` | (없음) | 미설정 시 Mock 폴백(데모/테스트) |
| `ANTHROPIC_API_KEY` | (없음) | 레거시 공급자 키(`LLM_PROVIDER=anthropic` 시) |
| `JHA_FORCE_MOCK` | false | true 면 키가 있어도 Mock 강제 |
| `JHA_AUTH_ENABLED` | true | false 면 인증 우회(기본 worker 권한) |
| `JHA_JWT_SECRET` | poc-dev-secret | PoC JWT HS256 시크릿 |
| `JHA_MODEL_CLASSIFY` / `_ASSESS` | gpt-4.1 | 분류·평가 모델(A/B용, 조직 가용 모델로 교체 가능) |
| `JHA_MODEL_COMPLEX` | gpt-4.1 | confidence<0.7 모호 케이스 2차(상위/reasoning 모델로 교체 가능) |
| `JHA_MODEL_JUDGE` | gpt-4.1 | (eval) LLM-as-judge 모델 |
| `JHA_BM25_INDEX` | `02_foundation/bm25_index.pkl` | BM25 인덱스 경로 |

> 기본 모델 ID(`gpt-4.1`)는 조직 가용 모델로 교체 가능하다. 모든 모델 ID는 env 오버라이드를
> 지원하므로 ID 가 바뀌어도 코드 수정이 필요 없다.

## Mock 모드 데모 절차

OPENAI_API_KEY 없이 `uvicorn app.main:app` 실행 후(또는 `JHA_AUTH_ENABLED=false`):

```bash
# 1. 헬스 체크 (인덱스 로드 확인)
curl http://localhost:8000/v1/health

# 2. 세션 생성
SID=$(curl -s -X POST http://localhost:8000/v1/jha/sessions \
  -H 'Content-Type: application/json' \
  -d '{"work_description":"타워크레인 마스트 해체 작업"}' | python -c "import sys,json;print(json.load(sys.stdin)['session_id'])")

# 3. 분류 추천 (classification.alternatives[] 포함)
curl -s -X POST http://localhost:8000/v1/jha/sessions/$SID/classify | python -m json.tool

# 4. 위험성평가 (등급 코드 재계산·인용검증·경계셀 판정)
curl -s -X POST http://localhost:8000/v1/jha/sessions/$SID/assess \
  -H 'Content-Type: application/json' -d '{}' | python -m json.tool

# 5. (경계셀이면 PENDING_REVIEW → review 필요, 아니면) ERP 등록 큐잉
curl -s -X POST http://localhost:8000/v1/jha/sessions/$SID/finalize \
  -H 'Content-Type: application/json' -d '{"site_id":"HB-DEMO-001"}' | python -m json.tool

# 6. 세션 상태 조회 (erp = {status, erp_id, queue_position})
curl -s http://localhost:8000/v1/jha/sessions/$SID | python -m json.tool

# 7. 인용 원문 조회 (text/meta/score, 화이트리스트 필드만)
curl -s http://localhost:8000/v1/jha/citations/2 | python -m json.tool
```

### 역할 분기 데모(인증 활성)

`JHA_AUTH_ENABLED=true` 로 실행 시 `Authorization: Bearer <jwt>` 필요.
PoC 토큰 발급:

```python
from app.middleware.auth import encode_token
print(encode_token("w1", "worker"))          # 작업자
print(encode_token("m1", "safety_manager"))  # 안전관리자(review 전용 권한)
```

곱16 경계셀(강도4×빈도4) 세션은 `human_review_required=true`, `critical_register="O (잠정)"`.
안전관리자(`safety_manager`)가 `/review` 로 확정해야 `/finalize` 가 통과한다(미확정 시 409).
worker 가 `/review` 호출 시 403(AUTH_INSUFFICIENT_ROLE).

## 테스트

```bash
pytest -q
# 35 passed
```

커버리지: 상태머신 전이·409 차단, 등급 재계산(곱16 경계셀), citations⊆retrieved 검증,
MockERP 7 시나리오, Outbox 백오프(N=5)·idempotency, 화이트리스트 게이트·PII 마스킹,
API 전체 플로우·역할 권한.

## 동작 메모

- **Mock 모드**: `llm_client.MockLLMClient` 가 검색 청크 메타(severity/frequency/
  accident_type/chunk_id)로 결정적 JSON 을 생성한다. 실 LLM 없이도 G5~G8 후처리·
  상태머신·ERP 게이트를 end-to-end 검증할 수 있다.
- **코드 권위**: LLM 응답의 등급·중점등록·source_rows 는 코드가 재계산/재검증한다
  (`domain_postprocess`). 곱16 경계셀은 3중 강제(grade=상 / "O (잠정)" / human_review).
- **보안**: 외부 LLM 전송 전 `security_gate.whitelist_filter` 통과. 화이트리스트 미등록
  필드 발견 시 SecurityViolation(500, 외부 미전송).
- **Outbox**: 인메모리 PoC. `idempotency_key = outbox_entry_id`. 백오프 1·2·4·8s,
  최대 N=5. 운영 전환 시 PostgreSQL outbox 테이블 + 별도 워커 프로세스.
```
