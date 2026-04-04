import { NextResponse } from "next/server";
import { recordDurableEvent } from "@/lib/durable-state";
import { updateRepairJobCompletion } from "@/lib/maintenance-store";
import { getRepository } from "@/lib/repository-instance";
import { apiErrorMessage } from "@/lib/api-error";

/**
 * POST /api/engine/complete
 *
 * Called by the Python repair engine when a repair run completes.
 * Updates the repair job status and transitions the finding to fixed_pending_verify if patch was applied.
 *
 * Request body:
 * {
 *   finding_id: string,
 *   project_name: string,
 *   run_id: string,
 *   status: "completed" | "failed" | "applied",
 *   patch_applied?: boolean,
 *   applied_files?: string[],
 *   provider_used?: string,
 *   model_used?: string,
 *   routing_lane?: string,
 *   routing_strategy?: string,
 *   routing_usage?: object,
 *   error?: string,
 *   message?: string
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const findingId =
      typeof body.finding_id === "string" ? body.finding_id.trim() : "";
    const projectName =
      typeof body.project_name === "string" ? body.project_name.trim() : "";
    const runId = typeof body.run_id === "string" ? body.run_id.trim() : "";
    const status = body.status as "completed" | "failed" | "applied" | undefined;
    const patchApplied =
      typeof body.patch_applied === "boolean" ? body.patch_applied : undefined;
    const appliedFiles = Array.isArray(body.applied_files)
      ? body.applied_files.map((f: unknown) => String(f).trim())
      : [];
    const error =
      typeof body.error === "string" ? body.error.trim() : undefined;
    const message =
      typeof body.message === "string" ? body.message.trim() : undefined;
    const providerUsed =
      typeof body.provider_used === "string" ? body.provider_used.trim() : undefined;
    const modelUsed =
      typeof body.model_used === "string" ? body.model_used.trim() : undefined;
    const routingLane =
      typeof body.routing_lane === "string" ? body.routing_lane.trim() : undefined;
    const routingStrategy =
      typeof body.routing_strategy === "string"
        ? body.routing_strategy.trim()
        : undefined;
    const routingUsage =
      body.routing_usage && typeof body.routing_usage === "object"
        ? (body.routing_usage as Record<string, unknown>)
        : undefined;

    if (!findingId || !projectName || !runId) {
      return NextResponse.json(
        { error: "finding_id, project_name, and run_id are required" },
        { status: 400 }
      );
    }

    if (!status || !["completed", "failed", "applied"].includes(status)) {
      return NextResponse.json(
        {
          error: 'status must be one of: "completed", "failed", "applied"',
        },
        { status: 400 }
      );
    }

    const storeStatus: "completed" | "failed" =
      status === "failed" ? "failed" : "completed";

    // Update repair job record
    const updatedJob = await updateRepairJobCompletion({
      finding_id: findingId,
      project_name: projectName,
      status: storeStatus,
      reported_status: status,
      patch_applied: patchApplied,
      applied_files: appliedFiles,
      error,
      run_id: runId,
      provider_used: providerUsed,
      model_used: modelUsed,
      routing_lane: routingLane,
      routing_strategy: routingStrategy,
      routing_usage: routingUsage,
    });

    // If patch was applied, update the finding status to fixed_pending_verify
    if (patchApplied && status === "applied") {
      const repo = getRepository();
      const project = await repo.getByName(projectName);

      if (project) {
        const finding = project.findings.find(
          (f) => f.finding_id === findingId
        );

        if (finding) {
          finding.status = "fixed_pending_verify";
          finding.verified_at = new Date().toISOString();

          // Add history entry
          if (!finding.decision_history) {
            finding.decision_history = [];
          }
          finding.decision_history.push({
            timestamp: new Date().toISOString(),
            decision: "patch_applied_by_engine",
            metadata: {
              run_id: runId,
              applied_files: appliedFiles,
              message,
            },
          });

          await repo.update(project);
        }
      }
    }

    // Record durable event
    await recordDurableEvent({
      event_type: "repair_complete",
      project_name: projectName,
      source: "repair_engine",
      summary: `Repair ${status} for finding ${findingId}${
        patchApplied ? " with patch applied" : ""
      }`,
      payload: {
        finding_id: findingId,
        run_id: runId,
        status,
        patch_applied: patchApplied,
        applied_files: appliedFiles,
        provider_used: providerUsed,
        model_used: modelUsed,
        routing_lane: routingLane,
        routing_strategy: routingStrategy,
        routing_usage: routingUsage,
        error,
        message,
      },
    });

    return NextResponse.json({
      success: true,
      job: updatedJob,
      message: `Repair job updated to status: ${status}`,
    });
  } catch (error) {
    console.error("POST /api/engine/complete", error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: 500 }
    );
  }
}
