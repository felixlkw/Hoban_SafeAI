---
name: jha-frontend-ux
description: "JHA Agent의 사용자 인터페이스(Next.js + Tailwind + shadcn/ui) 설계·구현 워크플로우. 자연어 입력 컴포넌트, AI 추천 카드, KRAS 5×5 매트릭스 시각화, 인용 사이드 패널, 검토 워크플로우, 역할 분기, 모바일 반응형, 접근성(WCAG 2.1 AA), 현장 환경(햇빛·장갑·소음) UX 고려, 에러 UX, A/B 테스트 변형 구조까지 정의한다. frontend-engineer가 UI 설계·구현 시 반드시 이 스킬을 사용한다."
---

# JHA Frontend UX — Next.js UI/UX 워크플로우

## 언제 사용하는가

- 새 화면·컴포넌트 설계 시
- AI 추천 결과를 표시하는 UI를 설계할 때
- 위험등급·인용 시각화 패턴이 필요할 때
- 역할(작업자/안전관리자/관리자)별 분기 설계 시
- 에러·로딩·empty state UX 설계 시
- 접근성·반응형·현장 환경 고려가 필요할 때

## 단계 1: 사용자 여정 (Persona별)

### 작업자 (Worker)
1. 모바일 로그인 (SSO) → 2. 자연어 입력 ("타워크레인 해체") → 3. AI 분류 추천 확인 (수정 가능) → 4. AI 위험요인·대책 카드 확인 (체크박스로 적용) → 5. 안전관리자에게 검토 요청

### 안전관리자 (Safety Manager)
1. 검토 대기 목록 → 2. 작업자 제출 JHA 열람 → 3. 인용 원문 확인 → 4. 등급·대책 최종 확정 → 5. ERP 등록

### 관리자 (Admin)
1. 이력·통계 대시보드 → 2. 평가 결과 모니터링 → 3. 사용자 피드백 열람

## 단계 2: 핵심 컴포넌트

### NaturalLanguageInput
- 큰 입력창 (모바일 우선, 최소 높이 80px)
- placeholder 로테이션 (5초마다): "예: 5층 옥상에서 타워크레인 분해 작업", "예: 지하 1층 굴착 후 흙막이 가시설 설치" 등
- 음성 입력 옵션 (Web Speech API, 한국어)
- 자동완성: 공종 사전(`taxonomy_lookup/`) 기반 prefix 매칭
- 최근 입력 5건 표시 (localStorage)
- 글자수 30~150자 권장 표시

### ClassificationCard
- 추천 결과: 대공종 / 중공종 / 세부항목 + confidence 바
- 각 단계 옆 "수정" 버튼 → 인라인 드롭다운 (대안 후보 2~3건)
- 신뢰도 색상: 0.8+ 초록, 0.5~0.8 노랑, < 0.5 빨강
- 신뢰도 < 0.5 시 경고 배너 "AI 신뢰도가 낮습니다. 안전관리자 검토 필수."

