# ERP → 벡터 인덱스 ETL 동기화 파이프라인 (Design)

- **문서 ID**: 03_design / erp_etl_pipeline
- **작성**: erp-integration-engineer · Phase 3 (Design)
- **작성일**: 2026-06-10
- **상태**: 확정 (PoC). data-engineer `02_foundation/etl_pipeline.md` §7과 명시 정합.
- **역할 경계**: data-engineer = 청크/해시/인덱스 빌드 소유. erp-integration = **추출(Extract) 경계 + 스케줄 + 동기화 거버넌스(blue/green·회귀·로그·알림)** 소유. 두 영역은 `content_hash` 규약으로 연결.

---

## 1. 파이프라인 전체 (안전 DB → 인덱스)

```
[안전 DB / ERP]  (읽기 전용 계정, SELECT only · §보안)
   │
   │ ┌──────────── erp-integration 소유 ────────────┐
   ▼ │                                                │
[Extract]  EDI 덤프(CSV/고정폭) 1순위 │ OData top/skip 2순위   ← 일 1회 03:00 KST
   │ │   산출: raw_safety_{yyyymmdd}.csv (스테이징)        │
   ▼ │                                                │
[Map]   erp_mapping/{major,sub,detail}_map.csv 적용 → MJ/SB/DT + ERP코드 부여  │
   │ │   미매핑 ERP 코드 → [UNMAPPED] 격리 + 미스 알림   │
   │ └────────────────────────────────────────────────┘
   ▼
   │ ┌──────────── data-engineer 소유 (재사용) ────────┐
[Transform/clean]  clean.py 규칙(불릿제거·동의어·등급정합 플래그)              │
[Chunk]  chunk.py → chunks.jsonl (R{row:05d}, content_hash=SHA-256)           │
[Diff]   content_hash 비교 → added / changed / removed → chunks_diff.jsonl    │
[Reindex] added+changed 만 재토큰화·(재임베딩), removed 제거 → green 인덱스    │
   │ └────────────────────────────────────────────────┘
   ▼
   │ ┌──────────── erp-integration 소유 (거버넌스) ────┐
[Smoke]  green 스모크 검색(3 샘플 쿼리) 통과 확인                              │
[Swap]   통과 → alias swap(blue→green) │ 실패 → blue 유지 + 알림              │
[Regress] 변경비율 > 5% → eval-engineer 회귀 트리거                            │
[Log]    sync_log 기록(§5) + 메트릭 업데이트(§6)                               │
   │ └────────────────────────────────────────────────┘
   ▼
[jha_active alias]  (RAG 검색이 참조)
```

---

## 2. 스케줄

| 항목 | PoC | 운영 |
|------|-----|------|
| 트리거 | 수동 또는 cron `0 3 * * *` (03:00 KST) | 스케줄러(Airflow/cron) + ERP webhook(운영 1차) |
| 빈도 | 일 1회 | 일 1회 + 이벤트 |
| 윈도우 | ERP 마감 배치(23:00~05:00) 외곽 회피 `[검증 필요]` | 동일 + 마감일 자제 |
| 동시성 | 단일 실행(중복 실행 락) | 단일 실행 락 + 타임아웃 |

- **중복 실행 방지**: 락 파일/DB advisory lock. 이전 배치 미완료 시 skip + 알림.

---

## 3. 변경분 감지 (data-engineer §7과 명시 정합)

> **정합 선언**: 본 파이프라인은 **별도 해시를 만들지 않는다.** data-engineer가 정의한 `content_hash = SHA-256(chunk_text)`(chunk.py §4 inline 포맷)을 **그대로 소비**한다. 변경 단위·diff 산출물·alias 절차 모두 etl_pipeline.md §7과 동일.

```
sync():
  old = { chunk_id: content_hash }     # 직전 인덱스 메타 (alias 가 가리키는 blue)
  new = chunk.py 재생성 결과            # 신규 추출분 → 매핑 → 정제 → 청크
  added   = new.keys - old.keys
  removed = old.keys - new.keys
  changed = { id for id in (new & old) if new[id] != old[id] }
  reindex(added | changed); deindex(removed)
  write chunks_diff.jsonl(added, changed, removed)
```

