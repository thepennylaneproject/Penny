import type { Metadata } from "next";
import { DashboardRouteShell } from "@/components/DashboardRouteShell";
import { JobQueueView } from "@/components/JobQueueView";

export const metadata: Metadata = {
  title: "Activity",
};

export default function ActivityPage() {
  return (
    <DashboardRouteShell activeView="jobs">
      <JobQueueView />
    </DashboardRouteShell>
  );
}
