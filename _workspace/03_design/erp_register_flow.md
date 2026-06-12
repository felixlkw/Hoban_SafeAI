# JHA 등록 흐름 — ERP Register Flow (Design)

- **문서 ID**: 03_design / erp_register_flow
- **작성**: erp-integration-engineer · Phase 3 (Design)
- **작성일**: 2026-06-10
- **상태**: 확정. backend-engineer 어댑터 인터페이스 합의 대상(§6).
- **선행**: `safety_legal_citation_matrix.md` §5(ERP 등록 게이트), `safety_risk_matrix_spec.md` §6(human_review 게이트), 인벤토리 §6(Mock 7 시나리오).

---

## 1. 등록 시퀀스 (텍스트 다이어그램)

```
[Frontend]                 [Backend / Session SM]          [Outbox(DB)]        [Outbox Worker]        [ErpAdapter]          [ERP]
    │                              │                            │                    │                    │                  │
    │  검토 후 "확정"(finalize)    │                            │                    │                    │                  │
    │ ───────────────────────────▶│                            │                    │                    │                  │
    │                              │ (G1) 등록 전 게이트 검증     │                    │                    │                  │
    │                              │   - human_review_required && !resolved → 409 차단 (Outbox 적재 안 함)               │
    │                              │   - 필수 인용(MUST) 누락 → 422 차단                                                  │
    │                              │   - 마스터 코드 map_status != MAPPED → 422 차단                                      │
    │                              │                            │                    │                    │                  │
    │                              │ (G1 통과) payload + idempotency_key 적재(원자 트랜잭션)                              │
    │                              │ ──────────────────────────▶│ status=PENDING     │                    │                  │
    │  202 "등록 대기 중" + outbox_id                            │                    │                    │                  │
    │ ◀───────────────────────────│  (사용자 응답 즉시 — 비차단)                     │                    │                  │
    │                              │                            │  PENDING 폴링/이벤트│                    │                  │
    │                              │                            │ ──────────────────▶│                    │                  │
    │                              │                            │                    │ register_jha(payload, idem_key)        │
    │                              │                            │                    │ ──────────────────▶│                  │
    │                              │                            │                    │ (G2) 어댑터 방어검증 │                  │
    │                              │                            │                    │   human_review/인용/매핑 재확인        │
    │                              │                            │                    │ ──────────────────────────────────────▶│
    │                              │                            │                    │                    │   ┌── 분기 ──┐    │
    │                              │                            │                    │ ◀──────────────────────────────────────│
    │                              │                            │                    │                                          
    │            ┌─────────────────┴─────── 결과 분기 (§3) ─────┴────────────────────┴──────────────────────────────────┐
    │            │ 성공        → erp_jha_id 회수 → Outbox status=REGISTERED → 세션 갱신 → Frontend "등록 완료" + ID       │
    │            │ ErpRetryable→ status=RETRYING, 지수 백오프 재시도(최대 N) → 초과 시 FAILED + 알림                      │
    │            │ ErpConflict → 200 + 기존 erp_jha_id 회수(정상) → status=REGISTERED (중복 등록 없음)                    │
    │            │ ErpFatal    → status=FAILED → 사용자 "등록 실패" + 운영팀/매핑 갱신 알림(재시도 금지)                  │
    │            └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 트랜잭션 경계
- **finalize → Outbox 적재**는 단일 DB 트랜잭션(원자성). 적재 성공 = 등록 보장(eventual). 사용자에게는 즉시 202 반환(비차단).
- **Outbox → ERP register**는 별도 워커가 비동기 처리. ERP가 헤더+디테일 다행을 **단일 호출 원자 등록**한다고 가정 `[검증 필요-인벤토리 Q10]`. 다단계(헤더/디테일 분리)로 판명되면 §5 부분 실패 처리 적용.

---

## 2. 등록 페이로드 전체 스키마

`legal_citation_matrix` 필수 필드 + `risk_matrix_spec` human_review 증빙 + PII 경계 반영.

```json
{
  "idempotency_key": "outbox-{uuid}",          // = outbox_entry_id (재시도 안전, §4)
  "schema_version": "1.0",

  "context": {
    "site_code": "HB-SEOUL-001",               // ERP source of truth (직접 전달)
    "dept_code": "DEPT-EHS",
    "work_date": "2026-06-12",
    "requested_by": "EMP-12345",               // 사번만(PII 이름 미포함)
    "approved_by": "EMP-99999",                // [필수] 위변조방지·법정(citation §3 중점등록)
    "approved_at": "2026-06-12T09:30:00+09:00" // [필수] 승인시각
  },

  "classification": {
    "major_type_code": "HBC-MJ-001",           // [필수] map_status=MAPPED 필수
    "sub_type_code":   "HBC-SB-001",           // [필수] map_status=MAPPED 필수
    "detail_item_code":"HBC-DT-0012",          // erp_detail_codeable=Y 시 전송
    "detail_text":     "타워크레인 해체",       // erp_detail_codeable=N 시 대체 전송
    "jha_lineage": { "major_id":"MJ001","sub_id":"SB001","detail_id":"DT0012","source_rows":["R00043"] }
  },

  "assessment": {
    "hazards": [ { "accident_type":"전도", "hazard_text":"...", "source_row":"R00043" } ],
    "severity": 4,                             // [필수] 정수 1~5 (risk_matrix_spec §1)
    "frequency": 4,                            // [필수] 정수 1~5
    "risk_grade": "상",                        // [필수] 하/중/상
    "critical_register": "O",                  // [필수] 중점등록 O/X (grade==상 ⇔ O)
    "grade_rationale": "강도4×빈도4=16 (경계셀, 안전관리자 확인 완료)",

    "boundary_cell_flag": true,                // 곱16 경계셀 여부 (risk_matrix_spec §3)
    "human_review_required": true,             // 곱16 → true
    "human_review_resolved": true,             // [필수 IF required] 미해소면 등록 차단 (G1/G2)
    "human_review": {                          // [필수 증빙 IF required] 위변조방지
      "resolved_by": "EMP-99999",
      "resolved_at": "2026-06-12T09:28:00+09:00",
      "decision": "상 확정",                    // 상 유지 / 중 강등
      "note": "통제 가능성 검토 후 상 유지"
    }
  },

  "controls": [ { "text":"...", "source_row":"R00043" } ],   // 개선대책

  "citations": [                               // [필수: MUST 레벨] legal_citation_matrix §5
    { "law":"산업안전보건기준에 관한 규칙", "article":"§142",
      "level":"MUST", "source_row":"R00043" },
    { "law":"산업안전보건법 시행규칙", "article":"§43",      // 중점등록 O → §43 필수
      "level":"MUST", "source_row":"R00043" }
  ],

  "integrity": {                               // 위변조 방지(safety 4.4)
    "payload_hash": "sha256:...",              // context+assessment+citations 정규화 해시
    "generated_by": "jha-agent",
    "generated_at": "2026-06-12T09:30:05+09:00"
  }
}
```

### 2.1 ERP 응답 스키마
```json
{ "erp_jha_id": "JHA-2026-000123", "registered_at": "2026-06-12T09:30:06+09:00", "status": "REGISTERED" }
```

### 2.2 필수 필드 체크리스트 (등록 전 검증 대상)
| 필드 | 필수 조건 | 위반 시 |
|------|----------|--------|
| `approved_by`, `approved_at` | 항상 | 422 |
| `major_type_code`, `sub_type_code` | 항상 + map_status=MAPPED | 422 (마스터 미존재 → ErpFatal) |
| `severity`, `frequency`, `risk_grade`, `critical_register` | 항상, 정수/규칙 정합 | 422 |
| `citations[]` (MUST 레벨) | citation_matrix §1/§2 의무영역·중점등록 O | 422 (필수 인용 누락) |
| `human_review_resolved=true` + `human_review{}` | `human_review_required==true` 일 때 | **409/ErpFatal (등록 차단)** |

---

## 3. 결과 분기 상세 (예외 분류)

| 분기 | ERP 응답 | 의미 | 처리 | 재시도 |
|------|---------|------|------|--------|
| **성공** | 200 + erp_jha_id | 등록 완료 | ID 회수 → session/Frontend 갱신 | — |
| **ErpRetryable** | 5xx / timeout / 429 | 일시 장애·rate limit | Outbox status=RETRYING, 지수 백오프(예: 1·2·4·8s, 최대 N=5) | O |
| **ErpConflict** | 이미 등록(idem 충돌) | 동일 idem_key 재전송 | **200 + 기존 erp_jha_id** 회수(정상) | — (해소됨) |
| **ErpFatal** | 4xx (마스터 미존재/검증 실패/human_review 미해소) | 영구 실패 | status=FAILED + 사용자/운영팀 알림 + (매핑 미스면)매핑 갱신 요청 | **금지** |
| **인증실패** | 401/403 | 시크릿 만료 가능 | **즉시 중단** + 운영팀 알림 | **금지** |

> Mock 어댑터는 인벤토리 §6.2 트리거로 위 분기를 결정적 재현(`flaky-`→Retryable, 동일키→Conflict, 미매핑코드→Fatal, `expired-`→인증실패, health FAIL→Outbox 격리).

---

## 4. Idempotency

- `idempotency_key = outbox_entry_id`(UUID). Outbox 적재 시 1회 생성, 재시도 전반에 동일 키 사용.
- ERP가 idem key 지원 시 중복 등록 방지를 ERP가 보장 → Conflict는 **정상 경로**(기존 ID 반환).
- ERP가 idem 미지원 시 `[검증 필요-인벤토리 Q9]`: 어댑터가 "등록 전 조회(idem_key로 기존 등록 확인)" 보강 또는 ERP 측 unique 제약 요청.

---

## 5. 부분 실패 처리 (헤더 OK / 디테일 일부 실패)

ERP 등록이 다단계(헤더+디테일 분리)로 판명될 경우(`[검증 필요-Q10]`):
```
1. 헤더 등록 성공 → erp_jha_id 회수, Outbox 에 erp_jha_id 저장(중간 상태 PARTIAL)
2. 디테일 라인 N개 중 일부 실패:
   - 재시도 가능(Retryable) 라인 → erp_jha_id + line_idem_key 로 재시도(헤더 중복 등록 없음)
   - 영구 실패(Fatal) 라인 → 해당 라인만 보류 + 매핑/검증 알림, 성공 라인은 확정
