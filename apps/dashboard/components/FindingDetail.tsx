import { useState, useEffect, useCallback } from "react";
import type { Finding, FindingStatus, RepairJob, SyncMapping } from "@/lib/types";
import { Badge } from "./Badge";
import { STATUS_GROUPS } from "@/lib/constants";
import { isInQueuedSet } from "@/lib/finding-validation";
import { UI_COPY } from "@/lib/ui-copy";
import { apiFetch } from "@/lib/api-fetch";
import { repairLedgerCaption } from "@/lib/repair-proof";
import { useRepairJob } from "@/hooks/use-repair-job";
import { useRepairCandidates } from "@/hooks/use-repair-candidates";
import { useOrchestrationEvents } from "@/hooks/use-orchestration-events";
import { RepairJobMonitor } from "./RepairJobMonitor";
import { RepairConfigTuner, type RepairConfig } from "./RepairConfigTuner";
import { CandidateComparison } from "./CandidateComparison";
import { PRManager } from "./PRManager";
import { RepairHistory } from "./RepairHistory";
interface FindingLifecyclePayload {
  linear: {
    integration_configured: boolean;
    last_project_sync: string | null;
    mapping: SyncMapping | null;
  };
  repair_jobs: RepairJob[];
}

function repairStatusCaption(jobs: RepairJob[], queuedInUi: boolean): string {
  return repairLedgerCaption(jobs[0], queuedInUi);
}

const WORKFLOW_HINTS: Record<FindingStatus, string> = {
  open: "Finding is new and unresolved. Start work or defer.",
  accepted: "Finding is acknowledged and pending action.",
  in_progress: "You're actively working on this fix.",
  fixed_pending_verify: "Fix is implemented; awaiting verification.",
  fixed_verified: "Fix has been verified and is complete.",
  wont_fix: "You've decided not to fix this.",
  deferred: "Fix postponed for later.",
  duplicate: "This is a duplicate of another finding.",
  converted_to_enhancement: "This has been converted to an enhancement request.",
};

const SEVERITY_BORDER: Record<string, string> = {
  blocker: "var(--ink-red)",
  major:   "var(--ink-amber)",
  minor:   "var(--ink-blue)",
  nit:     "var(--ink-border)",
};

interface FindingDetailProps {
  finding:           Finding;
  projectName:       string;
  onClose:           () => void;
  onAction:          (findingId: string, newStatus: FindingStatus) => void;
  onQueueRepair?:    (findingId: string, projectName: string) => Promise<void>;
  queuedFindingIds?: Set<string>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize:      "9px",
        fontFamily:    "var(--font-mono)",
        fontWeight:    500,
        color:         "var(--ink-text-4)",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        marginBottom:  "0.5rem",
      }}
    >
      {children}
    </div>
  );
}

