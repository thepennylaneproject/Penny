"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { isStaleRecoveryError } from "@/lib/job-timeouts";
import type { RepairJob } from "@/lib/types";
import type { pennyAuditJobRow, pennyAuditRunRow } from "@/lib/orchestration-jobs";
import { repairProofState } from "@/lib/repair-proof";
import { UI_COPY } from "@/lib/ui-copy";

// ── Types ─────────────────────────────────────────────────────────────────────

type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "applied";

interface UnifiedJob {
  id: string;
  kind: "audit" | "repair";
  status: JobStatus;
  projectName: string | null;
  label: string;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  costUsd: number | null;
  auditJob?: pennyAuditJobRow;
  auditRun?: pennyAuditRunRow;
  repairJob?: RepairJob;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const JOB_TYPE_LABELS: Record<string, string> = {
  weekly_audit:       "weekly audit",
  onboard_project:    "onboard",
  onboard_repository: "onboard repo",
  re_audit_project:   "re-audit",
  synthesize_project: "synthesize",
  audit_project:      "audit",
};

const STATUS_MARK: Record<JobStatus, { symbol: string; color: string }> = {
  queued:    { symbol: "·",  color: "var(--ink-text-4)" },
  running:   { symbol: "◎",  color: "var(--ink-blue)" },
  completed: { symbol: "✓",  color: "var(--ink-green)" },
  applied:   { symbol: "✓",  color: "var(--ink-green)" },
  failed:    { symbol: "✗",  color: "var(--ink-red)" },
  cancelled: { symbol: "⊘",  color: "var(--ink-text-4)" },
};

const STATUS_ORDER: Record<JobStatus, number> = {
  running: 0, queued: 1, completed: 2, applied: 2, failed: 2, cancelled: 2,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function elapsedSince(from: string | null): string {
  if (!from) return "";
  const s = Math.floor((Date.now() - new Date(from).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function timeAgo(from: string | null): string {
  if (!from) return "";
  const s = Math.floor((Date.now() - new Date(from).getTime()) / 1000);
  if (s < 90)  return "just now";
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function toUnified(
  auditJobs: pennyAuditJobRow[],
  auditRuns: pennyAuditRunRow[],
  repairJobs: RepairJob[],
): UnifiedJob[] {
  const runsByJobId = new Map<string, pennyAuditRunRow>();
  for (const run of auditRuns) {
    if (run.job_id) runsByJobId.set(run.job_id, run);
  }

  const audit: UnifiedJob[] = auditJobs.map((job) => ({
    id: job.id,
    kind: "audit" as const,
    status: job.status,
    projectName: job.project_name,
    label: JOB_TYPE_LABELS[job.job_type] ?? job.job_type,
    queuedAt: job.created_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    error: job.error,
    costUsd: null,
    auditJob: job,
    auditRun: runsByJobId.get(job.id),
  }));

  const repair: UnifiedJob[] = repairJobs.map((job) => ({
    id: job.id ?? job.finding_id,
    kind: "repair" as const,
    status: job.status,
    projectName: job.project_name,
    label: `repair · ${job.finding_id.slice(0, 10)}`,
    queuedAt: job.queued_at,
    startedAt: job.started_at ?? null,
    finishedAt: job.completed_at ?? null,
    error: job.error ?? null,
    costUsd: job.cost_usd ?? null,
    repairJob: job,
  }));

  return [...audit, ...repair].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    return new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime();
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
      <span
        style={{
          color: "var(--ink-text-4)",
          minWidth: "90px",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span style={{ color: color ?? "var(--ink-text-2)", wordBreak: "break-all" }}>
        {value}
      </span>
    </div>
  );
}

function AuditJobDetail({
  job,
  run,
}: {
  job: pennyAuditJobRow;
  run?: pennyAuditRunRow;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <DetailRow label="job type"   value={job.job_type} />
      {job.project_name    && <DetailRow label="project"   value={job.project_name} />}
      {job.checklist_id    && <DetailRow label="checklist" value={job.checklist_id} />}
      {job.manifest_revision && (
        <DetailRow label="manifest"  value={job.manifest_revision.slice(0, 16) + "…"} />
      )}
      {job.repo_ref        && <DetailRow label="ref"       value={job.repo_ref} />}
      {run?.summary        && <DetailRow label="summary"   value={run.summary} />}
      {run && run.findings_added > 0 && (
        <DetailRow label="findings"  value={`${run.findings_added} added`} />
      )}
      {run?.coverage_complete != null && (
        <DetailRow
          label="coverage"
          value={run.coverage_complete ? "complete" : "partial"}
          color={run.coverage_complete ? "var(--ink-green)" : "var(--ink-amber)"}
        />
      )}
      {run?.completion_confidence && (
        <DetailRow label="confidence" value={run.completion_confidence} />
      )}
      {run?.exhaustiveness  && <DetailRow label="exhaustive" value={run.exhaustiveness} />}
      {job.error && (
        <DetailRow
          label={isStaleRecoveryError(job.error) ? "recovery" : "error"}
          value={job.error}
          color={isStaleRecoveryError(job.error) ? "var(--ink-amber)" : "var(--ink-red)"}
        />
      )}
    </div>
  );
}

function RepairJobDetail({ job }: { job: RepairJob }) {
  const policyRisk = job.repair_policy?.risk_class;
  const policyEligibility = job.repair_policy?.autofix_eligibility;
  const proofState = repairProofState(job);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <DetailRow label="finding"  value={job.finding_id} />
      {policyRisk        && <DetailRow label="risk"      value={String(policyRisk)} />}
      {policyEligibility && <DetailRow label="eligibility" value={String(policyEligibility)} />}
      {job.provider_used && <DetailRow label="provider"  value={job.provider_used} />}
      {job.model_used && <DetailRow label="model" value={job.model_used} />}
      {job.routing_lane && <DetailRow label="lane" value={job.routing_lane} />}
      {(job.targeted_files?.length ?? 0) > 0 && (
        <div>
          <div style={{ color: "var(--ink-text-4)", marginBottom: "0.15rem" }}>files</div>
          {job.targeted_files!.map((f) => (
            <div
              key={f}
              style={{ paddingLeft: "1rem", color: "var(--ink-text-3)", wordBreak: "break-all" }}
            >
              {f}
            </div>
          ))}
        </div>
      )}
      {(job.verification_commands?.length ?? 0) > 0 && (
        <div>
          <div style={{ color: "var(--ink-text-4)", marginBottom: "0.15rem" }}>verify</div>
          {job.verification_commands!.map((c) => (
            <div
              key={c}
              style={{
                paddingLeft: "1rem",
                color:       "var(--ink-text-3)",
                fontFamily:  "var(--font-mono)",
                wordBreak:   "break-all",
              }}
            >
              {c}
            </div>
          ))}
        </div>
      )}
      {job.patch_applied && (
        <DetailRow label="patch" value="applied" color="var(--ink-green)" />
      )}
      {job.reported_status && (
        <DetailRow label="reported" value={job.reported_status} />
      )}
      {proofState !== "none" && (
        <DetailRow
          label="proof"
          value={
            proofState === "reviewable"
              ? "reviewable"
              : "missing reviewable proof"
          }
          color={proofState === "reviewable" ? "var(--ink-green)" : "var(--ink-amber)"}
        />
      )}
      {job.repair_proof?.artifacts?.summary_path && (
        <DetailRow label="summary" value={job.repair_proof.artifacts.summary_path} />
      )}
      {job.repair_proof?.artifacts?.tree_path && (
        <DetailRow label="tree" value={job.repair_proof.artifacts.tree_path} />
      )}
      {job.repair_proof?.verification?.summary && (
        <DetailRow label="verify" value={job.repair_proof.verification.summary} />
      )}
      {job.rollback_notes && <DetailRow label="rollback" value={job.rollback_notes} />}
      {job.error && (
        <DetailRow
          label={isStaleRecoveryError(job.error) ? "recovery" : "error"}
          value={job.error}
          color={isStaleRecoveryError(job.error) ? "var(--ink-amber)" : "var(--ink-red)"}
        />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function JobQueueView() {
  const [jobs,        setJobs]        = useState<UnifiedJob[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState<string | null>(null);
  const [recoveredNotice, setRecoveredNotice] = useState<string | null>(null);
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [cancelling,  setCancelling]  = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [tick,        setTick]        = useState(0); // forces re-render for elapsed timers

  const jobsRef = useRef<UnifiedJob[]>([]);
  useEffect(() => { jobsRef.current = jobs; }, [jobs]);

  const fetchAll = useCallback(async () => {
    try {
      const [orchRes, queueRes] = await Promise.all([
        apiFetch("/api/orchestration/jobs"),
        apiFetch("/api/engine/queue"),
      ]);
      const orch  = orchRes.ok  ? (await orchRes.json()  as { jobs?: pennyAuditJobRow[]; runs?: pennyAuditRunRow[]; recovered_stale_jobs?: number }) : {};
      const queue = queueRes.ok ? (await queueRes.json() as { queue?: RepairJob[]; recovered_stale_jobs?: number }) : {};
      setJobs(toUnified(orch.jobs ?? [], orch.runs ?? [], queue.queue ?? []));
      const recoveredCount = Math.max(
        Number(orch.recovered_stale_jobs ?? 0),
        Number(queue.recovered_stale_jobs ?? 0)
      );
      setRecoveredNotice(
        recoveredCount > 0
          ? `Recovered ${recoveredCount} stale ${recoveredCount === 1 ? "job" : "jobs"} that timed out while marked running.`
          : null
      );
      setFetchError(null);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // Adaptive polling: faster when jobs are active
  useEffect(() => {
    const hasActive = jobsRef.current.some(
      (j) => j.status === "running" || j.status === "queued"
    );
    const ms = hasActive ? 3_000 : 15_000;
    const t = setInterval(() => void fetchAll(), ms);
    return () => clearInterval(t);
  }, [jobs, fetchAll]);

  // Tick every second while any job is running (for live elapsed display)
  useEffect(() => {
    if (!jobs.some((j) => j.status === "running")) return;
    const t = setInterval(() => setTick((n) => n + 1), 1_000);
    return () => clearInterval(t);
  }, [jobs]);

  const handleCancel = async (job: UnifiedJob) => {
    setCancelling(job.id);
    setCancelError(null);
    try {
      if (job.kind === "audit") {
        const res = await apiFetch("/api/orchestration/jobs", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: job.id }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Cancel failed (${res.status})`);
        }
      } else {
        const res = await apiFetch("/api/engine/queue", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            finding_id: job.repairJob!.finding_id,
            ...(job.repairJob!.project_name
              ? { project_name: job.repairJob!.project_name }
              : {}),
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Cancel failed (${res.status})`);
        }
      }
      await fetchAll();
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setCancelling(null);
    }
  };

  // ── Derived lists ─────────────────────────────────────────────────────────

  const running = jobs.filter((j) => j.status === "running");
  const queued  = jobs.filter((j) => j.status === "queued");
  const recent  = jobs
    .filter(
      (j) =>
        j.status === "completed" ||
        j.status === "applied" ||
        j.status === "failed" ||
        j.status === "cancelled"
    )
    .slice(0, 20);

  // ── Renderers ─────────────────────────────────────────────────────────────

  const renderJob = (job: UnifiedJob) => {
    const mark       = STATUS_MARK[job.status];
    const canCancel  = job.status === "queued" || job.status === "running";
    const isExpanded = expandedId === job.id;
    const isCancel   = cancelling === job.id;
    const staleRecovery = isStaleRecoveryError(job.error);

    void tick; // subscribe to tick so running timers update
    const timing =
      job.status === "running"
        ? elapsedSince(job.startedAt ?? job.queuedAt)
        : timeAgo(job.finishedAt ?? job.queuedAt);

    return (
      <div key={job.id}>
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "16px 1fr auto auto",
            alignItems:          "center",
            gap:                 "0.75rem",
            padding:             "0.45rem 0",
            borderBottom:        "0.5px solid var(--ink-border-faint)",
            cursor:              "pointer",
          }}
          onClick={() => setExpandedId(isExpanded ? null : job.id)}
        >
          {/* Status mark */}
          <span
            style={{
              fontSize:   "13px",
              fontFamily: "var(--font-mono)",
              color:      mark.color,
              animation:  job.status === "running"
                ? "pulse-dot 1.5s ease-in-out infinite"
                : undefined,
            }}
          >
            {mark.symbol}
          </span>

          {/* Label + sub-info */}
          <div>
            <div
              style={{
                fontSize:   "11px",
                fontFamily: "var(--font-mono)",
                color:      "var(--ink-text-2)",
              }}
            >
              {job.label}
              {job.projectName && (
                <span style={{ color: "var(--ink-text-4)", marginLeft: "0.5rem" }}>
                  {job.projectName}
                </span>
              )}
            </div>

            {/* Thinking / progress signals */}
            {job.status === "running" && job.kind === "audit" && job.auditJob?.checklist_id && (
              <div
                style={{
                  fontSize:   "9px",
                  fontFamily: "var(--font-mono)",
                  color:      "var(--ink-text-4)",
                  marginTop:  "1px",
                }}
              >
                checklist {job.auditJob.checklist_id.slice(0, 14)}
                {job.auditJob.manifest_revision
                  ? ` · manifest ${job.auditJob.manifest_revision.slice(0, 8)}`
                  : ""}
              </div>
            )}
            {job.kind === "repair" && job.repairJob && (
              <div
                style={{
                  fontSize:   "9px",
                  fontFamily: "var(--font-mono)",
                  color:      "var(--ink-text-4)",
                  marginTop:  "1px",
                }}
              >
                {(job.repairJob.targeted_files?.length ?? 0) > 0
                  ? `${job.repairJob.targeted_files!.length} file${job.repairJob.targeted_files!.length !== 1 ? "s" : ""}`
                  : ""}
                {job.repairJob.provider_used
                  ? ` · ${job.repairJob.provider_used}`
                  : ""}
                {job.repairJob.model_used
                  ? ` · ${job.repairJob.model_used}`
                  : ""}
              </div>
            )}
            {job.error && (
              <div
                style={{
                  fontSize:   "9px",
                  fontFamily: "var(--font-mono)",
                  color:      staleRecovery ? "var(--ink-amber)" : "var(--ink-red)",
                  marginTop:  "1px",
                }}
              >
                {job.error.slice(0, 72)}{job.error.length > 72 ? "…" : ""}
              </div>
            )}
          </div>

          {/* Timing + cost */}
          <div
            style={{
              textAlign:  "right",
              whiteSpace: "nowrap",
            }}
          >
            <div
              style={{
                fontSize:   "10px",
                fontFamily: "var(--font-mono)",
                color:      "var(--ink-text-4)",
              }}
            >
              {timing}
            </div>
            {job.costUsd != null && job.costUsd > 0 && (
              <div
                style={{
                  fontSize:   "9px",
                  fontFamily: "var(--font-mono)",
                  color:      "var(--ink-green)",
                  marginTop:  "1px",
                }}
              >
                ${job.costUsd.toFixed(4)}
              </div>
            )}
          </div>

          {/* Cancel / spacer */}
          {canCancel ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void handleCancel(job); }}
              disabled={isCancel}
              title="Cancel job"
              style={{
                fontSize:   "12px",
                fontFamily: "var(--font-mono)",
                color:      "var(--ink-text-4)",
                background: "none",
                border:     "none",
                cursor:     isCancel ? "default" : "pointer",
                padding:    "0 2px",
                opacity:    isCancel ? 0.4 : 0.65,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          ) : (
            <div style={{ width: "16px" }} />
          )}
        </div>

        {/* Expanded detail panel */}
        {isExpanded && (
          <div
            style={{
              padding:      "0.65rem 0.75rem",
              margin:       "0 0 0.25rem 1.75rem",
              background:   "var(--ink-bg-sunken)",
              border:       "0.5px solid var(--ink-border-faint)",
              borderRadius: "var(--radius-sm)",
              fontSize:     "10px",
              fontFamily:   "var(--font-mono)",
              lineHeight:   1.65,
              color:        "var(--ink-text-3)",
            }}
          >
            {job.kind === "audit" && job.auditJob && (
              <AuditJobDetail job={job.auditJob} run={job.auditRun} />
            )}
            {job.kind === "repair" && job.repairJob && (
              <RepairJobDetail job={job.repairJob} />
            )}
          </div>
        )}
      </div>
    );
  };

  const renderSection = (label: string, items: UnifiedJob[]) => {
    if (items.length === 0) return null;
    return (
      <div style={{ marginBottom: "2rem" }}>
        <div
          style={{
            fontSize:      "9px",
            fontFamily:    "var(--font-mono)",
            fontWeight:    500,
            color:         "var(--ink-text-4)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom:  "0.4rem",
          }}
        >
          {label}
        </div>
        <div style={{ borderTop: "0.5px solid var(--ink-border-faint)" }}>
          {items.map(renderJob)}
        </div>
      </div>
    );
  };

  // ── Layout ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <span
        style={{
          fontSize:   "12px",
          fontFamily: "var(--font-mono)",
          color:      "var(--ink-text-4)",
        }}
      >
        loading…
      </span>
    );
  }

  const hasAny = running.length + queued.length + recent.length > 0;

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display:        "flex",
          justifyContent: "space-between",
          alignItems:     "baseline",
          marginBottom:   "2rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize:   "17px",
              fontWeight: 500,
              margin:     0,
              color:      "var(--ink-text)",
            }}
          >
            {UI_COPY.navActivity}
          </h1>
          <p
            style={{
              margin:     "0.35rem 0 0",
              fontSize:   "12px",
              lineHeight: 1.45,
              color:      "var(--ink-text-3)",
              maxWidth:   "40rem",
            }}
          >
            {UI_COPY.activityPageSubline}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchAll()}
          style={{
            fontSize:   "11px",
            fontFamily: "var(--font-mono)",
            padding:    "4px 10px",
          }}
        >
          Refresh
        </button>
      </div>

      {/* Errors */}
      {fetchError && (
        <div
          style={{
            marginBottom:  "1rem",
            padding:       "0.65rem 0.85rem",
            fontSize:      "11px",
            fontFamily:    "var(--font-mono)",
            color:         "var(--ink-amber)",
            background:    "var(--ink-bg-sunken)",
            border:        "0.5px solid var(--ink-border-faint)",
            borderRadius:  "var(--radius-md)",
          }}
        >
          {fetchError}
        </div>
      )}
      {recoveredNotice && (
        <div
          style={{
            marginBottom:  "1rem",
            padding:       "0.65rem 0.85rem",
            fontSize:      "11px",
            fontFamily:    "var(--font-mono)",
            color:         "var(--ink-amber)",
            background:    "var(--ink-bg-sunken)",
            border:        "0.5px solid var(--ink-border-faint)",
            borderRadius:  "var(--radius-md)",
          }}
        >
          {recoveredNotice}
        </div>
      )}
      {cancelError && (
        <div
          style={{
            marginBottom:  "1rem",
            padding:       "0.65rem 0.85rem",
            fontSize:      "11px",
            fontFamily:    "var(--font-mono)",
            color:         "var(--ink-red)",
            background:    "var(--ink-bg-sunken)",
            border:        "0.5px solid var(--ink-border-faint)",
            borderRadius:  "var(--radius-md)",
            display:       "flex",
            alignItems:    "center",
            gap:           "0.5rem",
          }}
        >
          <span style={{ flex: 1 }}>{cancelError}</span>
          <button
            type="button"
            onClick={() => setCancelError(null)}
            style={{
              border:     "none",
              background: "none",
              color:      "inherit",
              cursor:     "pointer",
              fontSize:   "13px",
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Job sections */}
      {renderSection("Running", running)}
      {renderSection("Queued",  queued)}
      {renderSection("Recent",  recent)}

      {/* Empty state */}
      {!hasAny && (
        <div
          style={{
            fontSize:   "12px",
            fontFamily: "var(--font-mono)",
            color:      "var(--ink-text-4)",
            padding:    "0.5rem 0",
          }}
        >
          No jobs. Use the engine to run an audit or queue a repair.
        </div>
      )}
    </div>
  );
}