3. 모든 라인 확정 시 status=REGISTERED, 일부 영구실패 시 status=PARTIAL_FAILED(운영팀 검토)
```
단일 호출 원자 등록이면 본 절은 비활성(전부 성공 또는 전부 롤백).

---

## 6. 등록 차단 방어 검증 — human_review 게이트 (이중 방어)

`risk_matrix_spec §3/§6` + `citation_matrix §5`의 핵심 제약: **human_review 미해소 세션은 ERP 등록 호출 자체 차단**.

### 6.1 G1 — 백엔드 게이트 (1차, Outbox 적재 전)
```
IF assessment.human_review_required == true AND assessment.human_review_resolved != true:
    return 409 CONFLICT  (Outbox 적재 안 함, ERP 호출 자체 미발생)
    message = "경계셀(강도4×빈도4) 안전관리자 확인 미완료 — 등록 불가"
```

### 6.2 G2 — 어댑터 방어 검증 (2차, ErpAdapter.register_jha 진입부)
백엔드 게이트를 신뢰하되, **어댑터 레벨에서도 방어적 재검증**(Phase 2 합의: "어댑터 레벨에서도 방어적 검증 추가"):
```
def register_jha(payload, idempotency_key):
    a = payload["assessment"]
    # (1) human_review 미해소 차단
    if a.get("human_review_required") and not a.get("human_review_resolved"):
        raise ErpFatal("HUMAN_REVIEW_UNRESOLVED")        # 재시도 금지
    if a.get("human_review_required") and not payload["assessment"].get("human_review"):
        raise ErpFatal("HUMAN_REVIEW_EVIDENCE_MISSING")  # 증빙 누락
    # (2) 필수 인용(MUST) 누락 차단 (citation_matrix §5)
    if not _has_required_citations(payload):
        raise ErpFatal("REQUIRED_CITATION_MISSING")
    # (3) 마스터 코드 미매핑 차단
    if not _codes_mapped(payload["classification"]):     # map_status != MAPPED
        raise ErpFatal("MASTER_CODE_UNMAPPED")           # 매핑 갱신 요청
    # ... 정상 등록 진행
```
> **이중 방어 사유**: 백엔드 우회·코드 변경·Outbox 직접 주입 등 어떤 경로로도 미해소 경계셀이 ERP에 등록되지 않도록 시스템 경계(어댑터)에서 최종 차단. ErpFatal이므로 재시도 없이 즉시 보류 + 알림.

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | finalize→Outbox→worker→adapter 시퀀스, 전체 페이로드 스키마, 4분기, idempotency, 부분실패, human_review 이중 게이트 | Phase 3 Design |
