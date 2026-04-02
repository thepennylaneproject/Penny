#!/usr/bin/env node
/**
 * Database migration runner for penny dashboard.
 * Runs all pending migrations from supabase/migrations/ directory.
 * Safe to run multiple times (idempotent).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPostgresPool } from "../lib/postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../supabase/migrations");

interface Migration {
  name: string;
  path: string;
  timestamp: string;
}

async function getMigrations(): Promise<Migration[]> {
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

  return files
    .map((name) => ({
      name,
      path: path.join(migrationsDir, name),
      timestamp: name.split("_")[0],
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function ensureMigrationsTable(pool: any): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getExecutedMigrations(pool: any): Promise<Set<string>> {
  const result = await pool.query(
    "SELECT name FROM _migrations ORDER BY name"
  );
  return new Set(result.map((row: any) => row.name));
}

async function runMigration(
  pool: any,
  migration: Migration
): Promise<boolean> {
  const content = fs.readFileSync(migration.path, "utf-8");

  try {
    await pool.query("BEGIN");
    await pool.query(content);
    await pool.query("INSERT INTO _migrations (name) VALUES ($1)", [
      migration.name,
    ]);
    await pool.query("COMMIT");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function main(): Promise<void> {
  console.log("[migrate] Starting database migrations...");

  const pool = createPostgresPool();

  try {
    await ensureMigrationsTable(pool);
    console.log("[migrate] Migrations table ready");

    const migrations = await getMigrations();
    console.log(`[migrate] Found ${migrations.length} migration files`);

    const executed = await getExecutedMigrations(pool);
    console.log(`[migrate] ${executed.size} migrations already executed`);

    let ran = 0;
    for (const migration of migrations) {
      if (executed.has(migration.name)) {
        console.log(`[migrate] ⊘ ${migration.name} (already executed)`);
        continue;
      }

      try {
        await runMigration(pool, migration);
        console.log(`[migrate] ✓ ${migration.name}`);
        ran++;
      } catch (error) {
        console.error(
          `[migrate] ✗ ${migration.name} FAILED:`,
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    }

    if (ran === 0) {
      console.log("[migrate] All migrations already executed");
    } else {
      console.log(`[migrate] ✓ Successfully ran ${ran} migration(s)`);
    }
  } catch (error) {
    console.error(
      "[migrate] Fatal error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
