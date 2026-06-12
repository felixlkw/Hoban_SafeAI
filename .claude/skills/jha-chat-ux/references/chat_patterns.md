# 챗 워크플로우 패턴 상세

## 1. 메시지 타입

```ts
type ChatRole = "assistant" | "user" | "system";
interface ChatMessage {
  id: string;
  role: ChatRole;
  kind: "text" | "card";       // 일반 텍스트 vs 리치 카드
  text?: string;               // text 메시지
  card?: ChatCardType;         // 카드 종류 (분류/위험/동적/ERP 등)
  data?: unknown;              // 카드 렌더용 데이터
  ts: number;
}
type ChatCardType =
  | "classification" | "hazards" | "dynamic_risk"
  | "finalize" | "erp" | "refuse";
```

## 2. 상태 머신 (메시지 누적)

```
phase: greeting → classifying → assess → dynamic → finalize → done
```
- 각 phase 진입 시 어시스턴트 메시지(들) push.
- 사용자 액션(분류 확정, 시나리오 토글, 승인, 등록)은:
  1) 사용자 의도를 user 버블로 echo("이 분류로 진행할게요"),
  2) 어시스턴트 타이핑 → 다음 카드 push.
- 카드 내부 인터랙션(드롭다운·등급수정)은 카드 자체에서 처리, 결과만 다음 메시지로.

## 3. 타이핑 인디케이터

- 비동기 호출(classify/assess/dynamic/finalize) 동안 표시.
- 점 3개 bounce 애니메이션 + 텍스트("작업을 분석하고 있습니다…").
- aria-label로 스크린리더 안내. 완료 시 제거 후 결과 메시지.

## 4. 자동 스크롤

- 새 메시지 추가 시 리스트 하단으로 smooth scroll.
- 사용자가 스크롤을 위로 올린 상태면 자동 스크롤 보류 + "↓ 최신 메시지" 플로팅 버튼.
- 스크롤은 컨테이너만, 페이지 포커스 이동 금지(a11y).

## 5. 퀵 리플라이 / 액션칩

- greeting: 예시 작업 칩("타워크레인 해체", "흙막이 굴착", "밀폐공간 점검").
- 카드 하단/뒤: "이대로 진행", "수정할게요", "다른 시나리오" 등.
- 칩 클릭 = composer에 채우거나 즉시 액션. 44px 터치, 키보드 포커스.

## 6. Composer (입력 독)

- 하단 sticky. 멀티라인 자동확장. Enter 전송(Shift+Enter 줄바꿈) 또는 전송 버튼.
- 음성 입력 버튼 유지(Web Speech). placeholder 로테이션.
- phase가 입력을 받지 않는 단계(카드 액션 대기)면 비활성 + 안내.

## 7. 접근성

- 리스트 `role="log" aria-live="polite" aria-relevant="additions"`.
- 메시지 `role="article"`, 발신자 sr-only 라벨("호반 안전 도우미", "나").
- 카드는 기존 컴포넌트의 a11y 유지.

## 8. 재사용 원칙

- 카드 본문은 기존 컴포넌트 그대로(ClassificationCard, HazardMatrix, DynamicRiskPanel,
  ErpRegistrationStatus, RefuseNotice). 챗은 "껍데기(셸)"만 추가.
- 로직(api, 룰엔진, provider)은 전부 재사용. 페이지는 챗 셸로 재구성.
