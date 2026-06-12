# ETL / 동기화 파이프라인 — 전사 하위공종 위험요인

> 작성: data-engineer (Phase 2 · Foundation)
> 스크립트: `_workspace/04_build/scripts/etl/{profile,clean,chunk,index}.py`

## 1. 파이프라인 개요

```
00_input/전사 하위공종 위험요인_20260518.xlsx  (원본, 읽기 전용·불변)
        │
        ▼  profile.py        진단 → 01_discovery/data_profile.md
        ▼  clean.py          정제 → 02_foundation/data_cleaned.parquet
        │                            + taxonomy_lookup/{major,sub,detail}.csv
        │                            + data_quarantine.jsonl (격리, 현재 0행)
        ▼  chunk.py          청킹 → 02_foundation/chunks.jsonl (4,469 청크)
        ▼  index.py          인덱스 → 02_foundation/bm25_index.pkl
                                     + index_build_log.json
```

원본 보존 원칙: `00_input` 의 xlsx 는 절대 수정하지 않는다. 모든 산출물은 `02_foundation` 에 별도 생성되며 스크립트로 100% 재현 가능(수동 편집 없음).

## 2. 실행 순서 / 재실행 방법

```bash
# 작업 디렉토리: 프로젝트 루트
python _workspace/04_build/scripts/etl/profile.py   # (Phase 1, 선택)
python _workspace/04_build/scripts/etl/clean.py      # parquet + taxonomy + quarantine
python _workspace/04_build/scripts/etl/chunk.py      # chunks.jsonl (clean 선행 필요)
python _workspace/04_build/scripts/etl/index.py      # BM25 인덱스 (chunk 선행 필요)
```

- 의존성: pandas, openpyxl, pyarrow, rank_bm25, (선택) kiwipiepy
- 모든 스크립트는 Windows UTF-8 stdout 처리(`io.TextIOWrapper`) 적용 — 콘솔 한글 깨짐 방지.
- 전체 재실행 시간: 약 10초 미만(임베딩 제외).

## 3. 정제 규칙 요약 (clean.py)

| 규칙 | 내용 | 처리 결과 |
|------|------|-----------|
| 선행 불릿 제거 | `^\s*[-·•▪○●*]\s*` | 적용 |
| 다중 공백 단일화 | `[ \t]{2,}` → ` ` | 적용 |
| 셀 내 복수 항목 분리 | ` - ` 구분 → `items` 리스트 + `·` 결합 `text_norm` | 적용 |
| 비표준 공백 | NBSP/전각공백 → 일반 공백 | 적용(대상 0) |
| 분류 ID | 대 MJ### / 중 SB### / 세부 DT#### | 20 / 254 / 1,430 |
| 등급 정합성 | 임계곱(하≤9/중10~15/상≥16) 모순 → `grade_inconsistent=true` (보정 금지) | **35행 플래그** |
| 트리플 중복 | (중공종,세부항목,위험요인) 중복 → `dup_group` 부여(유지) | **7그룹 / 14행** |
| 완전 중복 | 전 컬럼 동일 → 첫 행 master, 후행 `dup_content_of` 기록 | 0행(완전), content_hash 2행 |
| 코드값 위반 | 강도/빈도 범위·등급·중점등록 위반 → 격리 | 0행 (격리 없음) |

> **세부항목 ID 수 주의**: profile.md 의 세부항목 카디널리티 1,182는 **세부항목 명칭의 distinct 수**다. clean.py 의 `detail_item_id` 는 (대공종, 중공종, 세부항목) 복합키로 1,430개를 부여한다. 동명 세부항목이 서로 다른 공종에 존재하기 때문이며(예: "작업 준비"), 청크 lineage·prefilter 정합성을 위해 복합키가 정확하다. 명칭 기준 distinct(1,182)는 `detail.csv` 의 `detail_item` 컬럼으로 역집계 가능.

## 4. 청킹 포맷 (chunk.py)