export function FindingDetail({
  finding,
  projectName,
  onClose,
  onAction,
  onQueueRepair,
  queuedFindingIds,
}: FindingDetailProps) {
  const [queueing, setQueueing] = useState(false);
  const [queueMsg, setQueueMsg] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<FindingLifecyclePayload | null>(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(true);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [repairSubmitting, setRepairSubmitting] = useState(false);
  const isQueued = isInQueuedSet(queuedFindingIds, projectName, finding.finding_id);
  const fix      = typeof finding.suggested_fix === "object" ? finding.suggested_fix : {};
  const stripe   = SEVERITY_BORDER[finding.severity ?? ""] ?? "var(--ink-border)";

  // Repair job hooks (if repair_job_id exists on finding)
  const { job, loading: jobLoading } = useRepairJob(finding.repair_job_id ?? null);
  const { candidates } = useRepairCandidates(finding.repair_job_id ?? null);
  const { events } = useOrchestrationEvents(finding.repair_job_id ?? null);

  const loadLifecycle = useCallback(async () => {
    setLifecycleError(null);
    setLifecycleLoading(true);
    try {
      const res = await apiFetch(
        `/api/findings/lifecycle?project=${encodeURIComponent(projectName)}&finding_id=${encodeURIComponent(finding.finding_id)}`
      );
      const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setLifecycle(null);
        const msg =
          typeof raw.error === "string" ? raw.error : `Could not load (${res.status})`;
        setLifecycleError(msg);
        return;
      }
      const data = raw as unknown as FindingLifecyclePayload;
      if (!data?.linear) {
        setLifecycle(null);
        setLifecycleError("Invalid lifecycle response");
        return;
      }
      setLifecycle({
        linear: data.linear,
        repair_jobs: Array.isArray(data.repair_jobs) ? data.repair_jobs : [],
      });
    } catch {
      setLifecycle(null);
      setLifecycleError("Network error loading lifecycle");
    } finally {
      setLifecycleLoading(false);
    }
  }, [projectName, finding.finding_id]);

  useEffect(() => {
    void loadLifecycle();
  }, [loadLifecycle]);

  const handleAction = async (status: FindingStatus) => {
    setActionInFlight(status);
    try {
      await onAction(finding.finding_id, status);
    } finally {
      setActionInFlight(null);
    }
  };

  const handleSubmitRepair = async (config: RepairConfig) => {
    setRepairSubmitting(true);
    try {
      const response = await apiFetch("/api/repair-jobs", {
        method: "POST",
        body: JSON.stringify({
          finding_id: finding.finding_id,
          project_id: projectName,
          config,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        // Refresh lifecycle to show new repair job
        await loadLifecycle();
      } else {
        const error = await response.json();
        console.error("Failed to submit repair job:", error);
      }
    } catch (err) {
      console.error("Error submitting repair job:", err);
    } finally {
      setRepairSubmitting(false);
    }
  };

  return (
    <div
      className="animate-fade-in"
      style={{
        position:     "relative",
        background:   "var(--ink-bg-raised)",
        border:       "0.5px solid var(--ink-border-faint)",
        borderLeft:   `3px solid ${stripe}`,
        borderRadius: `0 var(--radius-lg) var(--radius-lg) 0`,
        padding:      "1.5rem 1.75rem",
        marginBottom: "1.25rem",
      }}
    >
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        style={{
          position:    "absolute",
          top:         "0.875rem",
          right:       "0.875rem",
          border:      "none",
          background:  "transparent",
          padding:     "0 4px",
          fontSize:    "16px",
          color:       "var(--ink-text-4)",
          lineHeight:  1,
        }}
        aria-label="Close"
      >
        ×
      </button>

      {/* Badges row */}
      <div
        style={{
          display:    "flex",
          gap:        "0.375rem",
          marginBottom: "0.75rem",
          flexWrap:   "wrap",
        }}
      >
        <Badge color={finding.severity}>{finding.severity}</Badge>
        <Badge>{finding.priority}</Badge>
        <Badge>{finding.type}</Badge>
        <Badge>{finding.status?.replace(/_/g, " ")}</Badge>
        {finding.confidence && <Badge>{finding.confidence}</Badge>}
      </div>

      {/* Title */}
      <h3
        style={{
          fontSize:     "15px",
          fontWeight:   500,
          margin:       "0 0 0.625rem",
          color:        "var(--ink-text)",
          lineHeight:   1.4,
          paddingRight: "1.5rem",
        }}
      >
        {finding.title}
      </h3>

      {/* ID */}
      <div
        style={{
          fontSize:     "10px",
          fontFamily:   "var(--font-mono)",
          color:        "var(--ink-text-4)",
          marginBottom: "1rem",
        }}
      >
        {finding.finding_id}
      </div>

      {/* Audit ↔ Linear ↔ repair — one story */}
      <div
        style={{
          marginBottom: "1.1rem",
          padding: "0.65rem 0.75rem",
          borderRadius: "var(--radius-md)",
          border: "0.5px solid var(--ink-border-faint)",
          background: "var(--ink-bg-sunken)",
        }}
      >
        <SectionLabel>{UI_COPY.lifecycleSection}</SectionLabel>
        {lifecycleLoading && (
          <div
            style={{
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              color: "var(--ink-text-4)",
            }}
          >
            Loading Linear / ledger state…
          </div>
        )}
        {lifecycleError && !lifecycleLoading && (
          <div
            style={{
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              color: "var(--ink-text-4)",
            }}
          >
            {lifecycleError} — status actions still work.
          </div>
        )}
        {!lifecycleLoading && !lifecycleError && lifecycle && (
          <>
            <ol
              style={{
                margin: 0,
                paddingLeft: "1.15rem",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-text-2)",
                lineHeight: 1.55,
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
              }}
            >
              <li>
                <span style={{ color: "var(--ink-text-4)" }}>{UI_COPY.lifecyclepenny}: </span>
                {finding.status?.replace(/_/g, " ") ?? "—"}
                <span style={{ color: "var(--ink-text-4)" }}> — </span>
                {WORKFLOW_HINTS[finding.status] ?? "—"}
              </li>
              <li>
                <span style={{ color: "var(--ink-text-4)" }}>{UI_COPY.lifecycleRepairLedger}: </span>
                {repairStatusCaption(lifecycle.repair_jobs ?? [], isQueued)}
              </li>
              <li>
                <span style={{ color: "var(--ink-text-4)" }}>{UI_COPY.lifecycleLinear}: </span>
                {!lifecycle.linear.integration_configured && (
                  <span>{UI_COPY.lifecycleLinearNotConfigured}</span>
                )}
                {lifecycle.linear.integration_configured && !lifecycle.linear.mapping && (
                  <span>{UI_COPY.lifecycleLinearNoIssue}</span>
                )}
                {lifecycle.linear.integration_configured && lifecycle.linear.mapping && (
                  <span>
                    Linked
                    {lifecycle.linear.mapping.identifier ? (
                      <>
                        {" "}
                        {lifecycle.linear.mapping.url ? (
                          <a
                            href={lifecycle.linear.mapping.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--ink-blue)" }}
                          >
                            {lifecycle.linear.mapping.identifier}
                          </a>
                        ) : (
                          <span style={{ color: "var(--ink-text)" }}>
                            {lifecycle.linear.mapping.identifier}
                          </span>
                        )}
                      </>
                    ) : (
                      " (issue id on file)"
                    )}
                    {lifecycle.linear.mapping.last_synced && (
                      <span style={{ color: "var(--ink-text-4)" }}>
                        {" "}
                        · last sync {lifecycle.linear.mapping.last_synced.slice(0, 10)}
                      </span>
                    )}
                  </span>
                )}
              </li>
            </ol>
            {lifecycle.linear.mapping &&
              lifecycle.linear.mapping.penny_status !== finding.status && (
                <div
                  style={{
                    marginTop: "0.45rem",
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--ink-amber)",
                    lineHeight: 1.45,
                  }}
                >
                  {UI_COPY.lifecycleLinearDrift}
                </div>
              )}
            <div
              style={{
                marginTop: "0.55rem",
                paddingTop: "0.5rem",
                borderTop: "0.5px solid var(--ink-border-faint)",
              }}
            >
              <div
                style={{
                  fontSize: "9px",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ink-text-4)",
                  marginBottom: "0.35rem",
                }}
              >
                {UI_COPY.lifecycleNextHeading}
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "1.1rem",
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--ink-text-3)",
                  lineHeight: 1.5,
                }}
              >
                {UI_COPY.lifecycleNextSteps.map((step, idx) => (
                  <li key={idx} style={{ marginBottom: "0.25rem" }}>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>

      {/* Description */}
      <p
        style={{
          fontSize:     "13px",
          color:        "var(--ink-text-2)",
          lineHeight:   1.65,
          margin:       "0 0 1.25rem",
        }}
      >
        {finding.description}
      </p>

      {/* Proof hooks */}
      {finding.proof_hooks && finding.proof_hooks.length > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          <SectionLabel>Proof hooks</SectionLabel>
          <div
            style={{
              background:   "var(--ink-bg-sunken)",
              border:       "0.5px solid var(--ink-border-faint)",
              borderRadius: "var(--radius-md)",
              padding:      "0.625rem 0.75rem",
              display:      "flex",
              flexDirection: "column",
              gap:          "0.375rem",
            }}
          >
            {finding.proof_hooks.map((h, i) => (
              <div key={i} style={{ fontSize: "11px", fontFamily: "var(--font-mono)", lineHeight: 1.5 }}>
                <span style={{ color: "var(--ink-blue)" }}>
                  [{h.hook_type ?? h.type ?? "?"}]
                </span>{" "}
                <span style={{ color: "var(--ink-text-2)" }}>
                  {h.summary ?? h.value ?? ""}
                </span>
                {h.file && (
                  <span style={{ color: "var(--ink-text-4)" }}>
                    {" "}{h.file}{h.start_line != null ? `:${h.start_line}` : ""}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested fix */}
      {fix.approach && (
        <div style={{ marginBottom: "1.25rem" }}>
          <SectionLabel>Suggested fix</SectionLabel>
          <p style={{ fontSize: "13px", color: "var(--ink-text-2)", lineHeight: 1.6, margin: 0 }}>
            {fix.approach}
          </p>
          {fix.affected_files && fix.affected_files.length > 0 && (
            <div
              style={{
                marginTop:  "0.5rem",
                fontSize:   "11px",
                fontFamily: "var(--font-mono)",
                color:      "var(--ink-text-4)",
              }}
            >
              {fix.affected_files.join(", ")}
            </div>
          )}
          {fix.estimated_effort && (
            <div style={{ marginTop: "0.25rem", fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--ink-text-3)" }}>
              effort: {fix.estimated_effort}
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      {finding.history && finding.history.length > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          <SectionLabel>Timeline</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {finding.history.slice(-5).map((ev, i) => (
              <div
                key={i}
                style={{
                  fontSize:   "11px",
                  fontFamily: "var(--font-mono)",
                  color:      "var(--ink-text-4)",
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: "var(--ink-text-3)" }}>{ev.timestamp?.slice(0, 10)}</span>
                {" "}{ev.actor} · {ev.event}
                {ev.notes ? ` — ${ev.notes.slice(0, 80)}` : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Repair section */}
      {finding.repair_job_id && job && (
        <div style={{ marginBottom: "1.25rem" }}>
          <SectionLabel>Automatic Repair</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <RepairJobMonitor
              job={job}
              onRefresh={async () => {
                // Re-fetch by manually refreshing
              }}
            />
            {candidates.length > 0 && (
              <CandidateComparison
                candidates={candidates}
                bestCandidateId={job.best_candidate_id}
              />
            )}
            {job.pr_number && (
              <PRManager
                pr={job}
                findingId={finding.finding_id}
                onApprove={async () => {
                  // Handle PR approval
                }}
                onMerge={async () => {
                  // Handle PR merge
                }}
              />
            )}
            {events.length > 0 && <RepairHistory events={events} />}
          </div>
        </div>
      )}

      {/* Repair config tuner (if no active repair job) */}
      {!finding.repair_job_id && (
        <div style={{ marginBottom: "1.25rem" }}>
          <SectionLabel>Configure Auto-Repair</SectionLabel>
          <RepairConfigTuner
            findingId={finding.finding_id}
            onSubmit={handleSubmitRepair}
            isLoading={repairSubmitting}
          />
        </div>
      )}

      {/* Status workflow hint */}
      {finding.status && (
        <div
          style={{
            fontSize: "12px",
            color: "var(--ink-text-2)",
            lineHeight: 1.5,
            marginBottom: "1rem",
            padding: "0.75rem 0.85rem",
            background: "var(--ink-bg-sunken)",
            borderRadius: "var(--radius-md)",
            border: "0.5px solid var(--ink-border-faint)",
          }}
        >
          <strong style={{ color: "var(--ink-text)" }}>Status:</strong>{" "}
          {WORKFLOW_HINTS[finding.status] ?? "Unknown status"}
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display:      "flex",
          gap:          "0.5rem",
          alignItems:   "center",
          flexWrap:     "wrap",
          borderTop:    "0.5px solid var(--ink-border-faint)",
          paddingTop:   "1rem",
          marginTop:    "0.25rem",
        }}
      >
        {STATUS_GROUPS.active.includes(finding.status) && (
          <>
            <button
              type="button"
              disabled={actionInFlight !== null}
              onClick={() => handleAction("in_progress")}
            >
              {actionInFlight === "in_progress" ? "…" : "Start fix"}
            </button>
            <button
              type="button"
              disabled={actionInFlight !== null}
              onClick={() => handleAction("deferred")}
            >
              {actionInFlight === "deferred" ? "…" : "Defer"}
            </button>
          </>
        )}
        {finding.status === "in_progress" && (
          <button
            type="button"
            disabled={actionInFlight !== null}
            onClick={() => handleAction("fixed_pending_verify")}
          >
            {actionInFlight === "fixed_pending_verify" ? "…" : "Mark fixed (needs verify)"}
          </button>
        )}
        {finding.status === "fixed_pending_verify" && (
          <button
            type="button"
            disabled={actionInFlight !== null}
            onClick={() => handleAction("fixed_verified")}
          >
            {actionInFlight === "fixed_verified" ? "…" : "Verify fix"}
          </button>
        )}

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "0.35rem",
          }}
        >
          {onQueueRepair && !isQueued && (
            <span
              style={{
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-text-4)",
                maxWidth: "14rem",
                textAlign: "right",
                lineHeight: 1.4,
              }}
            >
              {UI_COPY.ledgerIntentHint}
            </span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {onQueueRepair && !isQueued && (
            <button
              type="button"
              disabled={queueing}
              onClick={async () => {
                setQueueing(true);
                setQueueMsg(null);
                try {
                  await onQueueRepair(finding.finding_id, projectName);
                  setQueueMsg(`✓ ${UI_COPY.ledgerRecorded}`);
                  void loadLifecycle();
                } catch (e) {
                  const msg =
                    e instanceof Error ? e.message : "Could not queue repair.";
                  setQueueMsg(`✗ ${msg}`);
                } finally {
                  setQueueing(false);
                }
              }}
              style={{
                borderColor: stripe,
                color:       stripe,
                fontFamily:  "var(--font-mono)",
                fontSize:    "11px",
              }}
              title={UI_COPY.addToLedger}
            >
              {queueing ? UI_COPY.ledgerAdding : UI_COPY.addToLedger}
            </button>
          )}
          {isQueued && (
            <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--ink-amber)" }}>
              {UI_COPY.onLedger}
            </span>
          )}
          {queueMsg && !isQueued && (
            <span
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: queueMsg.includes("✓") ? "var(--ink-green)" : "var(--ink-red)",
              }}
            >
              {queueMsg}
            </span>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
