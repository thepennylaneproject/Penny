"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-fetch";

export interface RepairCost {
  id: string;
  repair_job_id: string;
  model: string; // claude-3-5-sonnet, gpt-4-turbo, etc.
  usage_type: "generation" | "refinement" | "evaluation";
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
}

interface UseRepairCostsOptions {
  pollInterval?: number; // ms, default 5000
  enabled?: boolean; // whether to fetch
}

export function useRepairCosts(
  projectId: string | null,
  options: UseRepairCostsOptions = {}
) {
  const { pollInterval = 5000, enabled = true } = options;

  const [costs, setCosts] = useState<RepairCost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCosts = useCallback(async () => {
    if (!projectId || !enabled) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(
        `/api/projects/${projectId}/repair-costs`
      );
      if (response.status === 404) {
        setCosts([]);
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Failed to load repair costs (${response.status}).`);
      }
      const payload = (await response.json().catch(() => [])) as unknown;
      setCosts(Array.isArray(payload) ? payload : []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      console.error(`[useRepairCosts] Failed to fetch costs:`, err);
    } finally {
      setLoading(false);
    }
  }, [projectId, enabled]);

  // Initial fetch
  useEffect(() => {
    fetchCosts();
  }, [fetchCosts]);

  // Poll for new costs
  useEffect(() => {
    if (!projectId || !enabled) return;

    const interval = setInterval(() => {
      fetchCosts();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [projectId, pollInterval, enabled, fetchCosts]);

  const refresh = useCallback(async () => {
    return fetchCosts();
  }, [fetchCosts]);

  // Compute aggregates
  const totalCost = costs.reduce((sum, cost) => sum + cost.cost_usd, 0);
  const totalTokens = costs.reduce(
    (sum, cost) => sum + cost.input_tokens + cost.output_tokens,
    0
  );
  const costPerToken = totalTokens > 0 ? (totalCost / totalTokens) * 1000 : 0; // per 1k tokens

  // Breakdown by model
  const costByModel = costs.reduce(
    (acc, cost) => {
      if (!acc[cost.model]) acc[cost.model] = 0;
      acc[cost.model] += cost.cost_usd;
      return acc;
    },
    {} as Record<string, number>
  );

  // Breakdown by usage type
  const costByUsageType = costs.reduce(
    (acc, cost) => {
      if (!acc[cost.usage_type]) acc[cost.usage_type] = 0;
      acc[cost.usage_type] += cost.cost_usd;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    costs,
    loading,
    error,
    totalCost,
    totalTokens,
    costPerToken,
    costByModel,
    costByUsageType,
    refresh,
  };
}
