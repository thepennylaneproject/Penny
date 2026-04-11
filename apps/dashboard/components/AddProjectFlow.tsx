"use client";

/**
 * AddProjectFlow — unified component for adding a project.
 *
 * Replaces scattered ImportModal with clear, step-by-step onboarding.
 * Users select a mode → provide details → confirm → done.
 */

import { useState, type CSSProperties } from "react";
import type { Project } from "@/lib/types";
import type { ImportSummary } from "@/lib/import-summary";
import {
  type OnboardingMode,
  type SubmitMode,
  type OnboardingData,
  SUBMIT_MODE_LABELS,
  SUBMIT_MODE_GUIDANCE,
  ONBOARDING_STEP_GUIDANCE,
  validateOnboardingData,
} from "@/lib/onboarding-machine";
interface AddProjectFlowProps {
  onImport: (project: Project) => Promise<ImportSummary>;
  onOnboardRepository: (input: {
    name?: string;
    repository_url?: string;
    default_branch?: string;
  }) => Promise<void>;
  fixedMode?: SubmitMode;
  onClose: () => void;
}

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
};

const stepHeaderStyle: CSSProperties = {
  textAlign: "center",
  marginBottom: "1.5rem",
};

const stepTitleStyle: CSSProperties = {
  fontSize: "18px",
  fontWeight: 600,
  color: "var(--ink-text)",
  margin: 0,
  marginBottom: "0.25rem",
};

const stepSubtitleStyle: CSSProperties = {
  fontSize: "13px",
  color: "var(--ink-text-3)",
  margin: 0,
};

const modeGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "1rem",
};

const modeCardStyle = (selected: boolean): CSSProperties => ({
  padding: "1rem",
  borderRadius: "var(--radius-md)",
  border: selected ? "2px solid var(--ink-text)" : "1px solid var(--ink-border)",
  background: selected ? "var(--ink-bg-raised)" : "var(--ink-bg-sunken)",
  cursor: "pointer",
  transition: "all 150ms ease-out",
  textAlign: "center",
});

