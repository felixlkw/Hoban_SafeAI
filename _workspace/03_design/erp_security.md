# ERP 연동 보안 설계 (Design)

- **문서 ID**: 03_design / erp_security
- **작성**: erp-integration-engineer · Phase 3 (Design)
- **작성일**: 2026-06-10
- **상태**: 확정 (PoC). 모든 ERP 측 보안 수치는 인터뷰 부재 → `[검증 필요]`.
- **선행**: `01_discovery/erp_interface_inventory.md` §4(보안 요구 가정), data-engineer `data_security_policy.md`(PII 0건·화이트리스트).
- **원칙**: 읽기(ETL) ≠ 쓰기(JHA 등록) — 분리된 credential·화이트리스트·권한.

---

## 1. 네트워크 경계

| 항목 | 설계 | 상태 |
|------|------|------|
| 전용 회선/VPN | 본 PoC 서버 ↔ ERP DMZ. 공중망 직접 노출 금지 | `[검증 필요-Q13]` |
| IP 화이트리스트 | ERP 게이트웨이에 송신 IP 등록. **읽기용 IP ≠ 쓰기용 IP 분리** | `[검증 필요]` |
| 통신 암호화 | 전 구간 TLS 1.2+ 강제. 가능 시 **mTLS**(상호 인증) | `[검증 필요]` |
| DMZ 경유 | ERP 폐쇄망 직접 접근 금지, 게이트웨이/EAI 경유 | `[검증 필요]` |

---

## 2. 인증 — 읽기/쓰기 계정 분리

| 용도 | 계정/인증 | 권한 범위 | 화이트리스트 |
|------|----------|----------|-------------|
| **읽기(ETL)** | 안전 DB read-only 계정 또는 EDI SFTP key | 안전 위험요인 테이블 **SELECT only** (타 테이블 불가) | 읽기용 IP |
| **쓰기(JHA 등록)** | OAuth2 client_credentials 또는 mTLS 클라이언트 인증서 | JHA 등록 API **단일 권한** | 쓰기용 IP |

- 두 계정은 **서로의 권한을 침범 불가**(읽기 계정으로 등록 호출 불가, 쓰기 계정으로 DB SELECT 불가).
- 인증 실패(401/403) → **즉시 중단 + 재시도 금지 + 운영팀 알림**(시크릿 만료 가능성, register_flow §3).

### 2.1 인증 방식 선호 순위
1. **mTLS** (상호 인증) — 가장 강함. ERP 게이트웨이 지원 시 1순위.
2. **OAuth2 client_credentials** (게이트웨이 토큰) — 토큰 만료/회전 운영.
3. (읽기 전용) SFTP key + IP 화이트리스트 — EDI 덤프 경로.

---

## 3. 시크릿 관리 — PoC(.env) → 운영(Vault) 전환

| 항목 | PoC | 운영 |
|------|-----|------|
| 저장소 | `.env` (gitignore, 커밋 금지) | **Vault / Secrets Manager** |
| 주입 | 환경변수 로드 | 런타임 동적 페치(코드/환경변수 평문 노출 금지) |
| 회전 | 수동 | **90일 자동 회전** `[검증 필요]` |
| 분리 | 읽기/쓰기 시크릿 별도 키 | 별도 시크릿 경로 + 접근 정책 분리 |
| 감사 | 로컬 로그 | 시크릿 접근 감사 로그 |

```
# .env (PoC, gitignore) — 예시 키 (값은 절대 커밋 금지)
ERP_BASE_URL=...
ERP_WRITE_CLIENT_ID=...           # 쓰기(등록) — OAuth2
ERP_WRITE_CLIENT_SECRET=...
ERP_WRITE_MTLS_CERT_PATH=...      # mTLS 채택 시
ERP_READ_SFTP_HOST=...            # 읽기(ETL) — EDI
ERP_READ_SFTP_KEY_PATH=...
```
> 운영 전환 시 위 키는 Vault 경로(`secret/jha/erp/write/*`, `secret/jha/erp/read/*`)로 이동. 어댑터는 시크릿 provider 추상화로 .env↔Vault 무코드 변경 전환.

---

## 4. 데이터 보호 / 컴플라이언스

| 항목 | 설계 |
|------|------|
| **PII 외부 LLM 미전송** | 작업자 이름/연락처 등 인사정보는 외부 LLM 프롬프트에 절대 미포함. 등록 페이로드도 사번(EMP-#####)만, 이름 미포함. data-engineer 화이트리스트 필터 정합(PII 스캔 0건 유지) |
| **외부 LLM 화이트리스트 필터 강제** | 전송 페이로드 사전 검사(제약사항). site/worker/dept 코드는 분류·검색 키로만 사용 |
| **최소 권한** | 안전 위험요인 테이블 외 ERP 테이블 접근 불가 |
| **마스터 매핑 PII 경계** | worker_map은 사번·부서·역할만 저장, 이름 미저장(master_mapping §4) |

---

## 5. 감사 로그 (1년 보관)

ERP 모든 호출(읽기/쓰기) 감사 로그를 **1년 이상** 보관 `[검증 필요-보관기간]`.

```json
{ "ts":"...", "actor":"jha-agent", "op":"REGISTER|EXTRACT",
  "account":"write|read", "idempotency_key":"outbox-...",
  "erp_endpoint":"...", "result":"SUCCESS|RETRY|FATAL|AUTH_FAIL",
  "erp_jha_id":"JHA-2026-000123", "latency_ms":420, "src_ip":"..." }
```
- 등록 호출은 `idempotency_key`·`erp_jha_id`·승인자(`approved_by`) 추적 가능(위변조 방지·법정 정합).
- ETL 호출은 `sync_id`·추출 행수·매핑 미스 기록(erp_etl_pipeline §5와 연계).

---

## 6. 사내 보안 가이드라인 체크리스트

- [ ] 전용 회선/VPN 또는 DMZ 경유 `[검증 필요]`
- [ ] IP 화이트리스트(읽기/쓰기 분리) `[검증 필요]`
- [ ] 통신 암호화 TLS 1.2+ / mTLS `[검증 필요]`
- [ ] 시크릿 저장소(PoC .env → 운영 Vault), 코드/환경변수 평문 노출 금지
- [ ] credential 90일 회전 `[검증 필요]`
- [ ] 읽기/쓰기 계정·권한 물리 분리
- [ ] PII 외부 LLM 미전송 + 화이트리스트 필터 강제
- [ ] 감사 로그 1년 이상 보관
- [ ] 최소 권한(안전 테이블 외 접근 불가)
- [ ] 인증 실패 즉시 중단·재시도 금지·알림
- [ ] human_review 미해소·필수인용 누락·미매핑 코드 ERP 등록 차단(register_flow §6 게이트)

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | 네트워크·인증(읽기/쓰기 분리)·시크릿(.env→Vault)·PII·감사로그(1년)·체크리스트 | Phase 3 Design |
