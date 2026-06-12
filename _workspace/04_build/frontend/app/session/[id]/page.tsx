"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ClassificationCard } from "@/components/ClassificationCard";
import { HazardMatrix } from "@/components/HazardMatrix";
import { CitationPanel } from "@/components/CitationPanel";
import { RiskMatrixVisualizer } from "@/components/RiskMatrixVisualizer";
import { FinalizeGate } from "@/components/ReviewWorkflow";
import { RefuseNotice } from "@/components/RefuseNotice";
import { BoundaryCellBadge } from "@/components/BoundaryCellBadge";
import { DynamicRiskPanel } from "@/components/DynamicRiskPanel";
import { ChatShell } from "@/components/chat/ChatShell";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatMessage, TypingIndicator, QuickReplies, QuickReply } from "@/components/chat/ChatPrimitives";
import { ChatProgress } from "@/components/chat/ChatProgress";
import { ArtifactOpener } from "@/components/chat/ArtifactPanel";
import { CompanionPanel, PanelView } from "@/components/chat/CompanionPanel";
import { BriefingView, ClassifyTreeView, ReviewSummaryView, RegisteredView } from "@/components/chat/PanelViews";
import { PanelSummaryChip } from "@/components/chat/PanelSummaryChip";
import { RoleGate, useRole } from "@/components/AppProviders";
import { alertToken, stoppageActionCopy } from "@/lib/tokens";
import { classify, assess, finalize } from "@/lib/api";
import { fetchDynamicRisk, WeatherScenario, WEATHER_SCENARIOS, MockDynamicRiskProvider } from "@/lib/dynamicRiskProvider";
import { panelAlertFor, PanelAlert } from "@/lib/panelAlert";
import { tradeFromClassification } from "@/lib/weatherRules";

const weatherLabel = (s: WeatherScenario) => WEATHER_SCENARIOS.find((x) => x.key === s)?.label ?? s;
import {
  AssessmentResult,
  CitationDetail,
  ClassificationResult,
  DynamicRiskResult,
  ErpState,
  FinalizationResult,
  JhaApiError,
  WeatherContext,
} from "@/lib/types";

/**
 * 세션 = 대화형(Chat) 워크플로우 + 상시 컴패니언 패널.
 * 좌: 채팅 메시지 스트림(분류→위험요인→동적→확정→ERP).
 * 우(데스크톱 상시): 컴패니언 패널 — stage(briefing/classify/hazards/dynamic/review/registered)별 콘텐츠 + 상시 경보 띠.
 * 모바일: 패널 미점유, 요약 칩(스티키) + 온디맨드 시트.
 */

type Phase = "loading" | "classify" | "assess" | "dynamic" | "finalizing" | "finalized" | "refused" | "error";

// phase → 패널 자동 stage 매핑 (ux_companion_panel.md §2)
const VIEW_BY_PHASE: Record<Phase, PanelView> = {
  loading: "briefing",
  classify: "classify",
  assess: "hazards",
  dynamic: "dynamic",
  finalizing: "review",
  finalized: "registered",
  refused: "briefing",
  error: "briefing",
};

// 챗 메시지 모델
type MsgKind =
  | { t: "text"; role: "assistant" | "user" | "system"; text: string }
  | { t: "card"; card: CardKind }
  | { t: "opener"; artifact: ArtifactKind };
type CardKind = "classification" | "finalize" | "erp" | "refuse_full" | "refuse_partial";
type ArtifactKind = "hazards" | "dynamic";
interface Msg {
  id: string;
  kind: MsgKind;
}

let _seq = 0;
const nid = () => `m${++_seq}`;

