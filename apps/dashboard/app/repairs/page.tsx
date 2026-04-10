import type { Metadata } from "next";
import { DashboardRouteShell } from "@/components/DashboardRouteShell";
import { EngineView } from "@/components/EngineView";

export const metadata: Metadata = {
  title: "Repairs",
};

export default function RepairsPage() {
  return (
    <DashboardRouteShell activeView="engine">
      <EngineView />
    </DashboardRouteShell>
  );
}
