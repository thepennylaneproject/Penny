"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Shell, type NavView } from "@/components/Shell";

interface DashboardRouteShellProps {
  children: React.ReactNode;
  activeView: NavView;
  onAuditSynced?: () => void;
}

function routeForView(view: NavView): string {
  switch (view) {
    case "engine":
      return "/repairs";
    case "jobs":
      return "/activity";
    case "portfolio":
    default:
      return "/";
  }
}

export function DashboardRouteShell({
  children,
  activeView,
  onAuditSynced,
}: DashboardRouteShellProps) {
  const router = useRouter();

  const handleNavigate = useCallback(
    (view: NavView) => {
      router.push(routeForView(view));
    },
    [router]
  );

  return (
    <Shell
      activeView={activeView}
      onNavigate={handleNavigate}
      onAuditSynced={onAuditSynced}
    >
      {children}
    </Shell>
  );
}
