"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { UserRole } from "@/lib/types";

// ─── 역할(Role) 컨텍스트 ─────────────────────────────────
interface RoleCtx {
  role: UserRole;
  setRole: (r: UserRole) => void;
}
const RoleContext = createContext<RoleCtx>({ role: "worker", setRole: () => {} });
export const useRole = () => useContext(RoleContext);

// ─── 고대비 컨텍스트 ─────────────────────────────────────
interface ContrastCtx {
  high: boolean;
  toggle: () => void;
}
const ContrastContext = createContext<ContrastCtx>({ high: false, toggle: () => {} });
export const useContrast = () => useContext(ContrastContext);

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>("worker");
  const [high, setHigh] = useState(false);

  // 역할/대비 설정 영속(데모 편의)
  useEffect(() => {
    const r = window.localStorage.getItem("jha_role") as UserRole | null;
    if (r) setRole(r);
    const c = window.localStorage.getItem("jha_contrast");
    if (c === "high") setHigh(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("jha_role", role);
  }, [role]);

  useEffect(() => {
    document.documentElement.setAttribute("data-contrast", high ? "high" : "normal");
    window.localStorage.setItem("jha_contrast", high ? "high" : "normal");
  }, [high]);

  return (
    <RoleContext.Provider value={{ role, setRole }}>
      <ContrastContext.Provider value={{ high, toggle: () => setHigh((v) => !v) }}>
        {children}
      </ContrastContext.Provider>
    </RoleContext.Provider>
  );
}

/** 권한 게이트 — allow 역할에 없으면 미렌더(fallback 옵션) */
export function RoleGate({
  allow,
  children,
  fallback = null,
}: {
  allow: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { role } = useRole();
  if (!allow.includes(role)) return <>{fallback}</>;
  return <>{children}</>;
}
