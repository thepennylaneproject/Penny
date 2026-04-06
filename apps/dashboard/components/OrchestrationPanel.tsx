"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetchWithEnqueueSecret } from "@/lib/api-fetch";
import { penny_ENQUEUE_SECRET_STORAGE_KEY } from "@/lib/auth-constants";
import type { PortfolioOrchestrationState, OrchestrationActionKind } from "@/lib/orchestration";
import type { DurableStateSummary } from "@/lib/durable-state";
import type { pennyAuditJobRow, pennyAuditRunRow } from "@/lib/orchestration-jobs";
import { UI_COPY } from "@/lib/ui-copy";

const STAGE_LABELS: Record<string, string> = {
  onboarding: "onboarding",
  visual_audit_missing: "visual missing",
  audit_due: "audit due",
  repair_in_progress: "repairing",
  current: "current",
  manual_override: "override",
};

const DISPATCHABLE_ACTIONS = new Set<OrchestrationActionKind>([
  "onboard_project",
  "run_visual_audit",
  "run_full_audit",
  "run_synthesizer",
]);

const ORCHESTRATION_CACHE_MS = 15_000;

type OrchestrationLoadCache = {
  data: PortfolioOrchestrationState | null;
  jobs: pennyAuditJobRow[];
  runs: pennyAuditRunRow[];
  jobsConfigured: boolean;
  redisConfigured: boolean;
  durable: DurableStateSummary | null;
  jobsLoadError: string | null;
  at: number;
};

function actionToJob(
  action: OrchestrationActionKind,
  projectName?: string
): {
  job_type: string;
  project_name?: string | null;
  payload?: Record<string, unknown>;
} {
  switch (action) {
    case "onboard_project":
      return {
        job_type: "onboard_project",
        project_name: projectName ?? null,
      };
    case "run_visual_audit":
      return {
        job_type: "audit_project",
        project_name: projectName ?? null,
        payload: { visual_only: true },
      };
    case "run_full_audit":
      return {
        job_type: "re_audit_project",
        project_name: projectName ?? null,
      };
    case "run_synthesizer":
      return { job_type: "synthesize_project", project_name: projectName ?? null };
    default:
      return { job_type: "audit_project", project_name: projectName ?? null };
  }
}

