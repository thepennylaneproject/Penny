"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-fetch";

export interface RepairCandidate {
  id: string;
  repair_job_id: string;
  depth: number;
  sequence_number: number;
  parent_candidate_id?: string;
  patch_diff: string;
  score: number;
  validation_results?: {
    lint_ok?: boolean;
    typecheck_ok?: boolean;
    tests_ok?: boolean;
    execution_time_ms?: number;
  };
  error_log?: string;
  created_at: string;
  evaluated_at?: string;
}

interface UseRepairCandidatesOptions {
  pollInterval?: number; // ms, default 3000
  enabled?: boolean; // whether to fetch
}

export function useRepairCandidates(
  jobId: string | null,
  options: UseRepairCandidatesOptions = {}
) {
  const { pollInterval = 3000, enabled = true } = options;

  const [candidates, setCandidates] = useState<RepairCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCandidates = useCallback(async () => {
    if (!jobId || !enabled) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/repair-jobs/${jobId}/candidates`);
      setCandidates(Array.isArray(response) ? response : []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      console.error(`[useRepairCandidates] Failed to fetch candidates:`, err);
    } finally {
      setLoading(false);
    }
  }, [jobId, enabled]);

  // Initial fetch
  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  // Poll for new candidates
  useEffect(() => {
    if (!jobId || !enabled) return;

    const interval = setInterval(() => {
      fetchCandidates();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [jobId, pollInterval, enabled, fetchCandidates]);

  const refresh = useCallback(async () => {
    return fetchCandidates();
  }, [fetchCandidates]);

  return {
    candidates,
    loading,
    error,
    count: candidates.length,
    bestCandidate: candidates.reduce((best, candidate) => {
      return !best || candidate.score > best.score ? candidate : best;
    }, null as RepairCandidate | null),
    candidatesByDepth: candidates.reduce(
      (acc, candidate) => {
        if (!acc[candidate.depth]) acc[candidate.depth] = [];
        acc[candidate.depth].push(candidate);
        return acc;
      },
      {} as Record<number, RepairCandidate[]>
    ),
    refresh,
  };
}
