"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatShell } from "@/components/chat/ChatShell";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatMessage, QuickReplies, QuickReply } from "@/components/chat/ChatPrimitives";
import { createSession } from "@/lib/api";
import { JhaApiError } from "@/lib/types";

/**
 * 진입 = 챗 시작 화면. 호반 안전 도우미 인사 + 예시 칩 + 보조 단서 칩.
 * 작업 입력 → 세션 생성 → 세션 챗으로 이동(첫 입력은 세션 챗에서 사용자 버블로 표시).
 *
 * 보조 단서 칩(장소·작업높이·장비·특이사항): 한 문장 입력에서 누락되기 쉬운 단서를
 * 구조화 텍스트로 입력창에 자동 삽입한다(예: "… (장소: 옥상, 높이: 5m, 장비: 타워크레인)").
 * 자유 입력과 병행 가능하며, mock 분류(detectScenario)는 키워드 substring 매칭이라
 * 추가 단서 텍스트가 붙어도 깨지지 않는다.
 */

const RECENT_KEY = "jha_recent_inputs";

const EXAMPLES: QuickReply[] = [
  { label: "타워크레인 해체", value: "5층 옥상에서 타워크레인(T형) 해체 분해 작업을 진행합니다", icon: "🏗" },
  { label: "흙막이 굴착", value: "지하 흙막이 굴착 및 터파기 토공 작업을 수행합니다", icon: "⛏" },
  { label: "밀폐공간 점검", value: "E/V PIT 밀폐공간 내부 점검 및 청소 작업입니다", icon: "🕳" },
  { label: "철골 볼팅", value: "철골 보 단부 볼팅 및 데크 설치 작업입니다", icon: "🔩" },
];

/** 보조 단서 칩 — 카테고리별 키와 라벨(구조화 텍스트에 들어갈 라벨) */
interface ClueCategory {
  key: string; // 구조화 텍스트 라벨(예: "장소")
  title: string; // 칩 그룹 제목
  icon: string;
  options: string[];
}
const CLUE_CATEGORIES: ClueCategory[] = [
  { key: "장소", title: "장소", icon: "📍", options: ["지하", "옥상", "외벽", "고층", "실내"] },
  { key: "높이", title: "작업높이", icon: "📏", options: ["2m 이상", "고소", "5m", "10m 이상"] },
  { key: "장비", title: "장비", icon: "🏗", options: ["타워크레인", "지게차", "고소작업대", "리프트", "곤돌라"] },
  { key: "특이사항", title: "특이사항", icon: "⚠", options: ["동시작업", "야간", "우천", "강풍", "밀폐"] },
];

/** 선택된 단서 → 구조화 접미 텍스트. 비었으면 빈 문자열. */
function buildClueSuffix(clues: Record<string, string>): string {
  const parts = CLUE_CATEGORIES.map((c) => (clues[c.key] ? `${c.key}: ${clues[c.key]}` : null)).filter(
    Boolean,
  ) as string[];
  return parts.length ? ` (${parts.join(", ")})` : "";
}