export default function SessionPage() {
  const params = useParams();
  const sessionId = String(params.id);
  const { role } = useRole();
  const canFinalize = role === "safety_manager" || role === "admin";

  const [phase, setPhase] = useState<Phase>("loading");
  // 작업자(worker)는 확정·등록 권한 없음 → "안전관리자 검토 요청" 제출 상태.
  const [submittedForReview, setSubmittedForReview] = useState(false);
  // 되돌리기/거절 경로 상태
  const [rejected, setRejected] = useState(false);
  // P0-①: 카드 대기 중에도 자유 입력 허용 모드(액션 바의 토글로 on/off).
  const [freeInput, setFreeInput] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState<string | null>(null);

  const [cls, setCls] = useState<ClassificationResult | null>(null);
  const [assessment, setAssessment] = useState<AssessmentResult | null>(null);
  const [fin, setFin] = useState<FinalizationResult | null>(null);
  const [erp, setErp] = useState<ErpState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openCitation, setOpenCitation] = useState<{ chunkId: string; detail?: CitationDetail } | null>(null);

  // ── 컴패니언 패널: 상시. stage는 phase 자동 매핑 + 탭/카드 override. ──
  const autoView = VIEW_BY_PHASE[phase];
  const [overrideView, setOverrideView] = useState<PanelView | null>(null);
  // phase가 바뀌면 override 해제(자동 stage로 복귀)
  const lastPhase = useRef<Phase>(phase);
  useEffect(() => {
    if (lastPhase.current !== phase) {
      lastPhase.current = phase;
      setOverrideView(null);
    }
  }, [phase]);
  const panelView: PanelView = overrideView ?? autoView;
  // 모바일 시트(요약 칩 탭으로 제어)
  const [sheetOpen, setSheetOpen] = useState(false);
  const focusPanel = (v: PanelView) => {
    setOverrideView(v);
    setSheetOpen(true); // 모바일에서 카드 탭 시 시트 확장
  };

  // 동적 위험
  const [dynRisk, setDynRisk] = useState<DynamicRiskResult | null>(null);
  const [dynLoading, setDynLoading] = useState(false);
  const [dynError, setDynError] = useState(false); // P1-5: 동적 위험 로드 실패
  const [scenario, setScenario] = useState<WeatherScenario | undefined>(undefined);
  const [confirmedCls, setConfirmedCls] = useState<{ major_type: string; sub_type: string; detail_item: string } | null>(null);
  const [stoppageApproved, setStoppageApproved] = useState(false);
  const [approving, setApproving] = useState(false);

  // 브리핑용 idle 기상(분류 전)
  const [idleWeather, setIdleWeather] = useState<WeatherContext | undefined>(undefined);
  useEffect(() => {
    new MockDynamicRiskProvider("calm", "default").getWeather().then(setIdleWeather);
  }, []);

  const started = useRef(false);

  // ── 메시지 헬퍼 ──
  const pushText = (role: "assistant" | "user" | "system", text: string) =>
    setMessages((m) => [...m, { id: nid(), kind: { t: "text", role, text } }]);
  const pushCard = (card: CardKind) => setMessages((m) => [...m, { id: nid(), kind: { t: "card", card } }]);
  const pushOpener = (kind: ArtifactKind) =>
    setMessages((m) => (m.some((x) => x.kind.t === "opener" && x.kind.artifact === kind) ? m : [...m, { id: nid(), kind: { t: "opener", artifact: kind } }]));

  const think = useCallback(async (label: string, ms = 500) => {
    setTyping(label);
    await new Promise((r) => setTimeout(r, ms));
    setTyping(null);
  }, []);

  // ── 1단계: 분류 ──
  const runClassify = useCallback(async () => {
    setPhase("loading");
    setError(null);
    const desc = typeof window !== "undefined" ? window.sessionStorage.getItem(`mock_desc_${sessionId}`) : null;
    pushText("assistant", "안녕하세요, 호반 안전 도우미입니다. 입력하신 작업의 위험성을 함께 평가하겠습니다.");
    if (desc) pushText("user", desc);
    setTyping("작업을 분류하고 있습니다");
    try {
      const r = await classify(sessionId);
      setTyping(null);
      setCls(r);
      if (r.result_type === "refused_full") {
        pushText("assistant", "이 작업은 표준 데이터 범위를 벗어나 자동 평가를 제공하기 어렵습니다.");
        pushCard("refuse_full");
        setPhase("refused");
        return;
      }
      if (r.warnings?.length) pushText("assistant", `참고: ${r.warnings.join(" ")}`);
      pushText("assistant", "작업을 아래와 같이 분류했습니다. 맞으면 그대로 진행하고, 다르면 카드에서 수정해 주세요. 오른쪽 패널에서 공종 트리 위치를 함께 볼 수 있어요.");
      pushCard("classification");
      setPhase("classify");
    } catch (e) {
      setTyping(null);
      setError(e instanceof JhaApiError ? e.message : "분류 요청에 실패했습니다.");
      setPhase("error");
    }
  }, [sessionId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runClassify();
  }, [runClassify]);

  // ── 2단계: 위험요인 평가 ──
  async function runAssess(confirmed: { major_type: string; sub_type: string; detail_item: string }) {
    setBusy(true);
    setConfirmedCls(confirmed);
    pushText("user", `이 분류로 진행할게요 (${confirmed.sub_type || confirmed.major_type}).`);
    await think("위험요인과 등급을 분석하고 있습니다", 700);
    try {
      const r = await assess(sessionId, confirmed);
      setAssessment(r);
      if (r.result_type === "refused_partial") {
        pushText("assistant", "일부 위험요인만 자동 평가했습니다. 미평가 영역은 직접 작성이 필요합니다.");
        pushCard("refuse_partial");
      }
      pushText(
        "assistant",
        `재해형태별 위험요인 ${r.hazards.length}건을 평가했습니다. 오른쪽 패널에서 강도·빈도·등급과 개선대책을 검토해 주세요.`,
      );
      pushOpener("hazards");
      setPhase("assess");
      loadDynamicRisk(confirmed, undefined);
    } catch (e) {
      pushText("assistant", "위험요인 분석에 실패했습니다. 다시 시도해 주세요.");
      setError(e instanceof JhaApiError ? e.message : "위험요인 분석에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function changeGrade(index: number, grade: "상" | "중" | "하") {
    setAssessment((prev) => {
      if (!prev) return prev;
      const next: AssessmentResult = JSON.parse(JSON.stringify(prev));
      const h = next.hazards[index];
      if (h) {
        h.risk_grade = grade;
        h.boundary_cell = false;
      }
      return next;
    });
  }

  // ── 3단계: 동적 위험 ──
  async function loadDynamicRisk(
    confirmed: { major_type: string; sub_type: string; detail_item: string },
    weatherScenario: WeatherScenario | undefined,
  ) {
    setDynLoading(true);
    setDynError(false);
    setStoppageApproved(false);
    await think("현장 위치·실시간 기상·지형 재해를 결합하고 있습니다", 700);
    try {
      const dr = await fetchDynamicRisk(confirmed, { weatherScenario });
      setDynRisk(dr);
      // idle 시나리오 동기화(경보 띠가 동적위험 시나리오를 따라가도록)
      if (weatherScenario) setScenario(weatherScenario);
      if (!dynamicShown.current) {
        dynamicShown.current = true;
        const lvl = dr.overall_level;
        pushText(
          "assistant",
          lvl === "INFO"
            ? "현재 기상·지형 조건에서 추가 작업중지 사유는 없습니다. 오른쪽 패널에서 상세를 확인할 수 있어요."
            : "현장 기상·지형에서 주의가 필요한 사항이 있습니다. 오른쪽 패널에서 동적 위험을 검토해 주세요.",
        );
        pushOpener("dynamic");
      }
      setPhase("dynamic");
    } catch {
      // P1-5: 기상/지형 provider 실패 → 무한 로딩 방지. 에러 상태 + 재시도.
      setDynError(true);
      pushText(
        "assistant",
        "기상·지형 정보를 불러오지 못했습니다. 동적 위험 없이도 정적 위험요인 평가는 계속 진행할 수 있으며, 패널에서 다시 시도할 수 있습니다.",
      );
      setPhase("dynamic");
    } finally {
      setDynLoading(false);
    }
  }
  // P1-5: 동적 위험 재시도(에러 패널 버튼)
  const retryDynamic = useCallback(() => {
    if (confirmedCls) loadDynamicRisk(confirmedCls, scenario);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedCls, scenario]);
  const dynamicShown = useRef(false);

  function changeScenario(s: WeatherScenario) {
    setScenario(s);
    if (confirmedCls) {
      setDynLoading(true);
      pushText("user", `기상 상황을 '${weatherLabel(s)}'(으)로 바꿔서 다시 평가해줘.`);
      fetchDynamicRisk(confirmedCls, { weatherScenario: s })
        .then((dr) => {
          setDynRisk(dr);
          setStoppageApproved(false);
          pushText(
            "assistant",
            dr.overall_level === "INFO"
              ? `'${weatherLabel(s)}' 기준으로 다시 평가했습니다. 추가 작업중지 사유는 없습니다.`
              : `'${weatherLabel(s)}' 기준 종합 경보는 ${alertToken(dr.overall_level).label}입니다. 오른쪽 패널에서 확인하세요.`,
          );
        })
        .finally(() => setDynLoading(false));
    }
  }

  async function approveStoppage() {
    setApproving(true);
    await new Promise((r) => setTimeout(r, 400));
    setStoppageApproved(true);
    setApproving(false);
    // 경보 수준별 "실제 행위" 문구로 채팅 동기화 (작업중지 기록/대피 지시/휴식 조치).
    // "승인"이 작업 재개 허가로 오독되지 않도록 조치 이행 기록임을 명시.
    const copy = stoppageActionCopy(dynRisk?.overall_level ?? "STOP", {
      heatRest: dynRisk?.heat_rest?.required,
    });
    pushText("user", copy.chatUser);
    pushText("assistant", copy.chatAssistant);
  }

  // 확정 카드를 한 번만 노출 (assess+dynamic 완료 후. 동적 위험 로드 실패 시에도 정적 평가로 진행 가능).
  const finalizeShown = useRef(false);
  useEffect(() => {
    if ((phase === "assess" || phase === "dynamic") && assessment && (dynRisk || dynError) && !finalizeShown.current) {
      finalizeShown.current = true;
      pushText("assistant", "모든 항목을 확인하셨다면 평가를 확정하고 ERP에 등록하세요.");
      pushCard("finalize");
    }
  }, [phase, assessment, dynRisk, dynError]);

  // ── 4단계: 확정·등록 ──
  async function runFinalize() {
    setBusy(true);
    pushText("user", "평가를 확정하고 ERP에 등록합니다.");
    await think("ERP에 등록하고 있습니다", 500);
    try {
      const r = await finalize(sessionId);
      setFin(r);
      setErp(r.erp ?? { status: "pending", erp_id: null });
      setPhase("finalized");
      pushCard("erp");
      simulateErp();
    } catch (e) {
      pushText("assistant", "ERP 등록 요청에 실패했습니다.");
      setError(e instanceof JhaApiError ? e.message : "ERP 등록 요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }
  function simulateErp() {
    setTimeout(() => {
      setErp({ status: "success", erp_id: `JHA-2026-${sessionId.slice(0, 6).toUpperCase()}` });
      pushText("assistant", "ERP 등록이 완료되었습니다. 수고하셨습니다. 새 작업을 평가하려면 아래 버튼을 눌러주세요.");
    }, 2300);
  }
  function retryErp() {
    setErp({ status: "pending", erp_id: null, queue_position: 1 });
    simulateErp();
  }

  // ── 작업자(worker) 권한 경로: 확정·등록 대신 안전관리자 검토 요청 ──
  // 설계 근거: ux_user_journey.md — 작업자는 확정·등록 권한 없음. 검토 대기 상태로 제출
  // → /manager 목록(기존 mock 흐름)과 연결. 실연동 시 review 큐 API로 제출.
  async function requestReview() {
    setBusy(true);
    pushText("user", "안전관리자 검토를 요청합니다.");
    await think("검토 요청을 접수하고 있습니다", 500);
    setSubmittedForReview(true);
    pushText(
      "assistant",
      "안전관리자 검토 대기 목록에 제출했습니다. 확정·ERP 등록은 안전관리자가 진행합니다. 검토 결과는 알림으로 안내됩니다.",
    );
    setBusy(false);
  }

  // ── P0-②: 재분류 — 분류 확정 후에도 classify 단계로 복귀(이후 산출물 무효화) ──
  const reclassify = useCallback(() => {
    pushText("user", "분류를 다시 선택할게요.");
    pushText("assistant", "분류 단계로 돌아갑니다. 이전 위험요인·동적 위험·확정 결과는 무효화되며 다시 분석합니다.");
    // 이후 단계 산출물 무효화
    setAssessment(null);
    setDynRisk(null);
    setFin(null);
    setErp(null);
    setConfirmedCls(null);
    setScenario(undefined);
    setStoppageApproved(false);
    setSubmittedForReview(false);
    setRejected(false);
    dynamicShown.current = false;
    finalizeShown.current = false;
    // classify 카드만 다시 노출(스트림 기록 유지 = 감사 추적)
    pushCard("classification");
    setPhase("classify");
  }, []);

  // ── P0-②: 평가 거절 — 거절 사유(필수) 입력 후 세션 거절 종료 ──
  function rejectAssessment(reason: string) {
    const r = reason.trim();
    if (r.length < 5) return;
    pushText("user", `이 평가를 거절합니다. 사유: ${r}`);
    pushText(
      "assistant",
      "평가를 거절 상태로 종료했습니다. 자동 평가 결과는 등록되지 않습니다. 안전관리자에게 문의해 수동 작성·재평가를 진행하세요. (문의: 본사 안전관리팀 02-1234-5678)",
    );
    setRejected(true);
    setPhase("refused");
  }

  // ── 등록 게이트 차단 사유 ──
  const blockingReasons = useMemo(() => {
    if (!assessment) return [];
    const reasons: string[] = [];
    if (assessment.hazards.some((h) => h.boundary_cell))
      reasons.push("경계셀(잠정 등급) 위험요인은 안전관리자 검토 화면에서 확정해야 합니다.");
    if (assessment.human_review_flags?.human_review_required && assessment.result_type !== "refused_partial")
      reasons.push("안전관리자 검토가 필요한 항목이 있습니다.");
    if (dynRisk?.human_approval_required && !stoppageApproved) {
      const lvl = dynRisk.overall_level;
      reasons.push(
        `현장 ${lvl === "EVAC" ? "대피" : "작업중지"} 사유(기상·지형)가 발생했습니다. 현장소장이 ${
          lvl === "EVAC" ? "대피 지시" : "작업중지 조치"
        }를 시행·확인한 뒤 등록하세요.`,
      );
    }
    return reasons;
  }, [assessment, dynRisk, stoppageApproved]);

  // ── 상시 경보 띠 상태 ──
  const panelAlert: PanelAlert = useMemo(() => {
    // 분류 확정 후엔 동적 위험 결과를 우선(공종+시나리오), 그 전엔 시나리오 기반 일반 평가.
    if (dynRisk) {
      const t = alertToken(dynRisk.overall_level);
      const top = dynRisk.triggered_rules[0];
      return {
        level: dynRisk.overall_level,
        headline:
          dynRisk.overall_level === "INFO"
            ? "작업중지 경보 없음 · 정상 작업 가능"
            : `${top?.trade ?? dynRisk.trade} ${top?.message ?? t.meaning}`,
        ruleCount: dynRisk.triggered_rules.length,
        region: dynRisk.weather.region_name,
      };
    }
    const trade = confirmedCls ? tradeFromClassification(confirmedCls) : "일반";
    return panelAlertFor(scenario, trade);
  }, [dynRisk, scenario, confirmedCls]);

  // 진행 단계
  const progressStep = phase === "finalized" || phase === "finalizing" ? 4 : phase === "dynamic" ? 3 : phase === "assess" ? 2 : 1;

  // 컴포저 비활성 조건(카드 액션 대기 단계). 단, 자유 입력 모드(freeInput)가 켜지면 활성.
  const composerDisabled = phase !== "error" && !freeInput;
  const composerHint =
    phase === "refused"
      ? rejected
        ? "평가가 거절 상태로 종료되었습니다."
        : "이 작업은 자동 평가 대상이 아닙니다."
      : phase === "finalized"
        ? "평가가 완료되었습니다."
        : "위 카드에서 다음 단계를 진행하세요.";

  // 카드 대기 단계명(액션 바). refused/finalized 등 "더 진행할 카드가 없는" 비활성은
  // 단계명 없이 기존 힌트만 표시(=흐린 입력창 대신 안내문).
  const composerStepName = (() => {
    if (typing) return undefined; // 분석 중에는 액션 바 대신 타이핑 인디케이터에 맡김
    switch (phase) {
      case "classify":
        return "공종 분류";
      case "assess":
      case "dynamic":
        return "위험요인·동적 위험 검토 후 확정";
      case "finalizing":
        return "ERP 등록";
      default:
        return undefined;
    }
  })();

  // 액션 바 → 마지막 액션 카드로 스크롤(부드럽게). 카드 메시지에 ref 부착.
  const lastCardRef = useRef<HTMLDivElement>(null);
  const lastCardId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const k = messages[i].kind;
      if (k.t === "card" || k.t === "opener") return messages[i].id;
    }
    return null;
  }, [messages]);
  const scrollToLastCard = useCallback(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    lastCardRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }, []);

  // ── P0-①: 자유 텍스트 입력 처리(질문·정정) ──
  // mock 모드: (a) 정정 명령 패턴 → 단계 복귀/포커스, (b) 일반 질문 → 카드 우선 안내.
  // 입력은 항상 사용자 버블로 채팅 스트림에 기록(감사 추적).
  const handleFreeText = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      pushText("user", text);

      // 실연동 모드 자리: 백엔드 자유 텍스트 API로 전달(현재는 mock 분기).
      // TODO(real): await chatTurn(sessionId, text) → assistant 응답/단계 전환 반영. (api.ts: chatTurn 시그니처)

      const isReclassify = /재분류|분류\s*다시|다시\s*분류|분류\s*바꿔|분류\s*틀/.test(text);
      const isGradeIssue = /등급.*(이상|틀|왜|높|낮|다시)|등급\s*수정/.test(text);
      const isReject = /거절|취소할래|평가\s*거부/.test(text);

      if (isReclassify) {
        if (confirmedCls) reclassify();
        else pushText("assistant", "아직 분류 단계입니다. 위 분류 카드에서 직접 수정해 주세요.");
        return;
      }
      if (isReject) {
        pushText(
          "assistant",
          "평가를 거절하려면 위험요인 카드 아래 '이 평가 거절' 버튼을 눌러 사유를 입력해 주세요. (감사 기록을 위해 사유가 필요합니다)",
        );
        if (assessment) scrollToLastCard();
        return;
      }
      if (isGradeIssue) {
        pushText(
          "assistant",
          canFinalize
            ? "위험등급이 이상하다면 오른쪽 위험요인 패널의 '등급 확정' 버튼에서 직접 상/중/하로 조정할 수 있습니다. 패널에서 해당 위험요인을 확인해 주세요."
            : "위험등급 확정은 안전관리자 권한입니다. 등급이 이상하다고 판단되면 '이 평가 거절' 또는 '안전관리자 검토 요청'으로 의견을 남겨 주세요.",
        );
        focusPanel("hazards");
        return;
      }

      // (b) 일반 질문 → 카드 기반 진행 우선 안내
      const stepLabel =
        composerStepName ??
        (phase === "refused" ? "현재 세션은 종료되었습니다" : phase === "finalized" ? "평가가 완료되었습니다" : "현재");
      pushText(
        "assistant",
        `PoC 데모에서는 카드 기반 진행을 우선합니다. ${stepLabel} 카드에서 진행하거나, 정정이 필요하면 '재분류'라고 입력해 주세요.`,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirmedCls, assessment, canFinalize, phase, composerStepName, reclassify, scrollToLastCard],
  );

  // 채팅 인라인 카드 렌더러
  function renderCard(card: CardKind) {
    switch (card) {
      case "refuse_full":
        return <RefuseNotice mode="full" warnings={cls?.warnings} gapAreas={[]} />;
      case "refuse_partial":
        return (
          <RefuseNotice mode="partial" gapAreas={assessment?.human_review_flags?.gap_areas} warnings={assessment?.warnings} />
        );
      case "classification":
        return cls ? (
          <div className="space-y-2">
            <ClassificationCard classification={cls.classification} onConfirm={runAssess} confirming={busy} />
            {/* 분류 확정(위험요인 산출) 후에는 재분류 경로 제공. confirmedCls가 있을 때만 노출 */}
            {confirmedCls && (
              <button
                type="button"
                onClick={reclassify}
                data-testid="reclassify"
                className="min-h-touch w-full rounded-md border border-steel-300 px-3 py-2 text-sm font-medium text-ink-800 hover:bg-black/5"
              >
                ↺ 분류 다시 선택 (이후 단계 다시 분석)
              </button>
            )}
          </div>
        ) : null;
      case "finalize":
        // 위험요인 카드의 평가 거절 경로(작업자·관리자 공통 — 자동 평가 거절).
        // 확정·ERP 등록은 안전관리자·관리자만(RoleGate). 작업자는 검토 요청으로 대체.
        return (
          <div className="space-y-3">
            <RejectAssessmentAction onReject={rejectAssessment} disabled={busy} />
            <RoleGate
              allow={["safety_manager", "admin"]}
              fallback={
                <WorkerReviewRequestCard
                  blockingReasons={blockingReasons}
                  onRequest={requestReview}
                  submitting={busy}
                  submitted={submittedForReview}
                />
              }
            >
              <FinalizeGate blockingReasons={blockingReasons} onFinalize={runFinalize} finalizing={busy} />
            </RoleGate>
          </div>
        );
      case "erp":
        return erp ? (
          <div className="space-y-3">
            <ArtifactOpener
              icon="📦"
              title="ERP 등록 결과"
              summary={erp.status === "success" ? `등록 완료 · ${erp.erp_id ?? ""}` : "등록 진행 상태를 패널에서 확인하세요"}
              cta="결과 보기"
              onOpen={() => focusPanel("registered")}
              active={panelView === "registered"}
            />
          </div>
        ) : null;
    }
  }

  // 채팅 측 요약 카드 → 패널 stage 포커스
  function renderOpener(kind: ArtifactKind) {
    if (kind === "hazards" && assessment) {
      const counts = assessment.hazards.reduce(
        (a, h) => {
          if (h.boundary_cell) a.boundary++;
          else a[h.risk_grade as "상" | "중" | "하"]++;
          return a;
        },
        { 상: 0, 중: 0, 하: 0, boundary: 0 } as Record<string, number>,
      );
      return (
        <ArtifactOpener
          icon="📋"
          title={`위험요인 평가 (${assessment.hazards.length}건)`}
          summary={`상 ${counts["상"]} · 중 ${counts["중"]} · 하 ${counts["하"]}${counts.boundary ? ` · 경계 ${counts.boundary}` : ""}`}
          cta="검토"
          onOpen={() => focusPanel("hazards")}
          active={panelView === "hazards"}
        />
      );
    }
    if (kind === "dynamic" && dynRisk) {
      const t = alertToken(dynRisk.overall_level);
      return (
        <ArtifactOpener
          icon="🛰"
          title="동적 위험 (현장·기상·지형)"
          summary={`종합 경보 ${t.label} · 작업중지 룰 ${dynRisk.triggered_rules.length} · 지형 재해 ${dynRisk.geo_flags.length}`}
          cta="검토"
          onOpen={() => focusPanel("dynamic")}
          active={panelView === "dynamic"}
        />
      );
    }
    return null;
  }

  // ── 패널 stage 본문 ──
  function renderPanelBody() {
    switch (panelView) {
      case "briefing":
        return (
          <BriefingView weather={idleWeather} alert={panelAlert} />
        );
      case "classify":
        return cls ? <ClassifyTreeView cls={cls.classification} /> : null;
      case "hazards":
        return assessment ? (
          <div className="space-y-4">
            <CriticalRegisterHeader assessment={assessment} />
            {assessment.hazards.length > 0 && (
              <RiskMatrixVisualizer severity={assessment.hazards[0].severity} frequency={assessment.hazards[0].frequency} />
            )}
            {/* 등급 확정은 안전관리자·관리자만(RoleGate). 작업자는 읽기 전용. */}
            <HazardMatrix
              hazards={assessment.hazards}
              editable={canFinalize}
              onGradeChange={changeGrade}
              onCitationClick={(chunkId, detail) => setOpenCitation({ chunkId, detail })}
            />
          </div>
        ) : null;
      case "dynamic":
        if (dynError && !dynRisk) {
          return (
            <div role="alert" className="rounded-lg border-2 border-[#F97316] bg-[#FFF7ED] p-4" data-testid="dynamic-error">
              <p className="text-base font-bold text-[#9A3412]">기상 정보를 불러오지 못했습니다</p>
              <p className="mt-1 text-sm text-ink-800">
                실시간 기상·지형 데이터 연동에 실패했습니다. 네트워크 또는 외부 API 상태를 확인한 뒤 다시 시도해
                주세요. 동적 위험 없이도 정적 위험요인 평가·등록은 진행할 수 있습니다.
              </p>
              <button
                type="button"
                onClick={retryDynamic}
                disabled={dynLoading}
                data-testid="dynamic-retry"
                className="mt-3 min-h-touch rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {dynLoading ? "다시 불러오는 중…" : "다시 시도"}
              </button>
            </div>
          );
        }
        return dynRisk ? (
          <DynamicRiskPanel
            risk={dynRisk}
            loading={dynLoading}
            scenario={scenario}
            onScenarioChange={changeScenario}
            // 현장소장 조치 확인(작업중지·대피)은 안전관리자·관리자만 기록 가능.
            onApprove={canFinalize ? approveStoppage : undefined}
            approved={stoppageApproved}
            approving={approving}
          />
        ) : null;
      case "review":
        return <ReviewSummaryView assessment={assessment} dynRisk={dynRisk} blockingReasons={blockingReasons} />;
      case "registered":
        return <RegisteredView erp={erp} outboxId={fin?.outbox_id} onRetry={retryErp} />;
    }
  }

  // 모바일 요약 칩 요약 문구
  const chipSummary = (() => {
    switch (panelView) {
      case "hazards":
        return assessment ? `위험요인 ${assessment.hazards.length}건 검토` : "위험요인 평가";
      case "dynamic":
        return dynRisk ? `동적 위험 · ${alertToken(dynRisk.overall_level).label}` : "동적 위험";
      case "review":
        return blockingReasons.length ? `검토 요약 · 차단 ${blockingReasons.length}건` : "검토 요약 · 통과";
      case "registered":
        return erp?.status === "success" ? "등록 완료" : "ERP 등록 중";
      case "classify":
        return "작업 분류 도우미";
      default:
        return "오늘의 현장 브리핑";
    }
  })();

  const greetingQuick: QuickReply[] = [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatProgress current={progressStep} />
      {/* 좌: 채팅 / 우: 컴패니언 패널(데스크톱 상시) — TopBar·진행바와 동일한 max-w-screen-2xl 축으로 중앙 정렬.
          높이는 dvh 계산 대신 부모 플렉스를 채워(min-h-0 flex-1) 모바일 vh 과대 문제 회피. */}
      <div className="mx-auto flex w-full min-h-0 flex-1 max-w-screen-2xl lg:px-6">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:w-[440px] lg:flex-none xl:w-[520px]">
          <ChatShell
            narrow
            scrollKey={`${messages.length}-${typing ?? ""}`}
            composer={
              <>
                {/* 모바일 폴백: 상시 요약 칩(경보 포함) → 탭 시 시트 */}
                {phase !== "error" && (
                  <PanelSummaryChip view={panelView} alert={panelAlert} summary={chipSummary} onOpen={() => setSheetOpen(true)} />
                )}
                {error && phase === "error" && (
                  <div className="mx-auto mb-2 max-w-3xl px-3">
                    <div role="alert" className="rounded-lg border-2 border-[#DC2626] bg-[#FEF2F2] p-3 text-sm">
                      <p className="font-semibold text-[#991B1B]">{error}</p>
                      <button
                        type="button"
                        onClick={() => {
                          started.current = false;
                          setMessages([]);
                          runClassify();
                        }}
                        className="mt-2 min-h-touch rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
                      >
                        다시 시도
                      </button>
                    </div>
                  </div>
                )}
                <ChatComposer
                  onSend={(text) => {
                    handleFreeText(text);
                    // 전송 후엔 카드 흐름으로 복귀(자유 입력은 1회성 질문·정정 용도)
                    if (composerStepName) setFreeInput(false);
                  }}
                  disabled={composerDisabled}
                  disabledHint={composerHint}
                  stepName={composerStepName}
                  onScrollToCard={lastCardId ? scrollToLastCard : undefined}
                  // 액션 바에서 자유 입력(질문·정정) 토글. 종료성(refused/finalized)·error엔 미노출.
                  onOpenInput={
                    composerStepName && !freeInput ? () => setFreeInput(true) : undefined
                  }
                  freeInput={freeInput}
                  onCloseInput={freeInput ? () => setFreeInput(false) : undefined}
                />
              </>
            }
          >
            {messages.map((m) => {
              if (m.kind.t === "text") {
                return (
                  <ChatMessage key={m.id} role={m.kind.role}>
                    {m.kind.text}
                  </ChatMessage>
                );
              }
              if (m.kind.t === "opener") {
                const opener = renderOpener(m.kind.artifact);
                if (!opener) return null;
                return m.id === lastCardId ? (
                  <div key={m.id} ref={lastCardRef} data-card-anchor>
                    <ChatMessage role="assistant" card>
                      {opener}
                    </ChatMessage>
                  </div>
                ) : (
                  <ChatMessage key={m.id} role="assistant" card>
                    {opener}
                  </ChatMessage>
                );
              }
              return m.id === lastCardId ? (
                <div key={m.id} ref={lastCardRef} data-card-anchor>
                  <ChatMessage role="assistant" card>
                    {renderCard(m.kind.card)}
                  </ChatMessage>
                </div>
              ) : (
                <ChatMessage key={m.id} role="assistant" card>
                  {renderCard(m.kind.card)}
                </ChatMessage>
              );
            })}
            {greetingQuick.length > 0 && <QuickReplies replies={greetingQuick} onPick={() => {}} />}
            {typing && <TypingIndicator label={typing} />}
          </ChatShell>
        </div>

        <CompanionPanel
          view={panelView}
          autoView={autoView}
          onViewChange={(v) => setOverrideView(v === autoView ? null : v)}
          alert={panelAlert}
          sheetOpen={sheetOpen}
          onSheetClose={() => setSheetOpen(false)}
        >
          {renderPanelBody()}
        </CompanionPanel>
      </div>

      <CitationPanel
        chunkId={openCitation?.chunkId ?? null}
        detail={openCitation?.detail}
        onClose={() => setOpenCitation(null)}
      />
    </div>
  );
}

