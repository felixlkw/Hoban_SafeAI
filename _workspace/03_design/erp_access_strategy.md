# ERP 안전 DB 접근 전략 — 옵션 C(ETL 배치) 최종 확정 (Design)

- **문서 ID**: 03_design / erp_access_strategy
- **작성**: erp-integration-engineer · Phase 3 (Design)
- **작성일**: 2026-06-10
- **상태**: 확정 (PoC 범위). 운영 전환 시 옵션 A/D 재검토 로드맵 포함.
- **선행**: `01_discovery/erp_interface_inventory.md` §2 (옵션 C 권고) → 본 문서에서 확정.
- **정합**: data-engineer `02_foundation/etl_pipeline.md` §7 (content_hash 변경분 감지·blue/green·5% 회귀 트리거)와 1:1 정합.

---

## 1. 결정 요약

| 항목 | 결정 |
|------|------|
| **채택 옵션** | **C. ETL 배치 동기화** (안전 DB → 벡터 인덱스 저장소) |
| **스케줄** | **일 1회 야간 배치** (기본 03:00 KST, ERP 마감 배치 윈도우 23:00~05:00 외곽 회피) `[검증 필요]` |
| **변경분 감지** | `content_hash`(SHA-256) diff — data-engineer 청크 해시와 동일 키·동일 알고리즘 |
| **인덱스 교체** | blue/green alias swap (다운타임 0) |
| **회귀 트리거** | 변경 비율 > 5% 시 eval-engineer 회귀 평가 자동 트리거 |
| **읽기 경로** | File EDI 덤프(1순위) 또는 OData 페이지 조회(2순위) — 읽기 전용 계정 `[검증 필요]` |
| **운영 전환** | 실시간성 요구 발생 시 옵션 A(ERP API) 또는 D(CDC)로 점진 전환 (§5 로드맵) |

> **왜 C인가 (3줄):** ERP 팀 신규 개발(B)·로그 접근(D) 없이 읽기 권한만으로 착수 → PoC 일정 리스크 0. 야간 1회로 "ERP는 신성한 시스템" 원칙 준수(온라인 부하 미발생). 위험요인 마스터(4,469행)는 일 단위 신선도로 충분.

---

## 2. 옵션 비교 매트릭스 (확정 근거)

| 옵션 | ERP 부담 | 신선도 | 일정 리스크 | 권한 분리 | PoC 적합 | 판정 |
|------|---------|--------|------------|----------|---------|------|
| A. ERP API 우회 | 높음 | 실시간 | 높음(API 신규 가능성) | 보통 | △ | 운영 후보 |
| B. 전용 read-only API 신규 | 중(개발) | 실시간 | 높음(ERP 일정) | 명확 | △ | 보류 |
| **C. ETL 배치** | **낮음** | 일 단위 | **낮음** | **명확(읽기 전용)** | **⭕** | **확정** |
| D. CDC | 중(로그) | 준실시간 | 높음(인프라) | 보통 | ❌ | 운영 후보 |

판정 가중치: PoC 단계는 **일정 리스크·ERP 부담**을 최우선 가중. 신선도는 안전 마스터 특성상 일 단위로 충분 → C 압도적 우위.

---

## 3. ETL 배치 동기화 — 확정 흐름

```
[안전 DB / ERP]                          (읽기 전용 계정, SELECT only)
   │  일 1회 03:00 KST 야간 배치
   ▼
[추출(Extract)]  File EDI 덤프(CSV/고정폭) 또는 OData top/skip 페이지 조회
   │
   ▼
[정규화(Transform)]  data-engineer clean.py 규칙 재사용
   │   - 분류 ID 부여(MJ/SB/DT 복합키)
   │   - 등급 정합성 플래그(grade_inconsistent), 동의어 정규화
   │   - ERP 마스터 코드 매핑 적용(erp_mapping/*.csv) → 미매핑 [UNMAPPED] 격리
   ▼
[변경분 감지]  content_hash(SHA-256) diff  =  added / changed / removed
   │   old = {chunk_id: content_hash}  (이전 인덱스 메타)
   │   new = chunk.py 재생성 결과
   ▼
[부분 재인덱싱]  added+changed 만 재토큰화·(재임베딩), removed 는 제거
   │   → green 인덱스에 반영
   ▼
[검증 게이트]  green 인덱스 스모크 검색(3 샘플 쿼리) 통과 확인
   │
   ├─ 통과 →  alias swap (blue→green)  +  변경비율 산정
   │            └ 변경비율 > 5% → eval-engineer 회귀 평가 트리거
   │
   └─ 실패 →  blue alias 유지(swap 안 함) + 알림 + 동기화 로그 기록
```

