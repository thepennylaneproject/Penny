"use client";

import React, { useState } from "react";

interface SuggestedConstraint {
  template: string;
  templatePath: string;
  confidence: number;
  reason: string;
}

interface ManualReview {
  type: string;
  finding: string;
  suggestedCategory: string;
  suggestedSeverity: string;
}

interface ExtractionResult {
  projectId: string;
  suggestedConstraints: SuggestedConstraint[];
  manualReviewRequired: ManualReview[];
  sourceAnalysis: {
    filesScanned: number;
    docsAnalyzed: number;
    patternsFound: number;
  };
}

export default function ExtractConstraintsPage() {
  const [projectId, setProjectId] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [selectedConstraints, setSelectedConstraints] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);

  const handleExtract = async () => {
    if (!projectId) return;

    setExtracting(true);
    try {
      const response = await fetch("/api/admin/extract-constraints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          action: "scanProject"
        })
      });

      const data = await response.json();
      setResult(data.results);
      setSelectedConstraints(
        data.results.suggestedConstraints.map((_c: unknown, i: number) =>
          i.toString()
        )
      );
    } catch (error) {
      console.error("Extraction failed:", error);
    } finally {
      setExtracting(false);
    }
  };

  const handleApply = async () => {
    if (!result) return;

    setApplying(true);
    try {
      const constraints = result.suggestedConstraints
        .filter((_, i) => selectedConstraints.includes(i.toString()))
        .map((s, i) => ({
          id: `${projectId}-${i}`,
          name: s.template,
          category: "auto-generated",
          severity: "medium",
          difficulty: s.templatePath.split(".")[0] === "easy" ? "easy" : "moderate",
          description: s.reason
        }));

      const response = await fetch("/api/admin/extract-constraints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          action: "applyExtraction",
          data: { constraints }
        })
      });

      if (response.ok) {
        alert(`Successfully applied ${constraints.length} constraints to ${projectId}`);
        setResult(null);
        setProjectId("");
      }
    } catch (error) {
      console.error("Apply failed:", error);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6 p-6 bg-gray-50">
      <div>
        <h1 className="text-3xl font-bold">Extract Constraints</h1>
        <p className="text-gray-600 mt-2">
          Automatically discover and suggest constraints for a project
        </p>
      </div>

      {/* Project Selector */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4">Step 1: Select Project</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Project</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              disabled={extracting}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">-- Select a project --</option>
              <option value="codra">Codra</option>
              <option value="relevnt">Relevnt</option>
              <option value="advocera">Advocera</option>
              <option value="project-5">Project 5</option>
              <option value="project-6">Project 6</option>
            </select>
          </div>

          <button
            onClick={handleExtract}
            disabled={!projectId || extracting}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {extracting ? "Scanning..." : "Scan Project"}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Analysis Summary */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Step 2: Review Suggestions</h2>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-blue-50 rounded">
                <p className="text-sm text-gray-600">Files Scanned</p>
                <p className="text-2xl font-bold">{result.sourceAnalysis.filesScanned}</p>
              </div>
              <div className="p-4 bg-green-50 rounded">
                <p className="text-sm text-gray-600">Patterns Found</p>
                <p className="text-2xl font-bold">{result.sourceAnalysis.patternsFound}</p>
              </div>
              <div className="p-4 bg-orange-50 rounded">
                <p className="text-sm text-gray-600">Need Review</p>
                <p className="text-2xl font-bold">{result.manualReviewRequired.length}</p>
              </div>
            </div>

            {/* Suggested Constraints */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Suggested Constraints</h3>
              <div className="space-y-2">
                {result.suggestedConstraints.map((constraint, i) => (
                  <label
                    key={i}
                    className="flex items-start p-3 border rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedConstraints.includes(i.toString())}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedConstraints([...selectedConstraints, i.toString()]);
                        } else {
                          setSelectedConstraints(
                            selectedConstraints.filter(x => x !== i.toString())
                          );
                        }
                      }}
                      className="mt-1 mr-3"
                    />
                    <div className="flex-1">
                      <p className="font-semibold">{constraint.template}</p>
                      <p className="text-sm text-gray-600">{constraint.reason}</p>
                      <div className="flex gap-2 mt-2">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                          {(constraint.confidence * 100).toFixed(0)}% confident
                        </span>
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                          {constraint.templatePath}
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Manual Review */}
            {result.manualReviewRequired.length > 0 && (
              <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded mb-6">
                <h3 className="text-lg font-semibold mb-3">Requires Manual Review</h3>
                <div className="space-y-2">
                  {result.manualReviewRequired.map((item, i) => (
                    <div key={i} className="p-2 bg-white rounded">
                      <p className="font-semibold text-sm">{item.finding}</p>
                      <p className="text-xs text-gray-600">
                        Suggested: {item.suggestedCategory} ({item.suggestedSeverity})
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleApply}
                disabled={selectedConstraints.length === 0 || applying}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
              >
                {applying ? "Applying..." : `Apply ${selectedConstraints.length} Constraints`}
              </button>
              <button
                onClick={() => {
                  setResult(null);
                  setProjectId("");
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
        <h3 className="font-semibold mb-2">How It Works</h3>
        <ul className="text-sm space-y-1 text-gray-700">
          <li>✓ Scans package.json for dependencies</li>
          <li>✓ Analyzes README for documentation clues</li>
          <li>✓ Checks configuration files (tsconfig.json, etc)</li>
          <li>✓ Suggests constraints with confidence scores</li>
          <li>✓ Flags items requiring manual review</li>
        </ul>
      </div>
    </div>
  );
}
