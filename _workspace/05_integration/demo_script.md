# JHA Agent PoC — 데모 실행 스크립트 (Phase 6 Integration)

> 작성: backend-engineer · Phase 6 (Integration)
> 목적: 호반 JHA Agent PoC 데모를 **외부 LLM 호출 없이(Mock 모드)** 결정적으로 시연하는 단계별 절차.
> 시나리오 5건: ① 타워크레인 해체(경계셀) ② 굴착 흙막이 ③ 거푸집 동바리 ④ 고소 용접 ⑤ 밀폐공간(refuse).
> 관련: backend `README.md`, frontend `README.md`, `_workspace/02_foundation/rag_guardrails.md`(G3).

---

## 0. 사전 준비 — 백엔드 기동 (Mock 모드)

Mock 모드는 `ANTHROPIC_API_KEY` 미설정 시 자동 활성(또는 `JHA_FORCE_MOCK=true`). 외부 호출 0건, 결정적 응답.

```bash
cd _workspace/04_build/backend
pip install fastapi uvicorn pydantic rank-bm25 pyjwt        # 최초 1회
# 인증 우회 + Mock 강제(데모 단순화). 운영 데모는 JHA_AUTH_ENABLED=true + 토큰 사용.
JHA_AUTH_ENABLED=false JHA_FORCE_MOCK=true uvicorn app.main:app --reload --port 8000
```

Windows PowerShell:
```powershell
$env:JHA_AUTH_ENABLED="false"; $env:JHA_FORCE_MOCK="true"; uvicorn app.main:app --reload --port 8000
```

확인:
```bash
curl -s http://localhost:8000/v1/health          # status:"ok", dependencies 전부 ok
# Swagger UI: http://localhost:8000/docs
```

> 기대 포인트: `kb_index:"ok"`(BM25 인덱스 로드됨), `claude_api:"ok"`(Mock). 어느 하나라도 ok 아니면 데모 중단.

공통 헬퍼(세션 생성→ID 추출). 각 시나리오는 `WD`(작업 입력)만 바꿔 재사용:
```bash
new_session () {
  curl -s -X POST http://localhost:8000/v1/jha/sessions \
    -H "Content-Type: application/json" -d "{\"work_description\":\"$1\"}" \
    | python -c "import sys,json;print(json.load(sys.stdin)['session_id'])"
}
```

---

## 시나리오 ① 타워크레인 마스트 해체 — **경계셀(강도4×빈도4) 안전관리자 확정 흐름**

핵심 시연: 곱16 경계셀 → `result_type` 정상이나 `human_review_required=true` → `finalize` **409 차단** → 안전관리자 `review` 확정 → 재 `finalize` 통과.

```bash
SID=$(new_session "타워크레인 마스트 해체 작업")

# 1) 분류
curl -s -X POST http://localhost:8000/v1/jha/sessions/$SID/classify | python -m json.tool
# 기대: result_type="ok", classification.major_type="가설공사" 계열, candidates[] source_rows 포함

# 2) 평가
curl -s -X POST http://localhost:8000/v1/jha/sessions/$SID/assess \
  -H "Content-Type: application/json" -d '{}' | python -m json.tool
# 기대 포인트:
#   - hazards[].risk_grade 는 코드 재계산(LLM 값 무시) — 곱16 이면 "상" 강제
#   - 곱16 hazard 존재 시: boundary_cell=true, critical_register="O (잠정)",
#     human_review_flags.human_review_required=true, state="PENDING_REVIEW"
#   - warnings 에 "경계 셀(강도4×빈도4) — 안전관리자 확인 필요"

# 3) (작업자 권한) finalize 시도 → 409 ReviewRequired
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  http://localhost:8000/v1/jha/sessions/$SID/finalize -d '{}'
# 기대: 409 (human_review 미해소 게이트, pending_hazards 인덱스 반환)
```

**안전관리자 경계셀 확정** (safety_manager 토큰 필요 — 인증 활성 데모 시):
```bash
# safety_manager 토큰 발급(JHA_AUTH_ENABLED=true 인 경우):
TOK=$(cd _workspace/04_build/backend && python -c "from app.middleware.auth import encode_token; print(encode_token('sm1','safety_manager'))")

# review — 경계셀 hazard(index 0 가정) 를 "상"으로 확정, 중점등록 O 확정
curl -s -X POST http://localhost:8000/v1/jha/sessions/$SID/review \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"decisions":[{"hazard_index":0,"confirmed_grade":"상","confirmed_critical_register":"O"}],"reviewer_note":"고위험 해체 — 상 확정"}' \
  | python -m json.tool
# 기대: state="REVIEWED", boundary_cell=false(해소), human_review_required=false

# 재 finalize → 202 큐잉 통과
curl -s -X POST http://localhost:8000/v1/jha/sessions/$SID/finalize \
  -H "Authorization: Bearer $TOK" -d '{}' | python -m json.tool
# 기대: 202, status="queued", outbox_id 반환, state="REGISTERING"
```

> 데모 메시지: "AI는 경계셀을 **자동 확정하지 않는다**. 안전관리자 승인 없이는 ERP 등록이 차단된다(3중 강제)."
> 인증 우회 데모(`JHA_AUTH_ENABLED=false`)에서는 토큰 헤더 없이 review/finalize 호출 가능(권한은 항상 통과).

---

## 시나리오 ② 굴착 흙막이 지보공 — 표준 정상 플로우

