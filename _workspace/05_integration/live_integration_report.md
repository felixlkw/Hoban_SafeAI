# 호반 JHA Agent — 실연동 통합 점검 보고서 (Live Integration Report)

작성일: 2026-06-12
담당: 풀스택 통합 점검 (frontend 실빌드 ↔ backend 실 API)
대상 경계면: Next.js(3000) ↔ FastAPI(8000) — 이전까지 한 번도 동시 구동된 적 없던 조합.

---

## 0. 모드 (Mode)

| 항목 | 값 |
|------|-----|
| **LLM 모드** | **MockClaudeClient** (`_workspace/04_build/backend/.env` 부재 → `ANTHROPIC_API_KEY` 없음 → 자동 폴백) |
| **프론트 모드** | **실연동** (`NEXT_PUBLIC_USE_MOCK` 미설정 → `false` → `lib/api.ts`가 실제 `fetch`로 8000 호출) |
| **인증** | `JHA_AUTH_ENABLED=true` (기본). PoC JWT(HS256) 토큰 발급 후 주행 |
| **백엔드** | `claude_api` 의존성은 health에서 `ok`로 보고되나 실제로는 결정론적 Mock 응답 |

> 5단계(실 LLM 스모크)는 **키 부재로 보류**. 키 설정 후 재실행 필요.

---

## 1. 구동 토폴로지 (Topology)

```
[Browser/Playwright] ──HTTP──▶ Next.js prod (localhost:3000)  ──fetch(API_BASE)──▶ FastAPI/uvicorn (localhost:8000)
   localStorage:                lib/api.ts                          ├─ BM25 인덱스 4,469 청크 (bm25_index.pkl, 8.1MB)
   jha_token=<JWT>              Authorization: Bearer <JWT>         ├─ MockClaudeClient (결정론적 JSON)
   jha_role=<role>             Content-Type: application/json       └─ MockErpAdapter + Outbox (인메모리)
```

- 백엔드: `python -m uvicorn app.main:app --port 8000` (백그라운드). `/v1/health` → 200, `kb_index: ok`.
- BM25 인덱스: **4,469 청크 로드 확인** (`kb.chunk_ids` 길이 = 4469, `loaded=True`).
- 프론트: `next build`(실연동) 성공 → `next start -p 3000`. 5 라우트 정상 빌드, 타입 에러 0.
- 토큰 발급(README 절차): `app.middleware.auth.encode_token("w1","worker")` / `encode_token("m1","safety_manager")`.
- pytest: **55 passed** (CORS 추가 후 재실행에도 55 passed).

---

## 2. API 계약 스모크 — 상태머신 1회 주행 (httpx)

타워크레인 시나리오 + 굴착/밀폐/석면 분기까지 전체 상태머신 주행. **모든 전이 계약 일치.**

| 단계 | 입력 | HTTP | 상태/결과 | 계약 검증 |
|------|------|------|-----------|-----------|
| create | "5층 옥상에서 타워크레인 분해 작업" | 201 | CREATED | `Session{session_id,state,created_at}` OK |
| classify | — | 200 | CLASSIFIED, rt=ok | `classification{major/sub/detail/confidence}` + `alternatives[]`(3) + `candidates[]`(3) OK |
| assess | — | 200 | ASSESSED, rt=ok, hazards=3 | `critical_register="O"`, `human_review_flags`, `source_rows`, hazard `citations=[R00037]` OK |
| review (worker) | — | **403** | AUTH_INSUFFICIENT_ROLE | 권한 게이트 OK |
| finalize (manager) | site_id | **202** | REGISTERING, outbox_id 발급 | `FinalizationResult{outbox_id,status:queued}` OK |
| get detail | — | 200 | REGISTERING | `erp={status:queued, erp_id:null, queue_position:1, register_state:PENDING, attempts:0}` OK |
| citation | row=2 | 200 | 원문 반환 | `Citation{source_row,major_type,...,hazard_text,control_text,severity,frequency}` OK |

### 분기 시나리오(경계셀/거절 게이트) — 전부 계약대로 동작

| 시나리오 | classify rt | assess rt | state | 특이 |
|----------|-------------|-----------|-------|------|
| 굴착 흙막이 | ok | ok | **PENDING_REVIEW** | `critical="O (잠정)"`, human_review=True (곱16 경계셀 3중 강제) |
| 밀폐공간 | ok | **refused_partial** | PENDING_REVIEW | `gap_areas=['confined_space']`, hazards 2건(갭 고유 위험 제거) |
| 석면 | **refused_full** | **refused_full** | PENDING_REVIEW | classify+assess 모두 차단, `gap_areas=['asbestos']`, hazards 0 |
| 밀폐+worker finalize | — | — | — | **409 SESSION_REVIEW_REQUIRED** (G1 게이트) |