행 단위 청크. 메타데이터 inline 텍스트(단독 의미 보존):
```
[대공종: {major} / 중공종: {sub} / 세부항목: {detail} / 재해형태: {accident}]
[등급: {grade} (강도 {sev} × 빈도 {freq}) / 중점등록: {critical}]
위험요인:
{hazard_text}
개선대책:
{controls}
```
- `chunk_id` = `R{source_row:05d}` (R00002 ~ R04470)
- `content_hash` = SHA-256(text)
- 전 청크 `source_row` 보유(lineage 100%). 인용은 chunk_id → source_row 역추적.

## 5. 인덱스 (index.py)

- **BM25**: `rank_bm25.BM25Okapi`, 토크나이저 우선순위 = kiwipiepy(형태소) → 실패 시 fallback(공백+문자 bigram).
  - **이번 빌드: kiwipiepy 사용 (fallback 미사용)**. 평균 53.9 토큰/문서.
- **Dense(BGE-M3)**: Phase 2 **skip**. 인터페이스 stub(`embed_dense()`)만 제공. skip 사유 = 로컬 모델 ~2.3GB 다운로드 비용. Phase 4 온프레미스 GPU 환경 구비 시 활성화(주석 해제).
- **저장소 권고**: PoC = Chroma(간편), 운영 전환 = Qdrant(온프레미스·확장성). 메타 prefilter 인덱싱 키 = major_type_id, sub_type_id, accident_type, risk_grade, critical_register.

## 6. 검색 테스트 결과 (샘플 쿼리 3건 · BM25 top-5)

kiwipiepy 토크나이저, 4,469 문서 대상. 실제 `index.py` 실행 결과.

### 쿼리 1 — "타워크레인 해체"
| # | chunk_id | score | 분류 | 재해/등급 | 위험요인(앞 40자) |
|---|----------|------:|------|----------|-------------------|
| 1 | R00043 | 15.92 | 가설공사/타워크레인(T형)/타워크레인 해체 | 전도/중 | 타워크레인 지브해체시 주변 비계에 간섭으로 이동크레인 전도 |
| 2 | R00085 | 15.92 | 가설공사/타워크레인(L형)/타워크레인 해체 | 전도/중 | 타워크레인 지브해체시 주변 비계에 간섭으로 이동크레인 전도 |
| 3 | R00044 | 15.06 | 가설공사/타워크레인(T형)/타워크레인 해체 | 충돌/중 | 타워크레인 주변 호이스트 사용으로 메인/카운터 지브 충돌·붕괴 |
| 4 | R00086 | 15.06 | 가설공사/타워크레인(L형)/타워크레인 해체 | 충돌/중 | (동일, L형) |
| 5 | R00042 | 14.54 | 가설공사/타워크레인(T형)/타워크레인 해체 | 전도/중 | 아웃트리거 설치공간 부족으로 이동식 크레인 전도 |

→ **세부항목 '타워크레인 해체' 정확 적중.** T형/L형 양쪽 회수.

### 쿼리 2 — "굴착 흙막이"
| # | chunk_id | score | 분류 | 재해/등급 | 위험요인(앞 40자) |
|---|----------|------:|------|----------|-------------------|
| 1 | R02855 | 12.09 | 토목 전문공사/압입/굴착 및 흙막이 설치 | 추락/하 | 흙막이 설치 중 추락 |
| 2 | R02126 | 11.58 | 부대토목/관로터파기/터파기 | 붕괴/하 | 굴착사면 안식각 부족, 토사유실: 붕괴·흙막이 붕괴·전도 |
| 3 | R03809 | 9.58 | 토목 전문공사/수직구/수직구 흙막이 지보공 | 추락/하 | 하부 작업장 이동통로 미확보 실족 |
| 4 | R03606 | 9.41 | 토목 전문공사/부단수 천공/굴착 | 낙하/중 | 흙막이 지보공 자재 인양 중 낙하 |
| 5 | R03811 | 9.07 | 토목 전문공사/수직구/수직구 흙막이 지보공 | 붕괴/상 | 흙막이 지보공(Strut) 조립 미비 붕괴 |

→ **굴착·흙막이 붕괴 핵심 행 회수.** 토공·토목 전문공사 교차 적중.

