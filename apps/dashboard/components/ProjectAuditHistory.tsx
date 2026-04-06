"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetchWithEnqueueSecret } from "@/lib/api-fetch";
import { penny_ENQUEUE_SECRET_STORAGE_KEY } from "@/lib/auth-constants";
import type { AuditKind, ProjectManifest, RepairJob, ScopeType } from "@/lib/types";
import type {
  pennyAuditJobRow,
  pennyAuditRunRow,
} from "@/lib/orchestration-jobs";
import {
  concatRawLlmForProject,
  effectiveCoverageComplete,
  forensicsLinesForProject,
  redactAuditRunPayload,
  runSeriesAlerts,
} from "@/lib/audit-run-forensics";

const RUN_SERIES_SPARKLINE_MAX = 12;

interface ProjectAuditHistoryProps {
  projectName: string;
  projectStatus?: string;
}

function deltaVsPrior(
  current: number,
  prior: number | undefined
): string | null {
  if (prior === undefined) return null;
  const delta = current - prior;
  if (delta === 0) return "same as prior run";
  if (delta > 0) return `+${delta} vs prior run`;
  return `${delta} vs prior run`;
}

function formatAuditLabel(
  jobType: string,
  payload?: Record<string, unknown>
): string {
  if (jobType === "onboard_project" || jobType === "onboard_repository") return "Project setup audit";
  if (jobType === "re_audit_project") return "Full re-audit";
  if (jobType === "synthesize_project") return "Synthesizer";
  if (jobType === "weekly_audit") return "Weekly portfolio audit";
  if (jobType === "audit_project") {
    if (payload && payload.visual_only === true) return "Visual audit";
    if (payload && typeof payload.audit_kind === "string") return `${payload.audit_kind} audit`;
    return "Project audit";
  }
  return jobType;
}

