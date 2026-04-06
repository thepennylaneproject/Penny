import { DashboardRouteShell } from "@/components/DashboardRouteShell";
import { JobQueueView } from "@/components/JobQueueView";

export default function ActivityPage() {
  return (
    <DashboardRouteShell activeView="jobs">
      <JobQueueView />
    </DashboardRouteShell>
  );
}
