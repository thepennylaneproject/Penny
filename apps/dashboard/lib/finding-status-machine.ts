/**
 * Finding status state machine.
 *
 * Defines valid state transitions to ensure findings flow logically through
 * their lifecycle. Prevents invalid jumps (e.g., open → fixed_verified without
 * evidence of work).
 */

import type { FindingStatus } from "@/lib/types";

/**
 * Valid transitions from each status.
 * Maps current status → array of allowed next statuses.
 */
export const STATUS_TRANSITIONS: Record<FindingStatus, FindingStatus[]> = {
  // New finding: can be accepted, deferred, won't fix, or marked duplicate
  open: ["accepted", "wont_fix", "deferred", "duplicate"],

  // Acknowledged: can start work, defer, or mark duplicate
  accepted: ["in_progress", "wont_fix", "deferred", "duplicate"],

  // Working: can mark as fixed, or revert to accepted if hitting issues
  in_progress: ["fixed_pending_verify", "accepted", "wont_fix", "deferred"],

  // Fixed but unverified: can verify, revert to accepted if issues found, or defer
  fixed_pending_verify: ["fixed_verified", "accepted", "in_progress"],

  // Fixed and verified: resolved, no further transitions allowed
  fixed_verified: [],

  // Won't fix: resolved, no transitions
  wont_fix: [],

  // Deferred: can reopen to accepted when ready to resume
  deferred: ["accepted"],

  // Duplicate: can reopen to accepted if needed
  duplicate: ["accepted"],

  // Converted to enhancement: resolved, no transitions
  converted_to_enhancement: [],
};

/**
 * Check if a transition is valid.
 */
export function isValidTransition(from: FindingStatus, to: FindingStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Get allowed next statuses for a given status.
 */
export function getNextStatuses(status: FindingStatus): FindingStatus[] {
  return STATUS_TRANSITIONS[status];
}

/**
 * Categorize statuses for UI grouping and styling.
 */
export const STATUS_CATEGORIES = {
  active: new Set<FindingStatus>(["open", "accepted", "in_progress"]),
  pending: new Set<FindingStatus>(["fixed_pending_verify"]),
  resolved: new Set<FindingStatus>([
    "fixed_verified",
    "wont_fix",
    "deferred",
    "duplicate",
    "converted_to_enhancement",
  ]),
} as const;

/**
 * Get the category for a status.
 */
export function getStatusCategory(
  status: FindingStatus
): "active" | "pending" | "resolved" {
  if (STATUS_CATEGORIES.active.has(status)) return "active";
  if (STATUS_CATEGORIES.pending.has(status)) return "pending";
  return "resolved";
}

/**
 * Human-readable transition labels for UI.
 */
export const TRANSITION_LABELS: Record<FindingStatus, string> = {
  open: "New",
  accepted: "Accepted",
  in_progress: "In Progress",
  fixed_pending_verify: "Fixed (Verify)",
  fixed_verified: "Fixed",
  wont_fix: "Won't Fix",
  deferred: "Deferred",
  duplicate: "Duplicate",
  converted_to_enhancement: "Converted to Enhancement",
};

/**
 * Guidance for each status — explains current state and what can happen next.
 */
export const STATUS_GUIDANCE: Record<FindingStatus, { title: string; description: string }> = {
  open: {
    title: "New Finding",
    description: "This finding is new and unresolved. You can accept it, defer it, mark it as duplicate, or decide not to fix it.",
  },
  accepted: {
    title: "Acknowledged",
    description: "You've acknowledged this finding. Next, you can start work, decide not to fix it, or defer it.",
  },
  in_progress: {
    title: "In Progress",
    description: "You're working on a fix. When ready, mark it as fixed (pending verification) or revert if you hit issues.",
  },
  fixed_pending_verify: {
    title: "Fixed (Awaiting Verification)",
    description: "The fix is implemented. Next, you'll verify it works, or revert it if issues surface.",
  },
  fixed_verified: {
    title: "Fixed & Verified",
    description: "This finding is resolved. No further actions needed.",
  },
  wont_fix: {
    title: "Won't Fix",
    description: "You've decided not to fix this. No further actions needed.",
  },
  deferred: {
    title: "Deferred",
    description: "This fix is postponed for later. You can reopen it anytime.",
  },
  duplicate: {
    title: "Duplicate",
    description: "This is a duplicate of another finding. You can reopen it if needed.",
  },
  converted_to_enhancement: {
    title: "Converted to Enhancement",
    description: "This has been converted to an enhancement request. No further actions needed.",
  },
};