export function ProjectAuditHistory({ projectName, projectStatus }: ProjectAuditHistoryProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<pennyAuditRunRow[]>([]);
  const [jobs, setJobs] = useState<pennyAuditJobRow[]>([]);
  const [manifest, setManifest] = useState<ProjectManifest | null>(null);
  const [repairJobs, setRepairJobs] = useState<RepairJob[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enqueueSecret, setEnqueueSecret] = useState<string>("");
  const [enqueueAuthOptional, setEnqueueAuthOptional] = useState(false);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [auditKind, setAuditKind] = useState<AuditKind>("full");
  const [scopeType, setScopeType] = useState<ScopeType>("project");
  const [scopePaths, setScopePaths] = useState("");
  const [baseRef, setBaseRef] = useState("");
  const [headRef, setHeadRef] = useState("");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const storedSecret = sessionStorage.getItem(penny_ENQUEUE_SECRET_STORAGE_KEY);
      if (storedSecret) setEnqueueSecret(storedSecret);
    } catch {
      /* ignore */
    }
  }, []);

  const persistSecret = (secretValue: string) => {
    setEnqueueSecret(secretValue);
    try {
      if (secretValue.trim())
        sessionStorage.setItem(penny_ENQUEUE_SECRET_STORAGE_KEY, secretValue.trim());
      else sessionStorage.removeItem(penny_ENQUEUE_SECRET_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await apiFetchWithEnqueueSecret(
        `/api/orchestration/runs?project=${encodeURIComponent(projectName)}`
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        configured?: boolean;
        runs?: pennyAuditRunRow[];
        jobs?: pennyAuditJobRow[];
        manifest?: ProjectManifest | null;
        repair_jobs?: RepairJob[];
        enqueue_auth_optional?: boolean;
      };
      if (!res.ok) {
        setConfigured(null);
        setRuns([]);
        setJobs([]);
        setLoadError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setConfigured(Boolean(data.configured));
      setRuns(Array.isArray(data.runs) ? data.runs : []);
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
      setManifest(data.manifest ?? null);
      setRepairJobs(Array.isArray(data.repair_jobs) ? data.repair_jobs : []);
      setEnqueueAuthOptional(Boolean(data.enqueue_auth_optional));
    } catch {
      setLoadError("Network error");
      setConfigured(null);
    }
  }, [projectName]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) {
    return (
      <div
        style={{
          marginBottom: "1.25rem",
          fontSize: "11px",
          fontFamily: "var(--font-mono)",
          color: "var(--ink-red)",
        }}
      >
        audit history: {loadError}
      </div>
    );
  }

  if (configured === false) {
    return (
      <div
        style={{
          marginBottom: "1.25rem",
          fontSize: "10px",
          fontFamily: "var(--font-mono)",
          color: "var(--ink-text-4)",
          lineHeight: 1.45,
        }}
      >
        Worker audit history requires <code>DATABASE_URL</code> (Supabase). Runs are stored in{" "}
        <code>penny_audit_runs</code> / <code>penny_audit_jobs</code>.
      </div>
    );
  }

  if (configured === null) {
    return (
      <div
        style={{
          marginBottom: "1.25rem",
          fontSize: "10px",
          fontFamily: "var(--font-mono)",
          color: "var(--ink-text-4)",
        }}
      >
        audit history: loading…
      </div>
    );
  }

  const hasAny = runs.length > 0 || jobs.length > 0;
  const canEnqueue =
    configured === true &&
    (projectStatus ?? "active") === "active" &&
    (enqueueAuthOptional || enqueueSecret.trim().length > 0);

  const authHeaders = (): HeadersInit => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const trimmedSecret = enqueueSecret.trim();
    if (trimmedSecret) headers.Authorization = `Bearer ${trimmedSecret}`;
    return headers;
  };

  const formatApiError = async (res: Response): Promise<string> => {
    const err = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      hint?: string;
    };
    const message =
      typeof err.message === "string"
        ? err.message
        : typeof err.error === "string"
          ? err.error
          : `Failed (${res.status})`;
    return typeof err.hint === "string" ? `${message} ${err.hint}` : message;
  };

  const enqueueAudit = async (
    key: string,
    payload: { job_type: string; project_name: string; payload?: Record<string, unknown> }
  ) => {
    setDispatchError(null);
    setDispatching(key);
    try {
      const res = await apiFetchWithEnqueueSecret("/api/orchestration/jobs", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await formatApiError(res));
      }
      await load();
    } catch (error) {
      setDispatchError(error instanceof Error ? error.message : String(error));
    } finally {
      setDispatching(null);
    }
  };

  const scopedPayload = (): Record<string, unknown> => ({
    audit_kind: auditKind,
    scope_type: scopeType,
    scope_paths: scopePaths.split(",").map((value) => value.trim()).filter(Boolean),
    base_ref: baseRef.trim() || undefined,
    head_ref: headRef.trim() || undefined,
    manifest_revision: manifest?.revision,
    checklist_id: manifest?.checklist_id ?? "penny-bounded-audit-v1",
  });

  const newest = runs[0];
  const second = runs[1];
  const spike =
    newest &&
    second &&
    newest.findings_added >= 5 &&
    newest.findings_added - second.findings_added >= 3;
  const seriesAlerts = runSeriesAlerts(runs, { projectName });
  const expandedRun = expandedRunId ? runs.find((x) => x.id === expandedRunId) : undefined;

  return (
    <div
      style={{
        marginBottom: "1.5rem",
        paddingBottom: "1rem",
        borderBottom: "0.5px solid var(--ink-border-faint)",
      }}
    >
      <div
        style={{
          fontSize: "9px",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-text-4)",
          marginBottom: "0.5rem",
        }}
      >
        Worker audit history
      </div>
      <div
        style={{
          fontSize: "10px",
          fontFamily: "var(--font-mono)",
          color: "var(--ink-text-4)",
          lineHeight: 1.45,
          marginBottom: "0.75rem",
        }}
      >
        Audits now run against explicit repo scope with manifest-backed coverage. Use project or domain scope for broad
        passes, and file or diff scope for tight re-audits.
      </div>
      {manifest && (
        <div
          style={{
            marginBottom: "0.75rem",
            padding: "0.55rem 0.65rem",
            borderRadius: "var(--radius-md)",
            border: "0.5px solid var(--ink-border-faint)",
            background: "var(--ink-bg-sunken)",
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-text-4)",
            lineHeight: 1.45,
          }}
        >
          manifest: {manifest.modules.length} modules across {manifest.domains.length} domains
          {manifest.revision ? ` · ${manifest.revision.slice(0, 8)}` : ""}
          {manifest.entrypoints?.length ? ` · ${manifest.entrypoints.length} entrypoints` : ""}
          {repairJobs.length > 0 ? ` · ${repairJobs.length} repair jobs` : ""}
        </div>
      )}
      <div
        style={{
          marginBottom: "0.75rem",
          padding: "0.55rem 0.65rem",
          borderRadius: "var(--radius-md)",
          border: "0.5px solid var(--ink-border-faint)",
          background: "var(--ink-bg-sunken)",
        }}
      >
        <div
          style={{
            fontSize: "9px",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ink-text-4)",
            marginBottom: "0.4rem",
          }}
        >
          Scoped controls
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.45rem" }}>
          <select value={auditKind} onChange={(e) => setAuditKind(e.target.value as AuditKind)}>
            <option value="full">Full</option>
            <option value="logic">Logic</option>
            <option value="security">Security</option>
            <option value="performance">Performance</option>
            <option value="ux">UX</option>
            <option value="visual">Visual</option>
            <option value="data">Data</option>
            <option value="deploy">Deploy</option>
            <option value="synthesize">Synthesize</option>
          </select>
          <select value={scopeType} onChange={(e) => setScopeType(e.target.value as ScopeType)}>
            <option value="project">Project</option>
            <option value="domain">Domain</option>
            <option value="directory">Directory</option>
            <option value="file">File</option>
            <option value="selection">Selection</option>
            <option value="diff">Diff</option>
          </select>
          <input
            type="text"
            value={scopePaths}
            onChange={(e) => setScopePaths(e.target.value)}
            placeholder={scopeType === "domain" ? "domains (comma-separated)" : "scope paths (comma-separated)"}
          />
          <input type="text" value={baseRef} onChange={(e) => setBaseRef(e.target.value)} placeholder="base ref" />
          <input type="text" value={headRef} onChange={(e) => setHeadRef(e.target.value)} placeholder="head ref" />
        </div>
      </div>
      <div
        style={{
          marginBottom: "0.75rem",
          padding: "0.55rem 0.65rem",
          borderRadius: "var(--radius-md)",
          border: "0.5px solid var(--ink-border-faint)",
          background: "var(--ink-bg-sunken)",
        }}
      >
        <div
          style={{
            fontSize: "9px",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ink-text-4)",
            marginBottom: "0.4rem",
          }}
        >
          Manual audits
        </div>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() =>
              enqueueAudit("onboard", {
                job_type: "onboard_project",
                project_name: projectName,
              })
            }
            disabled={!canEnqueue || dispatching === "onboard"}
            style={{ fontSize: "10px", fontFamily: "var(--font-mono)", padding: "3px 8px" }}
          >
            {dispatching === "onboard" ? "…" : "Run onboard"}
          </button>
          <button
            type="button"
            onClick={() =>
              enqueueAudit("visual", {
                job_type: "audit_project",
                project_name: projectName,
                payload: {
                  ...scopedPayload(),
                  visual_only: true,
                  audit_kind: auditKind === "full" ? "visual" : auditKind,
                },
              })
            }
            disabled={!canEnqueue || dispatching === "visual"}
            style={{ fontSize: "10px", fontFamily: "var(--font-mono)", padding: "3px 8px" }}
          >
            {dispatching === "visual" ? "…" : "Run visual audit"}
          </button>
          <button
            type="button"
            onClick={() =>
              enqueueAudit("full", {
                job_type: auditKind === "synthesize" ? "synthesize_project" : "re_audit_project",
                project_name: projectName,
                payload: scopedPayload(),
              })
            }
            disabled={!canEnqueue || dispatching === "full"}
            style={{ fontSize: "10px", fontFamily: "var(--font-mono)", padding: "3px 8px" }}
          >
            {dispatching === "full" ? "…" : auditKind === "synthesize" ? "Run synthesizer" : "Run scoped audit"}
          </button>
          <button
            type="button"
            onClick={() =>
              enqueueAudit("synth", {
                job_type: "synthesize_project",
                project_name: projectName,
              })
            }
            disabled={!canEnqueue || dispatching === "synth"}
            style={{ fontSize: "10px", fontFamily: "var(--font-mono)", padding: "3px 8px" }}
          >
            {dispatching === "synth" ? "…" : "Run synthesizer"}
          </button>
        </div>
        {!canEnqueue && (
          <div style={{ marginTop: "0.45rem", fontSize: "10px", color: "var(--ink-text-4)", fontFamily: "var(--font-mono)" }}>
            {(projectStatus ?? "active") !== "active"
              ? "Activate the project before enqueueing audits"
              : "Access key required to enqueue audits"}
          </div>
        )}
        <details style={{ marginTop: "0.45rem", fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)" }}>
          <summary style={{ cursor: "pointer", marginBottom: "0.5rem" }}>
            Advanced: override access key
          </summary>
          <form
            onSubmit={(e) => e.preventDefault()}
            autoComplete="off"
            style={{ marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "0.5px solid var(--ink-border-faint)" }}
          >
            <input
              type="text"
              name="username"
              autoComplete="username"
              tabIndex={-1}
              aria-hidden="true"
              value="project-audit-history"
              readOnly
              style={{
                position: "absolute",
                opacity: 0,
                pointerEvents: "none",
                width: 1,
                height: 1,
              }}
            />
            <input
              type="password"
              name="audit_enqueue_secret_override"
              autoComplete="new-password"
              placeholder="Access key (optional override)"
              value={enqueueSecret}
              onChange={(e) => persistSecret(e.target.value)}
              style={{
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                width: "260px",
                maxWidth: "100%",
                marginBottom: "0.5rem",
              }}
            />
            <div style={{ fontSize: "9px", color: "var(--ink-text-4)" }}>
              Usually not needed if you&apos;re logged in. Use this to bypass with a different key.
            </div>
          </form>
        </details>
        {dispatchError && (
          <div style={{ marginTop: "0.45rem", fontSize: "10px", color: "var(--ink-red)", fontFamily: "var(--font-mono)" }}>
            {dispatchError}
          </div>
        )}
      </div>
      {spike && (
        <div
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-amber)",
            marginBottom: "0.65rem",
            lineHeight: 1.45,
          }}
        >
          Latest run added notably more findings than the previous completed run — review new items or drift in
          expectations.
        </div>
      )}
      {seriesAlerts.map((alert, i) => (
        <div
          key={i}
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-amber)",
            marginBottom: "0.65rem",
            lineHeight: 1.45,
          }}
        >
          {alert.message}
        </div>
      ))}
      {!hasAny && (
        <div style={{ fontSize: "10px", color: "var(--ink-text-4)", fontFamily: "var(--font-mono)" }}>
          No jobs or completed runs for this project yet. Enqueue onboard / re-audit from Orchestration.
        </div>
      )}
      {runs.length > 0 && (
        <div style={{ marginBottom: "0.75rem" }}>
          <div
            style={{
              fontSize: "10px",
              color: "var(--ink-text-3)",
              marginBottom: "0.35rem",
              fontFamily: "var(--font-mono)",
            }}
          >
            Completed runs ({runs.length}) — sampled audits may omit files; use row details for scope.
          </div>
          {(() => {
            const spark = [...runs.slice(0, RUN_SERIES_SPARKLINE_MAX)].reverse();
            const maxAdded = Math.max(1, ...spark.map((r) => r.findings_added));
            return (
              <div
                style={{
                  marginBottom: "0.5rem",
                  padding: "0.45rem 0.5rem",
                  borderRadius: "var(--radius-md)",
                  border: "0.5px solid var(--ink-border-faint)",
                  background: "var(--ink-bg-sunken)",
                }}
              >
                <div
                  style={{
                    fontSize: "9px",
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--ink-text-4)",
                    marginBottom: "0.35rem",
                  }}
                >
                  +Findings pulse (last {spark.length}, oldest → newest)
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "3px",
                    height: "28px",
                  }}
                  title="Bar height scales to the largest +findings in this window"
                >
                  {spark.map((r) => {
                    const h = Math.max(2, Math.round((r.findings_added / maxAdded) * 26));
                    return (
                      <div
                        key={r.id}
                        title={`${r.created_at.slice(0, 19)} · +${r.findings_added}`}
                        style={{
                          width: "5px",
                          height: `${h}px`,
                          borderRadius: "1px",
                          background:
                            r.findings_added === 0 ? "var(--ink-border-faint)" : "var(--ink-text-3)",
                          flexShrink: 0,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-text-2)",
              }}
            >
              <thead>
                <tr style={{ color: "var(--ink-text-4)", textAlign: "left" }}>
                  <th style={{ padding: "0.35rem 0.5rem 0.35rem 0", fontWeight: 500 }}>When</th>
                  <th style={{ padding: "0.35rem 0.5rem", fontWeight: 500 }}>Type</th>
                  <th style={{ padding: "0.35rem 0.5rem", fontWeight: 500 }}>Kind</th>
                  <th style={{ padding: "0.35rem 0.5rem", fontWeight: 500 }}>+Findings</th>
                  <th style={{ padding: "0.35rem 0.5rem", fontWeight: 500 }}>Coverage</th>
                  <th style={{ padding: "0.35rem 0.5rem", fontWeight: 500 }}>Conf</th>
                  <th style={{ padding: "0.35rem 0.5rem", fontWeight: 500 }}>Mode</th>
                  <th style={{ padding: "0.35rem 0.5rem", fontWeight: 500 }}>vs prior</th>
                  <th style={{ padding: "0.35rem 0", fontWeight: 500 }} />
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => {
                  const older = runs[i + 1];
                  const priorAdded = older?.findings_added;
                  const delta = deltaVsPrior(r.findings_added, priorAdded);
                  const open = expandedRunId === r.id;
                  const cov = effectiveCoverageComplete(r, projectName);
                  const kind =
                    typeof r.payload?.audit_kind === "string" && r.payload.audit_kind.trim()
                      ? r.payload.audit_kind
                      : "—";
                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderTop: "0.5px solid var(--ink-border-faint)",
                        verticalAlign: "top",
                        background: open ? "var(--ink-bg-sunken)" : undefined,
                      }}
                    >
                      <td style={{ padding: "0.45rem 0.5rem 0.45rem 0", color: "var(--ink-text-4)", whiteSpace: "nowrap" }}>
                        {r.created_at.slice(0, 19).replace("T", " ")}
                      </td>
                      <td style={{ padding: "0.45rem 0.5rem" }}>{formatAuditLabel(r.job_type, r.payload)}</td>
                      <td style={{ padding: "0.45rem 0.5rem", color: "var(--ink-text-3)" }}>{kind}</td>
                      <td style={{ padding: "0.45rem 0.5rem" }}>+{r.findings_added}</td>
                      <td style={{ padding: "0.45rem 0.5rem", color: "var(--ink-text-3)" }}>
                        {cov == null ? "—" : cov ? "complete" : "partial"}
                      </td>
                      <td style={{ padding: "0.45rem 0.5rem", color: "var(--ink-text-3)" }}>
                        {r.completion_confidence ?? "—"}
                      </td>
                      <td style={{ padding: "0.45rem 0.5rem", color: "var(--ink-text-3)" }}>
                        {r.exhaustiveness ?? "—"}
                      </td>
                      <td style={{ padding: "0.45rem 0.5rem", color: "var(--ink-text-3)" }}>{delta ?? "—"}</td>
                      <td style={{ padding: "0.45rem 0", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          onClick={() => setExpandedRunId(open ? null : r.id)}
                          style={{
                            fontSize: "10px",
                            fontFamily: "var(--font-mono)",
                            padding: "2px 6px",
                            cursor: "pointer",
                          }}
                        >
                          {open ? "Hide" : "Details"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {expandedRun && (
            <div
              style={{
                marginTop: "0.65rem",
                padding: "0.65rem 0.75rem",
                borderRadius: "var(--radius-md)",
                border: "0.5px solid var(--ink-border-faint)",
                background: "var(--ink-bg-sunken)",
              }}
            >
              <div
                style={{
                  fontSize: "9px",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ink-text-4)",
                  marginBottom: "0.5rem",
                }}
              >
                Run forensics · {expandedRun.created_at.slice(0, 19).replace("T", " ")}
              </div>
              {expandedRun.summary && (
                <div
                  style={{
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--ink-text-3)",
                    whiteSpace: "pre-wrap",
                    marginBottom: "0.55rem",
                    lineHeight: 1.45,
                  }}
                >
                  {expandedRun.summary}
                </div>
              )}
              {(() => {
                const lines = forensicsLinesForProject(expandedRun.payload, projectName);
                if (lines.length === 0) {
                  return (
                    <div style={{ fontSize: "10px", color: "var(--ink-text-4)", marginBottom: "0.5rem" }}>
                      No per-project audit detail in this payload (older worker or portfolio-wide run without
                      breakdown). Use redacted JSON for the full record.
                    </div>
                  );
                }
                return (
                  <dl
                    style={{
                      margin: "0 0 0.55rem 0",
                      display: "grid",
                      gridTemplateColumns: "minmax(8rem, auto) 1fr",
                      gap: "0.25rem 0.75rem",
                      fontSize: "10px",
                      fontFamily: "var(--font-mono)",
                      lineHeight: 1.4,
                    }}
                  >
                    {lines.map((line) => (
                      <div key={line.label} style={{ display: "contents" }}>
                        <dt style={{ color: "var(--ink-text-4)", margin: 0 }}>{line.label}</dt>
                        <dd style={{ margin: 0, color: "var(--ink-text-2)" }}>{line.value}</dd>
                      </div>
                    ))}
                  </dl>
                );
              })()}
              {expandedRun.job_id && (
                <div style={{ fontSize: "10px", color: "var(--ink-text-4)", marginBottom: "0.45rem" }}>
                  Job id {expandedRun.job_id}
                </div>
              )}
              <details style={{ marginTop: "0.35rem" }}>
                <summary style={{ cursor: "pointer", fontSize: "10px", color: "var(--ink-text-4)" }}>
                  Full JSON (model trace redacted)
                </summary>
                <pre
                  style={{
                    marginTop: "0.35rem",
                    padding: "0.5rem",
                    background: "var(--ink-bg-base)",
                    border: "0.5px solid var(--ink-border-faint)",
                    borderRadius: "var(--radius-md)",
                    overflowX: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    color: "var(--ink-text-3)",
                    fontSize: "10px",
                  }}
                >
                  {JSON.stringify(redactAuditRunPayload(expandedRun.payload), null, 2)}
                </pre>
              </details>
              <details style={{ marginTop: "0.35rem" }}>
                <summary style={{ cursor: "pointer", fontSize: "10px", color: "var(--ink-text-4)" }}>
                  Advanced: raw model output (large; may include code excerpts)
                </summary>
                <pre
                  style={{
                    marginTop: "0.35rem",
                    padding: "0.5rem",
                    maxHeight: "min(50vh, 28rem)",
                    overflow: "auto",
                    background: "var(--ink-bg-base)",
                    border: "0.5px solid var(--ink-border-faint)",
                    borderRadius: "var(--radius-md)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    color: "var(--ink-text-3)",
                    fontSize: "10px",
                  }}
                >
                  {concatRawLlmForProject(expandedRun.payload, projectName) ??
                    "No raw trace stored for this project on this run."}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}
      {jobs.length > 0 && (
        <div>
          <div
            style={{
              fontSize: "10px",
              color: "var(--ink-text-3)",
              marginBottom: "0.35rem",
              fontFamily: "var(--font-mono)",
            }}
          >
            Recent jobs ({jobs.length})
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: "1rem",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              color: "var(--ink-text-2)",
              lineHeight: 1.45,
            }}
          >
            {jobs.map((j) => (
              <li key={j.id} style={{ marginBottom: "0.25rem" }}>
                {j.created_at.slice(0, 19).replace("T", " ")} · {formatAuditLabel(j.job_type, j.payload)} ·{" "}
                <span
                  style={{
                    color:
                      j.status === "failed"
                        ? "var(--ink-red)"
                        : j.status === "completed"
                          ? "var(--ink-green)"
                          : "var(--ink-amber)",
                  }}
                >
                  {j.status}
                </span>
                {j.error && (
                  <span style={{ color: "var(--ink-red)" }}> — {j.error.slice(0, 120)}</span>
                )}
                <details style={{ marginTop: "0.25rem" }}>
                  <summary style={{ cursor: "pointer", color: "var(--ink-text-4)" }}>Job payload and status detail</summary>
                  <pre
                    style={{
                      marginTop: "0.3rem",
                      padding: "0.5rem",
                      background: "var(--ink-bg-sunken)",
                      border: "0.5px solid var(--ink-border-faint)",
                      borderRadius: "var(--radius-md)",
                      overflowX: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      color: "var(--ink-text-3)",
                    }}
                  >
                    {JSON.stringify(
                      {
                        id: j.id,
                        type: j.job_type,
                        status: j.status,
                        project_name: j.project_name,
                        created_at: j.created_at,
                        started_at: j.started_at,
                        finished_at: j.finished_at,
                        error: j.error,
                        payload: j.payload ?? {},
                      },
                      null,
                      2
                    )}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
