"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 챗 입력 독(Composer) — 하단 sticky. 멀티라인 자동확장, Enter 전송(Shift+Enter 줄바꿈),
 * 음성 입력(Web Speech), placeholder 로테이션.
 *
 * 카드 액션 대기 단계(`disabled` + `stepName`)에선 입력창을 흐리게 남기지 않고
 * 고정 액션 바로 교체한다: "현재 단계: 위 카드에서 {단계명} 확인 필요" + 카드로
 * 스크롤하는 버튼. 입력 가능 상태에서는 기존 컴포저 그대로. 전환은 fade.
 */

const PLACEHOLDERS = [
  "예: 5층 옥상에서 타워크레인(T형) 해체 작업",
  "예: 지하 흙막이 굴착·터파기 작업",
  "예: E/V PIT 밀폐공간 내부 점검",
  "예: 외부 비계 해체 작업",
];

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  disabledHint?: string;
  voiceEnabled?: boolean;
  /** 카드 대기 단계명(있으면 입력창 대신 고정 액션 바로 교체) */
  stepName?: string;
  /** 카드로 스크롤(액션 바 버튼). 없으면 버튼 숨김 */
  onScrollToCard?: () => void;
  /**
   * 외부에서 입력값을 덮어쓰기(보조 단서 칩 등). nonce가 바뀔 때마다 text로 설정.
   * 빈 문자열이면 입력창을 비운다. (제어형 진입점 없이 단방향 패치)
   */
  valuePatch?: { text: string; nonce: number };
  /** 입력값이 바뀔 때 외부 통지(보조 칩 동기화용) */
  onValueChange?: (v: string) => void;
  /**
   * P0-①: 카드 대기(액션 바) 상태에서 "질문·정정 입력" 토글.
   * 있으면 액션 바에 자유 입력 버튼을 노출. 없으면 미노출.
   */
  onOpenInput?: () => void;
  /** 자유 입력 모드 여부(켜지면 카드 대기 중에도 입력창 활성) */
  freeInput?: boolean;
  /** 자유 입력 모드 닫기(카드 흐름 복귀) */
  onCloseInput?: () => void;
}

