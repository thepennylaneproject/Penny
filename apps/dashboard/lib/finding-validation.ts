/**
 * Runtime validation helpers for Finding and Project payloads.
 * Validates enum fields and required properties without adding external deps.
 */

import type { Finding, FindingType, FindingStatus, Severity, Priority } from "./types";

export const VALID_FINDING_TYPES: FindingType[] = ["bug", "enhancement", "debt", "question"];
export const VALID_STATUSES: FindingStatus[] = [
  "open",
  "accepted",
  "assigned",
  "in_progress",
  "fixed_pending_verify",
  "fixed_verified",
  "wont_fix",
  "deferred",
  "duplicate",
  "converted_to_enhancement",
];
export const VALID_SEVERITIES: Severity[] = ["blocker", "major", "minor", "nit"];
export const VALID_PRIORITIES: Priority[] = ["P0", "P1", "P2", "P3"];

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate a full Finding payload. Returns an array of validation errors;
 * an empty array means the finding is valid.
 */
export function validateFinding(f: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!f || typeof f !== "object") {
    return [{ field: "finding", message: "Finding must be an object" }];
  }
  const finding = f as Record<string, unknown>;

  if (!finding.finding_id || typeof finding.finding_id !== "string" || finding.finding_id.trim() === "") {
    errors.push({ field: "finding_id", message: "finding_id is required and must be a non-empty string" });
  }
  if (!finding.title || typeof finding.title !== "string" || finding.title.trim() === "") {
    errors.push({ field: "title", message: "title is required and must be a non-empty string" });
  }
  if (finding.type !== undefined && !VALID_FINDING_TYPES.includes(finding.type as FindingType)) {
    errors.push({
      field: "type",
      message: `type must be one of: ${VALID_FINDING_TYPES.join(", ")}`,
    });
  }
  if (finding.status !== undefined && !VALID_STATUSES.includes(finding.status as FindingStatus)) {
    errors.push({
      field: "status",
      message: `status must be one of: ${VALID_STATUSES.join(", ")}`,
    });
  }
  if (finding.severity !== undefined && !VALID_SEVERITIES.includes(finding.severity as Severity)) {
    errors.push({
      field: "severity",
      message: `severity must be one of: ${VALID_SEVERITIES.join(", ")}`,
    });
  }
  if (finding.priority !== undefined && !VALID_PRIORITIES.includes(finding.priority as Priority)) {
    errors.push({
      field: "priority",
      message: `priority must be one of: ${VALID_PRIORITIES.join(", ")}`,
    });
  }
  if (!Array.isArray(finding.proof_hooks) || (finding.proof_hooks as unknown[]).length === 0) {
    errors.push({ field: "proof_hooks", message: "proof_hooks is required and must be a non-empty array" });
  }
  if (!Array.isArray(finding.history) || (finding.history as unknown[]).length === 0) {
    errors.push({ field: "history", message: "history is required and must be a non-empty array" });
  }

  return errors;
}

/**
 * Validate a Partial<Finding> update. Only validates fields that are present.
 */
export function validatePartialFinding(f: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!f || typeof f !== "object") {
    return [{ field: "finding", message: "Payload must be an object" }];
  }
  const patch = f as Record<string, unknown>;

  if (patch.status !== undefined && !VALID_STATUSES.includes(patch.status as FindingStatus)) {
    errors.push({
      field: "status",
      message: `status must be one of: ${VALID_STATUSES.join(", ")}`,
    });
  }
  if (patch.type !== undefined && !VALID_FINDING_TYPES.includes(patch.type as FindingType)) {
    errors.push({
      field: "type",
      message: `type must be one of: ${VALID_FINDING_TYPES.join(", ")}`,
    });
  }
  if (patch.severity !== undefined && !VALID_SEVERITIES.includes(patch.severity as Severity)) {
    errors.push({
      field: "severity",
      message: `severity must be one of: ${VALID_SEVERITIES.join(", ")}`,
    });
  }
  if (patch.priority !== undefined && !VALID_PRIORITIES.includes(patch.priority as Priority)) {
    errors.push({
      field: "priority",
      message: `priority must be one of: ${VALID_PRIORITIES.join(", ")}`,
    });
  }

  return errors;
}

/**
 * Check if a finding_id already exists in a findings array.
 */
export function isDuplicateFindingId(findings: Finding[], findingId: string): boolean {
  return findings.some((f) => f.finding_id === findingId);
}

/**
 * Check whether a composite `(projectName, findingId)` key is present in a
 * Set that uses `"projectName:findingId"` composite keys (server-backed queue only).
 */
export function isInQueuedSet(
  queuedIds: Set<string> | undefined,
  projectName: string,
  findingId: string
): boolean {
  if (!queuedIds) return false;
  return queuedIds.has(`${projectName}:${findingId}`);
}
