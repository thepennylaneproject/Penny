/**
 * Server-side module for reading from the penny audit output directory.
 *
 * The audit directory is resolved from penny_AUDIT_DIR (relative to the
 * dashboard project root, or absolute). Defaults to ../audits.
 *
 * All functions are synchronous and safe to call from Next.js API routes.
 * They return empty/null values if files don't exist yet.
 */

import fs from "fs";
import path from "path";
import type { Finding, RepairJob } from "./types";

export interface AuditRun {
  run_id?: string;
  timestamp?: string;
  apps_audited?: number;
  findings_count?: number;
  [key: string]: unknown;
}

export interface RepairRunSummary {
  run_id: string;
  finding_id?: string;
  project_name?: string;
  started_at?: string;
  completed_at?: string;
  total_cost_usd?: number;
  patch_applied?: boolean;
  provider_alias?: string;
  model?: string;
  [key: string]: unknown;
}

export interface EngineStatus {
  last_audit_date: string | null;
  audit_run_count: number;
  repair_run_count: number;
  total_cost_usd: number;
  queue_size: number;
  queued_findings: RepairJob[];
  recent_repair_runs: RepairRunSummary[];
  /** Queued + running audit jobs (from penny_audit_jobs). Present when DATABASE_URL is configured. */
  active_audit_jobs?: number;
}

function auditDir(): string {
  const raw = process.env.penny_AUDIT_DIR || "../audits";
  return path.resolve(process.cwd(), raw);
}

function safeReadJSON<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Read findings from audits/open_findings.json. */
export function readOpenFindings(): Finding[] {
  const data = safeReadJSON<{ open_findings?: Finding[] }>(
    path.join(auditDir(), "open_findings.json"),
    {}
  );
  return Array.isArray(data.open_findings) ? data.open_findings : [];
}

/** Read the audit run index from audits/index.json. */
export function readAuditIndex(): { runs: AuditRun[] } {
  return safeReadJSON(path.join(auditDir(), "index.json"), { runs: [] });
}

/** Read the repair queue from audits/repair_queue.json. */
export function readRepairQueue(): RepairJob[] {
  const data = safeReadJSON<{ queue?: RepairJob[] }>(
    path.join(auditDir(), "repair_queue.json"),
    {}
  );
  return Array.isArray(data.queue) ? data.queue : [];
}

/** Write the repair queue back to audits/repair_queue.json. */
export function writeRepairQueue(queue: RepairJob[]): void {
  const queuePath = path.join(auditDir(), "repair_queue.json");
  fs.writeFileSync(
    queuePath,
    JSON.stringify({ schema_version: "1.0.0", queue }, null, 2),
    "utf8"
  );
}

/** Read cost summaries from audits/repair_runs/{run_id}/cost_summary.json. */
export function readRepairRunSummaries(): RepairRunSummary[] {
  const runsDir = path.join(auditDir(), "repair_runs");
  if (!fs.existsSync(runsDir)) return [];
  try {
    const entries = fs.readdirSync(runsDir, { withFileTypes: true });
    const summaries: RepairRunSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const summaryPath = path.join(runsDir, entry.name, "cost_summary.json");
      const s = safeReadJSON<RepairRunSummary | null>(summaryPath, null);
      if (s) summaries.push(s);
    }
    return summaries.sort((a, b) =>
      (b.started_at ?? "").localeCompare(a.started_at ?? "")
    );
  } catch {
    return [];
  }
}

/** Read all audit run JSON files from audits/runs/. */
export function readAuditRunFiles(): AuditRun[] {
  const runsDir = path.join(auditDir(), "runs");
  if (!fs.existsSync(runsDir)) return [];
  try {
    const files = fs
      .readdirSync(runsDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();
    return files
      .map((f) => safeReadJSON<AuditRun>(path.join(runsDir, f), {}))
      .filter((r) => Object.keys(r).length > 0);
  } catch {
    return [];
  }
}

/** Aggregate status across all engine data sources. */
export function getEngineStatus(): EngineStatus {
  const index = readAuditIndex();
  const queue = readRepairQueue();
  const repairRuns = readRepairRunSummaries();

  const auditRunFiles = readAuditRunFiles();
  const allAuditRuns = [...index.runs, ...auditRunFiles];

  const lastAuditDate =
    allAuditRuns.length > 0
      ? (allAuditRuns
          .map((r) => r.timestamp ?? "")
          .filter(Boolean)
          .sort()
          .reverse()[0] ?? null)
      : null;

  const totalCost = repairRuns.reduce(
    (s, r) => s + (r.total_cost_usd ?? 0),
    0
  );

  return {
    last_audit_date: lastAuditDate,
    audit_run_count: allAuditRuns.length,
    repair_run_count: repairRuns.length,
    total_cost_usd: totalCost,
    queue_size: queue.filter((j) => j.status === "queued").length,
    queued_findings: queue,
    recent_repair_runs: repairRuns.slice(0, 5),
  };
}
