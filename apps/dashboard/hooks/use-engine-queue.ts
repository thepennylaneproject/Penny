"use client";

import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api-fetch";

export function useEngineQueue() {
  const [queuedFindingIds, setQueuedFindingIds] = useState<Set<string>>(new Set());
  const [queueError, setQueueError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setQueueError(null);
    try {
      const res = await apiFetch("/api/engine/queue");
      if (res.ok) {
        const data = await res.json();
        const keys = (data.queue ?? [])
          .filter((j: { finding_id?: string; project_name?: string }) =>
            Boolean(j.project_name?.trim() && j.finding_id?.trim())
          )
          .map(
            (j: { finding_id: string; project_name: string }) =>
              `${j.project_name}:${j.finding_id}`
          );
        setQueuedFindingIds(new Set(keys));
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const msg =
        typeof body.error === "string"
          ? body.error
          : `Repair queue could not be loaded (${res.status}). “Queued” badges may be wrong.`;
      setQueueError(msg);
    } catch (e) {
      setQueueError(
        e instanceof Error ? e.message : "Network error loading repair queue."
      );
    }
  }, []);

  return {
    queuedFindingIds,
    setQueuedFindingIds,
    queueError,
    setQueueError,
    fetchQueue,
  };
}
