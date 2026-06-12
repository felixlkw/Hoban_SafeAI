"use client";

import Link from "next/link";
import { RoleGate, useContrast, useRole } from "./AppProviders";
import { HobanLogo } from "./HobanLogo";
import { UserRole } from "@/lib/types";

const ROLE_LABEL: Record<UserRole, string> = {
  worker: "작업자",
  safety_manager: "안전관리자",
  admin: "관리자",
};

export function TopBar() {
  const { high, toggle } = useContrast();
  const { role, setRole } = useRole();

  return (
    <header className="surface sticky top-0 z-30 shrink-0 border-b">
      {/* 와이드 정렬 축: 세션 분할 화면과 동일한 max-w-screen-2xl·px-6 컨테이너로 가장자리 정렬 */}
      <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="호반 JHA 홈" className="rounded">
          <HobanLogo variant="wordmark" size={26} />
        </Link>
        <div className="flex items-center gap-2">
          {/* 안전관리자·관리자 전용 메뉴 — worker에겐 미노출(역할 게이트) */}
          <RoleGate allow={["safety_manager", "admin"]}>
            <nav className="flex items-center gap-1" aria-label="관리자 메뉴">
              <Link
                href="/manager"
                className="surface min-h-touch rounded border px-2 py-1 text-sm font-semibold"
              >
                검토함
              </Link>
              <Link
                href="/admin/kb"
                className="surface min-h-touch rounded border px-2 py-1 text-sm font-semibold"
                data-testid="nav-kb"
              >
                지식베이스
              </Link>
            </nav>
          </RoleGate>
          {/* 데모용 역할 전환 (운영은 SSO claim) */}
          <label className="sr-only" htmlFor="role-select">
            역할 전환
          </label>
          <select
            id="role-select"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="surface min-h-touch rounded border px-2 py-1 text-sm"
            aria-label="역할 전환"
          >
            {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggle}
            aria-pressed={high}
            className="surface min-h-touch min-w-touch rounded border px-3 py-1 text-sm"
            title="고대비 모드 (햇빛 가독성)"
          >
            고대비 {high ? "켜짐" : "꺼짐"}
          </button>
        </div>
      </div>
    </header>
  );
}
