"use client";

import { useEffect, useState } from "react";
import type { ProjectRepairSettings } from "@/lib/types";

interface ProjectRepairConfigProps {
  projectName: string;
  settings?: ProjectRepairSettings;
  onSave?: (settings: ProjectRepairSettings) => Promise<void> | void;
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    setRepairEnabled(settings.repair_enabled ?? true);
    setAutoDraft(settings.repair_auto_draft ?? true);
    setFastLaneThreshold(settings.confidence_fast_lane_threshold ?? 0.98);
    setVulnThreshold(settings.confidence_vulnerability_minimum ?? 0.97);
    setMaxConcurrent(settings.max_concurrent_repairs ?? 4);
    setDefaultTimeout(settings.default_timeout_seconds ?? 180);
    setSaveError(null);
    setSaveStatus(null);
  }, [settings]);

  const handleSave = async () => {
    if (!onSave) return;
    setSaveError(null);
    setSaveStatus(null);
    try {
      await onSave({
        repair_enabled: repairEnabled,
        repair_auto_draft: autoDraft,
        confidence_fast_lane_threshold: fastLaneThreshold,
        confidence_vulnerability_minimum: vulnThreshold,
        max_concurrent_repairs: maxConcurrent,
        default_timeout_seconds: defaultTimeout,
      });
      setSaveStatus("Saved.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          Repair defaults
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
            Enable automatic repairs
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
                Draft pull requests automatically
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
              These thresholds are stored per project and take effect for future repair runs.
            </p>
          </div>

          {saveError && (
            <p className="text-xs text-red-700">{saveError}</p>
          )}
          {saveStatus && (
            <p className="text-xs text-green-700">{saveStatus}</p>
          )}

          {/* Save button */}
          {onSave && (
            <button
              onClick={() => void handleSave()}
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
