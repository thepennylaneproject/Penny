const DEGRADED_AUDIT_MESSAGE_PATTERN = /could not complete a full model-backed audit/i;

function extractFindingText(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const finding = input as Record<string, unknown>;

  if (typeof finding.message === "string") return finding.message;
  if (typeof finding.description === "string") return finding.description;
  if (typeof finding.title === "string") return finding.title;

  return "";
}

export function isDegradedAuditPlaceholderFinding(input: unknown): boolean {
  return DEGRADED_AUDIT_MESSAGE_PATTERN.test(extractFindingText(input));
}

