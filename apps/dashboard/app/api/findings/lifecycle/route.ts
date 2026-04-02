import { NextResponse } from "next/server";
import { readRepairQueue } from "@/lib/audit-reader";
import { apiErrorMessage } from "@/lib/api-error";
import { listRepairJobsForFinding } from "@/lib/maintenance-store";
import { jobsStoreConfigured } from "@/lib/orchestration-jobs";
import { getRepository } from "@/lib/repository-instance";
import { isLinearConfigured } from "@/lib/linear";
import { getProjectSyncState } from "@/lib/sync-state";
import type { RepairJob, SyncMapping } from "@/lib/types";

/**
 * GET /api/findings/lifecycle?project=&finding_id=
 * One round-trip for finding detail: Linear mapping + repair ledger rows for this finding.
 * Does not call the Linear API (no per-open ping); use sync status / push flows for that.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawProject = searchParams.get("project") ?? "";
    const rawFinding = searchParams.get("finding_id") ?? "";
    if (!rawProject.trim() || !rawFinding.trim()) {
      return NextResponse.json(
        { error: "project and finding_id query params are required" },
        { status: 400 }
      );
    }

    const repo = getRepository();
    const project = await repo.getByName(rawProject.trim());
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const canonical = project.name;
    const findingId = rawFinding.trim();

    const syncState = await getProjectSyncState(canonical);
    const linearMapping: SyncMapping | null =
      syncState.mappings[findingId] ?? null;

    let repairJobs: RepairJob[] = [];
    if (jobsStoreConfigured()) {
      repairJobs = await listRepairJobsForFinding(canonical, findingId, 8);
    } else {
      repairJobs = readRepairQueue().filter(
        (j) =>
          j.finding_id === findingId &&
          j.project_name.trim().toLowerCase() === canonical.trim().toLowerCase()
      );
      repairJobs.sort(
        (a, b) =>
          new Date(b.queued_at).getTime() - new Date(a.queued_at).getTime()
      );
    }

    return NextResponse.json({
      project: canonical,
      finding_id: findingId,
      linear: {
        integration_configured: isLinearConfigured(),
        last_project_sync: syncState.last_sync,
        mapping: linearMapping,
      },
      repair_jobs: repairJobs,
    });
  } catch (e) {
    console.error("GET /api/findings/lifecycle", e);
    return NextResponse.json(
      { error: apiErrorMessage(e) },
      { status: 500 }
    );
  }
}