### 쿼리 3 — "고소 용접"
| # | chunk_id | score | 분류 | 재해/등급 | 위험요인(앞 40자) |
|---|----------|------:|------|----------|-------------------|
| 1 | R03296 | 8.72 | 토목 전문공사/라이닝폼제작/주기둥 H-beam 조립 | 추락/하 | 양중 용접 작업시 추락 |
| 2 | R03370 | 8.28 | 토목 전문공사/TBM 반력대/쉴드 받침대 | 붕괴/하 | 용접 작업시 감전사고 위험 |
| 3 | R02664 | 7.37 | 소방/기계설비/소화배관/배관용접 | 추락/하 | 고소작업 중 추락 |
| 4 | R03314 | 6.73 | 토목 전문공사/라이닝폼제작/Skin plate 조립 | 낙하/하 | 철판 용접시 추락·낙하 |
| 5 | R01665 | 6.55 | 창호공사/외장 UNIT/UNIT 상부 고정 | 협착/중 | 고소작업대 용접불티 화재·조작미숙 협착 |

→ **고소+용접 복합 키워드 적중.** 추락·감전·화재 복합 재해형태 회수(시나리오 4 부합).

**검증 결론: 3개 쿼리 모두 의미적으로 정확한 top-5 회수. 검색 테스트 성공.**

## 7. 변경분 감지 / 부분 재인덱싱 (hash 기반)

### 설계
- 각 청크는 `content_hash`(SHA-256) 보유. 동기화 시 신/구 hash 비교로 **신규·변경·삭제** 분류.
- 변경 단위는 행(source_row). 컬럼 단위 변경도 행 텍스트가 바뀌면 hash 변동으로 자동 포착.

```
sync():
  old = { chunk_id: content_hash }  # 이전 인덱스
  new = chunk.py 재생성 결과
  added   = new - old.keys
  removed = old.keys - new
  changed = { id : hash != old[id] }
  → added+changed 만 재토큰화·재임베딩, removed 는 인덱스에서 제거
  → diff 는 chunks_diff.jsonl 로 별도 저장
```

### 트리거 옵션 비교
| 옵션 | 지연 | 비용 | 권고 |
|------|------|------|------|
| 일/주 배치 | 최대 1일 | 낮음 | **PoC 권장** (안전 DB 갱신 빈도 낮음) |
| ERP 변경 webhook 이벤트 | 분 단위 | 중 | 운영 1차 (erp-integration-engineer 연동) |
| CDC (DB log) | 실시간 | 높음 | 운영 확장 시 검토 |

### 안전 절차
1. 인덱스는 alias(blue/green) 패턴 — 재구축 중 다운타임 0.
2. 변경 비율 > 5% 시 eval-engineer 회귀 평가 자동 트리거.
3. 실패 시 이전 인덱스 alias 유지 + 알림.
4. 청크 텍스트 포맷 변경은 전체 재임베딩 비용 큼 → rag-architect 합의 + eval 회귀 필수.

## 8. 산출물 일람 (검증 통과)

| 파일 | 내용 | 검증 |
|------|------|------|
| `02_foundation/data_cleaned.parquet` | 정제 데이터 4,469행 × 22컬럼 | parquet 저장 성공 |
| `02_foundation/taxonomy_lookup/major.csv` | 대공종 20 (ID·정규명·행수) | OK |
| `02_foundation/taxonomy_lookup/sub.csv` | 중공종 254 (소속 대공종·행수) | OK |
| `02_foundation/taxonomy_lookup/detail.csv` | 세부항목 1,430 (복합키·소속·행수) | OK |
| `02_foundation/chunks.jsonl` | 행 단위 청크 4,469 (text+메타) | **4,469행, source_row 100%** |
| `02_foundation/data_quarantine.jsonl` | 격리 행 | 0행 (격리 없음) |
| `02_foundation/bm25_index.pkl` | BM25 인덱스 | 4,469 문서, kiwipiepy |
| `02_foundation/index_build_log.json` | 빌드 로그·검색결과 | OK |
| `02_foundation/data_schema.json` | 메타데이터 JSON 스키마 | dup_group·grade_inconsistent 포함 |
| `02_foundation/data_security_policy.md` | PII 스캔·화이트리스트 | PII 0건 |
