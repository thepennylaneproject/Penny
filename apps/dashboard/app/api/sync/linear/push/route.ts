import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository-instance";
import { apiErrorMessage } from "@/lib/api-error";
import {
  isLinearConfigured,
  getTeamStates,
  createIssue,
  updateIssueState,
  penny_TO_LINEAR_STATUS,
  findingToLinearTitle,
  findingToDescription,
  getLinearPriority,
  getEnvLabelId,
  getEnvProjectId,
} from "@/lib/linear";
import {
  getProjectSyncState,
  setProjectSyncState,
} from "@/lib/sync-state";

export async function POST(request: Request) {
  if (!isLinearConfigured()) {
    return NextResponse.json(
      { error: "Linear not configured. Set LINEAR_API_KEY and LINEAR_TEAM_ID." },
      { status: 400 }
    );
  }

  let body: { projectName?: string; dryRun?: boolean } = {};
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

  const findings = project.findings ?? [];
  const dryRun = body.dryRun === true;

  let states: Record<string, string> = {};
  if (!dryRun) {
    try {
      states = await getTeamStates();
    } catch (error) {
      console.error("sync/linear/push getTeamStates", error);
      return NextResponse.json(
        { error: apiErrorMessage(error) },
        { status: 502 }
      );
    }
  }

  const syncState = await getProjectSyncState(canonicalProjectName);
  const mappings = { ...syncState.mappings };

  const projectId = getEnvProjectId(canonicalProjectName) ?? undefined;

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const f of findings) {
    const fid = f.finding_id;
    const status = f.status;

    // Only skip genuinely terminal states; let 'open' sync to Linear Backlog/Todo
    if (["fixed_verified", "wont_fix", "duplicate"].includes(status)) {
      skipped += 1;
      continue;
    }

    const title = findingToLinearTitle(f);
    const priority = getLinearPriority(f);
    const linearStateName = penny_TO_LINEAR_STATUS[status] ?? "Backlog";
    const stateId = states[linearStateName] ?? "";

    if (fid in mappings) {
      const existing = mappings[fid];
      if (existing.penny_status !== status) {
        if (dryRun) {
          updated += 1;
        } else {
          try {
            const ok = stateId && (await updateIssueState(existing.linear_id, stateId));
            if (ok) {
              existing.penny_status = status;
              existing.last_synced = new Date().toISOString();
              updated += 1;
            } else {
              failed += 1;
              errors.push(`update ${fid}: stateId not resolved or API returned false`);
            }
          } catch (error) {
            failed += 1;
            errors.push(`update ${fid}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      } else {
        skipped += 1;
      }
    } else {
      if (dryRun) {
        created += 1;
      } else {
        const description = findingToDescription(f);
        const labelId = getEnvLabelId(f.cluster);
        const issue = await createIssue({
          title,
          description,
          priority,
          stateId: stateId || undefined,
          labelIds: labelId ? [labelId] : undefined,
          projectId,
        });
        if (issue) {
          mappings[fid] = {
            linear_id: issue.id,
            identifier: issue.identifier,
            url: issue.url,
            penny_status: status,
            created_at: new Date().toISOString(),
            last_synced: new Date().toISOString(),
          };
          // Persist mapping immediately after each successful issue creation
          // so a partial failure doesn't cause duplicates on retry.
          await setProjectSyncState(canonicalProjectName, {
            mappings,
            last_sync: syncState.last_sync,
          });
          created += 1;
        }
      }
    }
  }

  // Only advance last_sync when the whole batch succeeded (ARCH-013)
  if (!dryRun) {
    await setProjectSyncState(canonicalProjectName, {
      mappings,
      last_sync: failed === 0 ? new Date().toISOString() : syncState.last_sync,
    });
  }

  return NextResponse.json({
    created,
    updated,
    skipped,
    failed,
    errors: errors.length > 0 ? errors : undefined,
    dryRun,
    partial_failure: failed > 0,
  });
}
