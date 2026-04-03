"use client";

import { useState } from "react";

export interface RepairCandidate {
  id: string;
  depth: number;
  sequence_number: number;
  patch_diff: string;
  score: number;
  validation_results?: {
    lint_ok?: boolean;
    typecheck_ok?: boolean;
    tests_ok?: boolean;
  };
  error_log?: string;
}

interface CandidateComparisonProps {
  candidates: RepairCandidate[];
  bestCandidateId?: string;
}

export function CandidateComparison({
  candidates,
  bestCandidateId,
}: CandidateComparisonProps) {
  const [selectedId, setSelectedId] = useState(bestCandidateId || candidates[0]?.id);
  const selected = candidates.find((c) => c.id === selectedId);

  if (candidates.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-600">No candidates generated yet</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Candidate list */}
      <div className="border-b border-gray-200 bg-gray-50 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Candidates ({candidates.length})
        </h3>
        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              onClick={() => setSelectedId(candidate.id)}
              className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                selectedId === candidate.id
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-700 border border-gray-300 hover:border-gray-400"
              }`}
            >
              <span className="inline-block mr-1">D{candidate.depth}</span>
              <span className="font-mono text-xs">
                {candidate.score.toFixed(0)}%
              </span>
              {candidate.id === bestCandidateId && (
                <span className="ml-1">⭐</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Selected candidate details */}
      {selected && (
        <div className="p-4 space-y-4">
          {/* Score and metadata */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-600">Score</p>
              <p className="text-lg font-semibold text-gray-900">
                {selected.score.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Depth</p>
              <p className="text-lg font-semibold text-gray-900">
                {selected.depth} / Seq {selected.sequence_number}
              </p>
            </div>
          </div>

          {/* Validation results */}
          {selected.validation_results && (
            <div className="bg-gray-50 rounded p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-700">
                Validation Results
              </p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      selected.validation_results.lint_ok
                        ? "bg-green-500"
                        : "bg-red-500"
                    }`}
                  />
                  <span className="text-gray-700">Lint</span>
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      selected.validation_results.typecheck_ok
                        ? "bg-green-500"
                        : "bg-red-500"
                    }`}
                  />
                  <span className="text-gray-700">Type</span>
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      selected.validation_results.tests_ok
                        ? "bg-green-500"
                        : "bg-red-500"
                    }`}
                  />
                  <span className="text-gray-700">Tests</span>
                </div>
              </div>
            </div>
          )}

          {/* Patch diff */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-700">Patch</p>
            <pre className="bg-gray-50 border border-gray-200 rounded p-3 text-xs overflow-x-auto max-h-64 overflow-y-auto font-mono text-gray-700 whitespace-pre-wrap">
              {selected.patch_diff}
            </pre>
          </div>

          {/* Error log */}
          {selected.error_log && (
            <div className="bg-red-50 border border-red-200 rounded p-3 space-y-2">
              <p className="text-xs font-semibold text-red-700">Error</p>
              <pre className="text-xs text-red-600 overflow-x-auto font-mono">
                {selected.error_log}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
