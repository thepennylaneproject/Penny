"use client";

import { useState } from "react";

export interface RepairConfig {
  beam_width?: number;
  max_depth?: number;
  timeout_seconds?: number;
  validation_commands?: string[];
  language?: string;
}

interface RepairConfigTunerProps {
  findingId: string;
  initialConfig?: RepairConfig;
  onConfigChange?: (config: RepairConfig) => void;
  onSubmit?: (config: RepairConfig) => void;
  isLoading?: boolean;
}

export function RepairConfigTuner({
  findingId,
  initialConfig = {},
  onConfigChange,
  onSubmit,
  isLoading = false,
}: RepairConfigTunerProps) {
  const [beamWidth, setBeamWidth] = useState(initialConfig.beam_width ?? 4);
  const [maxDepth, setMaxDepth] = useState(initialConfig.max_depth ?? 4);
  const [timeout, setTimeout_] = useState(initialConfig.timeout_seconds ?? 180);
  const [validationCommands, setValidationCommands] = useState(
    initialConfig.validation_commands?.join("\n") ?? ""
  );
  const [language, setLanguage] = useState(initialConfig.language ?? "typescript");

  const handleChange = () => {
    const config: RepairConfig = {
      beam_width: beamWidth,
      max_depth: maxDepth,
      timeout_seconds: timeout,
      language,
      validation_commands: validationCommands
        .split("\n")
        .map((cmd) => cmd.trim())
        .filter(Boolean),
    };
    onConfigChange?.(config);
  };

  const handleSubmit = () => {
    const config: RepairConfig = {
      beam_width: beamWidth,
      max_depth: maxDepth,
      timeout_seconds: timeout,
      language,
      validation_commands: validationCommands
        .split("\n")
        .map((cmd) => cmd.trim())
        .filter(Boolean),
    };
    onSubmit?.(config);
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-4 bg-gray-50">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Repair Config</h3>
        <span className="text-xs text-gray-600">{findingId}</span>
      </div>

      {/* Beam Width */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-700 block">
          Beam Width (1-10)
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="1"
            max="10"
            value={beamWidth}
            onChange={(e) => {
              setBeamWidth(Number(e.target.value));
              handleChange();
            }}
            className="flex-1"
          />
          <span className="text-sm font-semibold text-gray-900 w-8 text-center">
            {beamWidth}
          </span>
        </div>
        <p className="text-xs text-gray-600">
          Number of candidates to keep at each depth (more = slower but better)
        </p>
      </div>

      {/* Max Depth */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-700 block">
          Max Depth (1-5)
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="1"
            max="5"
            value={maxDepth}
            onChange={(e) => {
              setMaxDepth(Number(e.target.value));
              handleChange();
            }}
            className="flex-1"
          />
          <span className="text-sm font-semibold text-gray-900 w-8 text-center">
            {maxDepth}
          </span>
        </div>
        <p className="text-xs text-gray-600">
          Number of refinement iterations (more = slower but better)
        </p>
      </div>

      {/* Timeout */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-700 block">
          Timeout (30-900 seconds)
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="30"
            max="900"
            step="30"
            value={timeout}
            onChange={(e) => {
              setTimeout_(Number(e.target.value));
              handleChange();
            }}
            className="flex-1"
          />
          <span className="text-sm font-semibold text-gray-900 w-16 text-right">
            {timeout}s
          </span>
        </div>
        <p className="text-xs text-gray-600">
          Max time for repair (30s = 3min, 900s = 15min)
        </p>
      </div>

      {/* Language */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-700 block">
          Language
        </label>
        <select
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value);
            handleChange();
          }}
          className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-white"
        >
          <option value="typescript">TypeScript</option>
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="go">Go</option>
          <option value="rust">Rust</option>
          <option value="java">Java</option>
        </select>
      </div>

      {/* Validation Commands */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-700 block">
          Validation Commands (one per line)
        </label>
        <textarea
          value={validationCommands}
          onChange={(e) => {
            setValidationCommands(e.target.value);
            handleChange();
          }}
          placeholder="npm run lint&#10;npm run typecheck&#10;npm test"
          className="w-full px-2 py-2 text-xs border border-gray-300 rounded bg-white font-mono"
          rows={3}
        />
        <p className="text-xs text-gray-600">
          Commands to validate patch (lint, typecheck, tests)
        </p>
      </div>

      {/* Submit button */}
      {onSubmit && (
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="w-full py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 rounded transition-colors"
        >
          {isLoading ? "Submitting..." : "Submit Repair Job"}
        </button>
      )}
    </div>
  );
}
