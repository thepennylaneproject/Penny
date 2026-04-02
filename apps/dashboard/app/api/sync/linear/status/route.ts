import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository-instance";
import { isLinearConfigured, pingLinearApi } from "@/lib/linear";
import { getProjectSyncState } from "@/lib/sync-state";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawName = searchParams.get("project") ?? "";
  if (!rawName.trim()) {
    return NextResponse.json(
      { error: "project query param is required" },
      { status: 400 }
    );
  }
  // Normalize once so both repo lookup and sync-state key are consistent
  const projectName = rawName.trim();

  const repo = getRepository();
  const project = await repo.getByName(projectName);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const canonicalProjectName = project.name;

  const findings = project.findings ?? [];
  const syncState = await getProjectSyncState(canonicalProjectName);
  const mappings = syncState.mappings;
  const syncedIds = new Set(Object.keys(mappings));
  const findingIds = new Set(findings.map((f) => f.finding_id));

  const inBoth = findings.filter((f) => syncedIds.has(f.finding_id));
  const inLinearOnly = [...syncedIds].filter((id) => !findingIds.has(id));
  const unresolvedpennyOnly = findings.filter(
    (f) =>
      !syncedIds.has(f.finding_id) &&
      ["open", "accepted", "in_progress", "fixed_pending_verify"].includes(f.status)
  );

  const linearConfigured = isLinearConfigured();
  let linearReachable: boolean | null = null;
  let linearError: string | null = null;
  if (linearConfigured) {
    const ping = await pingLinearApi();
    linearReachable = ping.ok;
    linearError = ping.error ?? null;
  }

  return NextResponse.json({
    configured: linearConfigured,
    linear_reachable: linearReachable,
    linear_error: linearError,
    last_sync: syncState.last_sync,
    synced_count: inBoth.length,
    in_linear_only: inLinearOnly.length,
    unsynced_unresolved: unresolvedpennyOnly.length,
  });
}
