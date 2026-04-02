import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository-instance";
import { parseOpenFindingsPayload } from "@/lib/repository";
import type { Finding, Project } from "@/lib/types";
import { apiErrorMessage } from "@/lib/api-error";
import { normalizeMaintenanceBacklog } from "@/lib/maintenance-backlog";
import {
  upsertMaintenanceBacklogItems,
} from "@/lib/maintenance-store";
import { hasSupabaseProjectsStore } from "@/lib/store-supabase";
import { mergeImportedFindings, type ImportSummary } from "@/lib/import-summary";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const projectName = typeof body.name === "string" ? body.name.trim() : "";
    if (!projectName) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      );
    }
    const raw =
      typeof body.json === "string"
        ? body.json
        : typeof body.open_findings !== "undefined"
          ? JSON.stringify({ open_findings: body.open_findings })
          : "";
    if (!raw) {
      return NextResponse.json(
        { error: "JSON or open_findings array is required" },
        { status: 400 }
      );
    }
    const { findings: importedFindings } = parseOpenFindingsPayload(raw);

    // mode: "merge" (default) merges by finding_id; "replace" overwrites all findings.
    const mode: "merge" | "replace" =
      body.mode === "replace" ? "replace" : "merge";

    const repo = getRepository();
    const existing = await repo.getByName(projectName);
    const totalBefore = existing?.findings?.length ?? 0;

    let findings: Finding[];
    let summary: ImportSummary;

    if (mode === "replace") {
      const removed = totalBefore;
      const totalAfter = importedFindings.length;
      findings = importedFindings;
      summary = {
        mode: "replace",
        created: !existing,
        added: totalAfter,
        updated: 0,
        unchanged: 0,
        removed,
        total_before: totalBefore,
        total_after: totalAfter,
      };
    } else {
      const existingFindings = existing?.findings ?? [];
      const merged = mergeImportedFindings(existingFindings, importedFindings);
      findings = merged.findings;
      summary = {
        mode: "merge",
        created: !existing,
        added: merged.added,
        updated: merged.updated,
        unchanged: merged.unchanged,
        removed: 0,
        total_before: totalBefore,
        total_after: findings.length,
      };
    }

    const project: Project = {
      name: existing?.name ?? projectName,
      findings,
      lastUpdated: new Date().toISOString(),
      repositoryUrl:
        typeof body.repositoryUrl === "string"
          ? body.repositoryUrl.trim() || undefined
          : existing?.repositoryUrl,
      stack: existing?.stack,
      status: existing?.status ?? "active",
      sourceType: existing?.sourceType ?? "import",
      sourceRef: existing?.sourceRef,
      auditConfig: existing?.auditConfig,
      profile: existing?.profile,
      expectations: existing?.expectations,
      onboardingState: existing?.onboardingState,
      decisionHistory: existing?.decisionHistory,
      profileSummary: existing?.profileSummary,
      manifest: existing?.manifest,
      maintenanceBacklog: existing?.maintenanceBacklog,
      maintenanceTasks: existing?.maintenanceTasks,
    };

    if (existing) {
      await repo.update(project);
      if (hasSupabaseProjectsStore()) {
        await upsertMaintenanceBacklogItems(
          project.name,
          normalizeMaintenanceBacklog(project.name, project.findings)
        );
      }
      return NextResponse.json({
        project,
        created: false,
        mode,
        import_summary: summary,
      });
    }
    await repo.create(project);
    if (hasSupabaseProjectsStore()) {
      await upsertMaintenanceBacklogItems(
        project.name,
        normalizeMaintenanceBacklog(project.name, project.findings)
      );
    }
    return NextResponse.json({
      project,
      created: true,
      mode,
      import_summary: summary,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("No findings array") || message.includes("JSON")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("POST /api/import", e);
    return NextResponse.json({ error: apiErrorMessage(e) }, { status: 500 });
  }
}