function CriticalRegisterHeader({ assessment }: { assessment: AssessmentResult }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold">위험요인 평가 결과</h3>
        <CriticalRegisterBadge value={assessment.critical_register} />
      </div>
      {assessment.critical_register_reasons && (
        <ul className="mt-1 text-xs text-muted">
          {assessment.critical_register_reasons.map((r, i) => (
            <li key={i}>· {r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CriticalRegisterBadge({ value }: { value: AssessmentResult["critical_register"] }) {
  if (value === "O (잠정)") return <BoundaryCellBadge mode="register" symbol="O" />;
  const isO = value === "O";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-3 py-1 text-sm font-bold ${
        isO ? "bg-[#DC2626] text-white" : "bg-[#16A34A] text-white"
      }`}
      aria-label={isO ? "중점등록 대상" : "중점등록 비대상"}
    >
      <span aria-hidden>{isO ? "⚠" : "✓"}</span>
      중점등록 {value}
    </span>
  );
}

/**
 * 작업자(worker) 권한 경로 — 확정·ERP 등록 대신 "안전관리자 검토 요청".
 * 검토 대기 상태로 제출(기존 mock 흐름: /manager 목록과 연결).
 */
function WorkerReviewRequestCard({
  blockingReasons,
  onRequest,
  submitting,
  submitted,
}: {
  blockingReasons: string[];
  onRequest: () => void;
  submitting: boolean;
  submitted: boolean;
}) {
  if (submitted) {
    return (
      <div role="status" className="rounded-lg border-2 border-[#16A34A] bg-[#F0FDF4] p-4" data-testid="review-requested">
        <p className="text-base font-bold text-[#15803D]">✓ 안전관리자 검토 요청 완료</p>
        <p className="mt-1 text-sm text-ink-800">
          검토 대기 목록에 제출되었습니다. 위험등급 확정과 ERP 등록은 안전관리자가 진행합니다.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-2" data-testid="worker-review-request">
      <div className="mb-2 rounded-md border border-steel-300 bg-surface-tint p-3 text-sm">
        <p className="font-semibold text-ink-900">작업자 권한 안내</p>
        <p className="mt-1 text-ink-800">
          위험등급 확정·중점등록·ERP 등록은 <strong>안전관리자</strong> 권한입니다. 검토를 요청하면 안전관리자 화면의
          검토 대기 목록에 추가됩니다.
        </p>
      </div>
      {blockingReasons.length > 0 && (
        <ul className="mb-2 list-disc rounded-md border border-[#F97316] bg-[#FFF7ED] py-2 pl-8 pr-3 text-xs text-[#9A3412]">
          {blockingReasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      <button
        type="button"
        disabled={submitting}
        onClick={onRequest}
        className="min-h-[56px] w-full rounded-lg bg-brand px-4 text-lg font-semibold text-white disabled:opacity-50"
        data-testid="request-review"
      >
        {submitting ? "검토 요청 중…" : "안전관리자 검토 요청 ▶"}
      </button>
    </div>
  );
}

/**
 * P0-②: 평가 거절 — 거절 사유(필수 5자 이상) 입력 후 세션 거절 종료.
 * 접힘 상태에서 "이 평가 거절" → 펼치면 사유 입력 + 확정.
 */
function RejectAssessmentAction({ onReject, disabled }: { onReject: (reason: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 5;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="reject-open"
        className="min-h-touch w-full rounded-md border border-[#DC2626] px-3 py-2 text-sm font-medium text-[#991B1B] hover:bg-[#FEF2F2]"
      >
        ✕ 이 평가 거절 (수동 작성 전환)
      </button>
    );
  }
  return (
    <div className="rounded-lg border-2 border-[#DC2626] bg-[#FEF2F2] p-4" data-testid="reject-form">
      <p className="text-sm font-bold text-[#991B1B]">평가 거절 사유 (필수)</p>
      <p className="mt-1 text-xs text-ink-800">
        자동 평가 결과를 등록하지 않고 거절합니다. 거절 시 안전관리자에게 문의해 수동 작성·재평가를 진행하세요.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        aria-label="거절 사유"
        placeholder="예: 추천 위험요인이 실제 작업 범위와 맞지 않아 수동 재작성 필요"
        className="surface mt-2 w-full resize-none rounded-md border p-2 text-sm"
      />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReason("");
          }}
          className="surface min-h-touch flex-1 rounded-md border px-3 py-2 text-sm font-semibold"
        >
          취소
        </button>
        <button
          type="button"
          disabled={!valid || disabled}
          onClick={() => onReject(reason)}
          data-testid="reject-confirm"
          className="min-h-touch flex-[2] rounded-md bg-[#DC2626] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          거절하고 종료
        </button>
      </div>
      {!valid && (
        <p className="mt-2 text-xs text-[#991B1B]" role="status">
          거절 사유를 5자 이상 입력해야 합니다.
        </p>
      )}
    </div>
  );
}
