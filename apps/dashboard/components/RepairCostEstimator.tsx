"use client";

interface RepairCost {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  usage_type: string;
}

interface RepairCostEstimatorProps {
  costs: RepairCost[];
  jobCount?: number;
  averageConfidence?: number;
}

const modelLabels: Record<string, string> = {
  "claude-3-5-sonnet-latest": "Claude 3.5 Sonnet",
  "claude-3-opus-latest": "Claude 3 Opus",
  "claude-3-haiku-latest": "Claude 3 Haiku",
  "gpt-4-turbo": "GPT-4 Turbo",
  "gpt-4o": "GPT-4o",
};

export function RepairCostEstimator({
  costs,
  jobCount = 0,
  averageConfidence = 0,
}: RepairCostEstimatorProps) {
  const totalCost = costs.reduce((sum, cost) => sum + cost.cost_usd, 0);
  const totalInputTokens = costs.reduce(
    (sum, cost) => sum + cost.input_tokens,
    0
  );
  const totalOutputTokens = costs.reduce(
    (sum, cost) => sum + cost.output_tokens,
    0
  );
  const totalTokens = totalInputTokens + totalOutputTokens;
  const costPerJob = jobCount > 0 ? totalCost / jobCount : 0;
  const costPerToken = totalTokens > 0 ? totalCost / totalTokens : 0;

  // Group by model and usage type
  const costsByModel = costs.reduce(
    (acc, cost) => {
      if (!acc[cost.model]) {
        acc[cost.model] = { total: 0, count: 0, tokens: 0 };
      }
      acc[cost.model].total += cost.cost_usd;
      acc[cost.model].count += 1;
      acc[cost.model].tokens += cost.input_tokens + cost.output_tokens;
      return acc;
    },
    {} as Record<string, { total: number; count: number; tokens: number }>
  );

  const costsByUsage = costs.reduce(
    (acc, cost) => {
      if (!acc[cost.usage_type]) {
        acc[cost.usage_type] = 0;
      }
      acc[cost.usage_type] += cost.cost_usd;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Cost Summary</h3>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 rounded p-3">
          <p className="text-xs text-gray-600">Total Cost</p>
          <p className="text-lg font-semibold text-blue-900">
            ${totalCost.toFixed(2)}
          </p>
        </div>
        <div className="bg-green-50 rounded p-3">
          <p className="text-xs text-gray-600">Cost / Job</p>
          <p className="text-lg font-semibold text-green-900">
            ${costPerJob.toFixed(3)}
          </p>
        </div>
        <div className="bg-purple-50 rounded p-3">
          <p className="text-xs text-gray-600">Total Tokens</p>
          <p className="text-lg font-semibold text-purple-900">
            {(totalTokens / 1000).toFixed(1)}K
          </p>
        </div>
        <div className="bg-orange-50 rounded p-3">
          <p className="text-xs text-gray-600">$ / 1K Tokens</p>
          <p className="text-lg font-semibold text-orange-900">
            ${(costPerToken * 1000).toFixed(3)}
          </p>
        </div>
      </div>

      {/* Confidence efficiency */}
      {averageConfidence > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded p-3">
          <p className="text-xs text-indigo-700 font-medium">
            Avg Confidence: {averageConfidence.toFixed(1)}%
          </p>
          <p className="text-xs text-indigo-600 mt-1">
            Cost per confidence point: $
            {((totalCost / averageConfidence) * 100).toFixed(3)}
          </p>
        </div>
      )}

      {/* By model */}
      {Object.keys(costsByModel).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-700">By Model</p>
          <div className="space-y-1">
            {Object.entries(costsByModel).map(([model, data]) => (
              <div
                key={model}
                className="flex items-center justify-between text-xs bg-gray-50 p-2 rounded"
              >
                <span className="text-gray-700">
                  {modelLabels[model] || model}
                </span>
                <span className="text-gray-900 font-mono">
                  ${data.total.toFixed(2)} ({data.tokens.toLocaleString()}T)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By usage */}
      {Object.keys(costsByUsage).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-700">By Usage Type</p>
          <div className="space-y-1">
            {Object.entries(costsByUsage).map(([usage, cost]) => (
              <div
                key={usage}
                className="flex items-center justify-between text-xs bg-gray-50 p-2 rounded"
              >
                <span className="text-gray-700 capitalize">{usage}</span>
                <span className="text-gray-900 font-mono">${cost.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {costs.length === 0 && (
        <p className="text-xs text-gray-600 text-center py-4">
          No cost data available yet
        </p>
      )}
    </div>
  );
}
