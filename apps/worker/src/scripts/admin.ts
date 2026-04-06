#!/usr/bin/env node
/**
 * penny Worker Admin CLI
 * Manage jobs, queue repairs, check health, and debug the worker.
 *
 * Usage:
 *   npx tsx src/scripts/admin.ts health
 *   npx tsx tsx src/scripts/admin.ts queue --project MyApp --type weekly_audit
 *   npx tsx src/scripts/admin.ts repair --finding-id F123 --project MyApp
 *   npx tsx src/scripts/admin.ts clear-queue
 */

import { Pool } from "pg";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse environment
const dbUrl =
  process.env.DATABASE_URL ||
  "postgresql://penny:penny-dev-password@localhost:5432/penny";

interface Command {
  name: string;
  handler: (args: string[]) => Promise<void>;
  help: string;
}

// Database connection
const pool = new Pool({ connectionString: dbUrl });

function readFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

async function validateAuditRun(jobId: string): Promise<number> {
  const jobResult = await pool.query(
    `SELECT id, job_type, project_name, status, error, payload, created_at, started_at, finished_at
       FROM penny_audit_jobs
      WHERE id = $1`,
    [jobId]
  );
  const job = jobResult.rows[0];
  if (!job) {
    console.error(`No audit job found for ${jobId}`);
    return 1;
  }

  const runResult = await pool.query(
    `SELECT id, job_id, job_type, project_name, status, summary, findings_added,
            manifest_revision, checklist_id, coverage_complete, completion_confidence,
            exhaustiveness, payload, created_at
       FROM penny_audit_runs
      WHERE job_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [jobId]
  );
  const run = runResult.rows[0] ?? null;

  const modelUsageForJob = await pool.query(
    `SELECT agent_name, model_name, input_tokens, output_tokens, cost_usd, latency_ms, timestamp
       FROM model_usage
      WHERE run_id = $1
      ORDER BY timestamp DESC`,
    [jobId]
  );

  const modelUsageForRun = run
    ? await pool.query(
        `SELECT agent_name, model_name, input_tokens, output_tokens, cost_usd, latency_ms, timestamp
           FROM model_usage
          WHERE run_id = $1
          ORDER BY timestamp DESC`,
        [run.id]
      )
    : { rows: [] as Array<Record<string, unknown>> };

  const repairRows = await pool.query(
    `SELECT id, finding_id, status, patch_applied, error, payload, created_at, started_at, finished_at
       FROM penny_repair_jobs
      WHERE payload->>'audit_run_id' = $1
      ORDER BY created_at DESC`,
    [jobId]
  );

  const runPayload =
    run && typeof run.payload === "object" && run.payload ? run.payload : {};
  const auditMetrics =
    typeof runPayload.audit_metrics === "object" && runPayload.audit_metrics
      ? runPayload.audit_metrics
      : null;
  const projectAuditDetails = Array.isArray(runPayload.project_audit_details)
    ? runPayload.project_audit_details
    : [];

  const failures: string[] = [];
  const warnings: string[] = [];

  if (job.status === "queued" || job.status === "running") {
    failures.push(`job is still ${job.status}`);
  }

  if (job.status === "completed" && !run) {
    failures.push("job is completed but no penny_audit_runs row exists");
  }

  if (run && run.status !== job.status) {
    warnings.push(`job status ${job.status} does not match run status ${run.status}`);
  }

  if (run && !auditMetrics) {
    warnings.push("completed run payload is missing audit_metrics");
  }

  if (run && projectAuditDetails.length === 0) {
    warnings.push("completed run payload is missing project_audit_details");
  }

  const usageRows = modelUsageForJob.rows.length > 0 ? modelUsageForJob.rows : modelUsageForRun.rows;
  if (run && usageRows.length === 0) {
    warnings.push(
      "no model_usage rows were found for either the job id or the completed penny_audit_runs id"
    );
  }

  console.log("Validation target");
  console.log(`  job_id: ${job.id}`);
  console.log(`  job_type: ${job.job_type}`);
  console.log(`  project: ${job.project_name ?? "(none)"}`);
  console.log(`  status: ${job.status}`);
  console.log(`  created_at: ${job.created_at?.toISOString?.() ?? job.created_at}`);
  console.log(`  started_at: ${job.started_at?.toISOString?.() ?? job.started_at ?? "(null)"}`);
  console.log(`  finished_at: ${job.finished_at?.toISOString?.() ?? job.finished_at ?? "(null)"}`);

  console.log("\nJob payload");
  console.log(formatJson(job.payload));

  console.log("\nCompleted run");
  if (!run) {
    console.log("  (none)");
  } else {
    console.log(`  run_id: ${run.id}`);
    console.log(`  status: ${run.status}`);
    console.log(`  findings_added: ${run.findings_added}`);
    console.log(`  coverage_complete: ${run.coverage_complete}`);
    console.log(`  completion_confidence: ${run.completion_confidence ?? "(null)"}`);
    console.log(`  exhaustiveness: ${run.exhaustiveness ?? "(null)"}`);
    console.log(`  summary: ${run.summary ?? "(null)"}`);
    if (auditMetrics) {
      console.log("  audit_metrics:");
      console.log(formatJson(auditMetrics));
    }
    if (projectAuditDetails.length > 0) {
      console.log(`  project_audit_details: ${projectAuditDetails.length} item(s)`);
    }
  }

  console.log("\nmodel_usage");
  console.log(`  rows_by_job_id: ${modelUsageForJob.rows.length}`);
  console.log(`  rows_by_run_id: ${modelUsageForRun.rows.length}`);
  if (usageRows.length > 0) {
    const totalCost = usageRows.reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
    console.log(`  effective_rows: ${usageRows.length}`);
    console.log(`  total_cost_usd: ${totalCost.toFixed(5)}`);
    for (const row of usageRows.slice(0, 10)) {
      console.log(
        `    - ${String(row.agent_name ?? "unknown")} via ${String(row.model_name ?? "unknown")} ($${Number(
          row.cost_usd ?? 0
        ).toFixed(5)})`
      );
    }
  }

  console.log("\nrepair_handoff");
  console.log(`  repair_rows: ${repairRows.rows.length}`);
  for (const row of repairRows.rows.slice(0, 10)) {
    console.log(
      `    - ${row.finding_id} => ${row.status}${row.patch_applied === true ? " (applied)" : ""}`
    );
  }

  if (warnings.length > 0) {
    console.log("\nWarnings");
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }

  if (failures.length > 0) {
    console.log("\nFailures");
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
    return 1;
  }

  console.log("\n✓ Validation complete");
  return 0;
}

// Commands
const commands: Record<string, Command> = {
  health: {
    name: "health",
    help: "Check worker health and database connection",
    handler: async () => {
      try {
        const result = await pool.query("SELECT NOW()");
        console.log("✓ Database connected");
        console.log(
          `  Current time: ${result.rows[0].now.toISOString()}`
        );

        const jobs = await pool.query(
          "SELECT COUNT(*) as count, status FROM penny_audit_jobs GROUP BY status"
        );
        console.log("\n✓ Audit jobs:");
        for (const row of jobs.rows) {
          console.log(`  ${row.status}: ${row.count}`);
        }

        const repairs = await pool.query(
          "SELECT COUNT(*) as count, status FROM penny_repair_jobs GROUP BY status"
        );
        console.log("\n✓ Repair jobs:");
        for (const row of repairs.rows) {
          console.log(`  ${row.status}: ${row.count}`);
        }
      } finally {
        await pool.end();
      }
    },
  },

  queue: {
    name: "queue",
    help: "Queue an audit job",
    handler: async (args) => {
      const projectIdx = args.indexOf("--project");
      const typeIdx = args.indexOf("--type");

      if (projectIdx === -1 || typeIdx === -1) {
        console.error(
          "Usage: admin.ts queue --project <name> --type <type>"
        );
        process.exit(1);
      }

      const project = args[projectIdx + 1];
      const type = args[typeIdx + 1];

      try {
        const result = await pool.query(
          `INSERT INTO penny_audit_jobs (project_name, job_type, status, payload)
           VALUES ($1, $2, 'queued', '{}'::jsonb)
           RETURNING id, project_name, job_type, status, created_at`,
          [project, type]
        );

        const job = result.rows[0];
        console.log("✓ Job queued:");
        console.log(`  ID: ${job.id}`);
        console.log(`  Project: ${job.project_name}`);
        console.log(`  Type: ${job.job_type}`);
        console.log(`  Created: ${job.created_at.toISOString()}`);
      } finally {
        await pool.end();
      }
    },
  },

  repair: {
    name: "repair",
    help: "Queue a repair job for a finding",
    handler: async (args) => {
      const findingIdx = args.indexOf("--finding-id");
      const projectIdx = args.indexOf("--project");

      if (findingIdx === -1 || projectIdx === -1) {
        console.error(
          "Usage: admin.ts repair --finding-id <id> --project <name>"
        );
        process.exit(1);
      }

      const findingId = args[findingIdx + 1];
      const project = args[projectIdx + 1];

      try {
        const result = await pool.query(
          `INSERT INTO penny_repair_jobs (project_name, finding_id, status)
           VALUES ($1, $2, 'queued')
           RETURNING id, finding_id, project_name, status, created_at`,
          [project, findingId]
        );

        const job = result.rows[0];
        console.log("✓ Repair job queued:");
        console.log(`  ID: ${job.id}`);
        console.log(`  Finding: ${job.finding_id}`);
        console.log(`  Project: ${job.project_name}`);
        console.log(`  Created: ${job.created_at.toISOString()}`);
      } finally {
        await pool.end();
      }
    },
  },

  "clear-queue": {
    name: "clear-queue",
    help: "Clear all queued audit jobs (use with caution!)",
    handler: async (args) => {
      const forceIdx = args.indexOf("--force");
      if (forceIdx === -1) {
        console.error(
          "⚠ This will delete all queued jobs. Use --force to confirm."
        );
        process.exit(1);
      }

      try {
        const result = await pool.query(
          "DELETE FROM penny_audit_jobs WHERE status = 'queued'"
        );
        console.log(`✓ Deleted ${result.rowCount} queued jobs`);
      } finally {
        await pool.end();
      }
    },
  },

  "list-jobs": {
    name: "list-jobs",
    help: "List recent audit jobs",
    handler: async () => {
      try {
        const result = await pool.query(
          `SELECT id, project_name, job_type, status, created_at
           FROM penny_audit_jobs
           ORDER BY created_at DESC
           LIMIT 10`
        );

        console.log("✓ Recent audit jobs:");
        for (const job of result.rows) {
          console.log(
            `  [${job.status.padEnd(8)}] ${job.project_name}:${job.job_type} (${job.id})`
          );
        }
      } finally {
        await pool.end();
      }
    },
  },

  "list-repairs": {
    name: "list-repairs",
    help: "List recent repair jobs",
    handler: async () => {
      try {
        const result = await pool.query(
          `SELECT id, finding_id, project_name, status, created_at
           FROM penny_repair_jobs
           ORDER BY created_at DESC
           LIMIT 10`
        );

        console.log("✓ Recent repair jobs:");
        for (const job of result.rows) {
          console.log(
            `  [${job.status.padEnd(8)}] ${job.project_name}/${job.finding_id} (${job.id})`
          );
        }
      } finally {
        await pool.end();
      }
    },
  },

  "validate-run": {
    name: "validate-run",
    help: "Validate an audit job lifecycle from DB evidence",
    handler: async (args) => {
      const jobId = readFlag(args, "--job-id");
      if (!jobId) {
        console.error("Usage: admin.ts validate-run --job-id <uuid>");
        process.exit(1);
      }

      try {
        const exitCode = await validateAuditRun(jobId);
        process.exit(exitCode);
      } finally {
        await pool.end();
      }
    },
  },

  help: {
    name: "help",
    help: "Show this help message",
    handler: async () => {
      console.log("penny Worker Admin CLI\n");
      console.log("Commands:");
      for (const cmd of Object.values(commands)) {
        console.log(`  ${cmd.name.padEnd(20)} ${cmd.help}`);
      }
      console.log(
        "\nExamples:\n" +
          "  npx tsx src/scripts/admin.ts health\n" +
          "  npx tsx src/scripts/admin.ts queue --project MyApp --type weekly_audit\n" +
          "  npx tsx src/scripts/admin.ts repair --finding-id F123 --project MyApp\n" +
          "  npx tsx src/scripts/admin.ts validate-run --job-id <uuid>"
      );
    },
  },
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    await commands.help.handler([]);
    process.exit(0);
  }

  const cmdName = args[0];
  const cmd = commands[cmdName];

  if (!cmd) {
    console.error(`Unknown command: ${cmdName}\n`);
    await commands.help.handler([]);
    process.exit(1);
  }

  try {
    await cmd.handler(args.slice(1));
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

main();
