---
name: jha-data-prep
description: "호반그룹 전사 하위공종 위험요인 Excel(4,469행)의 정제·정규화·청킹·임베딩 인덱스 구축 워크플로우. 결측 진단, 동의어 통합, 메타데이터 스키마 확정, 행 단위 청크 + 메타데이터 inline 포맷, BGE-M3/multilingual-e5 벡터화, Chroma/Qdrant 인덱싱, ETL 동기화·재인덱싱·PII 마스킹·화이트리스트 정책을 단계별로 정의한다. data-engineer가 데이터 자산화 작업 수행 시 반드시 이 스킬을 사용한다."
---

# JHA Data Preparation — 데이터 자산화 워크플로우

## 언제 사용하는가

- 원본 Excel을 LLM/RAG가 사용할 수 있는 형태로 변환할 때
- 청크 포맷·메타데이터 스키마를 결정할 때
- 임베딩 모델을 선정·교체할 때
- 인덱스 부분 재구축이 필요할 때
- ERP↔벡터 DB 동기화 파이프라인을 설계할 때
- PII 마스킹·외부 LLM 화이트리스트를 정의할 때

## 핵심 데이터 사실

- **파일**: `_workspace/00_input/전사 하위공종 위험요인_20260518.xlsx` (490KB)
- **시트**: `Sheet1` 단일
- **크기**: 4,469 행 × 11 컬럼
- **인코딩**: UTF-8 (한국어), 일부 cp949 잔재 가능 → openpyxl 사용 권장
- **카디널리티**: 대공종 20 / 중공종 254 / 세부항목 1,182 / 재해형태 21
- **분포**: 등급(상 518 / 중 1,507 / 하 2,444), 중점등록(O 518 / X 3,951)

## 단계 1: 데이터 진단

`scripts/etl/profile.py`로 자동 진단:
- 컬럼별 결측·중복·이상값·카디널리티
- 강도/빈도 범위(1~5) 위반
- 위험등급 비-(상/중/하) 값
- 위험요인·개선대책 텍스트 길이 분포·이상치
- 인코딩 이슈(cp949 의심 문자열)

산출: `_workspace/01_discovery/data_profile.md` (마크다운 보고서)

## 단계 2: 정제 규칙

### 텍스트 정규화 (위험요인·개선대책)
- 선행 "- " 불릿 → 공백 trim (유지 옵션은 metadata)
- 다중 공백/탭 → 단일 공백
- "  - " 다중 줄 → "·" 구분 또는 "\n" (rag-architect 합의)
- 영문 약어 통일 (예: T/C ↔ T형 ↔ Tower Crane → "타워크레인(T형)" 정규형)
- 단위 정규화 (m/s, mm/hr 등)

### 동의어 통합 (safety-domain-expert 가이드 기반)
- 재해형태 동의어 사전 적용 (`references/synonym_map.csv`)
- 위험요인 텍스트 내 동의어는 정규형 + 원형 병기 (검색 recall ↑)

### 분류 ID 부여
- 대공종/중공종/세부항목 각각 정규명 → ID (예: `MAJ-가설공사 → MJ001`, `SUB-타워크레인T형 → SB003`)
- ID는 안정적(재정렬 영향 없음). 변경 시 별도 마이그레이션 로그.

### 정합성 검증
- 강도×빈도와 등급 곱 정합성 검증 (단계 1 진단 결과 기반)
- 불일치 행은 `[도메인 검증 필요]` 태그 + safety-domain-expert에게 보고

