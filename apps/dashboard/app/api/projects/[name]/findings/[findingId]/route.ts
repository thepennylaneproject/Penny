import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository-instance";
import type { Finding, FindingStatus } from "@/lib/types";
import { apiErrorMessage } from "@/lib/api-error";
import { validatePartialFinding } from "@/lib/finding-validation";
import { summarizeAuditDecision } from "@/lib/onboarding-pure";
import { normalizeMaintenanceBacklog } from "@/lib/maintenance-backlog";
import { upsertMaintenanceBacklogItems } from "@/lib/maintenance-store";
import { hasSupabaseProjectsStore } from "@/lib/store-supabase";

type Params = { params: Promise<{ name: string; findingId: string }> };

const VALID_STATUSES: FindingStatus[] = [
  "open",
  "accepted",
  "in_progress",
  "fixed_pending_verify",
  "fixed_verified",
  "wont_fix",
  "deferred",
  "duplicate",
  "converted_to_enhancement",
];

/** Fields allowed in a PATCH body; everything else is ignored. */
interface FindingPatchDTO {
  status?: FindingStatus;
  notes?: string;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { name, findingId } = await params;
    const id = decodeURIComponent(findingId);
    const raw = (await request.json()) as Partial<Finding> & { notes?: string };
    const errors = validatePartialFinding(raw);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: "Validation failed", details: errors },
        { status: 422 }
      );
    }
    const repo = getRepository();
    const project = await repo.getByName(decodeURIComponent(name));
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const findings = project.findings ?? [];
    const index = findings.findIndex((f) => f.finding_id === id);
    if (index === -1) {
      return NextResponse.json({ error: "Finding not found" }, { status: 404 });
    }

    // Validate status if provided
    if (raw.status !== undefined) {
      if (!VALID_STATUSES.includes(raw.status as FindingStatus)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
          { status: 422 }
        );
      }
    }

    // Accept only the narrow DTO fields
    const patch: FindingPatchDTO = {
      ...(raw.status !== undefined ? { status: raw.status as FindingStatus } : {}),
      ...(typeof raw.notes === "string" ? { notes: raw.notes } : {}),
    };

    const existing = findings[index];
    const updatedFinding: Finding = {
      ...existing,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      finding_id: existing.finding_id,
    };

    // Only append history on a real status transition
    if (patch.status !== undefined && patch.status !== existing.status) {
      const history = [...(existing.history ?? [])];
      history.push({
        timestamp: new Date().toISOString(),
        actor: "dashboard",
        event: patch.status,
        notes: patch.notes ?? `Status changed to ${patch.status}`,
      });
      updatedFinding.history = history;
    }

    const newFindings = [...findings];
    newFindings[index] = updatedFinding;
    const decisionHistory = [...(project.decisionHistory ?? [])];
    if (patch.status !== undefined && patch.status !== existing.status) {
      decisionHistory.push(
        summarizeAuditDecision("dashboard", "finding_status_changed", "finding", {
          notes: patch.notes ?? `Status changed to ${patch.status}`,
          before: { status: existing.status, finding_id: existing.finding_id },
          after: { status: patch.status, finding_id: existing.finding_id },
        })
      );
    }
    await repo.update({ ...project, findings: newFindings, decisionHistory });
    if (hasSupabaseProjectsStore()) {
      await upsertMaintenanceBacklogItems(
        project.name,
        normalizeMaintenanceBacklog(project.name, newFindings)
      );
    }
    return NextResponse.json(updatedFinding);
  } catch (error) {
    console.error("PATCH /api/projects/[name]/findings/[findingId]", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}
