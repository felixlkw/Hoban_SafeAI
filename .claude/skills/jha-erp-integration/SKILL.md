---
name: jha-erp-integration
description: "JHA Agent와 호반그룹 ERP 시스템 간 연동 워크플로우. ERP는 PoC의 유일한 외부 I/F. 가용 I/F 인벤토리, 안전 DB 접근 전략(직접 API/전용 API/ETL/CDC) 비교 결정, 마스터 데이터(공종·현장·작업자) 매핑, JHA 등록 트랜잭션·Idempotency·Outbox 패턴, ETL 동기화·변경분 감지, 보안(mTLS·시크릿·IP 화이트리스트), 운영 모니터링, 장애 격리까지 정의한다. erp-integration-engineer가 ERP 연동 설계·구현·운영 시 반드시 이 스킬을 사용한다."
---

# JHA ERP Integration — ERP 연동 워크플로우

## 언제 사용하는가

- ERP 가용 I/F 조사·문서화 시
- 안전 DB 접근 전략을 결정·변경할 때
- 마스터 데이터 매핑 룩업을 구축·갱신할 때
- JHA 등록 호출 흐름·트랜잭션·재시도를 설계할 때
- ETL 동기화 파이프라인 구현 시
- 보안·시크릿·운영 모니터링 추가 시

## 단계 1: ERP I/F 인벤토리

다음 항목을 표로 정리 (`_workspace/01_discovery/erp_interface_inventory.md`):

| I/F 종류 | 가용 여부 | 인증 | SLA | rate limit | 페이로드 제한 | 비고 |
|---------|----------|------|-----|-----------|-------------|------|
| REST API | ? | OAuth2/JWT | ? | ? | ? | 가장 선호 |
| SOAP | ? | WS-Security | ? | - | - | 레거시 |
| DB Direct | ? | DB 계정 | - | - | - | 위험 |
| File EDI | ? | SFTP | 시간 단위 | - | - | 배치 |
| Message Queue | ? | mTLS | - | - | - | 실시간 |

ERP 팀 인터뷰 자료 부재 시 **가정** + 명시 (`[검증 필요]` 태그).

## 단계 2: 안전 DB 접근 전략 비교

| 옵션 | 설명 | 장점 | 단점 | PoC 적합 |
|------|------|------|------|---------|
| A. ERP API 우회 | ERP 내부 안전 DB를 ERP가 제공하는 API로 접근 | 보안 일관, ERP 권한 모델 활용 | ERP 부담, API 미존재 시 추가 개발 | ⭕ (API 존재 시) |
| B. 전용 read-only API 신규 | 안전 DB 전용 API 신규 개발 | 분리, 성능 최적 | ERP 팀 개발 일정 영향 | △ |
| C. ETL 동기화 | 안전 DB → 벡터 인덱스 저장소 주기 배치 | 본 PoC 분리, 빠른 도입 | 신선도 지연 (일/시간 단위) | ⭕ (권장) |
| D. CDC | DB log 기반 실시간 동기화 | 신선도 ↑ | 인프라 부담 큼 | ❌ |

**PoC 권장**: 옵션 C (ETL 배치). 운영 전환 후 D 또는 A 검토.

추천 사유 문서화 (`_workspace/02_foundation/erp_access_strategy.md`):
- ERP 팀 일정 영향 최소
- 안전 DB 접근 권한 분리 명확
- 인덱스 신선도 일 단위 → PoC 데모에 충분

## 단계 3: 마스터 데이터 매핑

```csv
# _workspace/03_design/erp_master_mapping.md/major_type.csv
erp_code,erp_name,jha_major_type_id,jha_major_type
HBC001,가설공사,MJ001,가설공사
HBC002,토목 전문공사,MJ002,토목 전문공사
...
```

매핑 룩업 유지 규칙:
- ERP가 source of truth → 충돌 시 ERP 측 코드 우선
- 매핑 신규/변경은 ETL 시점에 자동 감지 → 미매핑 ERP 코드 발견 시 알림 + data-engineer에게 갱신 요청
- 신규 ERP 코드는 `[미매핑]` 상태로 표시, 매핑 결정 전까지 검색에 제외

추가 매핑:
- 현장 코드 (site_code)
- 작업자 ID (worker_id)
- 부서 코드 (dept_code)

## 단계 4: JHA 등록 흐름

```
[Backend Outbox에 적재]
   │ 트랜잭션 안전
   ▼
[Outbox Worker]
   │ idempotency_key = outbox_entry_id
   ▼
[ERP Adapter.register(payload, idempotency_key)]
   │
   ├─ 성공 → ERP 발급 ID 회수 → session_store 갱신
   ├─ ErpRetryable (5xx/timeout/429) → 지수 백오프 재시도
   ├─ ErpConflict (이미 등록됨, idempotency 충돌) → 기존 ID 회수 (정상 처리)
   └─ ErpFatal (4xx 마스터 미존재 등) → 사용자 알림 + 운영팀 알림
```

