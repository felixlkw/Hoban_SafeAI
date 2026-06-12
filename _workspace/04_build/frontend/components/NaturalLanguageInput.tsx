"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  suggestions?: string[];
  recent?: string[];
  placeholders?: string[];
  minChars?: number;
  maxChars?: number;
  voiceEnabled?: boolean;
  submitting?: boolean;
}

const DEFAULT_PLACEHOLDERS = [
  "예: 5층 옥상에서 타워크레인(T형) 분해 작업",
  "예: 지하 흙막이 굴착·터파기 작업",
  "예: E/V PIT 밀폐공간 내부 점검",
  "예: 외부 비계 해체 작업",
];

const DEFAULT_SUGGESTIONS = [
  "타워크레인(T형) 해체",
  "타워크레인 인상(텔레스코핑)",
  "흙막이 굴착",
  "동바리 설치",
  "밀폐공간 작업",
  "철골 볼팅",
];

export function NaturalLanguageInput({
  value,
  onChange,
  onSubmit,
  suggestions = DEFAULT_SUGGESTIONS,
  recent = [],
  placeholders = DEFAULT_PLACEHOLDERS,
  minChars = 30,
  maxChars = 150,
  voiceEnabled = true,
  submitting = false,
}: Props) {
  const [phIdx, setPhIdx] = useState(0);
  const [listening, setListening] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const recognitionRef = useRef<unknown>(null);

  // placeholder 5초 로테이션
  useEffect(() => {
    const t = setInterval(() => setPhIdx((i) => (i + 1) % placeholders.length), 5000);
    return () => clearInterval(t);
  }, [placeholders.length]);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 5);
  }, [value, suggestions]);

  const len = value.trim().length;
  const tooShort = len > 0 && len < minChars;
  const tooLong = len > maxChars;
  const canSubmit = len >= 2 && !tooLong && !submitting; // 백엔드 최소 2자, 권장 30자

  function startVoice() {
    if (typeof window === "undefined") return;
    const SR =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
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
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      onChange(value ? `${value} ${text}` : text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  function stopVoice() {
    const rec = recognitionRef.current as { stop: () => void } | null;
    rec?.stop();
    setListening(false);
  }

  return (
    <section aria-labelledby="nl-input-title">
      <h2 id="nl-input-title" className="mb-2 text-xl font-semibold">
        어떤 작업을 하시나요?
      </h2>
      <div className="relative">
        <textarea
          aria-label="작업 내용 입력"
          aria-describedby="nl-charcount"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setShowSuggest(true);
          }}
          onFocus={() => setShowSuggest(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) onSubmit(value);
          }}
          placeholder={placeholders[phIdx]}
          rows={3}
          className="surface w-full resize-none rounded-lg border p-3 text-base"
        />
        {voiceEnabled && (
          <button
            type="button"
            aria-label={listening ? "음성 입력 중지" : "음성으로 입력"}
            aria-pressed={listening}
            onClick={listening ? stopVoice : startVoice}
            className={`absolute right-2 top-2 min-h-touch min-w-touch rounded-full border text-lg ${
              listening ? "animate-pulse bg-risk-high text-white" : "surface"
            }`}
          >
            <span aria-hidden>🎤</span>
          </button>
        )}
      </div>

      <div id="nl-charcount" className="mt-1 flex items-center justify-between text-sm">
        <span className={tooLong ? "text-risk-high" : "text-muted"}>
          글자수 {len} / 권장 {minChars}~{maxChars}자
        </span>
        {tooShort && <span className="text-muted">조금 더 자세히 적으면 정확도가 올라갑니다</span>}
        {tooLong && <span className="text-risk-high">권장 길이를 초과했습니다</span>}
      </div>

      {/* 자동완성 */}
      {showSuggest && filtered.length > 0 && (
        <ul role="listbox" aria-label="작업 자동완성" className="surface mt-2 overflow-hidden rounded-lg border">
          {filtered.map((s) => (
            <li key={s} role="option" aria-selected={false}>
              <button
                type="button"
                className="surface min-h-touch w-full px-3 py-2 text-left hover:bg-black/5"
                onClick={() => {
                  onChange(s);
                  setShowSuggest(false);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 최근 입력 */}
      {recent.length > 0 && (
        <div className="mt-3 text-sm">
          <span className="text-muted">최근 입력 ▸ </span>
          {recent.slice(0, 5).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onChange(r)}
              className="surface mr-2 mb-1 inline-block min-h-touch rounded-full border px-3 py-1"
            >
              {r}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => onSubmit(value)}
        className="mt-5 min-h-[56px] w-full rounded-lg bg-brand px-4 text-lg font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "분석 중…" : "분석하기 ▶"}
      </button>
    </section>
  );
}
