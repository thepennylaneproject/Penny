import { NextResponse } from "next/server";
import { readOpenFindings, readAuditRunFiles } from "@/lib/audit-reader";
import { getRepository } from "@/lib/repository-instance";
import { recordDurableEventBestEffort } from "@/lib/durable-state";
import type { Project, Finding } from "@/lib/types";
import { apiErrorMessage } from "@/lib/api-error";
import { normalizeProjectName } from "@/lib/project-identity";
import { validateFinding } from "@/lib/finding-validation";
import { isDegradedAuditPlaceholderFinding } from "@/lib/degraded-audit-finding";

/**
 * GET  /api/sync/audit — preview what's available to import.
 * POST /api/sync/audit — import all findings from audits/open_findings.json
 *                        and any audit run files under audits/runs/.
 */

/** Group an array of findings by their project_name field (or a fallback). */
function groupByProject(
  findings: Finding[],
  fallbackProject: string
): Record<string, Finding[]> {
  const groups: Record<string, Finding[]> = {};
  for (const f of findings) {
    const name =
      (f as Finding & { project_name?: string }).project_name ??
      fallbackProject;
    if (!groups[name]) groups[name] = [];
    groups[name].push(f);
  }
  return groups;
}

export async function GET() {
  const findings = readOpenFindings();
  const runFiles = readAuditRunFiles();
  return NextResponse.json({
    open_findings_count: findings.length,
    audit_run_files: runFiles.length,
    ready: findings.length > 0 || runFiles.length > 0,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const fallbackProject: string =
      typeof body.project_name === "string" && body.project_name.trim()
        ? body.project_name.trim()
        : "Imported";

    const findings = readOpenFindings();
    let findingsDroppedAsDegraded = 0;

    // Also pull findings from audit run files (findings[] inside each run)
    const runFiles = readAuditRunFiles();
    for (const run of runFiles) {
      const runFindings = (run as { findings?: Finding[] }).findings;
      if (Array.isArray(runFindings)) {
        findings.push(...runFindings);
      }
    }

    // Validate each finding against the required schema before importing.
    // Malformed findings (missing proof_hooks, history, etc.) are rejected so
    // broken auditor output never silently enters the dashboard.
    const validFindings: Finding[] = [];
    const invalidFindings: Array<{ finding_id: unknown; auditor: unknown; errors: string[] }> = [];
    for (const f of findings) {
      if (isDegradedAuditPlaceholderFinding(f)) {
        findingsDroppedAsDegraded++;
        continue;
      }
      const errors = validateFinding(f);
      if (errors.length === 0) {
        validFindings.push(f as Finding);
      } else {
        const raw = f as unknown as Record<string, unknown>;
        invalidFindings.push({
          finding_id: raw.finding_id ?? null,
          auditor: raw.agent_name ?? raw.auditor ?? null,
          errors: errors.map((e) => `${e.field}: ${e.message}`),
        });
      }
    }

    if (validFindings.length === 0 && findings.length === 0) {
      return NextResponse.json({
        projects_updated: 0,
        findings_imported: 0,
        findings_rejected: 0,
        findings_dropped_as_degraded: 0,
        message: "No findings found in audit output. Run an audit first.",
      });
    }

    if (validFindings.length === 0) {
      return NextResponse.json({
        projects_updated: 0,
        findings_imported: 0,
        findings_rejected: invalidFindings.length,
        findings_dropped_as_degraded: findingsDroppedAsDegraded,
        invalid_findings: invalidFindings,
        message:
          findingsDroppedAsDegraded > 0
            ? `Dropped ${findingsDroppedAsDegraded} degraded audit placeholder finding(s); no actionable findings remained.${invalidFindings.length > 0 ? ` ${invalidFindings.length} additional finding(s) were rejected due to schema violations.` : ""}`
            : `All ${invalidFindings.length} findings were rejected due to schema violations. Check auditor output.`,
      });
    }

    const groups = groupByProject(validFindings, fallbackProject);
    const repo = getRepository();
    const existingProjects = await repo.list();
    const existingByName = new Map(
      existingProjects.map((project) => [normalizeProjectName(project.name), project])
    );

    let projectsUpdated = 0;
    let findingsImported = 0;

    for (const [projectName, projectFindings] of Object.entries(groups)) {
      const normalizedProjectName = normalizeProjectName(projectName);
      const existing = existingByName.get(normalizedProjectName);
      const now = new Date().toISOString();

      if (existing) {
        // Upsert: update existing findings with incoming content, preserve
        // local workflow fields (status/history); append brand-new findings.
        const incomingById = new Map(projectFindings.map((f) => [f.finding_id, f]));
        let changed = false;

        // Update content of existing findings, preserving workflow fields
        const updatedFindings = existing.findings.map((prev) => {
          const incoming = incomingById.get(prev.finding_id);
          if (!incoming) return prev;
          // Replace audit content fields but keep workflow state
          const merged = {
            ...incoming,
            finding_id: prev.finding_id,
            status: prev.status,
            history: prev.history,
          };
          changed = true;
          return merged;
        });

        // Append brand-new findings not yet in the project
        const existingIds = new Set(existing.findings.map((f) => f.finding_id));
        const newFindings = projectFindings.filter((f) => !existingIds.has(f.finding_id));
        if (newFindings.length > 0) {
          updatedFindings.push(...newFindings);
          changed = true;
          findingsImported += newFindings.length;
        }

        if (changed) {
          await repo.update({
            ...existing,
            findings: updatedFindings,
            lastUpdated: now,
          });
          existingByName.set(normalizedProjectName, {
            ...existing,
            findings: updatedFindings,
            lastUpdated: now,
          });
          projectsUpdated++;
        }
      } else {
        const project: Project = {
          name: projectName,
          findings: projectFindings,
          lastUpdated: now,
          status: "active",
          sourceType: "import",
        };
        await repo.create(project);
        existingByName.set(normalizedProjectName, project);
        findingsImported += projectFindings.length;
        projectsUpdated++;
      }
    }

    await recordDurableEventBestEffort({
      event_type: "audit_sync",
      project_name: fallbackProject,
      source: "audit_sync_route",
      summary: "Synced audit findings into project storage",
      payload: {
        projects_updated: projectsUpdated,
        findings_imported: findingsImported,
        findings_dropped_as_degraded: findingsDroppedAsDegraded,
      },
    });
    return NextResponse.json({
      projects_updated: projectsUpdated,
      findings_imported: findingsImported,
      findings_rejected: invalidFindings.length,
      findings_dropped_as_degraded: findingsDroppedAsDegraded,
      ...(invalidFindings.length > 0 && { invalid_findings: invalidFindings }),
      message:
        findingsImported > 0
          ? `Imported ${findingsImported} findings across ${projectsUpdated} project(s).${findingsDroppedAsDegraded > 0 ? ` ${findingsDroppedAsDegraded} degraded placeholder finding(s) were dropped.` : ""}${invalidFindings.length > 0 ? ` ${invalidFindings.length} rejected (schema violations).` : ""}`
          : `All findings already present — nothing new to import.${findingsDroppedAsDegraded > 0 ? ` ${findingsDroppedAsDegraded} degraded placeholder finding(s) were dropped.` : ""}${invalidFindings.length > 0 ? ` ${invalidFindings.length} rejected (schema violations).` : ""}`,
    });
  } catch (error) {
    console.error("POST /api/sync/audit", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}
