"use client";

import { useState, useEffect } from "react";
import type { Project } from "@/lib/types";
import { apiFetch } from "@/lib/api-fetch";

interface ProjectManagementPanelProps {
  project: Project;
  onDeleted: () => void;
  onUpdated: () => Promise<void>;
}

const inputStyle: React.CSSProperties = {
  fontSize: "11px",
  fontFamily: "var(--font-mono)",
  padding: "4px 8px",
  background: "var(--ink-bg)",
  border: "0.5px solid var(--ink-border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--ink-text)",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: "10px",
  fontFamily: "var(--font-mono)",
  color: "var(--ink-text-4)",
  marginBottom: "4px",
  display: "block",
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.55rem",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const dangerBtnStyle: React.CSSProperties = {
  fontSize: "11px",
  fontFamily: "var(--font-mono)",
  padding: "4px 12px",
  background: "transparent",
  border: "0.5px solid var(--ink-red)",
  borderRadius: "var(--radius-sm)",
  color: "var(--ink-red)",
  cursor: "pointer",
};

const saveBtnStyle: React.CSSProperties = {
  fontSize: "11px",
  fontFamily: "var(--font-mono)",
  padding: "4px 14px",
  background: "var(--ink-bg-raised)",
  border: "0.5px solid var(--ink-border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--ink-text)",
  cursor: "pointer",
};

const dividerStyle: React.CSSProperties = {
  borderTop: "0.5px solid var(--ink-border-faint)",
  margin: "0.5rem 0",
};