export function AddProjectFlow({
  onImport,
  onOnboardRepository,
  fixedMode,
  onClose,
}: AddProjectFlowProps) {
  const [step, setStep] = useState<OnboardingMode>(fixedMode ? "input_details" : "select_mode");
  const [submitMode, setSubmitMode] = useState<SubmitMode | null>(fixedMode ?? null);
  const [data, setData] = useState<OnboardingData>({
    submitMode: fixedMode ?? "repository",
  });
  const [error, setError] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [, setDiscardOpen] = useState(false);

  const isDirty =
    (data.projectName?.trim().length ?? 0) > 0 ||
    (data.repositoryUrl?.trim().length ?? 0) > 0 ||
    (data.defaultBranch?.trim().length ?? 0) > 0 ||
    (data.jsonContent?.trim().length ?? 0) > 0;

  const stepGuidance = ONBOARDING_STEP_GUIDANCE[step];

  const handleSelectMode = (mode: SubmitMode) => {
    setSubmitMode(mode);
    setData((prev) => ({ ...prev, submitMode: mode }));
    setStep("input_details");
    setError("");
  };

  const handleBack = () => {
    if (fixedMode) {
      // Can't go back if mode is fixed
      setError("");
      return;
    }
    setStep("select_mode");
    setError("");
  };

  const handleNext = async () => {
    const validation = validateOnboardingData(data);
    if (!validation.valid) {
      setError(validation.error ?? "Invalid data");
      return;
    }

    setStep("confirm");
    setError("");
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    setError("");

    try {
      if (submitMode === "repository") {
        await onOnboardRepository({
          name: data.projectName,
          repository_url: data.repositoryUrl,
          default_branch: data.defaultBranch,
        });
      } else if (submitMode === "json") {
        if (!data.jsonContent) throw new Error("No JSON content");
        const parsed = JSON.parse(data.jsonContent);
        const summary = await onImport(parsed);
        setImportSummary(summary);
      }
      setStep("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add project";
      setError(msg);
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (importSummary) {
      onClose();
      return;
    }
    if (isDirty && !submitting) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  };

  // Step 1: Select Mode
  if (step === "select_mode" && !fixedMode) {
    return (
      <div style={containerStyle}>
        <div style={stepHeaderStyle}>
          <h2 style={stepTitleStyle}>{stepGuidance.title}</h2>
          {stepGuidance.subtitle && <p style={stepSubtitleStyle}>{stepGuidance.subtitle}</p>}
        </div>

        <div style={modeGridStyle}>
          {(["repository", "json"] as const).map((mode) => (
            <div
              key={mode}
              onClick={() => handleSelectMode(mode)}
              style={modeCardStyle(submitMode === mode)}
            >
              <div style={{ fontSize: "20px", marginBottom: "0.5rem" }}>
                {mode === "repository" ? "🔗" : "📄"}
              </div>
              <h3 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 0.5rem", color: "var(--ink-text)" }}>
                {SUBMIT_MODE_LABELS[mode]}
              </h3>
              <p style={{ fontSize: "12px", color: "var(--ink-text-3)", margin: 0, lineHeight: 1.4 }}>
                {SUBMIT_MODE_GUIDANCE[mode].description}
              </p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleClose}
          style={{
            alignSelf: "flex-start",
            fontSize: "12px",
            padding: "6px 12px",
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // Step 2: Input Details
  if (step === "input_details") {
    const isRepo = submitMode === "repository";
    return (
      <div style={containerStyle}>
        <div style={stepHeaderStyle}>
          <h2 style={stepTitleStyle}>{stepGuidance.title}</h2>
          {stepGuidance.subtitle && <p style={stepSubtitleStyle}>{stepGuidance.subtitle}</p>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {isRepo ? (
            <>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--ink-text)" }}>
                  Project name
                </label>
                <input
                  type="text"
                  value={data.projectName ?? ""}
                  onChange={(e) => setData((prev) => ({ ...prev, projectName: e.target.value }))}
                  style={{
                    width: "100%",
                    marginTop: "0.4rem",
                    padding: "0.6rem",
                    fontSize: "13px",
                    border: "1px solid var(--ink-border)",
                    borderRadius: "var(--radius-md)",
                    fontFamily: "inherit",
                  }}
                  placeholder="my-project"
                />
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--ink-text)" }}>
                  Repository URL
                </label>
                <input
                  type="text"
                  value={data.repositoryUrl ?? ""}
                  onChange={(e) => setData((prev) => ({ ...prev, repositoryUrl: e.target.value }))}
                  style={{
                    width: "100%",
                    marginTop: "0.4rem",
                    padding: "0.6rem",
                    fontSize: "13px",
                    border: "1px solid var(--ink-border)",
                    borderRadius: "var(--radius-md)",
                    fontFamily: "inherit",
                  }}
                  placeholder="https://github.com/user/repo"
                />
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--ink-text)" }}>
                  Default branch (optional)
                </label>
                <input
                  type="text"
                  value={data.defaultBranch ?? ""}
                  onChange={(e) => setData((prev) => ({ ...prev, defaultBranch: e.target.value }))}
                  style={{
                    width: "100%",
                    marginTop: "0.4rem",
                    padding: "0.6rem",
                    fontSize: "13px",
                    border: "1px solid var(--ink-border)",
                    borderRadius: "var(--radius-md)",
                    fontFamily: "inherit",
                  }}
                  placeholder="main"
                />
              </div>
            </>
          ) : (
            <div>
              <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--ink-text)" }}>
                JSON findings file
              </label>
              <textarea
                value={data.jsonContent ?? ""}
                onChange={(e) => setData((prev) => ({ ...prev, jsonContent: e.target.value }))}
                style={{
                  width: "100%",
                  minHeight: "200px",
                  marginTop: "0.4rem",
                  padding: "0.6rem",
                  fontSize: "12px",
                  fontFamily: "var(--font-mono)",
                  border: "1px solid var(--ink-border)",
                  borderRadius: "var(--radius-md)",
                }}
                placeholder='{"open_findings": [...]}'
              />
            </div>
          )}
        </div>

        {error && (
          <div style={{ fontSize: "12px", color: "var(--ink-red)", padding: "0.6rem", background: "rgba(239, 68, 68, 0.1)", borderRadius: "var(--radius-md)" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button type="button" onClick={handleBack} style={{ fontSize: "12px", padding: "6px 12px" }}>
            {fixedMode ? "Cancel" : "Back"}
          </button>
          <button
            type="button"
            onClick={() => void handleNext()}
            disabled={submitting}
            style={{ fontSize: "12px", padding: "6px 12px" }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // Step 3: Confirm
  if (step === "confirm") {
    return (
      <div style={containerStyle}>
        <div style={stepHeaderStyle}>
          <h2 style={stepTitleStyle}>{stepGuidance.title}</h2>
          {stepGuidance.subtitle && <p style={stepSubtitleStyle}>{stepGuidance.subtitle}</p>}
        </div>

        <div style={{ padding: "1rem", background: "var(--ink-bg-sunken)", borderRadius: "var(--radius-md)" }}>
          {submitMode === "repository" ? (
            <>
              <p style={{ fontSize: "12px", margin: "0 0 0.5rem", color: "var(--ink-text-3)" }}>
                <strong>Project:</strong> {data.projectName}
              </p>
              <p style={{ fontSize: "12px", margin: "0 0 0.5rem", color: "var(--ink-text-3)", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
                <strong>Repository:</strong> {data.repositoryUrl}
              </p>
              {data.defaultBranch && (
                <p style={{ fontSize: "12px", margin: "0", color: "var(--ink-text-3)" }}>
                  <strong>Branch:</strong> {data.defaultBranch}
                </p>
              )}
            </>
          ) : (
            <p style={{ fontSize: "12px", color: "var(--ink-text-3)" }}>
              Ready to import {JSON.parse(data.jsonContent ?? "{}").open_findings?.length ?? "?"} findings
            </p>
          )}
        </div>

        {error && (
          <div style={{ fontSize: "12px", color: "var(--ink-red)", padding: "0.6rem", background: "rgba(239, 68, 68, 0.1)", borderRadius: "var(--radius-md)" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => setStep("input_details")}
            disabled={submitting}
            style={{ fontSize: "12px", padding: "6px 12px" }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting}
            style={{ fontSize: "12px", padding: "6px 12px" }}
          >
            {submitting ? "Adding..." : "Add Project"}
          </button>
        </div>
      </div>
    );
  }

  // Step 4: Done
  if (step === "done") {
    return (
      <div style={containerStyle}>
        <div style={stepHeaderStyle}>
          <div style={{ fontSize: "32px", marginBottom: "0.75rem" }}>✓</div>
          <h2 style={stepTitleStyle}>{stepGuidance.title}</h2>
          {stepGuidance.subtitle && <p style={stepSubtitleStyle}>{stepGuidance.subtitle}</p>}
        </div>

        {importSummary && (
          <div style={{ padding: "1rem", background: "rgba(52, 168, 83, 0.1)", borderRadius: "var(--radius-md)", fontSize: "12px", color: "var(--ink-green)" }}>
            Added {importSummary.added ?? "?"} findings
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{ fontSize: "12px", padding: "6px 12px", alignSelf: "flex-end" }}
        >
          Done
        </button>
      </div>
    );
  }

  // Error state
  return (
    <div style={containerStyle}>
      <div style={stepHeaderStyle}>
        <div style={{ fontSize: "32px", marginBottom: "0.75rem" }}>✗</div>
        <h2 style={stepTitleStyle}>{stepGuidance.title}</h2>
        {stepGuidance.subtitle && <p style={stepSubtitleStyle}>{stepGuidance.subtitle}</p>}
      </div>

      <div style={{ fontSize: "12px", color: "var(--ink-red)", padding: "0.6rem", background: "rgba(239, 68, 68, 0.1)", borderRadius: "var(--radius-md)" }}>
        {error}
      </div>

      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => setStep("input_details")}
          style={{ fontSize: "12px", padding: "6px 12px" }}
        >
          Try Again
        </button>
        <button
          type="button"
          onClick={handleClose}
          style={{ fontSize: "12px", padding: "6px 12px" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
