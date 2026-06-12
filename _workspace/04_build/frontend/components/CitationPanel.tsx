"use client";

import { useEffect, useState } from "react";
import { Citation, CitationDetail } from "@/lib/types";
import { getCitation, chunkIdToSourceRow } from "@/lib/api";
import { legalRefMeta, LegalRefMeta } from "@/lib/mock";
import { scoreLabel } from "@/lib/tokens";

/**
 * 인용 원문 패널 — 데스크톱 우측 사이드 패널 / 모바일 풀스크린 모달.
 *
 * 우선순위:
 *  1) inline prefetch된 citation_detail이 있으면 즉시 표시 (네트워크 없이)
 *  2) 없으면 getCitation(source_row) 호출
 *  3) 로드 실패 시에도 인용 ID(chunk_id)는 항상 표시 (완전 미표시 금지)
 *
 * 검색 키워드 하이라이트(<mark>) 지원.
 */

interface Props {
  /** 열려있는 인용 chunk_id (예: R00042) — null이면 닫힘 */
  chunkId: string | null;
  /** inline prefetch 상세 (hazard.citation_detail) */
  detail?: CitationDetail;
  /** 강조할 키워드 (작업 설명 등) */
  highlight?: string;
  onClose: () => void;
}

function highlightText(text: string, kw?: string) {
  if (!kw || !kw.trim()) return text;
  const terms = kw
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 8);
  if (terms.length === 0) return text;
  const esc = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${esc.join("|")})`, "gi");
  const parts = text.split(re);
  return parts.map((p, i) =>
    esc.some((e) => new RegExp(`^${e}$`, "i").test(p)) ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>,
  );
}

export function CitationPanel({ chunkId, detail, highlight, onClose }: Props) {
  const [fetched, setFetched] = useState<Citation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => setCopied(false), [chunkId]);

  useEffect(() => {
    setError(false);
    setFetched(null);
    if (!chunkId || detail) return; // inline 있으면 fetch 불필요
    const sourceRow = chunkIdToSourceRow(chunkId);
    setLoading(true);
    let cancelled = false;
    getCitation(sourceRow)
      .then((c) => !cancelled && setFetched(c))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [chunkId, detail]);

  // ESC로 닫기
  useEffect(() => {
    if (!chunkId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chunkId, onClose]);

  if (!chunkId) return null;

  const sourceRow = chunkIdToSourceRow(chunkId);
  const meta = detail?.meta;
  const text = detail?.text ?? fetched?.hazard_text;
  const control = fetched?.control_text;
  const legal = meta?.legal_refs ?? fetched?.legal_refs ?? [];
  const classPath = [
    meta?.major_type ?? fetched?.major_type,
    meta?.sub_type ?? fetched?.sub_type,
    meta?.detail_item ?? fetched?.detail_item,
  ]
    .filter(Boolean)
    .join(" › ");
  const accidentType = meta?.accident_type ?? fetched?.accident_type;
  // 법령 상세(전체명+조항명) 보강 — "§43" 같은 짧은 근거를 검토자가 판단 가능하도록.
  const legalDetails: LegalRefMeta[] = legal
    .map((l) => legalRefMeta(l))
    .filter((x): x is LegalRefMeta => x !== null);
  const score = detail?.score;

  /** 근거 복사 — 법령명+조항+원 데이터 행을 정형 텍스트로 클립보드에 복사. */
  async function copyEvidence() {
    const lines: string[] = [`[근거 인용 ${chunkId} · 데이터 행 ${sourceRow}]`];
    if (legalDetails.length) {
      lines.push("");
      lines.push("■ 법적 근거");
      for (const d of legalDetails) {
        lines.push(`- ${d.lawName} ${d.article}${d.articleTitle ? `(${d.articleTitle})` : ""}`);
      }
    } else if (legal.length) {
      lines.push("", "■ 법적 근거", ...legal.map((l) => `- ${l}`));
    }
    lines.push("", "■ 원 데이터 행");
    if (classPath) lines.push(`- 공종 분류: ${classPath}`);
    if (accidentType) lines.push(`- 재해형태: ${accidentType}`);
    if (text) lines.push(`- 위험요인: ${text}`);
    if (control) lines.push(`- 개선대책: ${control}`);
    if (score !== undefined) lines.push("", `■ 검색 적합도: ${scoreLabel(score)}`);
    lines.push("", `출처: 전사 하위공종 위험요인 데이터 행 ${sourceRow}`);
    const out = lines.join("\n");
    try {
      await navigator.clipboard.writeText(out);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // 클립보드 권한 거부 등 — 폴백: 사용자에게 알림
      alert("복사에 실패했습니다. 텍스트를 직접 선택해 복사하세요.\n\n" + out);
    }
  }

  return (
    <>
      {/* 모바일 dim 오버레이 */}
      <div
        className="fixed inset-0 z-40 bg-black/40 md:hidden"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`인용 원문 ${chunkId}`}
        data-testid="citation-panel"
        className="fixed inset-0 z-50 flex flex-col bg-[var(--card)] md:inset-y-0 md:left-auto md:right-0 md:w-96 md:border-l md:shadow-xl"
        style={{ borderColor: "var(--border)" }}
      >
        <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <div>
            <p className="text-xs text-muted">인용 원문 · 데이터 행</p>
            <h2 className="text-lg font-bold">
              {chunkId} <span className="text-sm font-normal text-muted">(행 {sourceRow})</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="인용 패널 닫기"
            className="surface min-h-touch min-w-touch rounded-md border text-lg"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && <p className="text-sm text-muted">원문을 불러오는 중…</p>}

          {error && !detail && (
            <div role="alert" className="rounded-md border-2 border-[#F97316] bg-[#FFF7ED] p-3 text-sm">
              <p className="font-semibold text-[#9A3412]">원문을 불러오지 못했습니다</p>
              <p className="mt-1 text-ink-800">
                네트워크 문제로 상세 원문을 표시할 수 없습니다. 인용 식별자는 아래와 같습니다.
              </p>
              <p className="mt-2 font-mono text-ink-800">
                {chunkId} · 데이터 행 {sourceRow}
              </p>
            </div>
          )}

          {!loading && (meta || text || fetched) && (
            <div className="space-y-4 text-sm" data-testid="citation-body">
              {/* ① 법령 전체명 + 조항 제목 (감사 친화) */}
              <Section index="①" title="법적 근거">
                {legalDetails.length > 0 ? (
                  <ul className="space-y-2">
                    {legalDetails.map((d) => (
                      <li key={d.ref} className="rounded-md border border-line bg-surface-tint p-2" data-testid="legal-detail">
                        <p className="font-semibold text-ink-900">
                          {d.lawName} {d.article}
                        </p>
                        {d.articleTitle && <p className="mt-0.5 text-ink-800">{d.articleTitle}</p>}
                        <p className="mt-0.5 text-xs text-muted">원 표기: {d.ref}</p>
                      </li>
                    ))}
                  </ul>
                ) : legal.length > 0 ? (
                  <ul className="list-disc pl-4">
                    {legal.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">해당 인용에 직접 연결된 법령 조항이 없습니다(일반 안전수칙 적용).</p>
                )}
              </Section>

              {/* ② 원 데이터 행 (공종 경로 + 위험요인 + 개선대책) */}
              <Section index="②" title="원 데이터 행">
                <dl className="space-y-2">
                  {classPath && <Row label="공종 분류 경로">{classPath}</Row>}
                  {accidentType && <Row label="재해형태">{accidentType}</Row>}
                  {text && (
                    <Row label="위험요인">
                      <span className="leading-relaxed">{highlightText(text, highlight)}</span>
                    </Row>
                  )}
                  {control && <Row label="개선대책">{highlightText(control, highlight)}</Row>}
                  {(fetched?.severity || fetched?.frequency) && (
                    <Row label="강도 × 빈도">
                      {fetched?.severity} × {fetched?.frequency} = {(fetched?.severity ?? 0) * (fetched?.frequency ?? 0)}
                    </Row>
                  )}
                </dl>
              </Section>

              {/* ③ 검색 적합도 */}
              <Section index="③" title="검색 적합도">
                <p className="text-ink-800" data-testid="citation-score">
                  {score !== undefined ? scoreLabel(score) : "— (적합도 정보 없음)"}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  RAG 하이브리드 검색이 이 행을 추천 근거로 선정한 상대적 적합도입니다.
                </p>
              </Section>

              {/* 근거 복사 */}
              <button
                type="button"
                onClick={copyEvidence}
                data-testid="copy-evidence"
                aria-live="polite"
                className={`min-h-touch w-full rounded-lg border-2 px-4 py-2 text-sm font-semibold transition ${
                  copied ? "border-[#16A34A] bg-[#F0FDF4] text-[#15803D]" : "border-brand bg-brand text-white"
                }`}
              >
                {copied ? "✓ 근거를 복사했습니다" : "📋 근거 복사 (법령·원문 행)"}
              </button>
            </div>
          )}

          <p className="mt-6 text-xs text-muted">
            ※ 본 원문은 전사 하위공종 위험요인 데이터의 행 {sourceRow}에서 인용되었습니다. AI 추천의
            근거이며, 법적 판단의 최종 책임은 검토자에게 있습니다.
          </p>
        </div>
      </aside>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-muted">{label}</dt>
      <dd className="mt-0.5 text-[var(--fg)]">{children}</dd>
    </div>
  );
}

function Section({ index, title, children }: { index: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-ink-900">
        <span aria-hidden className="text-brand-700">
          {index}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}
