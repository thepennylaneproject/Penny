import { NextResponse } from "next/server";
import {
  jobsStoreConfigured,
  listAuditJobsForProject,
  listAuditRunsForProject,
} from "@/lib/orchestration-jobs";
import {
  getLatestManifestForProject,
  listRepairJobsForProject,
} from "@/lib/maintenance-store";
import { apiErrorMessage } from "@/lib/api-error";

/**
 * GET ?project=Name — recent penny_audit_runs + penny_audit_jobs for that project.
 * Auth: same middleware as other /api routes (cookie or Bearer).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const project = searchParams.get("project")?.trim() ?? "";
  if (!project) {
    return NextResponse.json(
      { error: "project query parameter is required" },
      { status: 400 }
    );
  }

  if (!jobsStoreConfigured()) {
    return NextResponse.json({
      configured: false,
      enqueue_auth_optional: true,
      runs: [],
      jobs: [],
    });
  }

  try {
    const [runs, jobs, manifest, repairJobs] = await Promise.all([
      listAuditRunsForProject(project, 30),
      listAuditJobsForProject(project, 20),
      getLatestManifestForProject(project),
      listRepairJobsForProject(project, 20),
    ]);
    return NextResponse.json({
      configured: true,
      enqueue_auth_optional: true,
      runs,
      jobs,
      manifest,
      repair_jobs: repairJobs,
    });
  } catch (error) {
    console.error("GET /api/orchestration/runs", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}
