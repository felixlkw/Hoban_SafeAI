# ERP 마스터 데이터 매핑 설계 (Design)

- **문서 ID**: 03_design / erp_master_mapping
- **작성**: erp-integration-engineer · Phase 3 (Design)
- **작성일**: 2026-06-10
- **상태**: 매핑 테이블 생성 완료. 모든 ERP 코드는 **가상([검증 필요-가상코드])**.
- **선행**: `01_discovery/erp_interface_inventory.md` §3 (Excel에 ERP 코드 컬럼 부재 → 매핑 신규 구축).
- **소스**: `02_foundation/taxonomy_lookup/{major,sub,detail}.csv` (data-engineer 산출, MJ/SB/DT 체계).

---

## 0. 핵심 전제 (재확인)

입력 Excel은 분류를 **한글 명칭으로만** 보유, **ERP 코드 컬럼 부재**. → ERP 코드 체계와의 매핑을 **본 PoC가 신규 구축**한다. 실 ERP 코드는 운영 전환 전 ERP 마스터 추출(인벤토리 Q6)로 교체해야 하므로, 본 문서의 모든 `erp_*_code`는 **가상 코드**이며 CSV 헤더에 `[검증 필요-가상코드]` 주석을 강제했다.

---

## 1. 가상 ERP 코드 체계 설계

| 마스터 | jha ID 체계 (data-engineer) | 가상 ERP 코드 체계 | 매핑 카디널리티 | 비고 |
|--------|----------------------------|-------------------|---------------|------|
| 대공종 | `MJ001`~`MJ020` | `HBC-MJ-###` | 20 (1:1) | HBC = Hoban Construction prefix(가상) |
| 중공종 | `SB001`~`SB254` | `HBC-SB-####` | 254 (1:1) | 대공종 코드를 부모로 보유 |
| 세부항목 | `DT0001`~`DT1430` (복합키) | `HBC-DT-#####` | 1,430 (1:1) | ERP 코드화 여부 미확정 → `erp_detail_codeable` 플래그 |

> **세부항목 카디널리티 주의(data-engineer etl_pipeline.md §3 정합)**: 세부항목 **명칭 distinct = 1,182**, 그러나 `detail_item_id`는 (대공종, 중공종, 세부항목) **복합키로 1,430개**. 동명 세부항목이 다른 공종에 존재(예: "작업 전 준비")하기 때문. 매핑은 **복합키 1,430 기준**으로 생성한다(lineage·prefilter 정합).

### 1.1 코드 생성 규칙 (재현 가능)
- `HBC-MJ-###` = `MJ` 일련번호(예: MJ001 → HBC-MJ-001)
- `HBC-SB-####` = `SB` 일련번호(예: SB001 → HBC-SB-001)
- `HBC-DT-#####` = `DT` 일련번호(예: DT0001 → HBC-DT-0001)
- 생성 스크립트: `_workspace/03_design/erp_mapping/_gen_mapping.py` (taxonomy CSV 실독 → 전 행 생성).

---

## 2. 생성된 매핑 테이블 (CSV 3종)

| 파일 | 행수 | 주요 컬럼 |
|------|------|----------|
| `erp_mapping/major_map.csv` | 20 | jha_major_type_id, erp_major_code, major_type_norm, row_count, map_status, note |
| `erp_mapping/sub_map.csv` | 254 | jha_sub_type_id, erp_sub_code, sub_type_norm, (부모)jha_major_type_id/erp_major_code, row_count, map_status, note |
| `erp_mapping/detail_map.csv` | 1,430 | jha_detail_item_id, erp_detail_code, detail_item_norm, (부모 SB/MJ 코드), row_count, **erp_detail_codeable**, map_status, note |

모든 CSV 1행은 `# [검증 필요-가상코드] ...` 주석 헤더. detail_map은 추가로 `# [검증 필요] 세부항목 ERP 코드화 여부 미확정 ...` 주석 포함.

### 2.1 map_status 상태값
| 상태 | 의미 | 검색 | ERP 등록 |
|------|------|------|----------|
| `MAPPED` | 실 ERP 코드 확정 | 포함 | 가능 |
| `PENDING_VERIFY` | 가상코드 부여, 실 ERP 검증 대기 (**본 PoC 전 행 기본값**) | 포함(데모) | Mock만 |
| `UNMAPPED` | ERP 코드 미부여 | **제외** | **보류** |

