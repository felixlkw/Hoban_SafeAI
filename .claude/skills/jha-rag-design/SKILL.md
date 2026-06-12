---
name: jha-rag-design
description: "호반그룹 JHA RAG 시스템의 검색·생성·환각방지 설계 워크플로우. 메타데이터 prefilter + BM25/Dense 하이브리드 검색, 행 단위 청크 검색, 재순위 조건, 시스템 프롬프트/few-shot/생성 템플릿, 인용 강제·refuse 가드레일, LLM API 최적화(기본 OpenAI: 자동 프롬프트 캐싱·structured outputs·모호케이스 모델분기, Anthropic 레거시)를 단계적으로 정의한다. rag-architect가 RAG 파이프라인 설계·튜닝·프롬프트 작성 시 반드시 이 스킬을 사용한다."
---

# JHA RAG Design — 검색·생성·환각방지 워크플로우

## 언제 사용하는가

- RAG 파이프라인 전체 설계가 필요할 때
- 시스템 프롬프트·few-shot·JHA 생성 템플릿을 작성·수정할 때
- 검색 hyperparameter(top_k, score threshold, BM25/Dense 비율)를 결정·튜닝할 때
- 환각·인용 누락·refuse 정책을 정의·강화할 때
- LLM API 사용 패턴(자동 캐싱·structured outputs·모호케이스 모델분기·tools)을 최적화할 때

## 단계 1: 검색 파이프라인 (3 stage)

### Stage 1: 메타데이터 Prefilter
사용자 입력에서 LLM 또는 룰 기반으로 분류 의도 추출 후, 인덱스 필터로 후보 축소.

| 추출 신호 | 필터 필드 | 효과 |
|----------|----------|------|
| "타워크레인" → sub_type | sub_type_id | 4,469 → 43 |
| "추락" → accident_type | accident_type | 4,469 → 792 |
| "고소작업" → 다중 sub_type 후보 | sub_type_id IN [...] | 4,469 → ~200 |

추출 실패 시 prefilter 건너뜀 (recall 보호).

### Stage 2: 하이브리드 검색
- **Sparse (BM25)**: Kiwi 토크나이저, 한국어 명사·조사 분리
- **Dense (BGE-M3)**: cosine similarity
- 결과 병합: RRF(Reciprocal Rank Fusion) 권장. 가중치 BM25:Dense = 0.4:0.6 (베이스라인)
- top_k = 20 (Stage 3 후보)

### Stage 3: 재순위 (Reranker)
- 후보 20개 → cross-encoder 또는 Cohere/Voyage reranker → top_k = 5
- PoC 베이스라인은 reranker 없이. 평가에서 +3pt 이상 개선 시 도입.

## 단계 2: 시스템 프롬프트 (예시)

```text
당신은 호반그룹 건설현장 작업위험성평가(JHA) 어시스턴트입니다.

규칙:
1. 아래 제공된 [검색 결과] 컨텍스트의 정보만 사용합니다. 컨텍스트에 없는 위험요인·대책은 생성하지 마십시오.
2. 모든 추천 위험요인·대책에 source_row 인용을 [R00042] 형식으로 표기합니다.
3. 위험등급은 KRAS 5×5 매트릭스를 따릅니다. 강도×빈도 ≥ 15 = "상", 8~14 = "중", < 8 = "하".
4. 중점등록(O/X)은 다음 조건 중 하나라도 충족 시 "O": (a) 등급 "상", (b) 산안법 §43 해당, (c) 검색 결과에서 critical_register="O"인 유사 사례 다수.
5. 검색 결과가 빈약하면 (score 모두 < 0.5 또는 0건) 응답을 거절하고 사용자에게 안전관리자 문의를 안내합니다.
6. 응답은 아래 JSON 스키마를 정확히 따릅니다.

[검색 결과]
{retrieved_chunks_with_metadata}

[사용자 입력]
{user_query}
```

## 단계 3: JHA 생성 출력 스키마

```json
{
  "classification": {
    "major_type": "string",
    "sub_type": "string",
    "detail_item": "string",
    "confidence": 0.0
  },
  "hazards": [
    {
      "accident_type": "string",
      "description": "string",
      "severity": 0,
      "frequency": 0,
      "risk_grade": "상|중|하",
      "controls": ["string"],
      "citations": ["R00042","R00128"]
    }
  ],
  "critical_register": "O|X",
  "critical_register_reasons": ["string"],
  "legal_refs": ["string"],
  "warnings": [],
  "result_type": "ok|low_confidence|no_match"
}
```

## 단계 4: Few-shot 예시 선택 규칙

safety-domain-expert의 gold set에서 5~10건 선택. 균형 원칙:
- 등급별: 상 2~3건 / 중 2~3건 / 하 1~2건
- 재해형태별: 추락·낙하·협착·감전·기타 중 다른 카테고리
- 분류 모호 케이스 1건 포함 (LLM이 모호함을 인정하도록 학습)

위치: 시스템 프롬프트 직후, prompt caching 경계 안에 둠.

## 단계 5: LLM API 최적화

LLM 호출은 백엔드 `llm_client.py` 의 **공급자 추상화**를 통한다(기본 **OpenAI**, Anthropic 레거시,
Mock 폴백). RAG 설계는 공급자 무관하게 정적 prefix(system→레퍼런스→few-shot) + 가변 입력 순서를
지킨다.

