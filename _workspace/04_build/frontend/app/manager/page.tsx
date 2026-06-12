"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RoleGate, useRole } from "@/components/AppProviders";
import { BoundaryCellBadge } from "@/components/BoundaryCellBadge";
import { pendingReviewList } from "@/lib/mock";
import { review } from "@/lib/api";
import { JhaApiError } from "@/lib/types";

/**
 * 안전관리자 화면 — 검토 대기 목록 + 경계셀 확정(상/중 택1 + 사유).
 * 권한 게이트: safety_manager / admin 만 접근.
 */

interface PendingItem {
  session_id: string;
  work_description: string;
  critical_register: string;
  boundary_count: number;
  data_gap?: boolean;
  created_at: string;
  worker: string;
}

export default function ManagerPage() {
  const { role } = useRole();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [selected, setSelected] = useState<PendingItem | null>(null);

  useEffect(() => {
    setItems(pendingReviewList() as PendingItem[]);
  }, []);

  return (
    // TopBar와 동일한 max-w-screen-2xl·px-6 정렬 축. 본문 가독 폭은 내부 max-w-3xl로 유지
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6">
    <div className="mx-auto max-w-3xl">
    <RoleGate
      allow={["safety_manager", "admin"]}
      fallback={
        <div role="alert" className="rounded-lg border-2 border-[#F97316] bg-[#FFF7ED] p-4">
          <h2 className="text-base font-bold text-[#9A3412]">접근 권한이 없습니다</h2>
          <p className="mt-1 text-sm text-ink-800">
            검토 대기 화면은 안전관리자·관리자만 볼 수 있습니다. 현재 역할: {role}. 우측 상단에서 역할을
            전환하거나 담당자에게 문의하세요.
          </p>
        </div>
      }
    >
      <h1 className="mb-1 text-xl font-bold">검토 대기 목록</h1>
      <p className="mb-4 text-sm text-muted">경계셀(잠정 등급)·데이터 갭 항목을 확정해 주세요.</p>

      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.session_id}>
            <article className="surface rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-base font-medium">{it.work_description}</p>
                  <p className="mt-1 text-xs text-muted">
                    작성자 {it.worker} · {new Date(it.created_at).toLocaleString("ko-KR")}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {it.critical_register === "O (잠정)" ? (
                    <BoundaryCellBadge mode="register" symbol="O" />
                  ) : (
                    <span className="rounded-md bg-[#16A34A] px-2 py-0.5 text-xs font-bold text-white">
                      등록 {it.critical_register}
                    </span>
                  )}
                  {it.boundary_count > 0 && (
                    <span className="text-xs text-[#854D0E]">경계셀 {it.boundary_count}건</span>
                  )}
                  {it.data_gap && <span className="text-xs text-[#9A3412]">⚠ 데이터 갭</span>}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(it)}
                  className="min-h-touch rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
                  data-testid="open-confirm"
                >
                  경계셀 확정 ▶
                </button>
              </div>
            </article>
          </li>
        ))}
      </ul>

      {selected && (
        <BoundaryConfirmDialog
          item={selected}
          onClose={() => setSelected(null)}
          onConfirmed={(id) => {
            setItems((prev) => prev.filter((x) => x.session_id !== id));
            setSelected(null);
          }}
        />
      )}
    </RoleGate>
    </div>
    </div>
  );
}

/**
 * 경계셀 확정 다이얼로그 — 상/중 택1 + 사유 입력(필수). 사유 없으면 확정 차단.
 */
