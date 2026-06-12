"use client";

import { ReactNode } from "react";
import { HobanSymbol } from "../HobanLogo";

/**
 * 챗 기본 요소 — 메시지 버블, 타이핑 인디케이터, 퀵리플라이.
 * jha-chat-ux 스킬: 어시스턴트=좌측(호반 심볼 아바타), 사용자=우측.
 * 색상만 의존 금지·44px 터치·role/aria 준수.
 */

export type ChatRole = "assistant" | "user" | "system";

interface MessageProps {
  role: ChatRole;
  children: ReactNode;
  /** 리치 카드는 버블 패딩을 줄이고 폭을 넓게 */
  card?: boolean;
}

export function ChatMessage({ role, children, card = false }: MessageProps) {
  if (role === "system") {
    return (
      <div className="animate-msg-in my-2 text-center" role="article">
        <span className="sr-only">시스템 메시지: </span>
        <span className="inline-block rounded-full bg-black/5 px-3 py-1 text-xs text-muted">{children}</span>
      </div>
    );
  }

  const isAssistant = role === "assistant";
  return (
    <div
      role="article"
      className={`animate-msg-in flex w-full gap-2 ${isAssistant ? "justify-start" : "justify-end"}`}
    >
      {isAssistant && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-line">
          <HobanSymbol size={18} />
        </div>
      )}
      <div
        className={`${
          isAssistant ? "bubble-assistant" : "bubble-user"
        } rounded-2xl ${card ? "w-full max-w-[88%] p-3" : "max-w-[82%] px-4 py-2.5"} ${
          isAssistant ? "rounded-tl-sm" : "rounded-tr-sm"
        } text-[15px] leading-relaxed shadow-sm`}
      >
        <span className="sr-only">{isAssistant ? "호반 안전 도우미: " : "나: "}</span>
        {children}
      </div>
    </div>
  );
}

export function TypingIndicator({ label = "분석하고 있습니다" }: { label?: string }) {
  return (
    <div className="animate-msg-in flex items-start gap-2" aria-label="호반 안전 도우미가 입력 중입니다">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-line">
        <HobanSymbol size={18} />
      </div>
      <div className="bubble-assistant flex items-center gap-2 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <span className="flex gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-steel-500 animate-typing-bounce"
              style={{ animationDelay: `${i * 0.16}s` }}
            />
          ))}
        </span>
        <span className="text-sm text-muted">{label}…</span>
      </div>
    </div>
  );
}

export interface QuickReply {
  label: string;
  value: string;
  icon?: string;
}

export function QuickReplies({
  replies,
  onPick,
  ariaLabel = "빠른 응답",
}: {
  replies: QuickReply[];
  onPick: (r: QuickReply) => void;
  ariaLabel?: string;
}) {
  if (replies.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 pl-10" role="group" aria-label={ariaLabel}>
      {replies.map((r) => (
        <button
          key={r.value}
          type="button"
          onClick={() => onPick(r)}
          className="min-h-touch rounded-full border border-brand-500 bg-white px-3 py-1.5 text-sm font-medium text-brand-600 transition hover:bg-surface-tint"
          data-testid="quick-reply"
        >
          {r.icon && <span aria-hidden className="mr-1">{r.icon}</span>}
          {r.label}
        </button>
      ))}
    </div>
  );
}