한글 인코딩: 응답 JSON UTF-8 정상(분류 "가설공사 > 타워크레인(T형) > 타워크레인", confidence 0.86). 콘솔 mojibake는 cp949 stdout 한정으로 데이터 무결.

---

## 3. 프론트 실연동 빌드 + 통합 구동 (3000 ↔ 8000)

- `npm run build` (실연동): **성공**. `/`(2.69kB), `/manager`(3.8kB), `/session/[id]`(27.7kB) 빌드.
- `lib/api.ts` base URL = `NEXT_PUBLIC_API_BASE || http://localhost:8000` → 일치. 인증 헤더 = `Authorization: Bearer ${localStorage.jha_token}` → 백엔드 JWT와 정합.
- **CORS**: 기존 백엔드에 미설정 → 수정(§4-A). 수정 후 preflight 200 + `access-control-allow-origin: http://localhost:3000` 확인.

### Playwright 실연동 주행 (3000+8000, worker JWT 주입, mock e2e 아님)

| 캡처 | 화면 | 결과 |
|------|------|------|
| `screenshots/LIVE1_home.png` | 홈 챗 시작 | 호반 CI + 예시 칩 렌더 |
| `screenshots/LIVE2_classify.png` | 분류 카드 | **실 백엔드** classify: 가설공사 > 타워크레인(T형) > 타워크레인, AI 신뢰도 86%, 형제 후보(90%/75%), 컴패니언 트리(524건) |
| `screenshots/LIVE3_hazards.png` | 위험요인 + 동적위험 | **실 백엔드** assess: 위험요인 3건(상0·중2·하1) + (프론트 mock) 동적 위험 패널 |

- **4xx/5xx 네트워크 에러 0건** — CORS·auth·계약 전 구간 정합.
- 분류 정확도: 타워크레인 → 가설공사 정확. confidence 0.86.

---

## 4. 경계면 불일치 발견·수정 (총 1건 수정, 1건 무해 확인)

### [수정 A] CORS 미설정 — **백엔드 수정** (계약/통합 요구사항 위반)

- **증상**: `app/main.py`에 CORSMiddleware 부재. 브라우저(3000)→8000 호출 시 preflight 차단되어 실연동 자체가 불가.
- **권위 판단**: OpenAPI는 CORS를 명시하지 않으나, 통합 토폴로지(3000↔8000) 구동의 전제 조건이며 백엔드 책임. 백엔드 수정.
- **수정 내용**:
  - `app/config.py`: `CORS_ORIGINS` 추가(env `JHA_CORS_ORIGINS` override, 기본 `localhost:3000/127.0.0.1:3000/3100`).
  - `app/main.py`: `CORSMiddleware` 등록(allow_credentials, expose `X-Request-ID`/`Retry-After`).
- **검증**: preflight 200, allow-origin/headers/credentials 정상. pytest 55 passed 유지.

### [확인 B] `classification.alternatives` vs `candidates` — **불일치 아님 (무해)**

- 작업 지시서는 "classification.alternatives[]"를 언급했으나, OpenAPI 계약은 `ClassificationResult.candidates[]`가 정식 필드.
- 백엔드는 **두 가지를 모두** 채운다: `candidates[]`(집계 후보) + `classification.alternatives[]`(frontend 합의 추가 필드, `models.py`·`rag_pipeline.py:269`).
- 프론트 `ClassificationCard`는 `classification.alternatives`를 읽음 → 백엔드가 채우므로 **정상 동작**. 수정 불필요.

### [확인 C] `ErpState.status` enum 표기 차이 — **무해 (런타임 영향 없음)**

- 프론트 `types.ts` `ErpState.status`: `idle|pending|success|failed|session_expired`.
- 백엔드 `SessionDetail.erp.status`: `none|queued|registering|registered|failed`.
- 두 enum 라벨이 다르나, **현재 실연동 화면(session 페이지)은 finalize 직후 `setErp({status:"pending"})`로 프론트-로컬 시뮬레이션**(`simulateErp`)을 쓰고 `SessionDetail.erp`를 폴링하지 않으므로 런타임 충돌 없음. 향후 ERP 상태 폴링 실연동 시 enum 정렬 필요 → **갭 목록에 기재**.

---

## 5. 실연동 미구현 갭 목록 (수정하지 않음 — 다음 단계 작업량 산정용)

우선순위: P1=데모 핵심 경로, P2=완성도, P3=운영 전환.