### 2.2 detail_map의 `erp_detail_codeable` (세부항목 등록 입도 분기)
- `Y` : ERP가 세부항목까지 코드화 → `erp_detail_code` 그대로 등록.
- `N` : ERP가 중공종까지만 코드화 → 등록 페이로드는 **중공종 코드(erp_sub_code)까지만** 전송 + 세부는 `detail_text` 텍스트 필드로 전달.
- 현재 전 행 `PENDING_VERIFY` (인벤토리 Q7 미확정). ERP 답변 확보 후 Y/N 일괄 갱신.

---

## 3. 미매핑(UNMAPPED) 처리 절차

ETL/매핑 시점에 ERP 코드 미존재(또는 신규 ERP 코드 출현) 발견 시:

```
1. 해당 분류 행을 map_status = UNMAPPED 으로 표기
2. 벡터 인덱스 검색에서 제외 (prefilter 에서 UNMAPPED 차단)
3. metric: jha_erp_master_mapping_misses_total += 1  (즉시 알림)
4. safety-domain-expert + data-engineer 에게 매핑 갱신 요청 (정규명 ↔ ERP 코드 결정)
5. 매핑 확정 시 map_status = MAPPED 전환 + 변경 이력 기록 + 영향 청크 목록 표기
```

- **충돌 시 ERP 코드 우선** (source of truth 원칙). 본 PoC 정규명과 ERP 명칭 표기 차이는 정규명 매핑 테이블이 흡수.
- **등록 게이트**: 등록 페이로드의 major/sub 코드가 `MAPPED`가 아니면 어댑터가 `ErpFatal`로 거부(중복 등록·오등록 방지). 상세는 `erp_register_flow.md` §4.

---

## 4. site / worker / dept 매핑 (스키마만 — ERP가 source of truth)

이 3종은 ERP가 코드를 직접 보유(인벤토리 §3, 매핑 난이도 '하'). 본 PoC는 **코드를 생성하지 않고 ERP 코드를 직접 사용**. 등록 시 사용자 선택값을 그대로 전달. 조회 API(`get_master_codes`)로 ERP에서 가져온다. 스키마만 정의(데이터 미생성).

```csv
# site_map (스키마, ERP source of truth — 데이터는 get_master_codes("site") 로 조회)
erp_site_code,site_name,wbs_code,status        # 예: HB-SEOUL-001,서울OO현장,WBS-xxxx,ACTIVE

# worker_map (스키마 — PII 포함, 외부 LLM 미전송)
erp_worker_id,dept_code,role                   # 예: EMP-12345,DEPT-EHS,WORKER  (이름 등 PII는 매핑에 미저장)

# dept_map (스키마)
erp_dept_code,dept_name,parent_dept_code       # 예: DEPT-EHS,안전환경팀,DEPT-HQ
```

> **PII 경계**: worker 매핑은 사번(`worker_id`)·부서·역할만. 이름/연락처 등 PII는 매핑 테이블·청크·프롬프트 어디에도 저장/전송하지 않는다(data-engineer 화이트리스트 정합, 보안 문서 §데이터 보호).

---

## 5. 매핑 유지·갱신 규칙

- 매핑 신규/변경은 ETL 시점 자동 감지(미매핑 ERP 코드 출현 알림).
- 매핑 변경 시: **변경 이력 + 영향 받는 인덱스 청크 목록** 표기(에이전트 운영 원칙). 청크 메타 inline에 코드가 포함되면 hash 변동 → 재인덱싱 자동 반영.
- 대공종(20)·중공종(254): ERP 마스터 추출 후 수작업 1:1 검수 확정.
- 세부항목(1,430): 명칭 유사도 자동 후보 매칭 + 안전/ERP 검수. ERP 미코드화면 `erp_detail_codeable=N` 경로.

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | 매핑 체계(HBC-MJ/SB/DT) 설계 + CSV 3종 생성(20/254/1430) + 미매핑 절차 + site/worker/dept 스키마 | Phase 3 Design |
