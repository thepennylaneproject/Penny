"use client";

/**
 * useProjectRemovalUndo — handles project removal with undo capability.
 *
 * Performs optimistic project removal with ability to undo within 5-second window.
 */

import { useCallback } from "react";
import { useUndo } from "@/contexts/UndoContext";
import { apiFetch } from "@/lib/api-fetch";
import type { Project } from "@/lib/types";

export interface UseProjectRemovalUndoOptions {
  onRemoveSuccess?: () => void;
  onRemoveError?: (error: Error) => void;
}

export function useProjectRemovalUndo(options?: UseProjectRemovalUndoOptions) {
  const { setUndoState } = useUndo();

  const removeProject = useCallback(
    async (project: Project) => {
      try {
        // Perform the removal
        const response = await apiFetch(
          `/api/projects/${encodeURIComponent(project.name)}`,
          { method: "DELETE" }
        );

        if (!response.ok) {
          throw new Error(`Failed to remove project: ${response.statusText}`);
        }

        // Set undo state so user can recover
        setUndoState({
          action: "remove_project",
          timestamp: new Date(),
          data: {
            projectName: project.name,
            label: `Removed project "${project.name}"`,
          },
        });

        options?.onRemoveSuccess?.();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        options?.onRemoveError?.(err);
        throw err;
      }
    },
    [setUndoState, options]
  );

  return { removeProject };
}
