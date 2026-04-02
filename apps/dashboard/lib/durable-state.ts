import type { Project } from "./types";
import {
  createPostgresPool,
  generateUuid,
  quoteIdent,
  readDatabaseConfig,
} from "./postgres";

export interface DurableEvent {
  event_type: string;
  project_name?: string | null;
  source: string;
  summary: string;
  payload?: Record<string, unknown>;
}

export interface DurableEventRecord extends DurableEvent {
  id?: string;
  created_at?: string;
}

export interface DurableProjectSnapshot {
  project_name: string;
  source: string;
  summary: string;
  project_json: Project;
  updated_at: string;
}

export interface DurableStateConfig {
  configured: boolean;
  missing: string[];
  host: string;
  port: number;
  database: string;
  user: string;
  ssl: boolean;
  connectionLabel: string;
  schema: string;
  eventsTable: string;
  snapshotsTable: string;
}

export interface DurableStateSummary {
  configured: boolean;
  missing: string[];
  recent_events: DurableEventRecord[];
  recent_snapshots: DurableProjectSnapshot[];
  error?: string;
}

const pool = (() => {
  try {
    return createPostgresPool();
  } catch {
    return null;
  }
})();

let schemaBootstrap: Promise<void> | null = null;

function getConfig(): DurableStateConfig {
  const config = readDatabaseConfig();
  return config;
}

async function ensureSchema(): Promise<void> {
  const config = readDatabaseConfig();
  if (!config.configured || !pool) return;
  if (!schemaBootstrap) {
    schemaBootstrap = (async () => {
      const schema = quoteIdent(config.schema);
      const eventsTable = quoteIdent(config.eventsTable);
      const snapshotsTable = quoteIdent(config.snapshotsTable);
      await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
      await pool.query(
        `CREATE TABLE IF NOT EXISTS ${schema}.${eventsTable} (
          id uuid PRIMARY KEY,
          event_type text NOT NULL,
          project_name text,
          source text NOT NULL,
          summary text NOT NULL,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        )`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS ${quoteIdent(`${config.eventsTable}_created_at_idx`)} ON ${schema}.${eventsTable} (created_at DESC)`
      );
      await pool.query(
        `CREATE TABLE IF NOT EXISTS ${schema}.${snapshotsTable} (
          project_name text PRIMARY KEY,
          source text NOT NULL,
          summary text NOT NULL,
          project_json jsonb NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        )`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS ${quoteIdent(`${config.snapshotsTable}_updated_at_idx`)} ON ${schema}.${snapshotsTable} (updated_at DESC)`
      );
    })();
    schemaBootstrap = schemaBootstrap.catch((error) => {
      schemaBootstrap = null;
      throw error;
    });
  }
  await schemaBootstrap;
}

export function hasDurableState(): boolean {
  return getConfig().configured;
}

export function getDurableStateConfig(): DurableStateConfig {
  return getConfig();
}

function toJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

async function requirePool(): Promise<NonNullable<typeof pool>> {
  if (!pool) {
    throw new Error("DATABASE_URL is required for durable state access");
  }
  await ensureSchema();
  return pool;
}

export async function recordDurableEvent(event: DurableEvent): Promise<void> {
  if (!hasDurableState()) return;
  const config = getConfig();
  const client = await requirePool();
  await client.query(
    `INSERT INTO ${quoteIdent(config.schema)}.${quoteIdent(config.eventsTable)}
       (id, event_type, project_name, source, summary, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      generateUuid(),
      event.event_type,
      event.project_name ?? null,
      event.source,
      event.summary,
      toJson(event.payload),
    ]
  );
}

export async function recordProjectSnapshot(
  project: Project,
  source: string,
  summary: string
): Promise<void> {
  if (!hasDurableState()) return;
  const config = getConfig();
  const client = await requirePool();
  await client.query(
    `INSERT INTO ${quoteIdent(config.schema)}.${quoteIdent(config.snapshotsTable)}
       (project_name, source, summary, project_json, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (project_name)
     DO UPDATE SET
       source = EXCLUDED.source,
       summary = EXCLUDED.summary,
       project_json = EXCLUDED.project_json,
       updated_at = EXCLUDED.updated_at`,
    [
      project.name,
      source,
      summary,
      toJson(project),
      new Date().toISOString(),
    ]
  );
}

/** Logs and continues if Postgres is down — GitHub/onboarding must not fail on durable logging. */
export async function recordDurableEventBestEffort(event: DurableEvent): Promise<void> {
  try {
    await recordDurableEvent(event);
  } catch (error) {
    console.warn(
      "[durable-state] recordDurableEvent skipped:",
      error instanceof Error ? error.message : error
    );
  }
}

export async function recordProjectSnapshotBestEffort(
  project: Project,
  source: string,
  summary: string
): Promise<void> {
  try {
    await recordProjectSnapshot(project, source, summary);
  } catch (error) {
    console.warn(
      "[durable-state] recordProjectSnapshot skipped:",
      error instanceof Error ? error.message : error
    );
  }
}

export async function fetchDurableState(limit = 10): Promise<DurableStateSummary> {
  const config = getConfig();
  if (!config.configured) {
    return {
      configured: false,
      missing: config.missing,
      recent_events: [],
      recent_snapshots: [],
    };
  }

  try {
    const client = await requirePool();
    const events = await client.query(
      `SELECT id, event_type, project_name, source, summary, payload, created_at
       FROM ${quoteIdent(config.schema)}.${quoteIdent(config.eventsTable)}
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    const snapshots = await client.query(
      `SELECT project_name, source, summary, project_json, updated_at
       FROM ${quoteIdent(config.schema)}.${quoteIdent(config.snapshotsTable)}
       ORDER BY updated_at DESC
       LIMIT $1`,
      [limit]
    );

    return {
      configured: true,
      missing: [],
      recent_events: events.map((event) => ({
        id: String(event.id ?? ""),
        event_type: String(event.event_type ?? ""),
        project_name: event.project_name == null ? null : String(event.project_name),
        source: String(event.source ?? ""),
        summary: String(event.summary ?? ""),
        payload: (event.payload && typeof event.payload === "object" ? event.payload : {}) as Record<string, unknown>,
        created_at: event.created_at == null ? undefined : String(event.created_at),
      })),
      recent_snapshots: snapshots.map((snapshot) => ({
        project_name: String(snapshot.project_name ?? ""),
        source: String(snapshot.source ?? ""),
        summary: String(snapshot.summary ?? ""),
        project_json: snapshot.project_json as Project,
        updated_at: String(snapshot.updated_at ?? ""),
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      configured: true,
      missing: [],
      recent_events: [],
      recent_snapshots: [],
      error: message,
    };
  }
}
