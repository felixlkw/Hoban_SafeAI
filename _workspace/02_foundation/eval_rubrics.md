# Eval Rubrics — LLM-as-judge Prompt 전문 (Foundation)

> 작성: eval-engineer · Phase 2 (Foundation) Wave 2
> 근거: `jha-eval-design` SKILL §3 judge 템플릿 + `safety_rubric.md` §2.5(faithfulness)·§2.7(control verifiability)
> 평가 LLM: **claude-opus-4-7** (judge_model). 결정적 메트릭(분류·coverage·등급·인용·refuse)은 코드로 처리하고, **주관 메트릭 2종만 judge** 사용.
> 편향 점검: 동일 응답 3회 평가 → score variance **< 0.5** 요구(불만족 시 judge 결과 무효·재실행).

---

## 0. Judge 공통 규약

1. **모델**: `claude-opus-4-7`. temperature=0.0 (재현성). max_tokens=1024.
2. **출력**: 반드시 단일 JSON object. 파싱 실패 시 1회 재시도, 재실패는 manual review 큐.
3. **컨텍스트 주입**: 검색된 source_row 원문(retrieved_chunks)을 컨텍스트로 제공. retrieved가 비면 judge skip(점수 null, "검색 컨텍스트 없음" 기록).
4. **편향 점검 프로토콜**: 무작위 표본 케이스에 대해 동일 (응답, 컨텍스트)를 3회 독립 호출. 3점수의 표본분산 ≥ 0.5면 해당 메트릭 judge 신뢰 불가 → rubric 문구 정제 후 재측정. variance는 보고서에 `judge_variance` 필드로 기록.
5. **position/length 편향 점검**: 길이가 긴 응답에 후한 점수를 주는 경향 점검 — 동일 내용을 장/단 2버전으로 만들어 점수차 < 0.5 확인(분기별 1회).

---

## 1. Faithfulness (충실성 — 환각 방지) · 1~5

**메트릭 의미**(rubric §2.5): 출력의 모든 위험요인·개선대책이 검색된 source_row에 근거하는가. 데이터 없는 위험 추측 금지(R3). 검색 결과에 없는 밀폐공간·화학물질 대책 생성 시 ≤2.

### Prompt 전문

```text
당신은 한국 건설안전(JHA) 도메인의 엄격한 평가자입니다.
아래 [응답]의 모든 주장(위험요인·위험등급·개선대책)이 제공된 [컨텍스트]에 의해
뒷받침되는지 평가하세요. 컨텍스트에 근거가 없는 위험요인·대책을 생성하면 환각입니다.

[작업 입력]
{task_input}

[컨텍스트 — 검색된 source_row 원문]
{retrieved_chunks}

[응답]
{system_response}

평가 기준 (정수 1~5):
5: 응답의 모든 주장이 컨텍스트로부터 명시적·직접적으로 도출됨
4: 대부분 도출 가능, 1~2개 주장이 약한 추론에 기반(도메인 상식 수준)
3: 약 절반의 주장이 명확히 도출됨, 나머지는 일반론
2: 대부분 컨텍스트와 연결이 약하거나 추측. 컨텍스트에 없는 구체적 대책 생성
1: 컨텍스트와 무관하거나 환각 다수(밀폐공간·화학물질 등 갭영역 대책 임의 생성)

주의:
- "안전모 착용" 같은 일반 안전수칙은 컨텍스트에 없어도 감점하지 않음(도메인 상식).
- 단, 컨텍스트에 없는 **구체적·기술적 대책**(특정 환기량, 특정 약품, 밀폐공간 산소농도 수치 등)을 단정하면 환각으로 간주(≤2).
- 위험등급(상/중/하)이 컨텍스트의 강도·빈도와 모순되면 감점.

다음 JSON 형식으로만 응답:
{"score": <1-5 정수>, "reasoning": "<2~3문장 근거>", "unsupported_claims": ["<컨텍스트 미근거 주장 목록>"]}
```

- **임계**: 평균 ≥ 4.0. score ≤ 2 + 갭영역 케이스 → critical-fail(E-HALL) 연동.
- 파싱: `score`는 1~5 정수. 범위 외/누락 시 재시도.

---

## 2. Control Verifiability (개선대책 실행가능성) · 0~1

**메트릭 의미**(rubric §2.7, R7): 개선대책이 **점검 가능한 행동단위(verifiable action)**인가. "안전모 착용" ❌ → "안전모(턱끈) 착용 후 작업반장이 출입구에서 점검" ✅. 행위주체·행위·점검가능성 3요소 충족도. data 원문을 paraphrase한 경우 원문이 verifiable이면 정답.

### Prompt 전문

```text
당신은 한국 건설안전(JHA) 도메인의 개선대책 품질 평가자입니다.
아래 [개선대책] 각 항목이 현장에서 "점검 가능한 행동단위"인지 평가하세요.
점검 가능한 행동단위 = 다음 3요소를 갖춘 대책:
  (1) 행위주체(누가): 작업자/작업반장/신호수/안전관리자 등 명시 또는 자명
  (2) 행위(무엇을 어떻게): 구체적 동작·설비·기준
  (3) 점검가능성(확인 방법): 제3자가 이행 여부를 관찰·확인 가능

[작업 입력]
{task_input}

[개선대책 목록]
{controls}

[참고 — 데이터 원문 대책(있으면)]
{source_controls}

각 대책을 평가하고 전체 평균 점수(0.0~1.0)를 산출:
1.0: 3요소 모두 명확. 즉시 현장 점검표로 사용 가능
0.7: 행위는 구체적이나 행위주체 또는 점검방법이 암묵적
0.4: 행위는 있으나 추상적("주의한다", "확인한다" 수준)
0.0: 구호성 문구("안전에 유의", "조심히 작업") — 점검 불가

주의:
- 데이터 원문 대책을 paraphrase했고 원문이 verifiable이면 점수 유지.
- "안전모 착용" 단독 = 0.4 (점검 주체·방법 없음). "안전모 턱끈 체결 상태 작업 전 반장 확인" = 1.0.

다음 JSON 형식으로만 응답:
{"score": <0.0-1.0 소수>, "reasoning": "<근거>", "weak_controls": ["<구호성·비점검 대책 목록>"]}
```

- **임계**: 평균 ≥ 0.70. weak_controls 다수 케이스 → E-VERIF 카운트(verifiable action 템플릿 피드백).

---

## 3. Judge 운영·편향 점검 절차

### 3.1 variance 점검 (필수)

```
표본 = 무작위 3~5 케이스 × {faithfulness, control_verifiability}
각 (응답,컨텍스트) → judge 3회 독립 호출(temp=0이어도 비결정성 잔존 가능)
variance = Var([s1, s2, s3])
PASS: variance < 0.5
FAIL: rubric 문구 모호 → 척도 경계 명확화 후 재측정. 보고서 judge_variance에 기록
```

### 3.2 파싱 실패 처리

1회 재시도(동일 prompt). 재실패 → `reports/manual_review_{date}.jsonl`에 (case_id, raw_response) 적재. 메트릭 평균에서 제외(skip 카운트).

### 3.3 judge 미가용(API 키 없음)

`ANTHROPIC_API_KEY` 미설정 시 judge skip → faithfulness·control_verifiability = null. 보고서에 "judge skipped (no API key)" 명시. 결정적 메트릭만으로 부분 보고 생성(self-test·CI smoke 모드).

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | 최초 작성. faithfulness·control verifiability judge prompt 전문 + variance<0.5 편향점검 | Phase 2 Foundation Wave 2 |
