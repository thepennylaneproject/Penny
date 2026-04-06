import type { LaneAuditFinding } from "./lane-client.js";

const DEGRADED_AUDIT_MESSAGE_PATTERN = /could not complete a full model-backed audit/i;

export function isLaneDegradedAuditFinding(finding: LaneAuditFinding): boolean {
  return DEGRADED_AUDIT_MESSAGE_PATTERN.test(finding.message ?? "");
}

