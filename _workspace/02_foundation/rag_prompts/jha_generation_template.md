# JHA Generation Template — 입력→JSON 출력 스키마 v1.0

> 작성: rag-architect · Phase 2 (Foundation) Wave 2
> 기반: `jha-rag-design` SKILL 출력 스키마 + `human_review_flags` 등 확정 명세 필드 추가.
> 용도: Claude `output_config.format` json_schema로 강제. backend 파싱·frontend 렌더링 계약.

---

## 1. 입력 → 출력 흐름

```
입력: 사용자 자연어 작업 설명 + STAGE 5 검색 결과(top_k_final 청크)
출력: 아래 JSON 스키마 단일 객체 (스키마 외 텍스트 금지)
```

생성 절차(프롬프트가 LLM에 요구):
- (a) 대/중/세부 분류 추천 + confidence
- (b) 재해형태별 위험요인 후보 (검색 결과 근거)
- (c) 강도×빈도 산정 + 잠정 등급 + 경계셀 플래그
- (d) 개선대책 (검색 결과 근거)
- (e) 인용 source_row(chunk_id) 목록 + 법적 인용
- (f) human_review_flags (경계셀·갭·법정후보·저신뢰)

---

## 2. JSON 출력 스키마

```json
{
  "result_type": "ok | low_confidence | no_match | refuse",
  "classification": {
    "major_type": "string|null",
    "sub_type": "string|null",
    "detail_item": "string|null",
    "confidence": 0.0
  },
  "hazards": [
    {
      "accident_type": "추락|낙하|전도|협착|충돌|감전|화재|폭발|질식|근골격계|질환|비래|붕괴|도괴|베임|찔림|절단|말림|골절|직업성 질환|기타",
      "description": "string (검색 결과 근거 위험요인)",
      "severity": 0,
      "frequency": 0,
      "risk_grade": "상|중|하",
      "boundary_cell": false,
      "controls": ["string (검색 결과 근거 개선대책)"],
      "citations": ["R00042", "R00128"],
      "legal_refs": ["산업안전보건기준에 관한 규칙 §43"]
    }
  ],
  "critical_register": "O|X|O (잠정)",
  "critical_register_reasons": ["string (예: 위험등급 상)"],
  "legal_refs": ["string (응답 전체 인용 합집합)"],
  "human_review_flags": {
    "boundary_cell": false,
    "human_review_required": false,
    "legal_critical_candidate": false,
    "data_gap": false,
    "gap_areas": [],
    "low_citation_confidence": false
  },
  "warnings": ["string"],
  "source_rows": [42, 128]
}
```

---

## 3. 필드 규약 (backend 후처리 계약)

| 필드 | LLM 채움 | backend 검증/재계산 |
|------|---------|--------------------|
| `result_type` | LLM 1차 판정 | 검색 게이트·인용검증 결과로 최종 결정 |
| `classification.confidence` | 0.0~1.0 정직 기재 | <0.7 → opus-4-7 2차 호출 트리거 |
| `hazards[].severity/frequency` | 정수 1~5 산정 | 범위 검증(1~5) |
| `hazards[].risk_grade` | 잠정 등급 | **코드 재계산**: 하≤9/중10~15/상≥16. LLM과 불일치 시 코드 우선 |
| `hazards[].boundary_cell` | severity==4 & frequency==4 → true | 코드 재검증. true면 grade="상" 고정·human_review |
| `hazards[].citations` | chunk_id 배열 | **citations ⊆ retrieved chunk_ids 검증**. 외부 인용 시 재생성 |
| `hazards[].legal_refs` | 필수 영역 조문 | 의무영역 누락 시 재생성(legal_citation_matrix) |
| `critical_register` | grade 종속 | 코드 재계산: "O" iff 최종 grade=="상". 곱16→"O (잠정)" |
| `human_review_flags.*` | 1차 표시 | 코드가 권위 있게 set(곱16·갭·법정후보·저신뢰) |
| `source_rows` | citations의 source_row 합집합 | chunk_id→source_row 역추적 검산. ERP 등록 키 |

### human_review_flags 세부
- `boundary_cell` / `human_review_required`: 곱16(강도4×빈도4)인 hazard 존재 시 true. ERP 등록 전 게이트(미확인 등록 차단).
- `legal_critical_candidate`: 법정 중점관리 작업인데 등급 중/하일 때 true(자동 O 승급 안 함).
- `data_gap` + `gap_areas`: 밀폐공간/화학물질/석면/작업환경측정 탐지 시. full refuse면 result_type="refuse".
- `low_citation_confidence`: 인용은 있으나 검색 score 약함(BM25 top1<5.0 등).

---

## 4. result_type별 응답 형태

| result_type | 의미 | hazards | 비고 |
|-------------|------|---------|------|
| `ok` | 정상 추천 | 채움 | 인용·등급·중점등록 완비 |
| `low_confidence` | 유사 사례 있으나 약함 | 채우되 warnings 경고 | "정확 매칭 아님" + 후보 표시 |
| `no_match` | 검색 0건/무관 | 빈 배열 | "관련 표준 데이터가 없습니다 — 안전관리자 문의" |
| `refuse` | 갭 full refuse(석면 등)/비작업 입력 | 빈 배열 | 조문은 표시 가능, 대책 생성 안 함 |

> partial refuse(GS-0005 밀폐공간 등): result_type="low_confidence" 또는 "ok" + `data_gap=true`로, 응답 가능한 위험(예: 추락)은 인용 근거로 채우고 갭 위험(질식 절차)은 warnings로 분리.

## 변경 이력
→ `CHANGELOG.md` 참조.
