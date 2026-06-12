"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

/**
 * 챗 셸 — 메시지 로그(role=log, aria-live) + 자동 스크롤 + "새 메시지" 플로팅.
 * 사용자가 위로 스크롤하면 자동스크롤 보류. composer는 children 밖(부모가 sticky 배치).
 */

interface Props {
  /** 메시지 영역 */
  children: ReactNode;
  /** 스크롤 트리거(메시지 개수/타이핑 상태 변화 시 증가) */
  scrollKey: number | string;
  /** 하단 고정 입력 독 */
  composer: ReactNode;
  /** 아티팩트 패널 열림 시 채팅 컬럼을 좁게(중앙정렬 해제) */
  narrow?: boolean;
}

/** 모션 민감 설정 시 즉시 스크롤(애니메이션 없음). 모바일 hit-test 안정화에도 기여. */
function scrollBehavior(): ScrollBehavior {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return "auto";
  }
  return "smooth";
}

export function ChatShell({ children, scrollKey, composer, narrow = false }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  // 새 메시지 시 하단 앵커로(단, 사용자가 위로 올렸으면 보류)
  useEffect(() => {
    if (atBottom) {
      bottomRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "end" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(dist < 80);
  }

  function jumpToBottom() {
    setAtBottom(true);
    bottomRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "end" });
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="chat-scroll flex-1 overflow-y-auto px-3 py-4"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="위험성평가 대화"
      >
        <div className={`flex flex-col gap-3 ${narrow ? "" : "mx-auto max-w-3xl"}`}>
          {children}
          <div ref={bottomRef} />
        </div>
      </div>

      {!atBottom && (
        <button
          type="button"
          onClick={jumpToBottom}
          className="absolute bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-full border bg-[var(--card)] px-4 py-2 text-sm font-medium shadow-md"
          style={{ borderColor: "var(--border)" }}
        >
          ↓ 최신 메시지
        </button>
      )}

      {composer}
    </div>
  );
}
