/**
 * Undo state machine for reversible actions.
 *
 * Provides a safe way to perform destructive actions with an undo window.
 * Users can recover from mistakes within a 5-second window.
 */

import type { Project } from "./types";

export type UndoableAction = "remove_project" | "change_finding_status" | "delete_finding";

export interface UndoState {
  action: UndoableAction;
  timestamp: Date;
  performUndo: () => Promise<void>;
  data: {
    projectName?: string;
    findingId?: string;
    previousStatus?: string;
    newStatus?: string;
    project?: Project;
    label: string;
  };
}

/**
 * Default undo window duration (milliseconds).
 * Users can undo within this window after a destructive action.
 */
export const UNDO_WINDOW_MS = 5000; // 5 seconds

/**
 * Get human-readable label for an undo action.
 */
export function getUndoLabel(action: UndoableAction, data: UndoState["data"]): string {
  switch (action) {
    case "remove_project":
      return `Removed project "${data.projectName}"`;
    case "change_finding_status":
      return data.previousStatus
        ? `Marked as "${data.newStatus}" — tap Undo to restore "${data.previousStatus}"`
        : `Marked as "${data.newStatus}"`;
    case "delete_finding":
      return `Deleted finding`;
    default:
      return "Undo action";
  }
}

/**
 * Check if an undo state is still valid (within undo window).
 */
export function isUndoValid(undoState: UndoState): boolean {
  const elapsed = Date.now() - undoState.timestamp.getTime();
  return elapsed < UNDO_WINDOW_MS;
}

/**
 * Get remaining time in undo window (milliseconds).
 */
export function getRemainingUndoTime(undoState: UndoState): number {
  const elapsed = Date.now() - undoState.timestamp.getTime();
  const remaining = UNDO_WINDOW_MS - elapsed;
  return Math.max(0, remaining);
}

/**
 * Format remaining time for display.
 */
export function formatUndoTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${seconds}s`;
}

/**
 * Context shape for undo operations.
 */
export interface UndoContextValue {
  undoState: UndoState | null;
  canUndo: boolean;
  remainingTime: number;
  isUndoing: boolean;
  undoError: string | null;
  undo: () => Promise<void>;
  clear: () => void;
  setUndoState: (state: UndoState | null) => void;
}

export const UNDO_SUCCESS_EVENT = "penny:undo-success";

export interface UndoSuccessDetail {
  action: UndoableAction;
  data: UndoState["data"];
}