```bash
SID=$(new_session "굴착 흙막이 지보공 설치 작업")
curl -s -X POST http://localhost:8000/v1/jha/sessions/$SID/classify | python -m json.tool
curl -s -X POST http://localhost:8000/v1/jha/sessions/$SID/assess -d '{}' | python -m json.tool
curl -s -X POST http://localhost:8000/v1/jha/sessions/$SID/finalize -d '{}' | python -m json.tool
```
기대 포인트:
- 분류: 토목/굴착 계열. hazards 에 "추락·붕괴" 포함, 각 hazard `citations` 비어있지 않음(citations ⊆ retrieved 불변식).
- `legal_refs` 에 붕괴/추락 필수 조문(§43 등) 표시.
- 경계셀 아니면 `human_review_required=false` → `finalize` 즉시 202.

---

## 시나리오 ③ 거푸집 동바리 조립 — 인용 검증 시연

```bash
SID=$(new_session "거푸집 동바리 조립 작업")
curl -s -X POST http://localhost:8000/v1/jha/sessions/$SID/classify | python -m json.tool
curl -s -X POST http://localhost:8000/v1/jha/sessions/$SID/assess -d '{}' | python -m json.tool
# 인용 원문 조회(사이드 패널 데이터): source_row 는 assess 응답 source_rows[] 에서 확인
curl -s http://localhost:8000/v1/jha/citations/680 | python -m json.tool
```
기대 포인트:
- `source_rows`는 **백엔드가 citations→metadata 역추적으로 재산출**(LLM 값 미신뢰).
- `/citations/{source_row}` 응답에 `hazard_text`·`control_text`·`severity`·`frequency` 원문 — frontend 인용 패널 연동.
- 화이트리스트 게이트로 PII/내부키 제거 확인(응답에 source_row 외 내부 식별자 없음).

---

## 시나리오 ④ 고소 철골 용접 — 감전/추락 필수 인용

```bash
SID=$(new_session "고소 철골 용접 작업")
curl -s -X POST http://localhost:8000/v1/jha/sessions/$SID/assess -d '{}' | python -m json.tool
```
기대 포인트:
- hazards 에 "감전"·"추락" 포함. 감전은 **등급 낮아도 §301~ 필수 인용**(legal_refs 확인).
- 정상 응답(`result_type="ok"`) — 갭영역 오발동 없음(false-refuse 0).

---

## 시나리오 ⑤ 밀폐공간(E/V PIT·맨홀) — **refuse 가드레일(G3 partial)** [핵심 데모]

Phase 5 버그(refuse 미발동) 수정 검증. **Mock 모드에서도 결정적으로 발동**.

```bash
SID=$(new_session "E/V PIT 내부 또는 맨홀 내 청소·점검 작업 (밀폐공간)")
curl -s -X POST http://localhost:8000/v1/jha/sessions/$SID/assess -d '{}' | python -m json.tool
```
기대 포인트(refused_partial):
- `result_type="refused_partial"` (이전 버그: "ok").
- `legal_refs` 에 **§619~§625(밀폐공간) + KOSHA Guide P-93** 표시(조문은 표시, 절차 대책은 차단).
- `human_review_flags`: `data_gap=true`, `human_review_required=true`, `gap_areas=["confined_space"]`.
- `warnings` 에 "밀폐공간 산소결핍·환기·감시인 절차는 데이터 부족 — 안전관리자/KOSHA P-93 확인".
- 갭 고유 위험(질식·환기 절차)은 hazards 에서 제거, 추락 등 일반 위험은 검색 근거 있으면 유지.

**(참고) full refuse — 석면**:
```bash
SID=$(new_session "외벽 석면 함유 마감재 해체 및 폐기물 처리 작업")
curl -s -X POST http://localhost:8000/v1/jha/sessions/$SID/assess -d '{}' | python -m json.tool
```
- `result_type="refused_full"`, `hazards=[]`(대책 생성 금지·환각 방지 R3), `model_used="-(gap_refuse)"`(LLM 미호출).
- `legal_refs`: 석면안전관리법·산안법 §123. `gap_areas=["asbestos"]`.

> 데모 메시지: "데이터 갭 영역(밀폐공간 절차·석면)은 **근거 없는 추천을 하지 않는다**. 결정적 키워드 가드레일이 LLM 의존 없이 차단·조문 표시한다."

---

## frontend mock 모드 데모 (백엔드 없이 UI 전체 흐름)

상세는 `_workspace/04_build/frontend/README.md` 참조.

```bash
cd _workspace/04_build/frontend
npm install                                   # 최초 1회
NEXT_PUBLIC_USE_MOCK=true npm run dev          # http://localhost:3000
```
PowerShell: `$env:NEXT_PUBLIC_USE_MOCK="true"; npm run dev`

UI 시연 포인트:
- 자연어 입력 → AI 추천 카드(대/중/세부 분류 + 대안 2~3건).
- KRAS 5×5 매트릭스 시각화 + **경계셀 "안전관리자 확인 필요" 배지**(시나리오 ①).
- 인용 사이드 패널(`/citations/{source_row}` 원문) — 시나리오 ③.
- refuse 응답 분리 표시(갭 영역 경고 + 조문, 대책 영역 차단) — 시나리오 ⑤.

**실 백엔드 연동 데모**: frontend `NEXT_PUBLIC_USE_MOCK` 미설정 + 백엔드 `:8000` 기동 시 §0 curl 흐름과 동일 응답을 UI로 시연.

---

## 데모 후 검증(회귀)

```bash
cd _workspace/04_build/backend && python -m pytest -q
# 기대: 55 passed (기존 35 + G3 refuse 가드레일 20). refuse 2건 발동·정상 false-refuse 0 포함.
```

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | 데모 스크립트 작성(5 시나리오 + frontend mock + 경계셀 확정 흐름 + G3 refuse 검증) | Phase 6 Integration / Phase 5 refuse 버그 수정 시연 |
