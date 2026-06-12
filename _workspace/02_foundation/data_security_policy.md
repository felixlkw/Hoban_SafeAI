# 데이터 보안·개인정보 정책 — 전사 하위공종 위험요인

> 작성: data-engineer (Phase 2 · Foundation)
> 검사 대상: `_workspace/02_foundation/chunks.jsonl` (4,469 청크) + 원본 10개 데이터 컬럼
> 검사 방식: 정규식 스캔 실제 실행 (재현: 본 문서 §1 명령)

## 1. PII 스캔 결과 (실측)

4,469개 청크 text 전수에 대해 패턴 스캔을 실행한 결과:

| 패턴 | 정규식 | 매칭 행 | 판정 |
|------|--------|--------:|------|
| 주민등록번호 | `\d{6}-?\d{7}` | **0** | 없음 |
| 연락처(휴대폰) | `01[016789]-?\d{3,4}-?\d{4}` | **0** | 없음 |
| 이메일 | `[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}` | **0** | 없음 |
| 인명 후보 | `[성씨]+1~2자 + 직책/호칭` | 64 | **전부 오탐(false positive)** |

### 인명 후보 64행 분석 — 전부 오탐

매칭된 64행은 실제 인명이 아니라 안전 용어의 우연 일치였다:
- `"장비 양중"` (자재·장비 양중작업) → 성씨 '양' 오탐
- `"고소작업자"` (고소작업 종사자, 일반명사) → 성씨 '고' 오탐
- `"이는 양"` (문장 조각) → 오탐

**결론: 본 데이터셋에는 실제 PII(주민번호·연락처·이메일·특정 개인 식별 인명)가 존재하지 않는다.**
데이터는 작업 유형별 일반화된 위험요인·개선대책 카탈로그이며, 개인·현장 식별 정보를 포함하지 않는다.

### 재현 명령
```bash
python - <<'PY'
import re, json
chunks=[json.loads(l) for l in open('_workspace/02_foundation/chunks.jsonl',encoding='utf-8')]
pats={'ssn':r'\d{6}-?\d{7}','phone':r'01[016789]-?\d{3,4}-?\d{4}','email':r'[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}'}
for n,p in pats.items():
    print(n, sum(1 for c in chunks if re.search(p,c['text'])))
PY
```

## 2. 잠재 PII 재유입 게이트 (운영 시)

현재는 PII 0건이나, ERP 동기화/추가 데이터 유입 시 재유입 가능. ETL `clean.py`에 다음 게이트를 상시 적용한다(운영 전환 시 활성화):

| 단계 | 동작 |
|------|------|
| 1. 스캔 | 신규/변경 행에 §1 정규식 + NER(선택) 적용 |
| 2. 마스킹 | 주민번호→`******-*******`, 연락처→`010-****-****`, 이메일→`***@***`, 확정 인명→`[작업자]` |
| 3. 격리 | 마스킹 확신 낮은 행은 `data_quarantine.jsonl` 격리 후 검수 |
| 4. 아카이브 | 원본은 암호화 보관(접근 통제), 활성 인덱스는 마스킹본만 |

## 3. 외부 LLM 화이트리스트

외부 Claude API 호출 시 **명시적으로 허용된 필드만** 전송한다. backend-engineer는 호출 직전 화이트리스트 외 필드 존재 시 차단(500 + 보안팀 알림)한다.

### 허용 (전송 가능) — 작업 안전 의미 필드
| 필드 | 사유 |
|------|------|
| `major_type` / `sub_type` / `detail_item` | 공종 분류명 (작업 유형, 비식별) |
| `accident_type` | 재해형태 (분류값) |
| `severity` / `frequency` / `risk_product` / `risk_grade` | 위험도 산정값 (코드) |
| `critical_register` | 중점등록 O/X |
| `hazard_text` / `hazard_items` | 위험요인 (일반화 텍스트, PII 0건 검증됨) |
| `controls` / `controls_items` | 개선대책 (일반화 텍스트) |
| `legal_refs` | 법령 조문 (공개 정보) |

### 차단 (내부 전용, 메타·검색 키로만 사용)
| 필드 | 사유 |
|------|------|
| `source_row` | 원본 행 번호 (lineage 내부 키). 인용은 chunk_id로 표면화, 행번호 직접 노출 불필요 |
| `chunk_id` / `content_hash` | 내부 식별·차분 키 |
| `major_type_id` / `sub_type_id` / `detail_item_id` | 내부 분류 ID (prefilter 전용) |
| `dup_group` / `dup_content_of` | 내부 중복 추적 메타 |

> ERP 연동 시 현장 코드·작업자 ID·부서 코드가 메타에 매핑되면(erp-integration-engineer 규약) **무조건 차단 목록**에 추가. 외부 LLM 전송 절대 금지.

## 4. 화이트리스트 적용 지점 (backend 송신)

- RAG 검색: prefilter는 내부 ID(차단 필드)로 수행 → 가능. 결과를 LLM 프롬프트에 넣을 때 **허용 필드만** 직렬화.
- 검증 훅: 프롬프트 빌더가 화이트리스트 set 으로 필터링. 미허용 키 발견 시 예외.
- chunk.py 의 `WHITELIST_FIELDS` 상수가 단일 출처(SSOT). 본 문서 §3 허용 목록과 동기 유지.
