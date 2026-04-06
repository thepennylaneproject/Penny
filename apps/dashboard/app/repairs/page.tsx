import { DashboardRouteShell } from "@/components/DashboardRouteShell";
import { EngineView } from "@/components/EngineView";

export default function RepairsPage() {
  return (
    <DashboardRouteShell activeView="engine">
      <EngineView />
    </DashboardRouteShell>
  );
}
