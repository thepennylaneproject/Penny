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
  onUndoSuccess?: () => void;
  onUndoError?: (error: Error) => void;
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
          performUndo: async () => {
            const restoreResponse = await apiFetch("/api/projects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(project),
            });

            if (!restoreResponse.ok) {
              const message = await restoreResponse
                .json()
                .then((data: unknown) => {
                  if (data && typeof data === "object" && "error" in data) {
                    return String((data as { error?: unknown }).error ?? restoreResponse.statusText);
                  }
                  return restoreResponse.statusText;
                })
                .catch(() => restoreResponse.statusText);
              throw new Error(`Failed to restore project: ${message}`);
            }

            options?.onUndoSuccess?.();
          },
          data: {
            projectName: project.name,
            label: `Removed project "${project.name}"`,
            project,
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