export function ProjectManagementPanel({
  project,
  onDeleted,
  onUpdated,
}: ProjectManagementPanelProps) {
  const [repoUrl, setRepoUrl]     = useState(project.repositoryUrl ?? "");
  const [scanRoots, setScanRoots] = useState(
    (project.auditConfig?.scanRoots ?? ["./"]).join(", ")
  );
  const [localPath, setLocalPath] = useState(
    project.repoAccess?.localPath ?? ""
  );

  const [saving,   setSaving]   = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset,  setConfirmReset]  = useState(false);
  const [runningCluster, setRunningCluster] = useState<string | null>(null);
  const [error,  setError]  = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Sync form if project changes
  useEffect(() => {
    setRepoUrl(project.repositoryUrl ?? "");
    setScanRoots((project.auditConfig?.scanRoots ?? ["./"]).join(", "));
    setLocalPath(project.repoAccess?.localPath ?? "");
  }, [project.name, project.repositoryUrl, project.auditConfig, project.repoAccess]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const body = {
        ...project,
        repositoryUrl: repoUrl.trim() || undefined,
        repoAccess: {
          ...project.repoAccess,
          localPath: localPath.trim() || undefined,
        },
        auditConfig: {
          ...project.auditConfig,
          scanRoots: scanRoots
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      };
      const res = await apiFetch(
        `/api/projects/${encodeURIComponent(project.name)}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setStatus("Saved.");
      await onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleResetOnboarding() {
    setResetting(true);
    setError(null);
    setStatus(null);
    try {
      // Set status back to draft + clear onboarding state so it re-runs fresh
      const body: Partial<Project> = {
        ...project,
        status: "draft",
        onboardingState: {
          stage: "collect_repo_context",
          reviewRequired: false,
          updatedAt: new Date().toISOString(),
        },
        profile: undefined,
        expectations: undefined,
      };
      const res = await apiFetch(
        `/api/projects/${encodeURIComponent(project.name)}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setStatus("Reset to draft. You can now re-run onboarding.");
      setConfirmReset(false);
      await onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  }

  async function handleClusterOnboard(cluster: string) {
    setRunningCluster(cluster);
    setError(null);
    setStatus(null);
    try {
      const res = await apiFetch(
        `/api/projects/${encodeURIComponent(project.name)}/onboarding/cluster`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cluster }) }
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      // Assuming the API returns the artifacts we collected for debug purposes right now.
      const data = await res.json() as { artifacts: Record<string, unknown> };
      console.log(`[pm-cluster] ${cluster} onboarding returned:`, data.artifacts);
      setStatus(`Successfully ran ${cluster} onboarding pass.`);
      await onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunningCluster(null);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/projects/${encodeURIComponent(project.name)}`,
        { method: "DELETE" }
      );
      if (!res.ok && res.status !== 204) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* ── Edit config ─────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-text-3)",
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Configuration
        </div>

        <div style={rowStyle}>
          <label style={labelStyle}>Repository URL</label>
          <input
            id="pm-repo-url"
            type="url"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/org/repo"
            style={inputStyle}
          />
        </div>

        <div style={rowStyle}>
          <label style={labelStyle}>Local path (for portfolio mirror)</label>
          <input
            id="pm-local-path"
            type="text"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            placeholder="/absolute/path/to/repo"
            style={inputStyle}
          />
        </div>

        <div style={rowStyle}>
          <label style={labelStyle}>Scan roots <span style={{ color: "var(--ink-text-4)" }}>(comma-separated)</span></label>
          <input
            id="pm-scan-roots"
            type="text"
            value={scanRoots}
            onChange={(e) => setScanRoots(e.target.value)}
            placeholder="./, src/"
            style={inputStyle}
          />
        </div>

        {error && (
          <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--ink-red)" }}>
            {error}
          </div>
        )}
        {status && (
          <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--ink-green)" }}>
            {status}
          </div>
        )}

        <div>
          <button
            id="pm-save-btn"
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            style={saveBtnStyle}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <div style={dividerStyle} />

      {/* ── Reset onboarding ─────────────────────────────────── */}
      <div style={sectionStyle}>
        <div
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-text-3)",
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Re-onboard
        </div>
        <p style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", margin: 0, lineHeight: 1.5 }}>
          Resets the project to <code style={{ color: "var(--ink-text-3)" }}>draft</code> status and clears the profile and expectations so you can run onboarding again from scratch. Findings are preserved.
        </p>

        {!confirmReset ? (
          <div>
            <button
              id="pm-reset-onboarding-btn"
              type="button"
              onClick={() => setConfirmReset(true)}
              style={{ ...dangerBtnStyle, borderColor: "var(--ink-amber)", color: "var(--ink-amber)" }}
            >
              Reset onboarding
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)" }}>
              Confirm reset?
            </span>
            <button
              id="pm-reset-confirm-btn"
              type="button"
              onClick={() => void handleResetOnboarding()}
              disabled={resetting}
              style={{ ...dangerBtnStyle, borderColor: "var(--ink-amber)", color: "var(--ink-amber)" }}
            >
              {resetting ? "Resetting…" : "Yes, reset"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              style={{ fontSize: "11px", fontFamily: "var(--font-mono)", background: "none", border: "none", color: "var(--ink-text-4)", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div style={dividerStyle} />

      {/* ── Cluster Onboarding ──────────────────────────────── */}
      <div style={sectionStyle}>
        <div
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-text-3)",
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Cluster Onboarding
        </div>
        <p style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", margin: 0, lineHeight: 1.5 }}>
          Run secondary data-gathering passes to collect cluster-specific metadata.
        </p>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "4px" }}>
          <button
            type="button"
            onClick={() => void handleClusterOnboard("investor")}
            disabled={runningCluster !== null}
            style={saveBtnStyle}
          >
            {runningCluster === "investor" ? "Running…" : "Investor Onboarding"}
          </button>
          
          <button
            type="button"
            onClick={() => void handleClusterOnboard("domain")}
            disabled={runningCluster !== null}
            style={saveBtnStyle}
          >
            {runningCluster === "domain" ? "Running…" : "Domain Onboarding"}
          </button>
          
          <button
            type="button"
            onClick={() => void handleClusterOnboard("visual")}
            disabled={runningCluster !== null}
            style={saveBtnStyle}
          >
            {runningCluster === "visual" ? "Running…" : "Visual Onboarding"}
          </button>
        </div>
      </div>

      <div style={dividerStyle} />

      {/* ── Delete project ───────────────────────────────────── */}
      <div style={sectionStyle}>
        <div
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-red)",
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Danger zone
        </div>
        <p style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", margin: 0, lineHeight: 1.5 }}>
          Permanently removes this project and all its findings, onboarding state, and history from penny. This cannot be undone.
        </p>

        {!confirmDelete ? (
          <div>
            <button
              id="pm-delete-btn"
              type="button"
              onClick={() => setConfirmDelete(true)}
              style={dangerBtnStyle}
            >
              Delete project
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--ink-red)" }}>
              Delete <strong>{project.name}</strong>? Cannot be undone.
            </span>
            <button
              id="pm-delete-confirm-btn"
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              style={dangerBtnStyle}
            >
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              style={{ fontSize: "11px", fontFamily: "var(--font-mono)", background: "none", border: "none", color: "var(--ink-text-4)", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
