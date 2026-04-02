import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository-instance";
import {
  isLinearConfigured,
  getIssue,
  LINEAR_TO_penny_STATUS,
} from "@/lib/linear";
import { getProjectSyncState, setProjectSyncState } from "@/lib/sync-state";
import type { FindingStatus } from "@/lib/types";

export async function POST(request: Request) {
  if (!isLinearConfigured()) {
    return NextResponse.json(
      { error: "Linear not configured. Set LINEAR_API_KEY and LINEAR_TEAM_ID." },
      { status: 400 }
    );
  }

  let body: { projectName?: string } = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    // no body
  }
  // Normalize once so repo lookup and sync-state key are consistent (ARCH-012)
  const rawName = body.projectName ?? "";
  if (!rawName.trim()) {
    return NextResponse.json(
      { error: "projectName is required" },
      { status: 400 }
    );
  }
  const projectName = rawName.trim();

  const repo = getRepository();
  const project = await repo.getByName(projectName);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const canonicalProjectName = project.name;

  const syncState = await getProjectSyncState(canonicalProjectName);
  const mappings = syncState.mappings;
  if (Object.keys(mappings).length === 0) {
    return NextResponse.json({
      pulled: 0,
      message: "No synced issues. Run push first.",
    });
  }

  const findings = [...(project.findings ?? [])];
  let pulled = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const [fid, info] of Object.entries(mappings)) {
    const linearId = info.linear_id;
    if (!linearId) continue;

    let issue: { state?: { name?: string } } | null = null;
    try {
      issue = await getIssue(linearId);
    } catch (error) {
      // Track failures instead of silently swallowing them (ARCH-013)
      failed += 1;
      errors.push(`fetch ${fid}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (!issue) continue;

    const linearState = issue.state?.name ?? "";
    const pennyStatus = LINEAR_TO_penny_STATUS[linearState] as FindingStatus | undefined;
    if (!pennyStatus) continue;

    const index = findings.findIndex((f) => f.finding_id === fid);
    if (index === -1) continue;

    const f = findings[index];
    if (f.status === pennyStatus) continue;

    f.status = pennyStatus;
    f.history = f.history ?? [];
    f.history.push({
      timestamp: new Date().toISOString(),
      actor: "linear-sync",
      event: "note_added",
      notes: `Status synced from Linear (${info.identifier ?? "?"}): ${linearState} -> ${pennyStatus}`,
    });
    info.penny_status = pennyStatus;
    info.last_synced = new Date().toISOString();
    pulled += 1;
  }

  await repo.update({
    ...project,
    findings,
    lastUpdated: new Date().toISOString(),
  });
  // Only advance last_sync when the whole batch succeeded (ARCH-013)
  await setProjectSyncState(canonicalProjectName, {
    mappings,
    last_sync: failed === 0 ? new Date().toISOString() : syncState.last_sync,
  });

  return NextResponse.json({
    pulled,
    failed,
    errors: errors.length > 0 ? errors : undefined,
    partial_failure: failed > 0,
  });
}