export default function HomePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  // 보조 단서 상태 + 자유 입력 베이스(구조화 접미 제외) + 컴포저 패치
  const [clues, setClues] = useState<Record<string, string>>({});
  const baseTextRef = useRef("");
  const [patch, setPatch] = useState<{ text: string; nonce: number }>({ text: "", nonce: 0 });
  const nonceRef = useRef(0);

  useEffect(() => {
    try {
      const r = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]");
      if (Array.isArray(r)) setRecent(r);
    } catch {
      /* noop */
    }
  }, []);

  const clueSuffix = useMemo(() => buildClueSuffix(clues), [clues]);

  // 칩 토글 → 같은 값 재선택 시 해제, 아니면 교체. 입력창에 즉시 반영.
  function toggleClue(catKey: string, value: string) {
    setClues((prev) => {
      const next = { ...prev };
      if (next[catKey] === value) delete next[catKey];
      else next[catKey] = value;
      const text = (baseTextRef.current + buildClueSuffix(next)).trimStart();
      nonceRef.current += 1;
      setPatch({ text, nonce: nonceRef.current });
      return next;
    });
  }

  // 사용자가 직접 입력하면 구조화 접미를 떼어내 베이스로 저장(병행 입력 지원).
  function handleValueChange(v: string) {
    const suffix = clueSuffix;
    baseTextRef.current = suffix && v.endsWith(suffix) ? v.slice(0, v.length - suffix.length) : v;
  }

  async function handleSubmit(text: string) {
    const desc = text.trim();
    if (desc.length < 2 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { session_id } = await createSession({ work_description: desc });
      const next = [desc, ...recent.filter((r) => r !== desc)].slice(0, 5);
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      router.push(`/session/${session_id}`);
    } catch (e) {
      setError(e instanceof JhaApiError ? e.message : "작업을 시작할 수 없습니다. 잠시 후 다시 시도하세요.");
      setSubmitting(false);
    }
  }

  const recentReplies: QuickReply[] = recent
    .slice(0, 4)
    .map((r) => ({ label: r.length > 18 ? r.slice(0, 18) + "…" : r, value: r }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatShell
        scrollKey="home"
        composer={
          <>
            {error && (
              <div className="mx-auto mb-2 max-w-3xl px-3">
                <div role="alert" className="rounded-lg border-2 border-[#DC2626] bg-[#FEF2F2] p-3 text-sm">
                  <p className="font-semibold text-[#991B1B]">{error}</p>
                </div>
              </div>
            )}

            <ChatComposer
              onSend={handleSubmit}
              disabled={submitting}
              disabledHint={submitting ? "세션을 시작하고 있습니다…" : undefined}
              valuePatch={patch}
              onValueChange={handleValueChange}
            />
          </>
        }
      >
        <ChatMessage role="assistant">
          <p className="font-semibold">안녕하세요, 호반 안전 도우미입니다.</p>
          <p className="mt-1">
            오늘 어떤 작업을 하시나요? 작업 내용을 한 문장으로 알려주시면, 공종 분류부터 위험요인·등급·개선대책,
            그리고 현장 기상·지형까지 함께 평가해 드리겠습니다.
          </p>
        </ChatMessage>

        <ChatMessage role="assistant">
          <p className="mb-2 text-sm text-muted">아래 예시를 눌러 바로 시작할 수 있어요.</p>
          <QuickReplies replies={EXAMPLES} onPick={(r) => handleSubmit(r.value)} ariaLabel="예시 작업" />
        </ChatMessage>

        {/* 보조 단서 칩 — 누락되기 쉬운 단서(장소·높이·장비·특이사항)를 구조화 텍스트로 입력창에 삽입 */}
        <ChatMessage role="assistant">
          <div data-testid="clue-chips">
            <p className="mb-2 text-sm text-muted">
              단서를 더하면 평가가 더 정확해져요 (선택). 칩을 누르면 아래 입력창에 자동으로 들어갑니다.
            </p>
            <div className="flex flex-col gap-1.5">
              {CLUE_CATEGORIES.map((cat) => (
                <div key={cat.key} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-[11px] font-semibold text-steel-700">
                    <span aria-hidden>{cat.icon}</span> {cat.title}
                  </span>
                  <div
                    className="-mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 pb-1"
                    role="group"
                    aria-label={`${cat.title} 단서`}
                  >
                    {cat.options.map((opt) => {
                      const active = clues[cat.key] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleClue(cat.key, opt)}
                          data-testid={`clue-${cat.key}-${opt}`}
                          className={`min-h-touch shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-sm transition ${
                            active ? "border-brand bg-brand text-white" : "surface text-ink-800"
                          }`}
                        >
                          {active && <span aria-hidden>✓ </span>}
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ChatMessage>

        {recentReplies.length > 0 && (
          <ChatMessage role="assistant">
            <p className="mb-2 text-sm text-muted">최근 입력</p>
            <QuickReplies replies={recentReplies} onPick={(r) => handleSubmit(r.value)} ariaLabel="최근 입력" />
          </ChatMessage>
        )}

        <ChatMessage role="system">
          AI 추천은 참고용 제안입니다. 최종 위험성 평가는 작업자·안전관리자의 검토와 확정을 거칩니다.
        </ChatMessage>
      </ChatShell>
    </div>
  );
}
