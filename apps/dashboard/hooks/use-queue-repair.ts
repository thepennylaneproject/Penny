"use client";

import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";

type Args = {
  fetchQueue: () => Promise<void>;
};

/**
 * Single path for POST /api/engine/queue + server reconciliation via fetchQueue.
 */
export function useQueueRepair({ fetchQueue }: Args) {
  const [queueActionError, setQueueActionError] = useState<string | null>(null);
  const [queueWarning, setQueueWarning] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);

  const queueRepair = useCallback(
    async (findingId: string, projectName: string) => {
      const res = await apiFetch("/api/engine/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finding_id: findingId, project_name: projectName }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
          hint?: string;
          existing_job_id?: string;
        };
        // Duplicate job is a soft conflict, not a hard error.
        if (body.error === "duplicate_repair_job") {
          await fetchQueue();
          return;
        }
        const msg =
          typeof body.message === "string"
            ? body.message
            : typeof body.error === "string"
              ? body.error
              : `Could not queue repair (${res.status}). Try again.`;
        const hint = typeof body.hint === "string" ? body.hint : "";
        throw new Error(hint ? `${msg} ${hint}` : msg);
      }
      const data = (await res.json().catch(() => ({}))) as { warnings?: string[] };
      if (data.warnings?.length) {
        setQueueWarning(data.warnings[0]);
      }
      await fetchQueue();
    },
    [fetchQueue]
  );

  const runQueueRepair = useCallback(
    async (findingId: string, projectName: string) => {
      setQueueActionError(null);
      setQueueWarning(null);
      setQueueing(true);
      try {
        await queueRepair(findingId, projectName);
      } catch (e) {
        setQueueActionError(
          e instanceof Error ? e.message : "Could not queue repair."
        );
      } finally {
        setQueueing(false);
      }
    },
    [queueRepair]
  );

  return {
    queueRepair,
    runQueueRepair,
    queueActionError,
    setQueueActionError,
    queueWarning,
    setQueueWarning,
    queueing,
  };
}