### ERP register 호출 페이로드 예시 (REST 가정)
```json
{
  "idempotency_key": "outbox-...",
  "site_code": "HB-SEOUL-001",
  "work_date": "2026-06-12",
  "worker_id": "EMP-12345",
  "jha_payload": {
    "major_type_code": "HBC001",
    "sub_type_code": "HBC001-T01",
    "detail_item_code": "...",
    "hazards": [...],
    "risk_grade": "상",
    "critical_register": "O",
    "controls": [...],
    "legal_refs": [...],
    "approved_by": "EMP-99999",
    "approved_at": "2026-06-12T09:30:00Z"
  }
}
```

응답:
```json
{"erp_jha_id": "JHA-2026-000123", "registered_at": "...", "status": "REGISTERED"}
```

## 단계 5: ETL 동기화 파이프라인

```
[ERP/안전 DB] ──(주기 배치, 권장 일 1회 새벽)──> [ETL 스크립트]
                                                  │
                                ┌─────────────────┼─────────────────┐
                                ▼                 ▼                 ▼
                          [신규 행 감지]   [변경 행 감지]    [삭제 행 감지]
                          (hash 비교)      (hash 비교)       (ID diff)
                                │                 │                 │
                                └────────┬────────┴────────┬────────┘
                                         ▼                 ▼
                                  [부분 재인덱싱]    [인덱스에서 제거]
                                         │                 │
                                         └────────┬────────┘
                                                  ▼
                                            [회귀 평가 트리거]
                                            (변경 비율 > 5% 시)
```

### 안전 절차
1. blue/green 인덱스 또는 alias swap
2. 변경분만 처리 (전체 재구축은 마지막 수단)
3. 동기화 실패 시 이전 인덱스 alias 유지 + 알림
4. 동기화 로그: 신규/변경/삭제 카운트, 처리 시간, 실패 항목

## 단계 6: 보안

### 네트워크
- 전용 회선 또는 VPN
- ERP 측 IP 화이트리스트 등록
- mTLS 또는 OAuth2 client_credentials

### 시크릿
- Vault 또는 cloud Secrets Manager
- ERP credential 회전 정책 (90일)
- 환경변수 직접 노출 금지

### 권한 분리
- 읽기(ETL용) 계정과 쓰기(JHA 등록용) 계정 분리
- 읽기 계정은 안전 DB 테이블만 SELECT
- 쓰기 계정은 JHA 등록 API 단일 권한

### 사내 보안 가이드라인 체크리스트
- [ ] PII 외부 LLM 미전송 (data-engineer 화이트리스트와 정합)
- [ ] 시크릿 저장소 사용
- [ ] 통신 암호화
- [ ] 감사 로그 보관 (1년 이상)
- [ ] 권한 분리

## 단계 7: 운영 모니터링

### 메트릭
- `jha_erp_register_total{status}` — 성공/실패/재시도 카운트
- `jha_erp_register_latency_seconds` — p50/p95
- `jha_erp_outbox_queue_depth` — 큐 적재량 (지속 증가 시 알림)
- `jha_erp_etl_last_success_timestamp` — ETL 마지막 성공 시각 (오래되면 알림)
- `jha_erp_master_mapping_misses_total` — 매핑 누락 카운트

### 알림 조건
- ERP register 실패율 > 5% (5분 윈도우)
- Outbox 큐 깊이 > 100
- ETL > 25시간 미실행 (일 1회 기준)
- 마스터 매핑 미스 > 0 (즉시 알림, 신규 ERP 코드)

## 단계 8: 어댑터 인터페이스 (코드)

```python
# _workspace/04_build/integrations/erp_adapter/interface.py
from abc import ABC, abstractmethod

class ErpAdapter(ABC):
    @abstractmethod
    async def register_jha(self, payload: dict, idempotency_key: str) -> RegisterResult: ...

    @abstractmethod
    async def get_master_codes(self, kind: Literal["major","sub","detail","site","worker"]) -> list[MasterCode]: ...

    @abstractmethod
    async def health_check(self) -> HealthStatus: ...

class MockErpAdapter(ErpAdapter): ...     # PoC 데모, 결정적 응답
class RestErpAdapter(ErpAdapter): ...     # 실 ERP REST API
class SoapErpAdapter(ErpAdapter): ...     # SOAP fallback
```

PoC 데모는 Mock 기본, 실 ERP 연결은 운영 전환 단계.

## 단계 9: PoC vs 운영 단계 차이

| 항목 | PoC | 운영 전환 |
|------|-----|----------|
| ERP 연결 | Mock 또는 stage ERP | 실 ERP |
| ETL | 수동 트리거 | 자동 스케줄러 |
| 시크릿 | .env (gitignore) | Vault |
| 모니터링 | 로컬 로그 | Prometheus + Grafana + 알림 |
| 알림 | 콘솔 | Slack/SMS |

운영 전환 체크리스트 별도 (`_workspace/03_design/erp_handover_checklist.md`).

## 적용 우선순위

1. **ERP는 신성한 시스템** (호출 빈도·페이로드 합의 없이 변경 금지)
2. **Idempotency 필수**
3. **읽기/쓰기 권한 분리**
4. **Outbox 패턴으로 사용자 응답 지연 방지**
5. **PoC는 Mock으로 데모, 운영은 실 ERP 별도 검증**

## references/

- `references/erp_payload_examples.md` — 등록 페이로드 예시 (다양한 케이스)
- `references/etl_sql_templates.md` — 변경분 감지 SQL 템플릿