| # | 갭 | 현재 상태 | 백엔드 필요 작업 | 우선순위 |
|---|-----|-----------|------------------|----------|
| G1 | **세션 작업설명 버블 미표시** | `session/[id]/page.tsx:154`가 `sessionStorage.mock_desc_*`를 읽으나 홈에서 기록 안 함 → 실연동 시 사용자 입력 버블 누락(분류는 정상) | 프론트: createSession 후 description을 sessionStorage/세션 GET으로 전달. 또는 `Session.work_description` 활용 | P2 |
| G2 | **동적 위험(기상·지형)** | 100% 프론트-로컬 mock(`MockDynamicRiskProvider`). 백엔드에 dynamic-risk 엔드포인트 없음 | 백엔드: 기상(KMA)·지형(V-World) provider + 룰엔진 API 신설. 현재 프론트 룰엔진을 백엔드로 이관 또는 provider만 실 API 교체 | P1(데모 핵심) |
| G3 | **챗 자유입력(chatTurn)** | `api.ts:chatTurn`이 `/v1/jha/sessions/{id}/chat` 호출하나 **백엔드에 라우트 없음**. 현재 프론트가 정규식으로 로컬 처리(`handleFreeText`) | 백엔드: `/chat` 엔드포인트(자연어 정정·질문 → action/next_phase) 신설 + LLM tool-use | P2 |
| G4 | **안전관리자 검토 대기 목록** | `manager/page.tsx`가 `lib/mock.pendingReviewList()` 사용. **백엔드에 세션 목록 조회 API 없음**(OpenAPI에도 부재) | 백엔드: `GET /v1/jha/sessions?state=PENDING_REVIEW` 목록 엔드포인트 + 페이지네이션·권한 | P1(관리자 흐름 핵심) |
| G5 | **ERP 등록 상태 실시간 폴링** | finalize 후 프론트가 `simulateErp()`로 2.3초 뒤 성공을 가짜로 표시. 실제 `SessionDetail.erp` 폴링 안 함 | 프론트: finalize 후 `GET /sessions/{id}` 폴링하여 `erp.status` 반영 + enum 정렬(확인 C) | P2 |
| G6 | **worker 검토 요청 제출** | worker "안전관리자 검토 요청"이 프론트 상태만 변경(`setSubmittedForReview`). 백엔드 큐 적재 없음 | 백엔드: 검토 요청 제출 엔드포인트(또는 G4 목록에 worker-submitted 플래그) | P2 |
| G7 | **역할별 JWT 발급 UI 없음** | 프론트가 `jha_token`을 절대 설정 안 함. 역할 토글(`jha_role`)은 UI 표시용. 실연동 시 토큰 수동 주입 필요 | 프론트: 로그인/토큰 발급 흐름(PoC: 역할 선택→백엔드 토큰 발급 엔드포인트). 운영: SSO(OIDC) | P1(인증 경로 필수) |

> 참고: G2·G3·G4·G7은 OpenAPI 계약 자체에 미정의 영역 → 계약 확장(`/v2` 아닌 minor 추가)부터 필요.

---

## 6. 실 LLM 스모크 (5단계)

**보류 — 키 설정 후 재실행.** `_workspace/04_build/backend/.env` 부재 및 `anthropic` 패키지 미설치(`pip install anthropic` 필요)로 MockClaudeClient 자동 폴백. 키 설정 시 데모 3건(타워크레인 해체/굴착 흙막이/밀폐공간 refuse)을 실 Claude로 재주행하여 분류 정확성·인용 검증·refuse 발동·토큰·지연을 기록해야 함.

---

## 7. 종합 판정

- **상태머신 1회 주행: 통과** (create→classify→assess→review-gate→finalize→ERP queue→detail).
- **3000↔8000 실연동: 통과** (CORS 수정 후 4xx/5xx 0건, 분류/위험요인 실 백엔드 렌더).
- **계약 정합성: 통과** (alternatives/candidates/erp/citations 전부 계약 일치, CORS 1건 수정).
- **데모 차단 요인: 없음** (Mock 모드에서 핵심 경로 완주).
- **다음 단계 핵심**: G7(토큰 발급 UI), G4(검토 목록 API), G2(동적위험 백엔드화) — 데모 완전 실연동의 3대 잔여 작업.

### 산출물
- 본 보고서: `_workspace/05_integration/live_integration_report.md`
- 스크린샷: `_workspace/05_integration/screenshots/LIVE1_home.png`, `LIVE2_classify.png`, `LIVE3_hazards.png`
- 서버 로그: `_workspace/05_integration/uvicorn.log`, `next.log`
- 라이브 캡처 스크립트: `_workspace/04_build/frontend/e2e/live-integration.mjs`