export function ChatComposer({
  onSend,
  disabled = false,
  disabledHint,
  voiceEnabled = true,
  stepName,
  onScrollToCard,
  valuePatch,
  onValueChange,
  onOpenInput,
  freeInput = false,
  onCloseInput,
}: Props) {
  const [value, setValue] = useState("");
  const [phIdx, setPhIdx] = useState(0);
  const [listening, setListening] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<unknown>(null);

  useEffect(() => {
    const t = setInterval(() => setPhIdx((i) => (i + 1) % PLACEHOLDERS.length), 5000);
    return () => clearInterval(t);
  }, []);

  // 외부 패치(보조 단서 칩) — nonce 변경 시 입력값 덮어쓰기.
  const patchNonce = valuePatch?.nonce;
  useEffect(() => {
    if (valuePatch === undefined) return;
    setValue(valuePatch.text);
    onValueChange?.(valuePatch.text);
    // 포커스 유지(칩 토글 후에도 이어서 입력 가능)
    taRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patchNonce]);

  function update(v: string) {
    setValue(v);
    onValueChange?.(v);
  }

  // 자동 높이
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }, [value]);

  function submit() {
    const v = value.trim();
    if (!v || disabled) return;
    onSend(v);
    update("");
  }

  function startVoice() {
    if (typeof window === "undefined") return;
    const SR =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    if (!SR) {
      alert("이 브라우저는 음성 입력을 지원하지 않습니다. 직접 입력해 주세요.");
      return;
    }
    const rec = new (SR as new () => {
      lang: string;
      interimResults: boolean;
      onresult: (e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void;
      onerror: () => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    })();
    rec.lang = "ko-KR";
    rec.interimResults = false;
    rec.onresult = (e) =>
      setValue((prev) => {
        const next = prev ? `${prev} ${e.results[0][0].transcript}` : e.results[0][0].transcript;
        onValueChange?.(next);
        return next;
      });
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }
  function stopVoice() {
    (recRef.current as { stop: () => void } | null)?.stop();
    setListening(false);
  }

  // 카드 대기 단계: 입력창을 흐리게 남기지 않고 고정 액션 바로 교체.
  // (단계명이 주어졌을 때만 — refused/finalized 등 단계명 없는 비활성은 기존 힌트 표시)
  const showActionBar = disabled && !!stepName;

  if (showActionBar) {
    return (
      <div className="shrink-0 z-20 border-t bg-[var(--bg)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div
          role="status"
          data-testid="composer-action-bar"
          className="animate-fade-in mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border-2 border-brand-300 bg-brand-50 p-3"
        >
          <span aria-hidden className="text-xl leading-none">
            👆
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-brand-700">현재 단계</p>
            <p className="truncate text-sm text-ink-800">
              위 카드에서 <strong>{stepName}</strong> 확인이 필요합니다
            </p>
          </div>
          {/* P0-①: 카드 대기 중에도 질문·정정을 위한 자유 입력 토글 */}
          {onOpenInput && (
            <button
              type="button"
              onClick={onOpenInput}
              data-testid="open-free-input"
              aria-label="질문·정정 입력 열기"
              className="surface min-h-touch shrink-0 rounded-full border px-3 text-sm font-semibold text-ink-800 transition hover:bg-black/5"
            >
              💬 질문·정정
            </button>
          )}
          {onScrollToCard && (
            <button
              type="button"
              onClick={onScrollToCard}
              data-testid="scroll-to-card"
              className="min-h-touch shrink-0 rounded-full bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              카드로 이동 ↑
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 z-20 border-t bg-[var(--bg)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
      {disabled && disabledHint && (
        <p className="mb-1 text-center text-xs text-muted" role="status">
          {disabledHint}
        </p>
      )}
      {/* P0-①: 자유 입력 모드 안내 + 카드 흐름 복귀 버튼(액션 바와 공존) */}
      {freeInput && !disabled && (
        <div className="animate-fade-in mx-auto mb-1 flex max-w-3xl items-center justify-between gap-2 px-1">
          <p className="text-xs text-muted" role="status">
            질문·정정 입력 모드 · 예: "재분류", "등급이 이상해"
          </p>
          {onCloseInput && (
            <button
              type="button"
              onClick={onCloseInput}
              data-testid="close-free-input"
              className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-brand-700 underline"
            >
              카드 흐름으로 ↑
            </button>
          )}
        </div>
      )}
      <div
        className={`mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border bg-[var(--card)] p-2 ${
          disabled ? "opacity-60" : ""
        }`}
        style={{ borderColor: "var(--border)" }}
      >
        {voiceEnabled && (
          <button
            type="button"
            onClick={listening ? stopVoice : startVoice}
            disabled={disabled}
            aria-label={listening ? "음성 입력 중지" : "음성으로 입력"}
            aria-pressed={listening}
            className={`flex h-touch w-touch shrink-0 items-center justify-center rounded-full border text-lg ${
              listening ? "animate-pulse bg-risk-high text-white" : "surface"
            }`}
          >
            <span aria-hidden>🎤</span>
          </button>
        )}
        <textarea
          ref={taRef}
          value={value}
          disabled={disabled}
          aria-label="메시지 입력"
          rows={1}
          placeholder={disabled ? "위 카드에서 다음 단계를 진행하세요" : PLACEHOLDERS[phIdx]}
          onChange={(e) => update(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-[140px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] outline-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || value.trim().length === 0}
          aria-label="전송"
          className="flex h-touch min-w-touch shrink-0 items-center justify-center rounded-full bg-brand px-4 text-lg font-bold text-white transition hover:bg-brand-dark disabled:opacity-40"
          data-testid="chat-send"
        >
          <span aria-hidden>↑</span>
        </button>
      </div>
    </div>
  );
}
