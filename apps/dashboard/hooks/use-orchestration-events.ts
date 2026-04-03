"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-fetch";

export interface OrchestrationEvent {
  id: string;
  repair_job_id: string;
  event_type: string; // completion, failure, pr_created, pr_merged, pr_approved, candidate_generated
  action?: string; // fast_lane_ready_pr, ready_pr, draft_pr, candidate_only, do_not_repair
  confidence_score?: number;
  pr_number?: number;
  created_at: string;
}

interface UseOrchestrationEventsOptions {
  pollInterval?: number; // ms, default 4000
  enabled?: boolean; // whether to fetch
}

export function useOrchestrationEvents(
  jobId: string | null,
  options: UseOrchestrationEventsOptions = {}
) {
  const { pollInterval = 4000, enabled = true } = options;

  const [events, setEvents] = useState<OrchestrationEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!jobId || !enabled) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(
        `/api/repair-jobs/${jobId}/events`
      );
      setEvents(Array.isArray(response) ? response : []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      console.error(`[useOrchestrationEvents] Failed to fetch events:`, err);
    } finally {
      setLoading(false);
    }
  }, [jobId, enabled]);

  // Initial fetch
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Poll for new events
  useEffect(() => {
    if (!jobId || !enabled) return;

    const interval = setInterval(() => {
      fetchEvents();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [jobId, pollInterval, enabled, fetchEvents]);

  const refresh = useCallback(async () => {
    return fetchEvents();
  }, [fetchEvents]);

  // Get most recent event of each type
  const latestEventByType = events.reduce(
    (acc, event) => {
      acc[event.event_type] = event;
      return acc;
    },
    {} as Record<string, OrchestrationEvent>
  );

  return {
    events,
    loading,
    error,
    count: events.length,
    latestEventByType,
    refresh,
  };
}
