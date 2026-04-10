"use client";

import { useState, useRef, type CSSProperties } from "react";
import type { Project } from "@/lib/types";
import type { ImportSummary } from "@/lib/import-summary";
import { UI_COPY } from "@/lib/ui-copy";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type OnboardMode = "repository" | "json";

interface ImportModalProps {
  onImport: (project: Project) => Promise<ImportSummary>;
  onOnboardRepository: (input: {
    name?: string;
    repository_url?: string;
    default_branch?: string;
  }) => Promise<void>;
  fixedMode?: OnboardMode;
  onClose:  () => void;
}

const modeBtn = (active: boolean): CSSProperties => ({
  fontSize:     "11px",
  fontFamily:   "var(--font-mono)",
  padding:      "5px 12px",
  borderRadius: "var(--radius-md)",
  border:       active ? "0.5px solid var(--ink-border)" : "0.5px solid var(--ink-border-faint)",
  background:   active ? "var(--ink-bg-raised)" : "transparent",
  color:        active ? "var(--ink-text)" : "var(--ink-text-4)",
  cursor:       "pointer",
});

export function ImportModal({
  onImport,
  onOnboardRepository,
  fixedMode,
  onClose,
}: ImportModalProps) {
  const [mode, setMode] = useState<OnboardMode>(fixedMode ?? "repository");
  const [name,      setName]      = useState("");
  const [repoUrl,   setRepoUrl]   = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [jsonText,  setJsonText]  = useState("");
  const [error,     setError]     = useState("");
  const [dragging,  setDragging]  = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [onboardedName, setOnboardedName] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isDirty =
    name.trim().length > 0 ||
    repoUrl.trim().length > 0 ||
    defaultBranch.trim().length > 0 ||
    jsonText.trim().length > 0;

  const tabsEnabled = fixedMode === undefined;
  const isRepositoryMode = mode === "repository";
  const modalTitle = isRepositoryMode ? "New project from repository" : "Import findings";

  const handleClose = () => {
    if (importSummary || onboardedName) {
      onClose();
      return;
    }
    if (isDirty && !submitting) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  };

  function deriveNameFromRepoUrl(value: string): string {
    try {
      const url = new URL(value);
      const parts = url.pathname.split("/").filter(Boolean);
      return (parts[parts.length - 1] || "").replace(/\.git$/, "");
    } catch {
      const parts = value.split("/").filter(Boolean);
      return (parts[parts.length - 1] || value.trim()).replace(/\.git$/, "");
    }
  }

  function loadFile(file: File) {
    const derivedName = file.name.replace("open_findings", "").replace(".json", "").replace(/^[-_]/, "");
    if (!name && derivedName) setName(derivedName);
    const reader = new FileReader();
    reader.onload = (ev) => setJsonText((ev.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith(".json")) loadFile(file);
  }

  async function handleSubmit() {
    const trimmedName = name.trim();
    const trimmedRepo = repoUrl.trim();
    const trimmedJson = jsonText.trim();
    const projectName = trimmedName || (trimmedRepo ? deriveNameFromRepoUrl(trimmedRepo) : "");

    setError("");

    if (mode === "repository") {
      if (!trimmedRepo) {
        setError("Enter a repository URL (HTTPS or SSH). Penny clones it on the server.");
        return;
      }
      if (!projectName) {
        setError("Project name is required or will be derived from repository URL");
        return;
      }
      setSubmitting(true);
      try {
        await onOnboardRepository({
          name: projectName || undefined,
          repository_url: trimmedRepo,
          default_branch: defaultBranch.trim() || undefined,
        });
        setOnboardedName(projectName);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!trimmedJson) {
      setError("Load or paste an open_findings JSON payload");
      return;
    }
    if (!trimmedName) {
      setError("Enter a project name (or load a file; the name may be inferred from the filename)");
      return;
    }
    let data: { open_findings?: unknown; findings?: unknown };
    try {
      data = JSON.parse(trimmedJson) as { open_findings?: unknown; findings?: unknown };
    } catch {
      setError("Invalid JSON");
      return;
    }
    const findings = data.open_findings ?? data.findings ?? [];
    if (!Array.isArray(findings)) {
      setError("No findings array found");
      return;
    }

    setSubmitting(true);
    try {
      const summary = await onImport({
        name: trimmedName,
        findings,
        repositoryUrl: undefined,
      });
      setImportSummary(summary);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const submitLabel =
    mode === "repository"
      ? submitting
        ? "onboarding…"
        : "Start onboarding"
      : submitting
        ? "importing…"
        : "Import findings";

  return (
    <>
      <ConfirmDialog
        open={discardOpen}
        title={UI_COPY.confirmDiscardImportTitle}
        body={UI_COPY.confirmDiscardImportBody}
        confirmLabel={UI_COPY.confirmDiscard}
        cancelLabel={UI_COPY.confirmCancel}
        danger
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => {
          setDiscardOpen(false);
          onClose();
        }}
      />
    <div
      style={{
        background:   "var(--ink-bg-raised)",
        border:       "0.5px solid var(--ink-border)",
        borderRadius: "var(--radius-lg)",
        padding:      "1.5rem 1.75rem",
        marginBottom: "1.5rem",
      }}
      className="animate-fade-in"
    >
      <div
        style={{
          display:        "flex",
          justifyContent: "space-between",
          alignItems:     "center",
          marginBottom:   "1.25rem",
        }}
      >
        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--ink-text)" }}>
          {modalTitle}
        </span>
        <button
          type="button"
          onClick={handleClose}
          style={{ border: "none", background: "transparent", padding: "0 4px", fontSize: "16px", color: "var(--ink-text-4)" }}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {onboardedName ? (
        <div>
          <div
            style={{
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
              color: "var(--ink-green)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "0.65rem",
            }}
          >
            Project onboarded
          </div>
          <p
            style={{
              margin: "0 0 0.5rem 0",
              fontSize: "13px",
              color: "var(--ink-text)",
              fontWeight: 500,
            }}
          >
            {onboardedName}
          </p>
          <p
            style={{
              margin: "0 0 1rem 0",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "var(--ink-text-4)",
              lineHeight: 1.5,
            }}
          >
            The project is being set up. Findings will appear once the first audit run completes — this usually takes a few minutes.
          </p>
          <button type="button" onClick={() => onClose()} style={{ padding: "5px 16px" }}>
            Done
          </button>
        </div>
      ) : importSummary ? (
        <div>
          <div
            style={{
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
              color: "var(--ink-text)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "0.65rem",
            }}
          >
            {UI_COPY.importSummaryHeading}
          </div>
          <p
            style={{
              margin: "0 0 0.75rem 0",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              color: "var(--ink-text-4)",
              lineHeight: 1.5,
            }}
          >
            {importSummary.mode === "replace"
              ? UI_COPY.importSummaryReplaceHint
              : UI_COPY.importSummaryMergeHint}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "0.35rem 1.25rem",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "var(--ink-text-2)",
              marginBottom: "0.75rem",
              maxWidth: "22rem",
            }}
          >
            {importSummary.mode === "merge" && (
              <>
                <span style={{ color: "var(--ink-text-4)" }}>{UI_COPY.importSummaryAdded}</span>
                <span>{importSummary.added}</span>
                <span style={{ color: "var(--ink-text-4)" }}>{UI_COPY.importSummaryUpdated}</span>
                <span>{importSummary.updated}</span>
                <span style={{ color: "var(--ink-text-4)" }}>{UI_COPY.importSummaryUnchanged}</span>
                <span>{importSummary.unchanged}</span>
              </>
            )}
            {importSummary.mode === "replace" && (
              <>
                <span style={{ color: "var(--ink-text-4)" }}>{UI_COPY.importSummaryRemoved}</span>
                <span>{importSummary.removed}</span>
                <span style={{ color: "var(--ink-text-4)" }}>{UI_COPY.importSummaryAdded}</span>
                <span>{importSummary.added}</span>
              </>
            )}
            <span style={{ color: "var(--ink-text-4)" }}>{UI_COPY.importSummaryTotals}</span>
            <span>
              {importSummary.total_before} → {importSummary.total_after}
            </span>
          </div>
          <button type="button" onClick={() => onClose()} style={{ padding: "5px 16px" }}>
            {UI_COPY.importSummaryDone}
          </button>
        </div>
      ) : (
        <>
      {tabsEnabled && (
        <div
          role="tablist"
          aria-label="Onboarding mode"
          style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "repository"}
            onClick={() => {
              setMode("repository");
              setError("");
            }}
            style={modeBtn(mode === "repository")}
          >
            From repository
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "json"}
            onClick={() => {
              setMode("json");
              setError("");
            }}
            style={modeBtn(mode === "json")}
          >
            Import findings JSON
          </button>
        </div>
      )}

      {mode === "repository" && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
              color: "var(--ink-text)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "0.75rem",
            }}
          >
            Repository <span style={{ color: "var(--ink-red)" }}>required</span>
          </div>
          <div style={{ fontSize: "10px", color: "var(--ink-text-4)", marginBottom: "0.75rem", lineHeight: 1.45 }}>
            Penny clones this URL on the server (no local checkout required). Project name is optional if the URL contains the repo name. Private repos need network access and credentials on the host running the dashboard.
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name (e.g. relevnt)"
            style={{ marginBottom: "0.5rem", display: "block", width: "100%", maxWidth: "480px" }}
          />
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="Repository URL (https://github.com/owner/repo)"
            style={{ marginBottom: "0.5rem", display: "block", width: "100%", maxWidth: "480px" }}
          />
          <input
            type="text"
            value={defaultBranch}
            onChange={(e) => setDefaultBranch(e.target.value)}
            placeholder="Default branch (optional)"
            style={{ display: "block", width: "100%", maxWidth: "480px" }}
          />
        </div>
      )}

      {mode === "json" && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
              color: "var(--ink-text)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "0.75rem",
            }}
          >
            Findings file
          </div>
          <div style={{ fontSize: "10px", color: "var(--ink-text-4)", marginBottom: "0.75rem", lineHeight: 1.45 }}>
            Import an existing <code style={{ fontSize: "10px" }}>open_findings.json</code> into the portfolio. Merges by{" "}
            <code style={{ fontSize: "10px" }}>finding_id</code> (updates rows when key fields differ from the snapshot).
            After import, a summary shows added / updated / unchanged counts.
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            style={{ marginBottom: "1rem", display: "block", width: "100%", maxWidth: "480px" }}
          />
          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                fontSize: "9px",
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
                color: "var(--ink-text-4)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: "0.375rem",
              }}
            >
              Load from file
            </label>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              style={{
                border: `0.5px dashed ${dragging ? "var(--ink-border)" : "var(--ink-border-faint)"}`,
                borderRadius: "var(--radius-md)",
                padding: "1.25rem",
                textAlign: "center",
                cursor: "pointer",
                background: dragging ? "var(--ink-bg-sunken)" : "transparent",
                transition: "background 0.12s ease, border-color 0.12s ease",
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--ink-text-4)", fontFamily: "var(--font-mono)" }}>
                {jsonText ? "✓ file loaded" : "drag & drop open_findings.json or click to browse"}
              </span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              onChange={handleFile}
              style={{ display: "none" }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: "9px",
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
                color: "var(--ink-text-4)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: "0.375rem",
              }}
            >
              Or paste JSON
            </label>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              rows={6}
              placeholder='{"open_findings": [...]}'
              style={{ fontFamily: "var(--font-mono)", fontSize: "11px", width: "100%", maxWidth: "520px" }}
            />
          </div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--ink-red)", marginBottom: "0.75rem" }}>
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        style={{ padding: "5px 16px" }}
      >
        {submitLabel}
      </button>
        </>
      )}
    </div>
    </>
  );
}
