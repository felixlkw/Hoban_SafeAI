"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RoleGate, useRole } from "@/components/AppProviders";
import { BoundaryCellBadge } from "@/components/BoundaryCellBadge";
import {
  listKbRows,
  getKbRow,
  createKbRow,
  updateKbRow,
  deleteKbRow,
  kbStats,
  kbReindex,
} from "@/lib/api";
import {
  KbRow,
  KbRowWrite,
  KbStats,
  RiskGrade,
  CriticalRegister,
  JhaApiError,
  computeGradePreview,
} from "@/lib/types";
import { ACCIDENT_TYPES, MAJOR_TYPES, SUBS_BY_MAJOR, isKnownSub } from "@/lib/kbTaxonomy";

/**
 * 안전관리자·관리자 전용 KB(지식베이스) 운영 화면.
 * 전사 하위공종 위험요인 SSOT를 CRUD → 서버 자동 재인덱싱 → AI 답변 갱신.
 *
 * 핵심 UX 약속:
 *  - 등급·중점등록은 입력이 아니라 "실시간 미리보기"(서버 재계산 규칙과 동일).
 *  - 소프트 삭제(검색 제외·복구 가능) 명시.
 *  - 재인덱싱 상태 위젯 + 변이 후 폴링 → idle 복귀 시 "지식베이스 갱신됨" 토스트.
 */

const PAGE_SIZE = 50;
const GRADES: RiskGrade[] = ["상", "중", "하"];

