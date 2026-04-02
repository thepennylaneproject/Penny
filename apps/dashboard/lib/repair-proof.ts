import type { RepairJob, RepairProof } from "./types";
import { isStaleRecoveryError } from "./job-timeouts";

export type RepairProofVerificationStatus = "passed" | "failed" | "not_run";

export function normalizeReportedRepairStatus(
  status: unknown
): "completed" | "failed" | "applied" | null {
  return status === "completed" || status === "failed" || status === "applied"
    ? status
    : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
    : [];
}

export function parseRepairProof(value: unknown): RepairProof | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;
  const artifacts =
    typeof obj.artifacts === "object" && obj.artifacts !== null
      ? (obj.artifacts as Record<string, unknown>)
      : null;
  const evaluation =
    typeof obj.evaluation === "object" && obj.evaluation !== null
      ? (obj.evaluation as Record<string, unknown>)
      : null;
  const verification =
    typeof obj.verification === "object" && obj.verification !== null
      ? (obj.verification as Record<string, unknown>)
      : null;

  if (
    obj.source !== "repair_engine" ||
    !isNonEmptyString(obj.generated_at) ||
    !isNonEmptyString(obj.selected_node_id) ||
    !artifacts ||
    !evaluation ||
    !verification ||
    !isNonEmptyString(artifacts.summary_path) ||
    !isNonEmptyString(artifacts.tree_path) ||
    typeof evaluation.candidate_passed !== "boolean" ||
    typeof evaluation.apply_ok !== "boolean" ||
    typeof evaluation.compile_ok !== "boolean" ||
    typeof evaluation.lint_ok !== "boolean" ||
    typeof evaluation.tests_ok !== "boolean" ||
    (verification.status !== "passed" &&
      verification.status !== "failed" &&
      verification.status !== "not_run") ||
    !isNonEmptyString(verification.summary)
  ) {
    return null;
  }

  return {
    source: "repair_engine",
    generated_at: obj.generated_at,
    selected_node_id: obj.selected_node_id,
    artifacts: {
      summary_path: artifacts.summary_path,
      tree_path: artifacts.tree_path,
    },
    evaluation: {
      candidate_passed: evaluation.candidate_passed,
      apply_ok: evaluation.apply_ok,
      compile_ok: evaluation.compile_ok,
      lint_ok: evaluation.lint_ok,
      tests_ok: evaluation.tests_ok,
      warnings:
        typeof evaluation.warnings === "number" ? evaluation.warnings : undefined,
      exit_code:
        typeof evaluation.exit_code === "number" ? evaluation.exit_code : undefined,
      reasons: asStringArray(evaluation.reasons),
    },
    verification: {
      status: verification.status,
      summary: verification.summary,
      commands_declared: asStringArray(verification.commands_declared),
    },
  };
}

export function isRepairProofReviewable(
  proof: RepairProof | null,
  appliedFiles: string[]
): boolean {
  if (!proof) return false;
  if (!proof.evaluation.candidate_passed || !proof.evaluation.apply_ok) return false;
  if (proof.verification.status !== "passed") return false;
  return appliedFiles.length > 0;
}

export function repairProofState(job: RepairJob | undefined): "reviewable" | "missing" | "none" {
  if (!job?.patch_applied) return "none";
  return isRepairProofReviewable(job.repair_proof ?? null, job.applied_files ?? [])
    ? "reviewable"
    : "missing";
}

export function repairLedgerCaption(job: RepairJob | undefined, queuedInUi: boolean): string {
  if (job) {
    if (job.status === "queued") return "Queued for repair.";
    if (job.status === "running") return "Repair is running.";
    if (job.status === "failed") {
      return isStaleRecoveryError(job.error)
        ? "Repair timed out and was recovered safely. Queue it again to retry."
        : "Repair failed.";
    }
    if (job.patch_applied) {
      return repairProofState(job) === "reviewable"
        ? "Patch applied with reviewable proof. Ready for verification."
        : "Patch was reported, but reviewable proof is missing. Manual review is required before changing status.";
    }
    if (job.status === "completed") return "Repair completed.";
    if (job.status === "cancelled") return "Repair was cancelled.";
    return `Ledger row: ${job.status}`;
  }
  if (queuedInUi) return "Queued locally; waiting for ledger refresh.";
  return "No repair job yet.";
}