- **매핑 변경 반영**: erp_mapping CSV 갱신으로 청크 메타 inline(대/중/세부 명칭·코드)이 바뀌면 chunk_text 변동 → `content_hash` 변동 → 자동 재인덱싱. 매핑 변경도 별도 트리거 없이 해시 경로로 흡수.

---

## 4. 부분 재인덱싱 / 실패 시 이전 alias 유지

| 상황 | 처리 |
|------|------|
| 정상 | added+changed 만 부분 재인덱싱(전체 재구축 회피) → green → swap |
| 추출 실패(ERP 접속/타임아웃) | 배치 중단, **swap 안 함**, blue 유지, 알림. 다음 배치 재시도 |
| 청크/인덱스 빌드 실패 | green 폐기, blue 유지, 알림 |
| 스모크 검색 실패 | swap 보류, blue 유지, 알림(green은 candidate로 보존·조사) |
| 부분 실패(일부 행 정제 격리) | **성공분만 인덱스 반영**, 격리분 `data_quarantine.jsonl` 로그 → 다음 배치 재시도 |
| 변경비율 > 5% | swap 후(또는 운영은 회귀 통과 후) eval 회귀 트리거 |
| 텍스트 포맷 변경(전체 재임베딩 필요) | rag-architect 합의 + eval 회귀 필수(부분 재인덱싱 예외) |

---

## 5. 동기화 로그 스키마 (`sync_log.jsonl`)

```json
{
  "sync_id": "etl-2026-06-12T03:00:00+09:00",
  "started_at": "2026-06-12T03:00:00+09:00",
  "finished_at": "2026-06-12T03:00:41+09:00",
  "duration_sec": 41,
  "source": "EDI_DUMP",                       // EDI_DUMP | ODATA
  "extract": { "rows_pulled": 4469, "extract_ok": true },
  "mapping": { "mapped": 4469, "unmapped": 0, "new_erp_codes": [] },
  "diff": { "added": 3, "changed": 12, "removed": 1, "total_chunks": 4469,
            "change_ratio": 0.0036 },
  "reindex": { "reindexed": 15, "deindexed": 1, "quarantined": 0 },
  "smoke": { "queries": 3, "passed": 3 },
  "swap": { "from": "blue", "to": "green", "swapped": true },
  "regression_triggered": false,              // change_ratio > 0.05 시 true
  "status": "SUCCESS",                        // SUCCESS | PARTIAL | FAILED
  "failures": [],                             // 실패 항목(행/사유)
  "alert_sent": false
}
```

- 로그 보관: 1년 이상(감사 정합, 보안 §감사 로그).
- 실패/부분실패/미매핑/회귀트리거 시 `alert_sent=true` + 알림 채널(PoC 콘솔 → 운영 Slack/SMS).

---

## 6. ETL 운영 메트릭 (eval-engineer 송신)

| 메트릭 | 의미 | 알림 조건 |
|--------|------|----------|
| `jha_erp_etl_last_success_timestamp` | 마지막 ETL 성공 시각 | > 25h 미실행(일1회 기준) |
| `jha_erp_etl_change_ratio` | 변경 비율 | > 0.05 시 회귀 트리거 |
| `jha_erp_master_mapping_misses_total` | 매핑 누락 카운트 | > 0 즉시(신규 ERP 코드) |
| `jha_erp_etl_duration_seconds` | 배치 소요 | 임계 초과 시 알림 |
| `jha_erp_etl_quarantine_total` | 격리 행 수 | > 0 검토 |

---

## 7. 검증 필요 항목

- [ ] 추출 형태 EDI vs OData 확정 `[검증 필요-Q4]`
- [ ] 야간 윈도우 시간대 `[검증 필요-Q11]`
- [ ] 삭제 감지: ERP가 안전 마스터 행 삭제를 어떻게 표현하는지(소프트 삭제 플래그 vs 물리 삭제) `[검증 필요]`

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | 추출 경계+거버넌스 소유 명시, content_hash 정합 선언, blue/green·5%회귀·sync_log 스키마·메트릭 | Phase 3 Design |
