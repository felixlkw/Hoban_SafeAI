# KB CRUD + 자동 재인덱싱 파이프라인 — 실기동 데모

호반 JHA Agent 백엔드의 지식베이스(KB) 운영 파이프라인 검증.
안전관리자가 KB 행을 추가·수정·삭제하면 BM25 인덱스가 자동 재인덱싱(핫스왑)되어
검색·인용에 즉시 반영되는 전 과정을 실제 uvicorn 서버 대상으로 확인한다.

## 환경

| 항목 | 값 |
|------|-----|
| 서버 | `uvicorn app.main:app` @ `127.0.0.1:8000` |
| 시드 코퍼스 | `02_foundation/chunks.jsonl` (4,469행) + `bm25_index.pkl` |
| 운영 SSOT | 임시 SQLite(데모 격리, 원본 `kb.sqlite` 비접근) |
| 토크나이저 | kiwipiepy (인덱스와 동일 KEEP 품사셋) |
| 인증 | PoC JWT(HS256), role=safety_manager |
| Claude | Mock(데모는 KB 파이프라인만 검증) |

재인덱싱 시간: **전체 4,469행 핫스왑 ≈ 1.2~1.4초** (배치 토큰화 최적화 적용 후).

## 시나리오 (a / b / c)

각 단계는 변이 → `POST /v1/kb/reindex`(동기) → 검색·인용으로 결과를 결정적으로 확인.
(운영 경로는 변이 후 `reindexer.schedule()` 디바운스 자동 재인덱싱이며, 데모는
타이밍 레이스 없이 보이기 위해 동기 reindex 사용.)

### (a) 신규 행 추가 → 재인덱싱 후 키워드 검색 적중

```
POST /v1/kb/rows  {major:가설공사, sub:타워크레인(T형), detail:작업 전 준비,
                   accident:절단, severity:3, frequency:3,
                   hazard:"DEMOHAFNIUMKW7 손가락 절단 위험", controls:"보호장갑"}
→ 201  chunk_id=N2  source_row=-2  risk_grade=하   (강도3×빈도3=9 → 하, 서버 재계산)

POST /v1/kb/reindex
→ 200  index_version=3  doc_count=4470 (4469+1)  last_duration_ms≈1366

GET /v1/kb/rows?q=DEMOHAFNIUMKW7
→ hit=True  total=1   ✅ 신규 키워드 검색 적중
```

### (b) 행 수정 → 반영 (등급·경계셀·인용 갱신)

```
PUT /v1/kb/rows/N2  {... accident:추락, severity:4, frequency:4,
                     hazard:"DEMOHAFNIUMKW7 고소작업 추락 위험", controls:"안전대 체결"}
→ 200  risk_grade=상  risk_product=16  boundary_cell=True  critical_register=O  accident=추락
        (강도4×빈도4=16 → 상, 곱16 경계셀 플래그, 서버 도메인 규칙 강제)

POST /v1/kb/reindex  → 200  index_version=4

GET /v1/jha/citations/-2
→ accident_type=추락  severity=4  hazard_text에 "추락" 포함   ✅ 수정 내용 인용에 반영
```

### (c) 삭제 → 미적중 확인

```
DELETE /v1/kb/rows/N2  → 200  row_status=deleted (soft delete)

POST /v1/kb/reindex  → 200  index_version=5  doc_count=4469 (원복)

GET /v1/kb/rows?q=DEMOHAFNIUMKW7
→ hit=False  total=0   ✅ 삭제 행 검색 미적중(active만 인덱싱)

GET /v1/jha/citations/-2
→ text="[삭제된 행] ..."  meta.row_status=deleted   ✅ 저장소 fallback 으로 삭제 표기
```

### 최종 상태

```
index_version=5  active_rows=4469  deleted_rows=2  new_rows=0
```

## 검증 포인트 요약

| 요구 | 결과 |
|------|------|
| (a) 신규 행 추가 → 재인덱싱 → 검색 적중 | ✅ hit=True (ver 1→3, docs 4469→4470) |
| (b) 행 수정 → 반영 | ✅ 등급 하→상·경계셀·인용 모두 갱신 |
| (c) 삭제 → 미적중 | ✅ 검색 hit=False, 인용 "[삭제된 행]" 표기 |
| 핫스왑 무중단 | ✅ 동시 검색 4스레드 + 반복 재인덱싱 예외 0 (test_hot_swap_no_downtime) |
| 도메인 규칙 서버 강제 | ✅ 등급 임계곱 재계산·곱16 경계셀 critical 존중 |
| source_row lineage | ✅ 신규 행 음수(-2), 인용 조회 정상 |

## 운영 노트

- **자동 재인덱싱(디바운스)**: CRUD 후 `reindexer.schedule()`가 디바운스 타이머(기본 3초)를
  reset → 연속 변이를 1회 재빌드로 묶음. 데모 로그에서 create+update+delete 3회 변이가
  디바운스 후 단일 재인덱싱(v1→v2)으로 합쳐지는 것을 확인.
- **무중단 핫스왑**: 새 BM25 스냅샷을 만들어 단일 참조를 원자적 교체. 교체 직전 시작된
  검색은 구 스냅샷을 끝까지 사용(읽기 일관성).
- **성능**: 배치 토큰화(kiwipiepy 리스트 입력)로 4,469행 토큰화가 per-call 대비 ~100배 단축
  → 전체 재인덱싱 ≈1.2초. PoC 규모에서 동기 reindex 도 체감 지연 없음.
- **서버 종료**: 데모 후 uvicorn 정상 종료, 포트 8000 LISTENER 없음 확인.
  FastAPI lifespan(shutdown)에서 재인덱서 타이머 정리(daemon + 명시적 stop)로 종료 hang 없음.