### Prompt Caching
- **OpenAI(기본)**: 프롬프트 캐싱이 **자동**. 별도 `cache_control` 마킹 불필요 — 정적 prefix를
  가변 입력 앞에 두기만 하면 OpenAI 가 자동 캐싱한다. 적중은 `cached_tokens` 로 노출.
- **Anthropic(레거시)**: `cache_control` 4블록(시스템 끝 / few-shot 끝 / 정적 레퍼런스 / 가변 미캐시)
  마킹. TTL 5분 기본.
- 목표 적중률: > 70%. 미달 시 프롬프트 구조(정적 prefix 순서·경계) 재검토.

### Structured Outputs (OpenAI 기본)
- Chat Completions `response_format={"type":"json_schema", ...}` 로 JHA JSON 스키마를 강제한다.
  스키마 위반 응답을 구조적으로 차단(파싱 실패율↓). `temperature=0` 으로 결정성 확보.

### 모호 케이스 처리 (extended thinking 대응)
- 분류 모호 케이스(`confidence < 0.7`로 1차 판정) → 2차 호출에 상위 모델(`JHA_MODEL_COMPLEX`).
- Claude extended thinking 은 OpenAI 에서 reasoning 모델(o-계열) 또는 동일 모델 유지로 단순화한다
  (기본은 동일 모델 유지 — 결정성·요금 변동 없음). 필요 시 env 로 reasoning 모델 지정.

### Tool Use
LLM이 호출할 수 있는 도구(공급자 공통 function/tool calling):
- `search_jha_kb(query, filters, top_k)` — 추가 검색 필요 시
- `get_legal_citation(law_id)` — 법조문 본문 조회
- `classify_work_type(text)` — 분류 재호출

PoC 베이스라인은 tool 없이 single-shot. 평가에서 분류 정확도 향상 입증 시 도입.

### 모델 선택 (전부 env 교체 가능 — 조직 가용 모델로)
- 분류·추천 단순 케이스: `gpt-4.1` (`JHA_MODEL_CLASSIFY`/`_ASSESS`)
- 모호 케이스·gold set 평가: `gpt-4.1`/상위 모델 (`JHA_MODEL_COMPLEX`)
- 평가 LLM-as-judge: `gpt-4.1` (`JUDGE_MODEL`)
- 레거시 옵션(Anthropic): `LLM_PROVIDER=anthropic` 시 `claude-sonnet-4-6`/`claude-opus-4-7` 경로 사용.

## 단계 6: 환각 방지 가드레일

### 인용 검증
LLM 응답의 `citations` 필드에 명시된 source_row가 실제로 검색 결과(retrieved_chunks)에 있는지 백엔드에서 검증. 외부 source_row 발견 시:
1. 1차 응답 폐기
2. "응답에 인용 검증 실패가 있어 재생성합니다" + 재호출
3. 재실패 시 거절 + 검색 결과 raw 표시

### 응답 구조 검증
- JSON 스키마 위반 → 1회 재생성
- 필수 필드 누락 → 1회 재생성
- 재실패 → raw text + 파싱 실패 플래그

### Refuse 발동 조건
- 검색 결과 0건
- 모든 score < 0.5 (cosine)
- 입력이 작업 설명 아님 (의도 분류 LLM이 reject)
- PII 의심

응답: `result_type = "no_match"` + 안내 메시지.

## 단계 7: 평가 hook

rag-architect는 다음 hyperparameter를 eval-engineer가 스윕 가능하도록 노출:
- `top_k_retrieval` (기본 20)
- `top_k_final` (기본 5)
- `score_threshold` (기본 0.5)
- `bm25_dense_weight` (기본 0.4:0.6)
- `use_reranker` (기본 false)
- `use_extended_thinking` (기본 conditional — OpenAI 에선 모호 케이스 상위 모델 분기로 대응)
- `model_id` (기본 gpt-4.1, env 교체 가능)

설정은 환경변수 + config 파일로 노출. 코드 변경 없이 실험 가능.

## 단계 8: 프롬프트 변경 관리

- 모든 프롬프트는 파일로 존재 (`rag_prompts/*.md`)
- 변경 시 `rag_prompts/CHANGELOG.md`에 추가:
  - 날짜·변경 사유·예상 영향·승인자
- 변경 후 자동 회귀 평가 (eval-engineer)
- 회귀 발견 시 자동 롤백 옵션

## 적용 우선순위

1. **단순 → 복잡** (BM25 단독부터)
2. **출처 없이는 답하지 않는다**
3. **메타데이터 prefilter 우선** (semantic 전에)
4. **모델 의존성 격리** (어댑터 패턴)
5. **모든 변경 후 회귀 평가**

## references/

- `references/prompt_patterns.md` — 시스템 프롬프트 변형 패턴 (분류/추천/검증 단계별)
- `references/hybrid_retrieval_tuning.md` — BM25/Dense 가중치 스윕 결과 템플릿
- `references/claude_caching_patterns.md` — (레거시) Claude prompt caching 패턴. 기본 경로 OpenAI 는 자동 캐싱이라 별도 마킹 불필요.