export function OrchestrationPanel() {
  const cacheRef = useRef<OrchestrationLoadCache | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [data, setData] = useState<PortfolioOrchestrationState | null>(null);
  const [jobs, setJobs] = useState<pennyAuditJobRow[]>([]);
  const [runs, setRuns] = useState<pennyAuditRunRow[]>([]);
  const [jobsConfigured, setJobsConfigured] = useState(false);
  const [redisConfigured, setRedisConfigured] = useState(false);
  const [durable, setDurable] = useState<DurableStateSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [overrideProject, setOverrideProject] = useState<string>("");
  const [overrideAction, setOverrideAction] = useState<OrchestrationActionKind>("run_full_audit");
  const [enqueueSecret, setEnqueueSecret] = useState<string>("");
  const [enqueueAuthOptional, setEnqueueAuthOptional] = useState(false);
  const [jobsLoadError, setJobsLoadError] = useState<string | null>(null);
  const [showClearQueueConfirm, setShowClearQueueConfirm] = useState(false);

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

  const load = useCallback(async (
    signal?: AbortSignal,
    opts?: { bypassCache?: boolean }
  ) => {
    setLoadError(null);
    const now = Date.now();
    const cached = cacheRef.current;
    if (
      !opts?.bypassCache &&
      cached &&
      now - cached.at < ORCHESTRATION_CACHE_MS
    ) {
      setData(cached.data);
      setJobs(cached.jobs);
      setRuns(cached.runs);
      setJobsConfigured(cached.jobsConfigured);
      setRedisConfigured(cached.redisConfigured);
      setDurable(cached.durable);
      setJobsLoadError(cached.jobsLoadError ?? null);
      setLoadedAt(cached.at);
      setLoading(false);
      return;
    }

    const [orchestrationRes, jobsRes, durableRes] = await Promise.all([
      apiFetchWithEnqueueSecret("/api/orchestration"),
      apiFetchWithEnqueueSecret("/api/orchestration/jobs"),
      apiFetchWithEnqueueSecret("/api/durable-state"),
    ]);

    if (signal?.aborted) return;
    let dataVal: PortfolioOrchestrationState | null = null;
    if (orchestrationRes.ok) {
      dataVal = await orchestrationRes.json();
      setData(dataVal);
    } else {
      const errText = await orchestrationRes.text();
      setLoadError(`Orchestration failed (${orchestrationRes.status}): ${errText.slice(0, 200)}`);
    }
    if (signal?.aborted) return;
    let jobsVal: pennyAuditJobRow[] = [];
    let runsVal: pennyAuditRunRow[] = [];
    let jobsConfiguredVal = false;
    let redisConfiguredVal = false;
    let jobsErr: string | null = null;
    if (jobsRes.ok) {
      const jobsPayload = await jobsRes.json();
      jobsConfiguredVal = Boolean(jobsPayload.configured);
      redisConfiguredVal = Boolean(jobsPayload.redis_configured);
      setJobsConfigured(jobsConfiguredVal);
      setRedisConfigured(redisConfiguredVal);
      setEnqueueAuthOptional(Boolean(jobsPayload.enqueue_auth_optional));
      jobsVal = Array.isArray(jobsPayload.jobs) ? jobsPayload.jobs : [];
      runsVal = Array.isArray(jobsPayload.runs) ? jobsPayload.runs : [];
      setJobs(jobsVal);
      setRuns(runsVal);
      setJobsLoadError(null);
    } else {
      const errText = await jobsRes.text();
      jobsErr = `Jobs list failed (${jobsRes.status}): ${errText.slice(0, 200)}`;
      setJobsLoadError(jobsErr);
      setJobsConfigured(false);
      setJobs([]);
      setRuns([]);
    }
    if (signal?.aborted) return;
    let durableVal: DurableStateSummary | null = null;
    if (durableRes.ok) {
      const payload = await durableRes.json();
      durableVal = payload.state ?? null;
      setDurable(durableVal);
    } else {
      setDurable(null);
    }
    if (signal?.aborted) return;
    cacheRef.current = {
      data: dataVal,
      jobs: jobsVal,
      runs: runsVal,
      jobsConfigured: jobsConfiguredVal,
      redisConfigured: redisConfiguredVal,
      durable: durableVal,
      jobsLoadError: jobsErr,
      at: Date.now(),
    };
    setLoadedAt(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const signal = ac.signal;
    (async () => {
      try {
        await load(signal);
      } catch {
        if (!signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [load]);

  const authHeaders = useCallback((): HeadersInit => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const trimmedSecret = enqueueSecret.trim();
    if (trimmedSecret) {
      headers.Authorization = `Bearer ${trimmedSecret}`;
    }
    return headers;
  }, [enqueueSecret]);

  const formatApiError = useCallback(async (res: Response): Promise<string> => {
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
  }, []);

  const dispatchAction = useCallback(
    async (action: OrchestrationActionKind, projectName?: string) => {
      setDispatchError(null);
      setDispatching(projectName ? `${action}:${projectName}` : action);
      try {
        const body = actionToJob(action, projectName);
        const res = await apiFetchWithEnqueueSecret("/api/orchestration/jobs", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(await formatApiError(res));
        }
        await load(undefined, { bypassCache: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setDispatchError(msg);
      } finally {
        setDispatching(null);
      }
    },
    [load, authHeaders, formatApiError]
  );

  const clearQueue = useCallback(async () => {
    setShowClearQueueConfirm(false);
    setDispatchError(null);
    setDispatching("clear_queue");
    try {
      const res = await apiFetchWithEnqueueSecret("/api/orchestration/queue/clear", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        throw new Error(await formatApiError(res));
      }
      await load(undefined, { bypassCache: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setDispatchError(msg);
    } finally {
      setDispatching(null);
    }
  }, [load, authHeaders, formatApiError]);

  const enqueueWeekly = useCallback(async () => {
    setDispatchError(null);
    setDispatching("weekly_audit");
    try {
      const res = await apiFetchWithEnqueueSecret("/api/orchestration/jobs", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ job_type: "weekly_audit" }),
      });
      if (!res.ok) {
        throw new Error(await formatApiError(res));
      }
      await load(undefined, { bypassCache: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDispatchError(msg);
    } finally {
      setDispatching(null);
    }
  }, [load, authHeaders, formatApiError]);

  if (loading) {
    return (
      <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", marginBottom: "1rem" }}>
        orchestration: loading…
      </div>
    );
  }

  const canEnqueue =
    jobsConfigured &&
    (enqueueAuthOptional || enqueueSecret.trim().length > 0);

  return (
    <section
      style={{
        background: "var(--ink-bg-raised)",
        border: "0.5px solid var(--ink-border-faint)",
        borderRadius: "var(--radius-lg)",
        padding: "1rem 1.25rem",
        marginBottom: "1.5rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "0.75rem", alignItems: "baseline", flexWrap: "wrap" }}>
        <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-text-4)" }}>
          Orchestration (Supabase + BullMQ)
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.2rem" }}>
          {data && (
            <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: jobsConfigured ? "var(--ink-green)" : "var(--ink-amber)" }}>
              {jobsConfigured ? `jobs DB · redis ${redisConfigured ? "on" : "poll mode"}` : "DATABASE_URL + migrations required"}
            </div>
          )}
          {loadedAt != null && (
            <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)" }}>
              {UI_COPY.orchestrationUpdatedPrefix}{" "}
              {new Date(loadedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
          )}
        </div>
      </div>

      {!data && loadError && (
        <div
          style={{
            marginBottom: "0.75rem",
            padding: "0.75rem 0.85rem",
            borderRadius: "var(--radius-md)",
            background: "var(--ink-bg-sunken)",
            border: "0.5px solid var(--ink-border-faint)",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-red)",
            lineHeight: 1.45,
          }}
        >
          <strong>Orchestration unavailable:</strong> {loadError}
          <button
            type="button"
            onClick={() => load(undefined, { bypassCache: true })}
            style={{ marginLeft: "0.5rem", fontSize: "11px", textDecoration: "underline", cursor: "pointer", border: "none", background: "none", color: "inherit" }}
          >
            Retry
          </button>
        </div>
      )}

      {!data && !loadError && (
        <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)" }}>
          Initializing orchestration...
        </div>
      )}

      <form
        onSubmit={(e) => e.preventDefault()}
        autoComplete="off"
        style={{ marginBottom: "0.75rem" }}
      >
        <input
          type="text"
          name="username"
          autoComplete="username"
          tabIndex={-1}
          aria-hidden="true"
          value="orchestration"
          readOnly
          style={{
            position: "absolute",
            opacity: 0,
            pointerEvents: "none",
            width: 1,
            height: 1,
          }}
        />
        <label style={{ fontSize: "9px", color: "var(--ink-text-4)", display: "block", marginBottom: "0.25rem" }}>
          ORCHESTRATION_ENQUEUE_SECRET (stored in session only)
        </label>
        <input
          type="password"
          name="orchestration_enqueue_secret"
          autoComplete="new-password"
          placeholder="paste secret to enable Run buttons"
          value={enqueueSecret}
          onChange={(e) => persistSecret(e.target.value)}
          style={{ width: "100%", maxWidth: "320px", fontSize: "11px", fontFamily: "var(--font-mono)" }}
        />
        <div
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-text-4)",
            marginTop: "0.35rem",
            maxWidth: "420px",
            lineHeight: 1.45,
          }}
        >
          When set, requests from this panel send this secret. The rest of the dashboard uses your sign-in cookie only.
        </div>
        <div
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-text-4)",
            marginTop: "0.25rem",
            lineHeight: 1.45,
            maxWidth: "420px",
          }}
        >
          This is the same value as <code style={{ fontSize: "9px" }}>ORCHESTRATION_ENQUEUE_SECRET</code> or{" "}
          <code style={{ fontSize: "9px" }}>DASHBOARD_API_SECRET</code> from your environment.
          Your login cookie handles all other dashboard actions — this field only unlocks job dispatch.
        </div>
      </form>

      {data && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: "1rem",
            marginBottom: "1rem",
          }}
        >
          <div><div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-text-4)" }}>Projects</div><div style={{ fontSize: "22px" }}>{data.summary.total_projects}</div></div>
          <div><div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-text-4)" }}>Onboarding</div><div style={{ fontSize: "22px" }}>{data.summary.onboarding}</div></div>
          <div><div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-text-4)" }}>Visual gaps</div><div style={{ fontSize: "22px" }}>{data.summary.visual_audit_missing}</div></div>
          <div><div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-text-4)" }}>Re-audit due</div><div style={{ fontSize: "22px" }}>{data.summary.audit_due}</div></div>
        </div>
      )}

      {jobsLoadError && (
        <div
          style={{
            marginBottom: "0.75rem",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-amber)",
            lineHeight: 1.45,
          }}
        >
          {jobsLoadError}
          <button
            type="button"
            onClick={() => void load(undefined, { bypassCache: true })}
            style={{ marginLeft: "0.5rem", fontSize: "11px", textDecoration: "underline", cursor: "pointer", border: "none", background: "none", color: "inherit" }}
          >
            Retry
          </button>
          <button type="button" onClick={() => setJobsLoadError(null)} style={{ marginLeft: "0.35rem", opacity: 0.8 }} aria-label="Dismiss jobs error">
            ×
          </button>
        </div>
      )}

      {dispatchError && (
        <div style={{ marginBottom: "0.75rem", fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-danger)" }}>
          {dispatchError}
          <button type="button" onClick={() => setDispatchError(null)} style={{ marginLeft: "0.5rem", opacity: 0.8 }} aria-label="Dismiss">×</button>
        </div>
      )}

      {jobsConfigured && redisConfigured && (
        <div
          style={{
            marginBottom: "0.75rem",
            padding: "0.5rem 0.65rem",
            borderRadius: "var(--radius-md)",
            background: "var(--ink-bg-sunken)",
            border: "0.5px solid var(--ink-border-faint)",
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-text-3)",
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: "var(--ink-amber)" }}>Worker required.</strong>{" "}
          With Redis on, jobs stay <code>queued</code> until{" "}
          <code>worker/</code> runs with the same <code>DATABASE_URL</code> and{" "}
          <code>REDIS_URL</code>:{" "}
          <code style={{ whiteSpace: "nowrap" }}>cd worker && npm install && npm run dev</code>
        </div>
      )}

      {jobsConfigured && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => enqueueWeekly()}
            disabled={!canEnqueue || dispatching === "weekly_audit"}
            style={{ fontSize: "11px", fontFamily: "var(--font-mono)", padding: "4px 10px" }}
          >
            {dispatching === "weekly_audit" ? "…" : "Enqueue weekly audit (all apps)"}
          </button>
          <button
            type="button"
            onClick={() => setShowClearQueueConfirm(true)}
            disabled={!canEnqueue || dispatching === "clear_queue"}
            title="Removes all BullMQ jobs on penny-audit and marks DB queued rows as failed"
            style={{ fontSize: "11px", fontFamily: "var(--font-mono)", padding: "4px 10px", color: "var(--ink-amber)" }}
          >
            {dispatching === "clear_queue" ? "…" : "Clear queue (Redis + DB)"}
          </button>
        </div>
      )}

      {showClearQueueConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-queue-confirm-title"
          style={{
            marginBottom: "1rem",
            padding: "1rem 1.15rem",
            borderRadius: "var(--radius-md)",
            border: "0.5px solid var(--ink-amber)",
            background: "var(--ink-bg-sunken)",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-text-2)",
            lineHeight: 1.5,
          }}
        >
          <div id="clear-queue-confirm-title" style={{ fontWeight: 600, color: "var(--ink-amber)", marginBottom: "0.5rem" }}>
            Clear entire queue?
          </div>
          <p style={{ margin: "0 0 0.75rem" }}>
            This removes <strong>all</strong> BullMQ jobs on the penny-audit queue and marks in-flight queued rows in the database as failed. Running workers may still finish current work; new work will not be picked up from the cleared queue.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void clearQueue()}
              disabled={dispatching === "clear_queue"}
              style={{ fontSize: "11px", fontFamily: "var(--font-mono)", padding: "4px 12px", color: "var(--ink-red)" }}
            >
              Yes, clear queue
            </button>
            <button
              type="button"
              onClick={() => setShowClearQueueConfirm(false)}
              style={{ fontSize: "11px", fontFamily: "var(--font-mono)", padding: "4px 12px" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {jobsConfigured && jobs.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-text-4)", marginBottom: "0.5rem" }}>
            Recent jobs
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
            {jobs.slice(0, 8).map((j) => (
              <div key={j.id} style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", color: "var(--ink-text-2)" }}>
                <span>{j.job_type}{j.project_name ? ` · ${j.project_name}` : ""}</span>
                <span style={{ color: j.status === "failed" ? "var(--ink-red)" : j.status === "completed" ? "var(--ink-green)" : "var(--ink-amber)" }}>{j.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {jobsConfigured && runs.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-text-4)", marginBottom: "0.5rem" }}>
            Recent runs
          </div>
          <div style={{ fontSize: "11px", color: "var(--ink-text-3)", maxHeight: "100px", overflow: "auto" }}>
            {runs.slice(0, 5).map((r) => (
              <div key={r.id} style={{ marginBottom: "0.35rem" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px" }}>{r.job_type}</span> — {r.summary?.slice(0, 120) ?? r.status}
              </div>
            ))}
          </div>
        </div>
      )}

      {data && (
        <>
          <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-text-4)", marginBottom: "0.5rem" }}>
            Next actions → enqueue job
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {data.projects.slice(0, 5).map((project) => (
          <div key={project.project_name} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", fontSize: "12px", alignItems: "center" }}>
            <div>
              <div style={{ color: "var(--ink-text-2)" }}>{project.project_name}</div>
              <div style={{ color: "var(--ink-text-4)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>
                {STAGE_LABELS[project.stage] ?? project.stage} · {project.recommended_action.reason}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ color: "var(--ink-text-4)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>
                {project.recommended_action.label}
              </span>
              {DISPATCHABLE_ACTIONS.has(project.recommended_action.kind) && (
                <button
                  type="button"
                  onClick={() => dispatchAction(project.recommended_action.kind, project.project_name)}
                  disabled={!canEnqueue || dispatching === `${project.recommended_action.kind}:${project.project_name}`}
                  style={{ fontSize: "10px", fontFamily: "var(--font-mono)", padding: "2px 8px" }}
                >
                  {dispatching === `${project.recommended_action.kind}:${project.project_name}` ? "…" : "run"}
                </button>
              )}
            </div>
          </div>
        ))}
          </div>
        </>
      )}

      {data && durable?.configured && (
        <div style={{ marginTop: "0.9rem", borderTop: "0.5px solid var(--ink-border-faint)", paddingTop: "0.9rem" }}>
          <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-text-4)", marginBottom: "0.5rem" }}>
            Recent durable events
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {durable.recent_events.slice(0, 4).map((event, index) => (
              <div key={`${event.event_type}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", fontSize: "11px" }}>
                <span style={{ color: "var(--ink-text-2)" }}>{event.summary}</span>
                <span style={{ color: "var(--ink-text-4)", fontFamily: "var(--font-mono)" }}>
                  {event.project_name ?? "global"} · {event.event_type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: "1rem", borderTop: "0.5px solid var(--ink-border-faint)", paddingTop: "0.9rem" }}>
        <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-text-4)", marginBottom: "0.5rem" }}>
          Overrides
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="project name"
            value={overrideProject}
            onChange={(e) => setOverrideProject(e.target.value)}
            style={{ width: "180px", fontSize: "11px" }}
          />
          <select
            value={overrideAction}
            onChange={(e) => setOverrideAction(e.target.value as OrchestrationActionKind)}
            style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}
          >
            <option value="onboard_project">Onboard project</option>
            <option value="run_visual_audit">Run visual audit</option>
            <option value="run_full_audit">Run full audit</option>
            <option value="run_synthesizer">Run synthesizer</option>
          </select>
          <button
            type="button"
            onClick={() => dispatchAction(overrideAction, overrideProject.trim() || undefined)}
            disabled={!canEnqueue || dispatching === `${overrideAction}:${overrideProject.trim() || ""}`}
            style={{ fontSize: "11px", fontFamily: "var(--font-mono)", padding: "2px 8px" }}
          >
            {dispatching === `${overrideAction}:${overrideProject.trim() || ""}` ? "…" : "enqueue"}
          </button>
        </div>
      </div>
    </section>
  );
}
