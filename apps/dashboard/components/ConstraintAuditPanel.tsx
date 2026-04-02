/**
 * Constraint Audit Panel Component
 * Displays constraint validation results in the dashboard
 */

"use client";

import React, { useEffect, useState } from "react";
import type { ConstraintAuditResult, ConstraintViolation } from "@/lib/constraint-types";

interface ConstraintAuditPanelProps {
  projectPath?: string;
  projectName?: string;
  difficulty?: "easy" | "moderate" | "complex" | "all";
}

export default function ConstraintAuditPanel({
  projectPath = ".",
  projectName = "Current Project",
  difficulty = "easy",
}: ConstraintAuditPanelProps) {
  const [result, setResult] = useState<ConstraintAuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState(difficulty);

  // Run audit
  const runAudit = async (
    diff: "easy" | "moderate" | "complex" | "all"
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/audits/constraints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath,
          projectName,
          difficulty: diff,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "Audit failed");
        return;
      }

      setResult(data.audit);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to run audit"
      );
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    runAudit(selectedDifficulty);
  }, []);

  const handleDifficultyChange = (
    newDiff: "easy" | "moderate" | "complex" | "all"
  ) => {
    setSelectedDifficulty(newDiff);
    runAudit(newDiff);
  };

  if (!result && !loading && !error) {
    return (
      <div className="p-6 bg-slate-50 rounded-lg border border-slate-200">
        <button
          onClick={() => runAudit(selectedDifficulty)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Run Constraint Audit
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Constraint Audit</h2>
        <div className="flex gap-2">
          {(["easy", "moderate", "complex", "all"] as const).map((diff) => (
            <button
              key={diff}
              onClick={() => handleDifficultyChange(diff)}
              className={`px-3 py-1 rounded text-sm font-medium transition ${
                selectedDifficulty === diff
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200 text-slate-700 hover:bg-slate-300"
              }`}
              disabled={loading}
            >
              {diff.charAt(0).toUpperCase() + diff.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="p-8 text-center">
          <div className="inline-block animate-spin">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full" />
          </div>
          <p className="mt-4 text-slate-600">Running constraint audit...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 font-medium">Error: {error}</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard
              label="Total"
              value={result.total_constraints}
              color="blue"
            />
            <StatCard
              label="Passed"
              value={result.passed}
              color="green"
            />
            <StatCard
              label="Failed"
              value={result.failed}
              color="red"
            />
            <StatCard
              label="Coverage"
              value={`${result.coverage_percentage}%`}
              color="purple"
            />
          </div>

          {/* Status Summary */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <p className="text-sm text-slate-600">
              {result.summary}
            </p>
          </div>

          {/* Progress Bar */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium">Overall Coverage</span>
              <span className="text-slate-600">
                {result.passed}/{result.total_constraints}
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-green-500 to-green-600 h-full transition-all"
                style={{
                  width: `${result.coverage_percentage}%`,
                }}
              />
            </div>
          </div>

          {/* Violations */}
          {result.violations.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Violations</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {result.violations.map((violation, idx) => (
                  <ViolationCard
                    key={idx}
                    violation={violation}
                  />
                ))}
              </div>
            </div>
          )}

          {/* No Violations */}
          {result.violations.length === 0 && result.failed === 0 && (
            <div className="p-6 bg-green-50 border border-green-200 rounded-lg text-center">
              <p className="text-green-700 font-medium">
                ✨ All constraints passing!
              </p>
            </div>
          )}

          {/* Metadata */}
          <div className="text-xs text-slate-500 pt-4 border-t border-slate-200">
            <p>Run ID: {result.run_id}</p>
            <p>Timestamp: {new Date(result.timestamp).toLocaleString()}</p>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Stat Card Component
 */
function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: "blue" | "green" | "red" | "purple";
}) {
  const colorClasses = {
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    green: "bg-green-50 border-green-200 text-green-700",
    red: "bg-red-50 border-red-200 text-red-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
  };

  return (
    <div
      className={`p-4 rounded-lg border ${colorClasses[color]}`}
    >
      <p className="text-sm font-medium opacity-75">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

/**
 * Violation Card Component
 */
function ViolationCard({
  violation,
}: {
  violation: ConstraintViolation;
}) {
  const severityColors = {
    critical: "bg-red-100 border-red-300 text-red-900",
    warning: "bg-yellow-100 border-yellow-300 text-yellow-900",
  };

  return (
    <div
      className={`p-4 rounded-lg border ${severityColors[violation.severity]}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-semibold">{violation.constraint_id}</p>
          <p className="text-sm opacity-75">{violation.violation_type}</p>
        </div>
        <span
          className={`px-2 py-1 text-xs font-medium rounded ${
            violation.severity === "critical"
              ? "bg-red-200 text-red-900"
              : "bg-yellow-200 text-yellow-900"
          }`}
        >
          {violation.severity.toUpperCase()}
        </span>
      </div>

      <div className="space-y-2 text-sm mb-3">
        <div>
          <p className="font-medium">Current State:</p>
          <p className="text-xs opacity-75 font-mono">
            {violation.current_state}
          </p>
        </div>
        <div>
          <p className="font-medium">Expected State:</p>
          <p className="text-xs opacity-75 font-mono">
            {violation.expected_state}
          </p>
        </div>
      </div>

      <div className="bg-white bg-opacity-50 p-3 rounded text-sm">
        <p className="font-medium mb-1">Fix:</p>
        <p>{violation.remediation}</p>
      </div>

      {violation.location && (
        <p className="text-xs opacity-50 mt-2">
          📄 {violation.location.file}
          {violation.location.line && `:${violation.location.line}`}
        </p>
      )}
    </div>
  );
}
