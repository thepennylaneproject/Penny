/**
 * Repair job status state machine.
 *
 * Tracks the lifecycle of repair jobs from submission through completion.
 * Used for real-time feedback on long-running repair operations.
 */

export type RepairJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

/**
 * Valid transitions for repair job status.
 * Repair jobs are generally unidirectional: queued → running → terminal state
 */
export const REPAIR_STATUS_TRANSITIONS: Record<RepairJobStatus, RepairJobStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: ["cancelled"],
  cancelled: [],
};

/**
 * Check if a repair status transition is valid.
 */
export function isValidRepairTransition(
  from: RepairJobStatus,
  to: RepairJobStatus
): boolean {
  return REPAIR_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Human-readable labels for repair job status.
 */
export const REPAIR_STATUS_LABELS: Record<RepairJobStatus, string> = {
  queued: "Queued",
  running: "Generating Fix",
  completed: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
};

/**
 * Guidance for each repair status.
 */
export const REPAIR_STATUS_GUIDANCE: Record<
  RepairJobStatus,
  { title: string; description: string; icon: string }
> = {
  queued: {
    title: "Waiting in Queue",
    description:
      "Your repair request has been submitted and is waiting to be processed. This typically takes a few seconds.",
    icon: "⏳",
  },
  running: {
    title: "Generating Fix",
    description:
      "The repair system is analyzing the finding and generating a fix. This may take a minute or two depending on complexity.",
    icon: "⚙️",
  },
  completed: {
    title: "Fix Generated",
    description:
      "A fix has been successfully generated and is ready for review. You can examine the patch and apply it manually or automatically.",
    icon: "✓",
  },
  failed: {
    title: "Repair Failed",
    description:
      "The repair system was unable to generate a fix for this finding. Review the error details or try again.",
    icon: "✗",
  },
  cancelled: {
    title: "Repair Cancelled",
    description: "The repair job was cancelled before completion.",
    icon: "—",
  },
};

/**
 * Estimate time remaining based on current status.
 * Used to provide user guidance on expected duration.
 */
export function estimateTimeRemaining(
  status: RepairJobStatus,
  elapsedSeconds: number
): string {
  if (status === "queued") {
    return "A few seconds";
  }
  if (status === "running") {
    if (elapsedSeconds < 30) return "About a minute";
    if (elapsedSeconds < 90) return "Less than a minute";
    return "Processing...";
  }
  return "";
}

/**
 * Determine if a repair job is in a terminal state.
 */
export function isRepairTerminal(status: RepairJobStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

/**
 * Color scheme for repair job status badges.
 */
export const REPAIR_STATUS_COLOR: Record<
  RepairJobStatus,
  { text: string; background: string; border: string }
> = {
  queued: {
    text: "var(--ink-text)",
    background: "var(--ink-bg-sunken)",
    border: "var(--ink-border)",
  },
  running: {
    text: "var(--ink-blue)",
    background: "rgba(66, 135, 245, 0.1)",
    border: "var(--ink-blue)",
  },
  completed: {
    text: "var(--ink-green)",
    background: "rgba(52, 168, 83, 0.1)",
    border: "var(--ink-green)",
  },
  failed: {
    text: "var(--ink-red)",
    background: "rgba(239, 68, 68, 0.1)",
    border: "var(--ink-red)",
  },
  cancelled: {
    text: "var(--ink-text-3)",
    background: "var(--ink-bg-sunken)",
    border: "var(--ink-border-faint)",
  },
};
