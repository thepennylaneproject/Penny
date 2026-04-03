"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-fetch";

export interface RepairJobStatus {
  repair_job_id: string;
  finding_id: string;
  project_id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "blocked";
  confidence_score?: number;
  confidence_breakdown?: {
    validation: number;
    locality: number;
    risk: number;
    uncertainty_penalty: number;
  };
  action?: string;
  progress?: Record<string, unknown>;
  best_candidate_id?: string;
  best_score?: number;
  candidates: Array<Record<string, unknown>>;
  pr_id?: string;
  pr_number?: number;
  pr_url?: string;
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

interface UseRepairJobOptions {
  pollInterval?: number; // ms, default 2000
  autoStop?: boolean; // stop polling when completed/failed
}

export function useRepairJob(
  jobId: string | null,
  options: UseRepairJobOptions = {}
) {
  const { pollInterval = 2000, autoStop = true } = options;

  const [job, setJob] = useState<RepairJobStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/repair-jobs/${jobId}`);
      setJob(response as RepairJobStatus);
      return response as RepairJobStatus;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      console.error(`[useRepairJob] Failed to fetch job ${jobId}:`, err);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  // Initial fetch
  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  // Auto-poll while job is in progress
  useEffect(() => {
    if (!jobId || !job) return;

    const isTerminal =
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "blocked";

    if (isTerminal && autoStop) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);

    const interval = setInterval(() => {
      fetchJob();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [jobId, job, pollInterval, autoStop, fetchJob]);

  const refresh = useCallback(async () => {
    return fetchJob();
  }, [fetchJob]);

  return {
    job,
    loading,
    error,
    isPolling,
    refresh,
    isComplete: job?.status === "completed",
    isFailed: job?.status === "failed",
    isBlocked: job?.status === "blocked",
  };
}
