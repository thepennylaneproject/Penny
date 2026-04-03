"use client";

import { useState } from "react";

export interface PRInfo {
  pr_number?: number;
  pr_url?: string;
  action?: string;
  confidence_score?: number;
  created_at?: string;
}

interface PRManagerProps {
  pr: PRInfo;
  findingId: string;
  onApprove?: () => void;
  onMerge?: () => void;
  isLoading?: boolean;
}

const actionColors: Record<string, string> = {
  fast_lane_ready_pr: "bg-green-100 text-green-800",
  ready_pr: "bg-blue-100 text-blue-800",
  draft_pr: "bg-yellow-100 text-yellow-800",
  candidate_only: "bg-gray-100 text-gray-800",
  do_not_repair: "bg-red-100 text-red-800",
};

export function PRManager({
  pr,
  findingId,
  onApprove,
  onMerge,
  isLoading = false,
}: PRManagerProps) {
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);

  if (!pr.pr_url) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-600">No PR created yet</p>
        {pr.action === "candidate_only" && (
          <p className="text-xs text-gray-500 mt-2">
            Confidence too low for automatic PR (show as candidate)
          </p>
        )}
        {pr.action === "do_not_repair" && (
          <p className="text-xs text-gray-500 mt-2">
            Confidence too low for repair
          </p>
        )}
      </div>
    );
  }

  const isDraft = pr.action === "draft_pr";
  const isReady = pr.action === "ready_pr" || pr.action === "fast_lane_ready_pr";

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Pull Request
          </h3>
          <p className="text-xs text-gray-600 mt-1">{findingId}</p>
        </div>
        {pr.action && (
          <span className={`px-2 py-1 text-xs rounded font-medium ${actionColors[pr.action]}`}>
            {pr.action === "fast_lane_ready_pr" ? "🚀 Fast Lane" : pr.action}
          </span>
        )}
      </div>

      {/* PR Link */}
      <a
        href={pr.pr_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block p-3 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-900">
              #{pr.pr_number}
            </p>
            <p className="text-xs text-blue-700 truncate">
              {pr.pr_url}
            </p>
          </div>
          <span className="text-lg">→</span>
        </div>
      </a>

      {/* Confidence badge */}
      {pr.confidence_score !== undefined && (
        <div className="flex items-center justify-between bg-gray-50 p-3 rounded">
          <span className="text-xs font-medium text-gray-700">Confidence</span>
          <span className="text-sm font-bold text-gray-900">
            {pr.confidence_score.toFixed(1)}%
          </span>
        </div>
      )}

      {/* Status message */}
      <div className="text-xs text-gray-600 space-y-1">
        {isDraft && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
            <p className="text-yellow-800">
              ⚠️ This PR is a <strong>draft</strong>. Review and convert to
              ready when confident.
            </p>
          </div>
        )}
        {pr.action === "fast_lane_ready_pr" && (
          <div className="bg-green-50 border border-green-200 rounded p-2">
            <p className="text-green-800">
              ✅ This repair is <strong>high confidence</strong>. Ready to merge
              after approval.
            </p>
          </div>
        )}
        {isReady && pr.action !== "fast_lane_ready_pr" && (
          <div className="bg-blue-50 border border-blue-200 rounded p-2">
            <p className="text-blue-800">
              This PR is ready for review and merge.
            </p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {isDraft && onApprove && (
          <>
            <button
              onClick={() => setShowApproveConfirm(true)}
              disabled={isLoading}
              className="flex-1 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded transition-colors"
            >
              Convert to Ready
            </button>
            {showApproveConfirm && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-4 max-w-sm">
                  <p className="text-sm font-medium text-gray-900 mb-4">
                    Convert to ready for review?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        onApprove();
                        setShowApproveConfirm(false);
                      }}
                      className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
                    >
                      Yes, Convert
                    </button>
                    <button
                      onClick={() => setShowApproveConfirm(false)}
                      className="flex-1 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {isReady && onMerge && (
          <>
            <button
              onClick={() => setShowMergeConfirm(true)}
              disabled={isLoading}
              className="flex-1 py-2 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 rounded transition-colors"
            >
              Merge
            </button>
            {showMergeConfirm && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-4 max-w-sm">
                  <p className="text-sm font-medium text-gray-900 mb-4">
                    Merge PR #{pr.pr_number}?
                  </p>
                  <p className="text-xs text-gray-600 mb-4">
                    This will merge the repair patch to the main branch.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        onMerge();
                        setShowMergeConfirm(false);
                      }}
                      className="flex-1 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded"
                    >
                      Merge
                    </button>
                    <button
                      onClick={() => setShowMergeConfirm(false)}
                      className="flex-1 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Open on GitHub */}
        <a
          href={pr.pr_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors text-center"
        >
          Open on GitHub
        </a>
      </div>
    </div>
  );
}
