"use client";

import { useState } from "react";

export interface ProjectRepairSettings {
  repair_enabled?: boolean;
  repair_auto_draft?: boolean;
  confidence_fast_lane_threshold?: number;
  confidence_vulnerability_minimum?: number;
  max_concurrent_repairs?: number;
  default_timeout_seconds?: number;
}

interface ProjectRepairConfigProps {
  projectName: string;
  settings?: ProjectRepairSettings;
  onSave?: (settings: ProjectRepairSettings) => void;
  isLoading?: boolean;
}

export function ProjectRepairConfig({
  projectName,
  settings = {},
  onSave,
  isLoading = false,
}: ProjectRepairConfigProps) {
  const [repairEnabled, setRepairEnabled] = useState(
    settings.repair_enabled ?? true
  );
  const [autoDraft, setAutoDraft] = useState(settings.repair_auto_draft ?? true);
  const [fastLaneThreshold, setFastLaneThreshold] = useState(
    settings.confidence_fast_lane_threshold ?? 0.98
  );
  const [vulnThreshold, setVulnThreshold] = useState(
    settings.confidence_vulnerability_minimum ?? 0.97
  );
  const [maxConcurrent, setMaxConcurrent] = useState(
    settings.max_concurrent_repairs ?? 4
  );
  const [defaultTimeout, setDefaultTimeout] = useState(
    settings.default_timeout_seconds ?? 180
  );

  const handleSave = () => {
    onSave?.({
      repair_enabled: repairEnabled,
      repair_auto_draft: autoDraft,
      confidence_fast_lane_threshold: fastLaneThreshold,
      confidence_vulnerability_minimum: vulnThreshold,
      max_concurrent_repairs: maxConcurrent,
      default_timeout_seconds: defaultTimeout,
    });
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          Repair Configuration
        </h3>
        <p className="text-xs text-gray-600 mt-1">{projectName}</p>
      </div>

      {/* Enable/disable */}
      <div className="space-y-2">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={repairEnabled}
            onChange={(e) => setRepairEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
          />
          <span className="text-sm font-medium text-gray-700">
            Enable Auto-Repair
          </span>
        </label>
        <p className="text-xs text-gray-600 ml-7">
          Allow automatic repair for this project
        </p>
      </div>

      {repairEnabled && (
        <>
          {/* Auto draft */}
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoDraft}
                onChange={(e) => setAutoDraft(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">
                Auto-Draft PRs
              </span>
            </label>
            <p className="text-xs text-gray-600 ml-7">
              Create draft PRs for lower confidence repairs (85-95%)
            </p>
          </div>

          {/* Fast lane threshold */}
          <div className="space-y-2 pt-2 border-t border-gray-200">
            <label className="text-xs font-medium text-gray-700 block">
              Fast Lane Threshold: {(fastLaneThreshold * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0.90"
              max="0.99"
              step="0.01"
              value={fastLaneThreshold}
              onChange={(e) => setFastLaneThreshold(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-gray-600">
              Minimum confidence for ready (non-draft) PRs
            </p>
          </div>

          {/* Vulnerability threshold */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700 block">
              Vulnerability Min Confidence: {(vulnThreshold * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0.90"
              max="0.99"
              step="0.01"
              value={vulnThreshold}
              onChange={(e) => setVulnThreshold(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-gray-600">
              Higher minimum for security/vulnerability repairs
            </p>
          </div>

          {/* Max concurrent */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700 block">
              Max Concurrent Repairs: {maxConcurrent}
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-gray-600">
              Maximum repairs to process in parallel per project
            </p>
          </div>

          {/* Default timeout */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700 block">
              Default Timeout: {defaultTimeout}s ({Math.round(defaultTimeout / 60)}min)
            </label>
            <input
              type="range"
              min="30"
              max="900"
              step="30"
              value={defaultTimeout}
              onChange={(e) => setDefaultTimeout(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-gray-600">
              Default maximum time for each repair (30s-15min)
            </p>
          </div>

          {/* Info box */}
          <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-1">
            <p className="text-xs font-medium text-blue-900">Governance Lock</p>
            <p className="text-xs text-blue-700">
              Thresholds and limits are hardcoded per the founder decisions.
              Contact your admin to change these values.
            </p>
          </div>

          {/* Save button */}
          {onSave && (
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="w-full py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 rounded transition-colors"
            >
              {isLoading ? "Saving..." : "Save Configuration"}
            </button>
          )}
        </>
      )}

      {!repairEnabled && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
          <p className="text-xs text-yellow-800">
            ⚠️ Auto-repair is disabled for this project. Enable it above to
            allow automatic patch generation.
          </p>
        </div>
      )}
    </div>
  );
}
