import type { AuditKind, DecisionEvent } from "./types";

export function makeDecisionEvent(
  actor: string,
  eventType: string,
  targetType: DecisionEvent["target_type"],
  extras: Partial<DecisionEvent> = {}
): DecisionEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    actor,
    event_type: eventType,
    target_type: targetType,
    ...extras,
  };
}

export function summarizeAuditDecision(
  actor: string,
  eventType: string,
  targetType: DecisionEvent["target_type"],
  args: {
    auditKind?: AuditKind;
    scopeType?: DecisionEvent["scope_type"];
    scopePaths?: string[];
    notes?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  }
): DecisionEvent {
  return makeDecisionEvent(actor, eventType, targetType, {
    notes: args.notes,
    audit_kind: args.auditKind,
    scope_type: args.scopeType,
    scope_paths: args.scopePaths,
    before: args.before,
    after: args.after,
  });
}
