"use client";

import { useState, useEffect } from "react";
import { ProgressBar } from "./ProgressBar";

export interface RepairJob {
  repair_job_id: string;
  finding_id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "blocked";
  confidence_score?: number;
  confidence_breakdown?: {
    validation: number;
    locality: number;
    risk: number;
    uncertainty_penalty: number;
  };
  action?: string;
  best_score?: number;
  total_candidates_evaluated?: number;
  pr_number?: number;
  pr_url?: string;
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

interface RepairJobMonitorProps {
  job: RepairJob;
  onRefresh?: () => void;
}

const statusColors: Record<string, string> = {
  queued: "bg-blue-100 text-blue-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  blocked: "bg-gray-100 text-gray-800",
};

const actionLabels: Record<string, { label: string; emoji: string }> = {
  fast_lane_ready_pr: { label: "Fast Lane PR", emoji: "🚀" },
  ready_pr: { label: "Ready PR", emoji: "✅" },
  draft_pr: { label: "Draft PR", emoji: "📝" },
  candidate_only: { label: "Candidate", emoji: "🔵" },
  do_not_repair: { label: "Blocked", emoji: "🚫" },
};

export function RepairJobMonitor({ job, onRefresh }: RepairJobMonitorProps) {
  const [elapsed, setElapsed] = useState<string>("");

  useEffect(() => {
    const updateElapsed = () => {
      const start = job.started_at
        ? new Date(job.started_at).getTime()
        : new Date(job.created_at).getTime();
      const end = job.completed_at
        ? new Date(job.completed_at).getTime()
        : Date.now();
      const ms = end - start;
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) {
        setElapsed(`${hours}h ${minutes % 60}m`);
      } else if (minutes > 0) {
        setElapsed(`${minutes}m ${seconds % 60}s`);
      } else {
        setElapsed(`${seconds}s`);
      }
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [job]);

  const confidencePercent = job.confidence_score ?? 0;
  const actionInfo = job.action ? actionLabels[job.action] : null;

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
      {/* Header with status and action */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">
            {job.finding_id}
          </h3>
          <p className="text-xs text-gray-600 mt-1">
            Job: {job.repair_job_id.slice(0, 8)}...
          </p>
        </div>
        <div className="flex gap-2">
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${statusColors[job.status]}`}
          >
            {job.status === "in_progress" ? `${job.status}...` : job.status}
          </span>
          {actionInfo && (
            <span className="inline-flex items-center rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
              {actionInfo.emoji} {actionInfo.label}
            </span>
          )}
        </div>
      </div>

      {/* Confidence score and breakdown */}
      {job.confidence_score !== undefined && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700">
              Confidence
            </span>
            <span className="text-sm font-semibold text-gray-900">
              {confidencePercent.toFixed(1)}%
            </span>
          </div>
          <ProgressBar value={confidencePercent} max={100} />

          {/* Breakdown details */}
          {job.confidence_breakdown && (
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-gray-600">Validation</div>
                <div className="font-semibold text-gray-900">
                  {job.confidence_breakdown.validation.toFixed(0)}%
                </div>
              </div>
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-gray-600">Locality</div>
                <div className="font-semibold text-gray-900">
                  {job.confidence_breakdown.locality.toFixed(0)}%
                </div>
              </div>
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-gray-600">Risk</div>
                <div className="font-semibold text-gray-900">
                  {job.confidence_breakdown.risk.toFixed(0)}%
                </div>
              </div>
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-gray-600">Uncertainty</div>
                <div className="font-semibold text-gray-900">
                  -{job.confidence_breakdown.uncertainty_penalty.toFixed(0)}%
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Candidates evaluated */}
      {job.total_candidates_evaluated !== undefined && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">Candidates Evaluated</span>
          <span className="font-semibold text-gray-900">
            {job.total_candidates_evaluated}
          </span>
        </div>
      )}

      {/* Best score */}
      {job.best_score !== undefined && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">Best Patch Score</span>
          <span className="font-semibold text-gray-900">
            {job.best_score.toFixed(1)}%
          </span>
        </div>
      )}

      {/* PR link */}
      {job.pr_url && (
        <div className="bg-blue-50 border border-blue-200 rounded p-2">
          <a
            href={job.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-700 hover:text-blue-900 font-medium"
          >
            PR #{job.pr_number} → {job.pr_url.split("/").pop()}
          </a>
        </div>
      )}

      {/* Error message */}
      {job.error_message && (
        <div className="bg-red-50 border border-red-200 rounded p-2">
          <p className="text-xs text-red-700">{job.error_message}</p>
        </div>
      )}

      {/* Timing */}
      <div className="pt-2 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>Elapsed</span>
          <span className="font-mono">{elapsed}</span>
        </div>
      </div>

      {/* Refresh button */}
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="w-full py-2 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors"
        >
          Refresh Status
        </button>
      )}
    </div>
  );
}
