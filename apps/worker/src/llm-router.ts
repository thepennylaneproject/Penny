/**
 * Penny v3.0 LLM Router with Cost Tracking
 * Maps audit kinds to providers with per-token cost tracking
 */

import { getRegistry } from './providers/registry.js';
import { insertModelUsage } from './supabase-client.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuditMetricUsage {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latency_ms?: number;
}

/**
 * Pricing map for all supported models (per 1M tokens)
 * Format: { model: { input: cost_usd, output: cost_usd } }
 */
const PRICING_RATES: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-3-5-haiku-latest': { input: 0.8, output: 4.0 },
  'claude-3-5-sonnet-latest': { input: 3.0, output: 15.0 },
  'claude-3-opus-latest': { input: 15.0, output: 75.0 },

  // OpenAI
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 5.0, output: 15.0 },

  // Gemini
  'gemini-2-flash': { input: 0.075, output: 0.3 },
  'gemini-1-5-pro': { input: 1.25, output: 5.0 },

  // Default fallback
  default: { input: 1.0, output: 1.0 },
};

/**
 * Calculate the cost of an LLM call based on token usage
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rates = PRICING_RATES[model] || PRICING_RATES.default;
  const inputCost = (inputTokens / 1_000_000) * rates.input;
  const outputCost = (outputTokens / 1_000_000) * rates.output;
  return inputCost + outputCost;
}

/**
 * Log an audit result to Supabase model_usage table
 */
export async function logAuditMetrics(
  client: SupabaseClient | null,
  runId: string,
  auditKind: string,
  result: AuditMetricUsage
): Promise<boolean> {
  const inputTokens = result.inputTokens ?? 0;
  const outputTokens = result.outputTokens ?? 0;
  if (!client || (inputTokens <= 0 && outputTokens <= 0)) {
    return false;
  }

  const costUsd = calculateCost(result.model, inputTokens, outputTokens);

  return insertModelUsage(
    client,
    runId,
    auditKind,
    result.model,
    inputTokens,
    outputTokens,
    costUsd,
    result.latency_ms || 0
  );
}

/**
 * Resolve the LLM tier for a given suite and project config
 * Returns one of: 'aggressive', 'balanced', 'precision'
 */
export function resolveLLMTier(
  suite: string,
  projectDefaultTier?: string,
  suiteOverride?: string
): 'aggressive' | 'balanced' | 'precision' {
  // Suite override takes precedence
  if (suiteOverride && ['aggressive', 'balanced', 'precision'].includes(suiteOverride)) {
    return suiteOverride as 'aggressive' | 'balanced' | 'precision';
  }

  // Project default
  if (projectDefaultTier && ['aggressive', 'balanced', 'precision'].includes(projectDefaultTier)) {
    return projectDefaultTier as 'aggressive' | 'balanced' | 'precision';
  }

  // Environment override
  const envTier =
    process.env.penny_ROUTING_STRATEGY?.trim().toLowerCase() ||
    process.env.PENNY_ROUTING_STRATEGY?.trim().toLowerCase();
  if (envTier && ['aggressive', 'balanced', 'precision'].includes(envTier)) {
    return envTier as 'aggressive' | 'balanced' | 'precision';
  }

  // Default to balanced
  return 'balanced';
}

/**
 * Tier pricing hints for UI cost estimation
 */
export const TIER_PRICING: Record<
  'aggressive' | 'balanced' | 'precision',
  { model: string; cost_per_1m_input: number; cost_per_1m_output: number }
> = {
  aggressive: {
    model: 'claude-3-5-haiku-latest',
    cost_per_1m_input: 0.8,
    cost_per_1m_output: 4.0,
  },
  balanced: {
    model: 'claude-3-5-sonnet-latest',
    cost_per_1m_input: 3.0,
    cost_per_1m_output: 15.0,
  },
  precision: {
    model: 'claude-3-opus-latest',
    cost_per_1m_input: 15.0,
    cost_per_1m_output: 75.0,
  },
};