function BoundaryConfirmDialog({
  item,
  onClose,
  onConfirmed,
}: {
  item: PendingItem;
  onClose: () => void;
  onConfirmed: (id: string) => void;
}) {
  const router = useRouter();
  const [grade, setGrade] = useState<"상" | "중" | "">("");
  const [reason, setReason] = useState("");
  // 기본값 제거: 등급·중점등록 모두 미선택으로 시작 → "판단"이 아니라 "기본값 유지" 방지.
  const [registerO, setRegisterO] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = grade !== "" && registerO !== null && reason.trim().length >= 5;

  // 모달 열림 동안 배경(문서) 스크롤 잠금 — 모바일에서 배경 스크롤이 fixed 시트의
  // 좌표·hit-test를 흔드는 것을 차단(표준 모달 패턴 + e2e 안정화).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // P1-6: 포커스 트랩 — Tab 순환 + ESC 닫기 + 닫을 때 트리거로 포커스 복귀.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const trigger = (document.activeElement as HTMLElement | null) ?? null;
    const node = dialogRef.current;
    // 진입 시 첫 포커스 가능 요소로 이동
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
      if (list.length === 0) return;
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
      trigger?.focus(); // 트리거 복귀
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!canConfirm) return;
    setSubmitting(true);
    setError(null);
    try {
      // mock 세션은 review API에 상태가 없을 수 있으므로 실패해도 데모상 진행
      await review(
        item.session_id,
        [{ hazard_index: 0, confirmed_grade: grade as "상" | "중", confirmed_critical_register: registerO ? "O" : "X", note: reason }],
        reason,
      ).catch((e) => {
        if (e instanceof JhaApiError && !e.retryable) throw e;
      });
      onConfirmed(item.session_id);
    } catch (e) {
      setError(e instanceof JhaApiError ? e.message : "확정에 실패했습니다. 다시 시도하세요.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      {/* 바텀시트/다이얼로그 — 모바일 hit-test 안정화(KB 패턴):
          fixed inset-0 컨테이너 + max-h-full 플렉스 패널. 본문만 스크롤하고
          액션 푸터(취소/확정)는 스크롤 영역 '밖' 고정 → 짧은 뷰포트에서도
          버튼이 텍스트영역에 가려지지 않는다. */}
      <div className="fixed inset-0 z-50 flex items-end justify-center p-0 md:items-center md:p-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="flex max-h-[calc(100%-1rem)] w-full flex-col rounded-t-2xl bg-[var(--card)] md:max-w-md md:rounded-2xl"
          style={{ borderColor: "var(--border)" }}
        >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
        <h2 id="confirm-title" className="text-lg font-bold">
          경계셀 위험등급 확정
        </h2>
        <p className="mt-1 text-sm text-muted">{item.work_description}</p>
        <div className="mt-2">
          <BoundaryCellBadge mode="grade" grade="상" />
          <span className="ml-2 text-sm text-muted">강도4 × 빈도4 = 16 (상/중 경계)</span>
        </div>

        {/* 등급 택1 */}
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">확정 등급 *</legend>
          <div className="mt-2 flex gap-2" role="radiogroup" aria-label="확정 등급">
            {(["상", "중"] as const).map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={grade === g}
                onClick={() => setGrade(g)}
                className={`min-h-touch flex-1 rounded-md border-2 px-4 py-2 text-base font-bold ${
                  grade === g
                    ? g === "상"
                      ? "border-[#DC2626] bg-[#DC2626] text-white"
                      : "border-[#F97316] bg-[#F97316] text-white"
                    : "surface"
                }`}
              >
                <span aria-hidden>{g === "상" ? "▲ " : "■ "}</span>
                {g}
              </button>
            ))}
          </div>
        </fieldset>

        {/* 중점등록 여부 — 기본값 없음(O/X 직접 선택) */}
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">중점등록(중점 관리 대상) *</legend>
          <div className="mt-2 flex gap-2" role="radiogroup" aria-label="중점등록 여부">
            {[
              { v: true, label: "O (등록)" },
              { v: false, label: "X (비등록)" },
            ].map((o) => (
              <button
                key={String(o.v)}
                type="button"
                role="radio"
                aria-checked={registerO === o.v}
                onClick={() => setRegisterO(o.v)}
                data-testid={`register-${o.v ? "O" : "X"}`}
                className={`min-h-touch flex-1 rounded-md border-2 px-4 py-2 text-sm font-semibold ${
                  registerO === o.v ? "border-brand bg-brand text-white" : "surface"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </fieldset>

        {/* 사유 (필수) */}
        <div className="mt-4">
          <label htmlFor="confirm-reason" className="text-sm font-semibold">
            확정 사유 * <span className="font-normal text-muted">(5자 이상, 감사 기록용)</span>
          </label>
          <textarea
            id="confirm-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="예: 해체 높이 30m·동시작업 다수로 빈도 상향, 상으로 확정"
            className="surface mt-1 w-full resize-none rounded-md border p-3 text-sm"
          />
        </div>

        {/* 미선택 안내 — 등급·중점등록 직접 선택 강제 */}
        {!canConfirm && (
          <p className="mt-3 rounded-md border border-[#F59E0B] bg-[#FFFBEB] p-2 text-xs text-[#854D0E]" data-testid="unselected-hint">
            등급과 중점등록 여부를 직접 선택해야 확정할 수 있습니다.
            {grade === "" && " (등급 미선택)"}
            {registerO === null && " (중점등록 미선택)"}
            {reason.trim().length < 5 && " (사유 5자 이상)"}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-2 text-sm font-semibold text-[#991B1B]">
            {error}
          </p>
        )}
        </div>

        {/* 액션 푸터 — 스크롤 영역 '밖' 고정(KB 패턴). 본문(p-5)만 스크롤하고
            취소/확정 버튼은 항상 패널 하단에 노출 → 짧은 뷰포트에서도 가려지지 않음. */}
        <div className="shrink-0 border-t bg-[var(--card)] p-5 pt-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="surface min-h-touch flex-1 rounded-lg border px-4 py-2 font-semibold"
            >
              취소
            </button>
            <button
              type="button"
              disabled={!canConfirm || submitting}
              onClick={submit}
              className="min-h-[56px] flex-[2] rounded-lg bg-brand px-4 font-semibold text-white disabled:opacity-50"
              data-testid="confirm-submit"
            >
              {submitting ? "확정 중…" : "확정하고 등록 진행"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => router.push(`/session/${item.session_id}`)}
            className="mt-3 w-full text-center text-sm text-brand-700 underline"
          >
            전체 평가 내용 보기
          </button>
        </div>
        </div>
      </div>
    </>
  );
}
