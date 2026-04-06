/**
 * useRepairJobPolling — hook for real-time repair job status updates.
 *
 * Polls the repair job status endpoint and updates state as the job progresses.
 * Automatically stops polling when job reaches terminal state.
 */

import { useState, useEffect, useCallback } from "react";
import type { RepairJob } from "@/lib/types";
import { apiFetch } from "@/lib/api-fetch";
import { isRepairTerminal } from "@/lib/repair-status-machine";

export interface RepairJobPollingOptions {
  /**
   * How often to poll for updates (ms). Default: 2000 (2 seconds).
   * Faster polling for running jobs, slower for queued jobs.
   */
  pollInterval?: number;
  /**
   * Whether to continue polling after terminal state. Default: false.
   */
  continuePollAfterTerminal?: boolean;
  /**
   * Callback when job reaches terminal state.
   */
  onTerminal?: (job: RepairJob) => void;
}

export interface RepairJobPollingState {
  job: RepairJob | null;
  isPolling: boolean;
  error: string | null;
  lastUpdateTime: Date | null;
}

/**
 * Poll repair job status until terminal state is reached.
 */
export function useRepairJobPolling(
  jobId: string | undefined,
  options: RepairJobPollingOptions = {}
): RepairJobPollingState {
  const { 
    pollInterval = 2000, 
    continuePollAfterTerminal = false,
    onTerminal 
  } = options;

  const [state, setState] = useState<RepairJobPollingState>({
    job: null,
    isPolling: !!jobId,
    error: null,
    lastUpdateTime: null,
  });

  const fetchJobStatus = useCallback(async () => {
    if (!jobId) {
      setState((prev) => ({ ...prev, isPolling: false }));
      return;
    }

    try {
      const res = await apiFetch(`/api/repair-jobs/${encodeURIComponent(jobId)}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const job: RepairJob = await res.json();
      
      setState((prev) => ({
        ...prev,
        job,
        error: null,
        lastUpdateTime: new Date(),
        isPolling: continuePollAfterTerminal || !isRepairTerminal(job.status),
      }));

      // Notify when reaching terminal state
      if (isRepairTerminal(job.status) && onTerminal) {
        onTerminal(job);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch repair job status";
      setState((prev) => ({
        ...prev,
        error: message,
        isPolling: false,
      }));
    }
  }, [jobId, continuePollAfterTerminal, onTerminal]);

  // Set up polling
  useEffect(() => {
    if (!jobId) return;

    // Fetch immediately
    void fetchJobStatus();

    // Set up interval
    const interval = setInterval(() => {
      void fetchJobStatus();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [jobId, pollInterval, fetchJobStatus]);

  return state;
}

/**
 * Format elapsed time since start.
 */
export function formatElapsedTime(startTime: Date): string {
  const elapsed = Math.floor((new Date().getTime() - startTime.getTime()) / 1000);
  
  if (elapsed < 60) return `${elapsed}s`;
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  return `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;
}