## 단계 3: 메타데이터 JSON 스키마

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "source_row": {"type": "integer", "description": "원본 Excel 행 번호 (2부터)"},
    "major_type_id": {"type": "string"},
    "major_type": {"type": "string"},
    "sub_type_id": {"type": "string"},
    "sub_type": {"type": "string"},
    "detail_item_id": {"type": "string"},
    "detail_item": {"type": "string"},
    "hazard_text": {"type": "string"},
    "accident_type": {"type": "string", "enum": ["추락","낙하","전도","협착","충돌","감전","화재","폭발","질식","근골격계","질환","비래","붕괴","도괴","베임","찔림","절단","말림","골절","직업성 질환","기타"]},
    "severity": {"type": "integer", "minimum": 1, "maximum": 5},
    "frequency": {"type": "integer", "minimum": 1, "maximum": 5},
    "risk_grade": {"type": "string", "enum": ["상","중","하"]},
    "critical_register": {"type": "string", "enum": ["O","X"]},
    "controls": {"type": "string"},
    "legal_refs": {"type": "array", "items": {"type": "string"}},
    "last_modified": {"type": "string", "format": "date-time"},
    "chunk_id": {"type": "string"},
    "content_hash": {"type": "string"}
  },
  "required": ["source_row","major_type","sub_type","detail_item","hazard_text","accident_type","severity","frequency","risk_grade","critical_register","controls","chunk_id","content_hash"]
}
```

## 단계 4: 청킹 포맷

### 기본: 행 단위 청크
한 행 = 한 청크. 텍스트 포맷:
```
[대공종: {major_type} / 중공종: {sub_type} / 세부항목: {detail_item} / 재해형태: {accident_type}]
[등급: {risk_grade} (강도 {severity} × 빈도 {frequency}) / 중점등록: {critical_register}]
위험요인:
{hazard_text}
개선대책:
{controls}
```

- 길이 상한: 400 토큰 (대부분 200 이내)
- 메타데이터 inline → 단독 검색·인용 시 문맥 보존
- chunk_id: `R{source_row:05d}` (예: R00042)
- content_hash: text의 SHA-256 (재인덱싱 차분 검출용)

### 옵션: 묶음 청크
동일 세부항목 내 위험요인 다수일 때 묶음 옵션 (rag-architect 결정). 묶음 청크는 ID `G{detail_item_id}_001` 형식.

## 단계 5: 임베딩 모델 비교

| 모델 | 차원 | 한국어 MTEB | 라이선스 | 온프레미스 | 비용/1M tokens |
|------|------|------------|---------|----------|--------------|
| BGE-M3 | 1024 | 강 | Apache-2.0 | 가능 | 자가 호스팅 |
| multilingual-e5-large | 1024 | 중상 | MIT | 가능 | 자가 호스팅 |
| KoSimCSE-roberta | 768 | 중 | Apache-2.0 | 가능 | 자가 호스팅 |
| OpenAI text-embedding-3-large | 3072 | 강 | API | 불가 | $0.13 |

**PoC 권장**: BGE-M3 (한국어·다국어 강건, 온프레미스 가능, 보안 정책 부합)

## 단계 6: 벡터 인덱스

- **저장소**: Chroma (PoC 간편) 또는 Qdrant (확장성). 둘 다 온프레미스 가능.
- **인덱스 키**: chunk_id
- **메타데이터 필드 인덱싱**: major_type_id, sub_type_id, accident_type, risk_grade, critical_register (prefilter 용)
- **BM25 보조 인덱스**: Kiwi 또는 Mecab 토크나이저 + Whoosh/Tantivy (한국어 형태소 분석)

## 단계 7: ETL/동기화 파이프라인

### 변경분 감지
- 매 동기화마다 행별 content_hash 비교
- 신규/변경/삭제 분류 → 부분 재인덱싱

### 트리거 옵션
- **배치 (권장 PoC)**: 일 1회 또는 ERP 변경 알림 webhook
- **CDC**: ERP DB log 기반 (운영 전환 시 검토)

### 안전 절차
1. 인덱스는 blue/green 또는 alias 패턴 (다운타임 0)
2. 변경 비율 > 5% 시 자동 회귀 평가 트리거 (eval-engineer)
3. 실패 시 이전 인덱스 alias 유지 + 알림

## 단계 8: 보안 게이트

### PII 마스킹
- 정규식 패턴: 주민번호(\d{6}-?\d{7}), 연락처(010-\d{4}-\d{4}), 이메일
- 작업자명 후보 패턴 (성씨+1~2자): NER 또는 사전 기반 — 의심 시 마스킹 후 검수
- 마스킹 결과: 원본은 archive에 암호화 저장, 활성 인덱스는 마스킹본

### 외부 LLM 화이트리스트
외부 Claude API에 보낼 수 있는 필드만 명시적 허용:
- ✅ 허용: major_type, sub_type, detail_item, hazard_text, controls, legal_refs, risk_grade, severity, frequency, accident_type
- ❌ 차단: source_row 내부 ID, 현장 코드, 작업자 ID, 부서 코드 (메타로만 사용)

검증: backend-engineer가 호출 전 화이트리스트 외 필드 존재 시 500 에러 + 보안팀 알림.

## 산출물 (디렉토리 구조)

```
_workspace/
├─ 00_input/전사 하위공종 위험요인_20260518.xlsx
├─ 01_discovery/data_profile.md
├─ 02_foundation/
│   ├─ data_schema.json
│   ├─ data_cleaned.parquet
│   ├─ chunks.jsonl
│   ├─ taxonomy_lookup/{major,sub,detail}.csv
│   ├─ etl_pipeline.md
│   └─ data_security_policy.md
└─ 04_build/scripts/etl/
    ├─ profile.py
    ├─ clean.py
    ├─ chunk.py
    ├─ index.py
    └─ sync.py
```

## 적용 우선순위

1. **원본 보존, 정제는 별도 산출물**
2. **재현 가능한 스크립트만 사용** (수동 편집 금지)
3. **source_row 메타데이터로 lineage 추적**
4. **PII 의심 시 마스킹부터, 검수는 사후**
5. **인덱스 변경 시 회귀 평가 트리거**