### 3.1 변경분 감지 정합 (data-engineer etl_pipeline.md §7과 명시 정합)
- **해시 키**: `content_hash = SHA-256(chunk_text)`. chunk_text 포맷은 data-engineer chunk.py §4 inline 포맷을 그대로 사용. erp-integration은 **별도 해시를 만들지 않고 동일 청크 해시를 소비**한다.
- **변경 단위**: 행(source_row = `R{row:05d}`). 컬럼 단위 변경도 행 텍스트 변동 시 hash로 자동 포착.
- **diff 산출물**: `chunks_diff.jsonl` (added/changed/removed 분류) — data-engineer 산출물 재사용.
- **충돌 방지**: ETL 추출분에 ERP 마스터 코드를 매핑한 뒤 청크화하므로, 매핑 변경(erp_mapping CSV 갱신)도 청크 텍스트(메타 inline)에 영향 시 hash 변동으로 재인덱싱에 반영.

### 3.2 blue/green alias swap
- 인덱스 alias(예: `jha_active`)가 항상 blue 또는 green 중 하나를 가리킴. 재구축은 비활성 슬롯에서 수행 → swap은 원자적 포인터 변경. 다운타임 0.
- 검색(RAG)은 alias만 참조 → swap 순간에도 in-flight 요청 영향 없음.

### 3.3 회귀 평가 트리거 (5% 규칙)
```
변경비율 = (added + changed + removed) / 전체 청크수
IF 변경비율 > 0.05:
    eval-engineer 회귀 평가 자동 트리거 (gold set 30~50건 재평가)
    회귀 통과 전까지 green 은 'candidate' 상태로 보류 옵션(운영 정책 선택)
```
- PoC는 swap 후 비동기 회귀(빠른 신선도 우선), 운영은 회귀 통과 후 swap(안전 우선)을 선택 가능 — 운영 전환 시 정책 결정.

---

## 4. 동기화 안전 절차 (확정)

1. **blue/green alias** — 재구축 중 다운타임 0.
2. **변경분만 처리** — 전체 재구축은 마지막 수단(텍스트 포맷 변경 시만, rag-architect 합의 필요).
3. **실패 시 이전 alias 유지** — green 빌드 실패 시 swap 안 함, blue 계속 서비스 + 알림.
4. **동기화 로그** — 신규/변경/삭제 카운트·처리시간·실패항목·매핑 미스 기록(상세 스키마는 `erp_etl_pipeline.md` §5).
5. **마감일 회피** — ERP 월말/주간 마감일은 배치 자제(ERP 팀 합의) `[검증 필요]`.

---

## 5. 운영 전환 로드맵 (옵션 A/D 재검토)

| 단계 | 트리거 조건 | 전환 대상 | 비고 |
|------|------------|----------|------|
| PoC | — | **C (배치)** | 현재. 수동/스케줄러 트리거, 일 1회 |
| 운영 1차 | 신선도 요구 시간→분 단위 | C + **ERP 변경 webhook** | data-engineer §7 "운영 1차" 정합. 이벤트 수신 시 부분 재인덱싱 즉시 트리거 |
| 운영 2차 | 준실시간 요구 / 안전 데이터 빈번 갱신 | **D (CDC)** | Debezium 등. DB팀·인프라 협조 확보 후 |
| 운영 대안 | ERP가 안전 DB 전용 API 제공 | **A (ERP API 우회)** | source of truth 일관성 최상. ERP 팀 API 개발 완료 시 |

> **불변식**: 어떤 옵션으로 전환하든 backend가 의존하는 `ErpAdapter` 추상 인터페이스와 청크 `content_hash` 변경분 규약은 유지된다. 전환은 어댑터/추출단 교체로 격리.

---

## 6. 검증 필요 항목 (운영 전환 전 ERP 팀 확인)

- [ ] 야간 배치 윈도우 정확 시간대(03:00 적정 여부) `[검증 필요]` (인벤토리 Q11)
- [ ] 안전 DB 읽기 전용 계정 발급 + 추출 형태(EDI 덤프 vs OData) `[검증 필요]` (인벤토리 Q4)
- [ ] OData 채택 시 페이지네이션(top/skip) 한도 `[검증 필요]`
- [ ] 마감일 배치 자제 정책 합의 `[검증 필요]` (인벤토리 Q11)

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | 옵션 C 최종 확정. 스케줄·hash 정합·blue/green·5% 회귀·A/D 로드맵 | Phase 3 Design |
