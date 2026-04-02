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
          "  npx tsx src/scripts/admin.ts repair --finding-id F123 --project MyApp"
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
