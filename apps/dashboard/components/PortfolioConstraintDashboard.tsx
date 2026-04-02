"use client";

import React, { useEffect, useState } from "react";
import {
  PortfolioAuditSummary,
  PortfolioHealthMetrics,
  EscalationAction
} from "@/lib/portfolio-types";

interface PortfolioConstraintDashboardProps {
  autoRefresh?: boolean;
  refreshInterval?: number; // milliseconds
  onAuditStart?: () => void;
  onAuditComplete?: () => void;
}

export default function PortfolioConstraintDashboard({
  autoRefresh = true,
  refreshInterval = 300000, // 5 minutes
  onAuditStart,
  onAuditComplete
}: PortfolioConstraintDashboardProps) {
  const [summary, setSummary] = useState<PortfolioAuditSummary | null>(null);
  const [metrics, setMetrics] = useState<PortfolioHealthMetrics | null>(null);
  const [escalations, setEscalations] = useState<EscalationAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Load initial data
  useEffect(() => {
    loadPortfolioData();
  }, []);

  // Set up auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadPortfolioData();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  const loadPortfolioData = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/audits/portfolio/summary");
      if (!response.ok) throw new Error("Failed to load portfolio data");

      const data = await response.json();
      setSummary(data.summary);
      setMetrics(data.metrics);
      setEscalations(data.escalations);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleRunAudit = async () => {
    try {
      onAuditStart?.();
      setLoading(true);
      const response = await fetch("/api/audits/portfolio/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty: "all" })
      });

      if (!response.ok) throw new Error("Audit failed");
      await loadPortfolioData();
      onAuditComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit failed");
    } finally {
      setLoading(false);
    }
  };

  if (!summary || !metrics) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin mb-4">⌛</div>
          <p>Loading portfolio data...</p>
        </div>
      </div>
    );
  }

  const complianceColor = (percentage: number) => {
    if (percentage >= 90) return "text-green-600";
    if (percentage >= 75) return "text-yellow-600";
    return "text-red-600";
  };

  const statusBadge = (status: "pass" | "warning" | "fail") => {
    const colors = {
      pass: "bg-green-100 text-green-800",
      warning: "bg-yellow-100 text-yellow-800",
      fail: "bg-red-100 text-red-800"
    };
    return (
      <span
        className={`px-2 py-1 rounded text-xs font-semibold ${colors[status]}`}
      >
        {status.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="space-y-6 p-6 bg-gray-50">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Portfolio Constraint Audit</h1>
          <p className="text-sm text-gray-500 mt-1">
            {lastUpdated
              ? `Last updated: ${lastUpdated.toLocaleTimeString()}`
              : "Never run"}
          </p>
        </div>
        <button
          onClick={handleRunAudit}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? "Auditing..." : "Run Audit"}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Portfolio Health Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Portfolio Compliance"
          value={`${summary.aggregatedStats.portfolioCompliance.toFixed(1)}%`}
          status={
            summary.aggregatedStats.portfolioCompliance >= 95 ? "pass" : "fail"
          }
          color={complianceColor(summary.aggregatedStats.portfolioCompliance)}
        />
        <StatCard
          title="Projects Compliant"
          value={`${metrics.projectsCompliant}/${summary.totalProjects}`}
          status={
            metrics.projectsFailing === 0 && metrics.projectsWarning === 0
              ? "pass"
              : "warning"
          }
          color="text-blue-600"
        />
        <StatCard
          title="Critical Violations"
          value={String(summary.criticalViolations.length)}
          status={summary.criticalViolations.length === 0 ? "pass" : "fail"}
          color={
            summary.criticalViolations.length === 0
              ? "text-green-600"
              : "text-red-600"
          }
        />
        <StatCard
          title="SLA Status"
          value={summary.aggregatedStats.slaStatus.toUpperCase()}
          status={
            summary.aggregatedStats.slaStatus === "pass" ? "pass" : "fail"
          }
          color={
            summary.aggregatedStats.slaStatus === "pass"
              ? "text-green-600"
              : "text-red-600"
          }
        />
      </div>

      {/* Per-Project Compliance Heatmap */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4">Per-Project Compliance</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Project</th>
                <th className="px-4 py-2 text-right font-semibold">
                  Constraints
                </th>
                <th className="px-4 py-2 text-right font-semibold">Passed</th>
                <th className="px-4 py-2 text-right font-semibold">Failed</th>
                <th className="px-4 py-2 text-right font-semibold">
                  Compliance
                </th>
                <th className="px-4 py-2 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.projectResults.map(project => (
                <tr key={project.projectId} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{project.projectName}</td>
                  <td className="px-4 py-3 text-right">
                    {project.totalConstraints}
                  </td>
                  <td className="px-4 py-3 text-right text-green-600">
                    {project.passed}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600">
                    {project.failed}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-bold ${complianceColor(
                      project.compliancePercentage
                    )}`}
                  >
                    {project.compliancePercentage.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-center">
                    {statusBadge(project.status)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Critical Violations */}
      {summary.criticalViolations.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-red-600">
          <h2 className="text-xl font-bold mb-4 text-red-700">
            🔴 Critical Violations
          </h2>
          <div className="space-y-3">
            {summary.criticalViolations.slice(0, 5).map((violation, i) => (
              <div
                key={i}
                className="p-3 bg-red-50 border border-red-200 rounded"
              >
                <div className="font-semibold text-red-700">
                  {violation.projectId}: {violation.constraint.id}
                </div>
                <p className="text-sm text-gray-700 mt-1">
                  {violation.violation.remediation}
                </p>
              </div>
            ))}
            {summary.criticalViolations.length > 5 && (
              <p className="text-sm text-gray-500 mt-2">
                +{summary.criticalViolations.length - 5} more violations
              </p>
            )}
          </div>
        </div>
      )}

      {/* Top Issues */}
      {summary.trending.commonFailures.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Top Failing Constraints</h2>
          <div className="space-y-2">
            {summary.trending.commonFailures.slice(0, 10).map((failure, i) => (
              <div key={i} className="flex justify-between items-center p-2">
                <span className="font-mono text-sm">{failure.constraintId}</span>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600">
                    {failure.affectedProjects} projects
                  </span>
                  <div className="w-32 h-2 bg-gray-200 rounded overflow-hidden">
                    <div
                      className="h-full bg-red-500"
                      style={{
                        width: `${(failure.failureCount / summary.totalProjects) * 100}%`
                      }}
                    />
                  </div>
                  <span className="text-sm font-semibold w-8 text-right">
                    {failure.failureCount}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Escalation Actions */}
      {escalations.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-orange-600">
          <h2 className="text-xl font-bold mb-4 text-orange-700">
            ⚠️ Escalation Actions ({escalations.length})
          </h2>
          <div className="space-y-3">
            {escalations.slice(0, 5).map(escalation => (
              <div
                key={escalation.id}
                className="p-3 bg-orange-50 border border-orange-200 rounded"
              >
                <div className="font-semibold text-orange-700">
                  Level {escalation.level}: {escalation.projectId}
                </div>
                <p className="text-sm text-gray-700 mt-1">{escalation.action}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Statistics */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4">Aggregated Statistics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Statistic
            label="Total Constraints"
            value={summary.aggregatedStats.totalConstraints}
          />
          <Statistic
            label="Total Passed"
            value={summary.aggregatedStats.totalPassed}
            color="text-green-600"
          />
          <Statistic
            label="Total Failed"
            value={summary.aggregatedStats.totalFailed}
            color="text-red-600"
          />
          <Statistic
            label="Total Warnings"
            value={summary.aggregatedStats.totalWarnings}
            color="text-yellow-600"
          />
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  status: "pass" | "warning" | "fail";
  color: string;
}

function StatCard({ title, value, status, color }: StatCardProps) {
  const statusColors = {
    pass: "bg-green-50 border-green-200",
    warning: "bg-yellow-50 border-yellow-200",
    fail: "bg-red-50 border-red-200"
  };

  return (
    <div
      className={`p-4 rounded-lg border ${statusColors[status]} flex flex-col`}
    >
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className={`text-2xl font-bold mt-2 ${color}`}>{value}</p>
    </div>
  );
}

interface StatisticProps {
  label: string;
  value: number;
  color?: string;
}

function Statistic({ label, value, color = "text-gray-700" }: StatisticProps) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
