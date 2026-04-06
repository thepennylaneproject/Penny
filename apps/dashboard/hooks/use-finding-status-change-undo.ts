"use client";

/**
 * useFindingStatusChangeUndo — handles finding status changes with undo capability.
 *
 * Performs optimistic status change with ability to undo within 5-second window.
 */

import { useCallback } from "react";
import { useUndo } from "@/contexts/UndoContext";
import { apiFetch } from "@/lib/api-fetch";

export interface UseFindingStatusChangeUndoOptions {
  onChangeSuccess?: () => void;
  onChangeError?: (error: Error) => void;
}

export function useFindingStatusChangeUndo(options?: UseFindingStatusChangeUndoOptions) {
  const { setUndoState } = useUndo();

  const changeFindingStatus = useCallback(
    async (
      projectName: string,
      findingId: string,
      newStatus: string,
      previousStatus: string
    ) => {
      try {
        // Perform the status change
        const response = await apiFetch(
          `/api/projects/${encodeURIComponent(projectName)}/findings/${encodeURIComponent(findingId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ status: newStatus }),
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to change finding status: ${response.statusText}`);
        }

        // Set undo state so user can recover
        setUndoState({
          action: "change_finding_status",
          timestamp: new Date(),
          data: {
            projectName,
            findingId,
            previousStatus,
            newStatus,
            label: `Changed finding status to "${newStatus}"`,
          },
        });

        options?.onChangeSuccess?.();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        options?.onChangeError?.(err);
        throw err;
      }
    },
    [setUndoState, options]
  );

  return { changeFindingStatus };
}