function GradeBadge({ grade }: { grade: RiskGrade }) {
  const map: Record<RiskGrade, { bg: string; glyph: string }> = {
    상: { bg: "bg-[#DC2626]", glyph: "▲" },
    중: { bg: "bg-[#F97316]", glyph: "■" },
    하: { bg: "bg-[#16A34A]", glyph: "●" },
  };
  const { bg, glyph } = map[grade];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md ${bg} px-2 py-0.5 text-xs font-bold text-white`}>
      <span aria-hidden>{glyph}</span>
      {grade}
    </span>
  );
}

function fmtTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function KbAdminPage() {
  const { role } = useRole();
  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6">
      <RoleGate
        allow={["safety_manager", "admin"]}
        fallback={
          <div
            role="alert"
            className="mx-auto max-w-3xl rounded-lg border-2 border-[#F97316] bg-[#FFF7ED] p-4"
            data-testid="kb-forbidden"
          >
            <h2 className="text-base font-bold text-[#9A3412]">접근 권한이 없습니다</h2>
            <p className="mt-1 text-sm text-ink-800">
              지식베이스 관리 화면은 안전관리자·관리자만 사용할 수 있습니다. 현재 역할: {role}. 우측 상단에서
              역할을 전환하거나 담당자에게 문의하세요.
            </p>
          </div>
        }
      >
        <KbConsole />
      </RoleGate>
    </div>
  );
}

interface Toast {
  id: number;
  text: string;
}

function KbConsole() {
  const [rows, setRows] = useState<KbRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 필터
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [fMajor, setFMajor] = useState("");
  const [fAccident, setFAccident] = useState("");
  const [fGrade, setFGrade] = useState<"" | RiskGrade>("");
  const [fRegister, setFRegister] = useState<"" | CriticalRegister>("");

  // 다이얼로그
  const [editing, setEditing] = useState<KbRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<KbRow | null>(null);

  // 재인덱싱 상태
  const [stats, setStats] = useState<KbStats | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastVersionRef = useRef<number | null>(null);

  // 토스트
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);
  const pushToast = useCallback((text: string) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listKbRows({
        q: q || undefined,
        major_type: fMajor || undefined,
        accident_type: fAccident || undefined,
        risk_grade: fGrade || undefined,
        critical_register: fRegister || undefined,
        offset,
        limit: PAGE_SIZE,
      });
      setRows(res.rows);
      setTotal(res.total);
    } catch (e) {
      setLoadError(e instanceof JhaApiError ? e.message : "목록을 불러오지 못했습니다. 다시 시도하세요.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, fMajor, fAccident, fGrade, fRegister, offset]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const loadStats = useCallback(async () => {
    try {
      const s = await kbStats();
      setStats(s);
      // idle 복귀 + 버전 증가 감지 → 토스트
      if (
        lastVersionRef.current != null &&
        s.reindex_status === "idle" &&
        s.index_version > lastVersionRef.current
      ) {
        pushToast(`AI 지식베이스 갱신됨 (v${s.index_version})`);
      }
      lastVersionRef.current = s.index_version;
      return s;
    } catch {
      return null;
    }
  }, [pushToast]);

  useEffect(() => {
    loadStats();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 변이 후: 목록 갱신 + 재인덱싱 폴링 시작(idle 복귀 시 중단). */
  const startReindexPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const s = await loadStats();
      if (s && s.reindex_status === "idle") {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 2000);
  }, [loadStats]);

  async function onSaved(savedFromNew: boolean) {
    setEditing(null);
    await loadRows();
    await loadStats();
    startReindexPolling();
    pushToast(savedFromNew ? "행이 생성되었습니다. 재인덱싱을 시작합니다." : "행이 수정되었습니다. 재인덱싱을 시작합니다.");
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteKbRow(deleting.chunk_id);
      setDeleting(null);
      await loadRows();
      await loadStats();
      startReindexPolling();
      pushToast("행을 소프트 삭제했습니다(복구 가능). 재인덱싱을 시작합니다.");
    } catch (e) {
      pushToast(e instanceof JhaApiError ? e.message : "삭제에 실패했습니다. 다시 시도하세요.");
    }
  }

  async function manualReindex() {
    pushToast("전체 재인덱싱을 시작합니다…");
    try {
      const ack = await kbReindex();
      await loadStats();
      lastVersionRef.current = ack.index_version;
      pushToast(`전체 재인덱싱 완료 (v${ack.index_version}, 문서 ${ack.doc_count}건)`);
    } catch (e) {
      pushToast(e instanceof JhaApiError ? e.message : "재인덱싱에 실패했습니다. 다시 시도하세요.");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const curPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <>
      <header className="mb-4">
        <h1 className="text-xl font-bold text-ink-900">지식베이스(KB) 관리</h1>
        <p className="mt-1 text-sm text-muted">
          전사 하위공종 위험요인 데이터를 편집하면 자동으로 재인덱싱되어 AI 답변이 갱신됩니다. 등급·중점등록은
          서버가 강도×빈도로 자동 산정합니다.
        </p>
      </header>

      <ReindexWidget stats={stats} onReindex={manualReindex} />

      {/* 필터 바 */}
      <section className="surface mt-4 rounded-lg border p-3" aria-label="검색 및 필터">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setOffset(0);
            setQ(qInput.trim());
          }}
        >
          <div className="min-w-[200px] flex-1">
            <label htmlFor="kb-q" className="mb-1 block text-xs font-semibold text-steel-700">
              텍스트 검색 (위험요인·대책·세부항목)
            </label>
            <input
              id="kb-q"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="예: 와이어로프, 추락, 타워크레인"
              className="surface min-h-touch w-full rounded-md border px-3 py-2 text-sm"
              data-testid="kb-search"
            />
          </div>
          <FilterSelect
            id="f-major"
            label="대공종"
            value={fMajor}
            onChange={(v) => {
              setOffset(0);
              setFMajor(v);
            }}
            options={MAJOR_TYPES}
          />
          <FilterSelect
            id="f-accident"
            label="재해형태"
            value={fAccident}
            onChange={(v) => {
              setOffset(0);
              setFAccident(v);
            }}
            options={[...ACCIDENT_TYPES]}
          />
          <FilterSelect
            id="f-grade"
            label="등급"
            value={fGrade}
            onChange={(v) => {
              setOffset(0);
              setFGrade(v as "" | RiskGrade);
            }}
            options={GRADES}
          />
          <FilterSelect
            id="f-register"
            label="중점등록"
            value={fRegister}
            onChange={(v) => {
              setOffset(0);
              setFRegister(v as "" | CriticalRegister);
            }}
            options={["O", "X"]}
          />
          <button
            type="submit"
            className="min-h-touch rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
            data-testid="kb-search-submit"
          >
            검색
          </button>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="surface min-h-touch rounded-md border-2 border-brand px-4 py-2 text-sm font-semibold text-brand-700"
            data-testid="kb-new"
          >
            + 신규 행
          </button>
        </form>
      </section>

      {/* 데이터 테이블 */}
      <section className="surface mt-4 overflow-hidden rounded-lg border" aria-label="KB 행 목록">
        <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted">
          <span data-testid="kb-total">총 {total.toLocaleString("ko-KR")}건</span>
          <span>
            {curPage} / {totalPages} 페이지
          </span>
        </div>

        {loadError ? (
          <div role="alert" className="m-3 rounded-md border-2 border-[#DC2626] bg-[#FEF2F2] p-3 text-sm">
            <p className="font-semibold text-[#991B1B]">{loadError}</p>
            <button
              type="button"
              onClick={loadRows}
              className="mt-2 min-h-touch rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white"
            >
              다시 시도
            </button>
          </div>
        ) : loading ? (
          <div className="p-6 text-center text-sm text-muted" data-testid="kb-loading">
            목록을 불러오는 중입니다…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted" data-testid="kb-empty">
            조건에 맞는 행이 없습니다. 검색어·필터를 바꾸거나 신규 행을 추가하세요.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-surface-sunken text-left text-xs text-steel-700">
                  <th scope="col" className="px-3 py-2 font-semibold">ID</th>
                  <th scope="col" className="px-3 py-2 font-semibold">대공종</th>
                  <th scope="col" className="px-3 py-2 font-semibold">중공종</th>
                  <th scope="col" className="px-3 py-2 font-semibold">세부항목</th>
                  <th scope="col" className="px-3 py-2 font-semibold">위험요인</th>
                  <th scope="col" className="px-3 py-2 font-semibold">재해형태</th>
                  <th scope="col" className="px-3 py-2 text-center font-semibold">강도×빈도</th>
                  <th scope="col" className="px-3 py-2 text-center font-semibold">등급</th>
                  <th scope="col" className="px-3 py-2 text-center font-semibold">중점등록</th>
                  <th scope="col" className="px-3 py-2 font-semibold">수정일</th>
                  <th scope="col" className="px-3 py-2 text-center font-semibold">작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.chunk_id} className="border-b align-top hover:bg-surface-sunken" data-testid="kb-row">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-steel-700">
                      {r.chunk_id}
                      {r.chunk_id.startsWith("N") && (
                        <span className="ml-1 rounded bg-brand-100 px-1 text-[10px] font-bold text-brand-800">신규</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.major_type}</td>
                    <td className="px-3 py-2">{r.sub_type}</td>
                    <td className="px-3 py-2">
                      {r.detail_item}
                      {r.is_new_detail && (
                        <span className="ml-1 rounded bg-brand-100 px-1 text-[10px] font-bold text-brand-800">신규</span>
                      )}
                    </td>
                    <td className="max-w-[260px] px-3 py-2 text-ink-800">
                      <span className="line-clamp-2">{r.hazard_text}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{r.accident_type}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-center tabular-nums">
                      {r.severity} × {r.frequency} = {r.severity * r.frequency}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.boundary_cell ? <BoundaryCellBadge mode="grade" grade="상" /> : <GradeBadge grade={r.risk_grade} />}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold">
                      {r.boundary_cell ? (
                        <span className="text-[#854D0E]" title="경계셀 — 안전관리자 확정 필요">{r.critical_register}(잠정)</span>
                      ) : (
                        r.critical_register
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{fmtTime(r.updated_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const full = await getKbRow(r.chunk_id);
                            setEditing(full);
                          } catch {
                            setEditing(r);
                          }
                        }}
                        className="surface min-h-touch rounded-md border px-2 py-1 text-xs font-semibold"
                        data-testid={`kb-edit-${r.chunk_id}`}
                      >
                        편집
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(r)}
                        className="ml-1 min-h-touch rounded-md border border-[#DC2626] px-2 py-1 text-xs font-semibold text-[#991B1B]"
                        data-testid={`kb-delete-${r.chunk_id}`}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이징 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 border-t px-3 py-2">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="surface min-h-touch rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
            >
              이전
            </button>
            <span className="text-sm text-muted">
              {curPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={curPage >= totalPages}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="surface min-h-touch rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
            >
              다음
            </button>
          </div>
        )}
      </section>

      {editing && (
        <RowEditDialog
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}

      {deleting && (
        <DeleteConfirmDialog row={deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} />
      )}

      {/* 토스트 */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto rounded-lg border border-brand-300 bg-surface-tint px-4 py-2 text-sm font-semibold text-brand-800 shadow"
            data-testid="kb-toast"
          >
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-steel-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="surface min-h-touch rounded-md border px-2 py-2 text-sm"
        data-testid={id}
      >
        <option value="">전체</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── 재인덱싱 상태 위젯 ───────────────────────────────────────────────────
function ReindexWidget({ stats, onReindex }: { stats: KbStats | null; onReindex: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const status = stats?.reindex_status ?? "idle";
  const statusInfo: Record<string, { label: string; cls: string }> = {
    idle: { label: "동기화됨", cls: "bg-[#F0FDF4] text-[#15803D] border-[#16A34A]" },
    pending: { label: "대기 중", cls: "bg-[#FFFBEB] text-[#854D0E] border-[#F59E0B]" },
    running: { label: "재인덱싱 중", cls: "bg-[#EFF6FF] text-[#1D4ED8] border-[#3B82F6]" },
  };
  const info = statusInfo[status];

  return (
    <section
      className="surface flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
      aria-label="재인덱싱 상태"
      data-testid="reindex-widget"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <div>
          <span className="text-xs text-steel-700">인덱스 버전</span>{" "}
          <span className="font-mono font-bold text-ink-900" data-testid="index-version">v{stats?.index_version ?? "—"}</span>
        </div>
        <div>
          <span className="text-xs text-steel-700">문서 수</span>{" "}
          <span className="font-semibold tabular-nums">{stats?.doc_count?.toLocaleString("ko-KR") ?? "—"}</span>
        </div>
        <div>
          <span className="text-xs text-steel-700">마지막 재인덱싱</span>{" "}
          <span className="text-muted">{fmtTime(stats?.last_reindex_at)}</span>
        </div>
        <div
          role="status"
          aria-label={`재인덱싱 상태: ${info.label}`}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-bold ${info.cls}`}
          data-testid="reindex-status"
        >
          {status === "running" && (
            <span
              aria-hidden
              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          )}
          {info.label}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!confirm ? (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="surface min-h-touch rounded-md border px-3 py-1.5 text-sm font-semibold"
            data-testid="reindex-trigger"
          >
            전체 재인덱싱
          </button>
        ) : (
          <div className="flex items-center gap-2" data-testid="reindex-confirm">
            <span className="text-xs text-muted">전체 재인덱싱을 실행할까요?</span>
            <button
              type="button"
              onClick={() => {
                setConfirm(false);
                onReindex();
              }}
              className="min-h-touch rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white"
              data-testid="reindex-confirm-yes"
            >
              실행
            </button>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="surface min-h-touch rounded-md border px-3 py-1.5 text-sm font-semibold"
            >
              취소
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── 행 편집/생성 다이얼로그 ──────────────────────────────────────────────
function RowEditDialog({
  row,
  onClose,
  onSaved,
}: {
  row: KbRow | null;
  onClose: () => void;
  onSaved: (fromNew: boolean) => void;
}) {
  const isNew = row === null;
  const [major, setMajor] = useState(row?.major_type ?? "");
  const [majorNew, setMajorNew] = useState("");
  const [sub, setSub] = useState(row?.sub_type ?? "");
  const [subNew, setSubNew] = useState("");
  const [detail, setDetail] = useState(row?.detail_item ?? "");
  const [accident, setAccident] = useState(row?.accident_type ?? "기타");
  const [severity, setSeverity] = useState(row?.severity ?? 3);
  const [frequency, setFrequency] = useState(row?.frequency ?? 3);
  const [hazard, setHazard] = useState(row?.hazard_text ?? "");
  const [controls, setControls] = useState(row?.controls ?? "");
  const [boundaryRegister, setBoundaryRegister] = useState<CriticalRegister>(
    (row?.critical_register as CriticalRegister) ?? "O",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const majorVal = major === "__new__" ? majorNew.trim() : major;
  const subVal = sub === "__new__" ? subNew.trim() : sub;

  // 등급·중점등록 미리보기 (서버 재계산 규칙과 동일)
  const preview = computeGradePreview(severity, frequency, boundaryRegister);
  const subIsNew = majorVal !== "" && subVal !== "" && !isKnownSub(majorVal, subVal);
  const detailIsNew =
    detail.trim() !== "" &&
    !(SUBS_BY_MAJOR[majorVal] || []).includes(detail.trim()); // 세부는 taxonomy 미관리 → 항상 신규로 표시 가능

  const canSave =
    majorVal !== "" && subVal !== "" && detail.trim() !== "" && hazard.trim() !== "" && !submitting;

  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const trigger = (document.activeElement as HTMLElement | null) ?? null;
    const node = dialogRef.current;
    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute("disabled"));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    const body: KbRowWrite = {
      major_type: majorVal,
      sub_type: subVal,
      detail_item: detail.trim(),
      accident_type: accident,
      severity,
      frequency,
      hazard_text: hazard.trim(),
      controls: controls.trim(),
      // 경계셀일 때만 서버가 존중. 그 외 무시.
      critical_register: preview.boundaryCell ? boundaryRegister : undefined,
    };
    try {
      if (isNew) await createKbRow(body);
      else await updateKbRow(row!.chunk_id, body);
      onSaved(isNew);
    } catch (e) {
      setError(e instanceof JhaApiError ? e.message : "저장에 실패했습니다. 다시 시도하세요.");
      setSubmitting(false);
    }
  }

  const subOptions = SUBS_BY_MAJOR[majorVal] || [];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      {/* 포지셔닝 컨테이너: 모바일=하단 정렬 시트, 데스크톱=중앙 정렬. fixed inset-0로 뷰포트 기준 고정.
          패널 높이는 vh가 아니라 컨테이너(=뷰포트) 기준 max-h-full 로 캡 → 모바일 URL바 vh 과대 산정 회피 */}
      <div className="fixed inset-0 z-50 flex flex-col justify-end overflow-hidden p-0 md:items-center md:justify-center md:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kb-edit-title"
        className="flex max-h-full w-full flex-col overflow-x-hidden rounded-t-2xl bg-[var(--card)] md:max-w-2xl md:rounded-2xl"
        style={{ borderColor: "var(--border)" }}
        data-testid="kb-edit-dialog"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5">
        <h2 id="kb-edit-title" className="text-lg font-bold text-ink-900">
          {isNew ? "신규 위험요인 행 생성" : `행 편집 — ${row!.chunk_id}`}
        </h2>
        <p className="mt-1 text-sm text-muted">
          분류·위험요인·대책·강도·빈도를 입력하세요. 등급·중점등록은 서버가 자동 산정하며 아래 미리보기로
          확인합니다.
        </p>

        {/* 분류 3단 */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TaxonomyField
            label="대공종 *"
            id="kb-major"
            value={major}
            newValue={majorNew}
            onValue={(v) => {
              setMajor(v);
              if (v !== "__new__") {
                setSub("");
                setSubNew("");
              }
            }}
            onNew={setMajorNew}
            options={MAJOR_TYPES}
          />
          <TaxonomyField
            label="중공종 *"
            id="kb-sub"
            value={sub}
            newValue={subNew}
            onValue={setSub}
            onNew={setSubNew}
            options={subOptions}
            badge={subIsNew ? "신규" : undefined}
          />
          <div>
            <label htmlFor="kb-detail" className="mb-1 block text-xs font-semibold text-steel-700">
              세부항목 *{detailIsNew && detail.trim() && <span className="ml-1 rounded bg-brand-100 px-1 text-[10px] font-bold text-brand-800">신규</span>}
            </label>
            <input
              id="kb-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="예: 마스트 해체"
              className="surface min-h-touch w-full rounded-md border px-3 py-2 text-sm"
              data-testid="kb-detail"
            />
          </div>
        </div>

        {/* 재해형태 + 강도/빈도 */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="kb-accident" className="mb-1 block text-xs font-semibold text-steel-700">
              재해형태
            </label>
            <select
              id="kb-accident"
              value={accident}
              onChange={(e) => setAccident(e.target.value)}
              className="surface min-h-touch w-full rounded-md border px-2 py-2 text-sm"
              data-testid="kb-accident"
            >
              {ACCIDENT_TYPES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <NumberField id="kb-severity" label="강도 (1~5)" value={severity} onChange={setSeverity} />
          <NumberField id="kb-frequency" label="빈도 (1~5)" value={frequency} onChange={setFrequency} />
        </div>

        {/* 등급·중점등록 미리보기 (입력 아님) */}
        <div
          className={`mt-3 rounded-md border-2 p-3 text-sm ${
            preview.boundaryCell
              ? "border-[#CA8A04] bg-[#FEF9C3]"
              : preview.grade === "상"
                ? "border-[#DC2626] bg-[#FEF2F2]"
                : preview.grade === "중"
                  ? "border-[#F97316] bg-[#FFF7ED]"
                  : "border-[#16A34A] bg-[#F0FDF4]"
          }`}
          data-testid="grade-preview"
          aria-live="polite"
        >
          <p className="font-semibold text-ink-900">
            <span className="text-xs font-normal text-steel-700">자동 산정 미리보기 · </span>
            {preview.label}
          </p>
          {preview.boundaryCell && (
            <div className="mt-2">
              <p className="text-xs text-[#854D0E]">
                경계셀(곱16)은 안전관리자가 중점등록 여부를 직접 정합니다. 검토 단계에서 최종 확정됩니다.
              </p>
              <div className="mt-2 flex gap-2" role="radiogroup" aria-label="경계셀 중점등록(잠정)">
                {(["O", "X"] as CriticalRegister[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={boundaryRegister === v}
                    onClick={() => setBoundaryRegister(v)}
                    className={`min-h-touch rounded-md border-2 px-3 py-1 text-sm font-semibold ${
                      boundaryRegister === v ? "border-brand bg-brand text-white" : "surface"
                    }`}
                    data-testid={`kb-boundary-${v}`}
                  >
                    {v === "O" ? "O (잠정 등록)" : "X (잠정 비등록)"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 위험요인 / 대책 */}
        <div className="mt-3">
          <label htmlFor="kb-hazard" className="mb-1 block text-xs font-semibold text-steel-700">
            위험요인 * <span className="font-normal text-muted">(여러 건은 · 또는 줄바꿈으로 구분)</span>
          </label>
          <textarea
            id="kb-hazard"
            value={hazard}
            onChange={(e) => setHazard(e.target.value)}
            rows={2}
            placeholder="예: 해체 중 부재 낙하 · 고소작업 추락"
            className="surface w-full resize-none rounded-md border p-3 text-sm"
            data-testid="kb-hazard"
          />
        </div>
        <div className="mt-3">
          <label htmlFor="kb-controls" className="mb-1 block text-xs font-semibold text-steel-700">
            개선대책 <span className="font-normal text-muted">(여러 건은 · 또는 줄바꿈으로 구분)</span>
          </label>
          <textarea
            id="kb-controls"
            value={controls}
            onChange={(e) => setControls(e.target.value)}
            rows={2}
            placeholder="예: 하부 통제구역 설정 · 안전대 체결 확인"
            className="surface w-full resize-none rounded-md border p-3 text-sm"
            data-testid="kb-controls"
          />
        </div>

        {!canSave && !submitting && (
          <p className="mt-3 rounded-md border border-[#F59E0B] bg-[#FFFBEB] p-2 text-xs text-[#854D0E]">
            대공종·중공종·세부항목·위험요인을 모두 입력해야 저장할 수 있습니다.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm font-semibold text-[#991B1B]">
            {error}
          </p>
        )}

        </div>
        {/* 고정 푸터 — 스크롤 영역 밖. 긴 폼에서도 저장/취소가 항상 도달 가능(모바일 바텀시트) */}
        <div className="flex flex-none gap-2 border-t bg-[var(--card)] p-4" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            onClick={onClose}
            className="surface min-h-touch flex-1 rounded-lg border px-4 py-2 font-semibold"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={save}
            className="min-h-[56px] flex-[2] rounded-lg bg-brand px-4 font-semibold text-white disabled:opacity-50"
            data-testid="kb-save"
          >
            {submitting ? "저장 중…" : isNew ? "생성하고 재인덱싱" : "저장하고 재인덱싱"}
          </button>
        </div>
      </div>
      </div>
    </>
  );
}

function TaxonomyField({
  label,
  id,
  value,
  newValue,
  onValue,
  onNew,
  options,
  badge,
}: {
  label: string;
  id: string;
  value: string;
  newValue: string;
  onValue: (v: string) => void;
  onNew: (v: string) => void;
  options: string[];
  badge?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-steel-700">
        {label}
        {badge && <span className="ml-1 rounded bg-brand-100 px-1 text-[10px] font-bold text-brand-800">{badge}</span>}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        className="surface min-h-touch w-full rounded-md border px-2 py-2 text-sm"
        data-testid={id}
      >
        <option value="">선택…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value="__new__">+ 직접 입력 [신규]</option>
      </select>
      {value === "__new__" && (
        <input
          value={newValue}
          onChange={(e) => onNew(e.target.value)}
          placeholder="신규 분류명 입력"
          className="surface mt-1 w-full rounded-md border px-3 py-2 text-sm"
          data-testid={`${id}-new`}
          aria-label={`${label} 직접 입력`}
        />
      )}
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-steel-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="surface min-h-touch w-full rounded-md border px-2 py-2 text-sm tabular-nums"
        data-testid={id}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── 삭제 확인 다이얼로그 ─────────────────────────────────────────────────
function DeleteConfirmDialog({
  row,
  onClose,
  onConfirm,
}: {
  row: KbRow;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const trigger = (document.activeElement as HTMLElement | null) ?? null;
    const node = dialogRef.current;
    const focusables = () =>
      Array.from(node?.querySelectorAll<HTMLElement>("button") ?? []).filter((el) => !el.hasAttribute("disabled"));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kb-del-title"
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-[var(--card)] p-5 md:inset-0 md:m-auto md:h-fit md:max-w-md md:rounded-2xl"
        style={{ borderColor: "var(--border)" }}
        data-testid="kb-delete-dialog"
      >
        <h2 id="kb-del-title" className="text-lg font-bold text-ink-900">
          행 삭제 확인
        </h2>
        <p className="mt-2 text-sm text-ink-800">
          <span className="font-mono text-xs text-steel-700">{row.chunk_id}</span> · {row.major_type} / {row.sub_type} /{" "}
          {row.detail_item}
        </p>
        <div className="mt-3 rounded-md border border-[#F59E0B] bg-[#FFFBEB] p-3 text-sm text-[#854D0E]">
          소프트 삭제됩니다 — 검색·AI 답변에서 제외되며, 인덱스에서 빠집니다. 이력은 보존되어 복구할 수 있습니다.
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="surface min-h-touch flex-1 rounded-lg border px-4 py-2 font-semibold"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-touch flex-1 rounded-lg bg-[#DC2626] px-4 py-2 font-semibold text-white"
            data-testid="kb-delete-confirm"
          >
            소프트 삭제
          </button>
        </div>
      </div>
    </>
  );
}