### HazardMatrix
- 재해형태별 그룹 (탭 또는 아코디언)
- 각 위험요인 카드:
  - 위험요인 텍스트
  - 강도·빈도 5×5 매트릭스 위치 표시 (시각 마커)
  - 등급 배지 (상=빨강 #DC2626, 중=주황 #F97316, 하=초록 #16A34A) + 텍스트 라벨 (색상만 의존 금지)
  - 개선대책 체크박스 리스트 (체크해야 진행 가능)
  - 인용 [R00042] 클릭 시 사이드 패널

### CitationPanel
- 우측 사이드 패널 (데스크탑) 또는 모달 (모바일)
- 인용된 source_row의 원본 행 표시
- 검색 결과 score 표시 (선택)
- 다중 인용 시 탭 또는 페이지네이션

### RiskMatrixVisualizer
- 5×5 그리드 (강도 x축, 빈도 y축)
- 위험요인 마커를 격자 셀에 배치
- 등급 영역 배경 색상 (옅게)
- 호버 시 위험요인 텍스트 미리보기

### ReviewWorkflow
- 진행 단계 progress bar: 분류 → 평가 → 검토 → 확정 → 등록
- 각 단계 미완료 시 "다음" 버튼 비활성
- 안전관리자 서명/승인 입력 (PIN 또는 SSO 재인증)

### ErpRegistrationStatus
- 등록 중: 스피너 + "ERP 등록 대기 중"
- 성공: 체크마크 + "등록 완료 (ERP ID: ...)"
- 실패: 경고 + "재시도" 버튼 + "관리자 문의" 링크

## 단계 3: 디자인 토큰

```ts
// tokens.ts
export const colors = {
  risk: {high: "#DC2626", medium: "#F97316", low: "#16A34A"},
  brand: {primary: "#0066CC", secondary: "#003366"}, // 호반 가이드 흡수 가능
  semantic: {success: "#16A34A", warning: "#F59E0B", error: "#DC2626", info: "#3B82F6"},
  surface: {base: "#FFFFFF", subtle: "#F9FAFB", muted: "#F3F4F6"}
};

export const typography = {
  body: "16px/1.5", // 현장 가독성
  heading: {h1: "28px/1.2 bold", h2: "22px/1.3 semibold"},
  mono: "ui-monospace"
};

export const spacing = {sm: "8px", md: "16px", lg: "24px", xl: "40px"};

export const touch = {minTarget: "44px"}; // 장갑 착용 고려
```

호반 디자인 시스템이 제공되면 토큰을 흡수, 컴포넌트 코드 변경 없이 적용 가능하도록 추상화.

## 단계 4: 접근성 (WCAG 2.1 AA)

- 색상 대비 ≥ 4.5:1 (텍스트), ≥ 3:1 (UI 요소)
- 키보드 네비: Tab 순서 명시, 포커스 인디케이터 명확
- 색상만으로 정보 전달 금지 → 등급 배지에 "상" 텍스트 + 색상 동시
- ARIA: 카드는 `role="article"`, 추천은 `role="region" aria-label="AI 분류 추천"`
- 스크린 리더: 인용 클릭 시 사이드 패널 포커스 이동 + announce
- 텍스트 200% 확대 시 레이아웃 깨지지 않음

## 단계 5: 모바일/현장 환경

### 모바일 우선
- 핵심 흐름(작업자 입력 → 분류 → 평가) 모바일 단일 컬럼
- 사이드 패널 → 풀스크린 모달
- 터치 타겟 최소 44×44px

### 현장 환경
- 햇빛: 고대비 모드 토글 (배경 #000, 텍스트 #FFF)
- 장갑: 큰 버튼, 스와이프 회피
- 소음: 시각 알림 우선 (소리 알림 옵션)
- 오프라인: PWA 캐시, 입력 임시 저장(localStorage), 온라인 복귀 시 동기화

## 단계 6: 에러·로딩·empty UX

| 상황 | UI |
|------|----|
| 로딩 (AI 분류) | 스켈레톤 + "AI가 작업을 분석하고 있습니다…" |
| RAG no_match | empty state 일러스트 + "관련 표준 데이터를 찾지 못했습니다. 안전관리자에게 문의하세요." + 문의 버튼 |
| LLM 파싱 실패 | 경고 카드 + "AI 응답을 해석할 수 없습니다." + "원본 보기" 토글 + "다시 시도" |
| 네트워크 실패 | 토스트 + 자동 재시도 카운트다운 + 수동 재시도 |
| 세션 만료 | 모달 + "세션이 만료되었습니다. 입력 내용은 임시 저장되었습니다." + 재로그인 |
| ERP 등록 실패 | 인라인 경고 + 큐 상태 + "다시 시도"/"관리자 문의" |

## 단계 7: 역할 기반 권한 게이트

```tsx
<RoleGate allow={["safety_manager", "admin"]}>
  <ApprovalButton ... />
</RoleGate>
```

권한 부족 시 컴포넌트 미렌더. 페이지 레벨은 미들웨어에서 redirect.

### KB(지식베이스) 관리 화면 규칙 (safety_manager·admin 전용)
- `/admin/kb`: 전사 하위공종 위험요인 SSOT를 CRUD → 서버 자동 재인덱싱. 상단바 진입 메뉴는 RoleGate로 worker 미노출.
- **등급·중점등록은 입력이 아니라 실시간 미리보기**(`computeGradePreview` = 서버 임계곱 규칙). 곱16(강도4×빈도4)은 경계셀 → 잠정 상 + 중점등록 O/X 직접 선택. 삭제는 소프트(복구 가능) 안내 필수.
- 재인덱싱 위젯(index_version·doc_count·idle/pending/running 배지+스피너) + 변이 후 stats 2s 폴링 → idle 복귀 시 "지식베이스 갱신됨 (v{n})" 토스트. 다이얼로그는 `fixed inset-0` 컨테이너 + `max-h-full` 패널 + 스크롤 영역 밖 고정 푸터(모바일 vh 과대·hit-test 회피).

## 단계 8: A/B 테스트 변형 구조

eval-engineer 정의 split key 사용. 변형은 컴포넌트 prop으로 주입:
```tsx
<ClassificationCard variant={getVariant("classification_card_v2")} />
```

변형은 별도 디렉토리(`variants/`)로 분리, 기본은 v1. 평가 종료 후 승자 promotion.

## 단계 9: 디렉토리 구조

```
_workspace/04_build/frontend/
├─ app/  (Next.js 14 App Router)
│  ├─ (worker)/...
│  ├─ (manager)/...
│  └─ (admin)/...
├─ components/
│  ├─ NaturalLanguageInput/
│  ├─ ClassificationCard/
│  ├─ HazardMatrix/
│  ├─ CitationPanel/
│  ├─ RiskMatrixVisualizer/
│  ├─ ReviewWorkflow/
│  └─ ErpRegistrationStatus/
├─ lib/
│  ├─ api.ts (backend client)
│  ├─ tokens.ts
│  └─ a11y.ts
├─ tests/
│  ├─ components/  (RTL + Vitest)
│  └─ e2e/  (Playwright)
└─ public/
```

## 적용 우선순위

1. **인지 부하 최소화** (한 화면 한 결정)
2. **AI 추천은 제안일 뿐** (수정/거절 항상 가능)
3. **인용 가시성** (1 클릭 내 출처)
4. **에러는 actionable** (다음 행동 명시)
5. **모바일 우선 + 현장 환경 고려**

## references/

- `references/wireframes_ascii.md` — 화면별 와이어프레임 (Figma 부재 시 ASCII)
- `references/component_props.md` — 컴포넌트 props/state/이벤트 전체 표
- `references/accessibility_checklist.md` — WCAG 항목 체크리스트
