import { randomUUID } from "node:crypto";
import { Pool, type PoolConfig } from "pg";

interface DatabaseSettings {
  connectionString: string;
  host: string;
  port: number;
  database: string;
  user: string;
  ssl: boolean;
  rejectUnauthorized: boolean;
}

export interface DatabaseConfig {
  configured: boolean;
  missing: string[];
  host: string;
  port: number;
  database: string;
  user: string;
  ssl: boolean;
  connectionLabel: string;
  eventsTable: string;
  snapshotsTable: string;
  schema: string;
}

function readFirstDefinedEnv(keys: readonly string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

function isSafeIdent(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

export function quoteIdent(value: string): string {
  if (!isSafeIdent(value)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }
  return `"${value}"`;
}

function parseDatabaseUrl(raw: string): DatabaseSettings {
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use a postgres:// or postgresql:// URL");
  }

  const host = url.hostname;
  const port = Number(url.port || "5432");
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres";
  const user = decodeURIComponent(url.username || "postgres");
  const sslmode = url.searchParams.get("sslmode")?.toLowerCase();
  const ssl = sslmode === "disable" ? false : host !== "localhost" && host !== "127.0.0.1";
  const rejectUnauthorized = sslmode === "verify-full";

  if (!url.password) {
    throw new Error("DATABASE_URL must include a password");
  }

  return {
    connectionString: raw,
    host,
    port,
    database,
    user,
    ssl,
    rejectUnauthorized,
  };
}

function maskDatabaseUrl(settings: DatabaseSettings): string {
  return `postgresql://${settings.user}:***@${settings.host}:${settings.port}/${settings.database}`;
}

function readTableName(envKey: string, fallback: string): string {
  return process.env[envKey]?.trim() || fallback;
}

export function readDatabaseConfig(): DatabaseConfig {
  const rawUrl = readFirstDefinedEnv(["DATABASE_URL", "penny_DATABASE_URL", "penny_SUPABASE_URL"]);
  const missing: string[] = [];

  if (!rawUrl) {
    missing.push("DATABASE_URL");
  }

  const schema = process.env.penny_POSTGRES_SCHEMA?.trim() || process.env.penny_SUPABASE_SCHEMA?.trim() || "public";
  const eventsTable = readTableName("penny_POSTGRES_EVENTS_TABLE", process.env.penny_SUPABASE_EVENTS_TABLE?.trim() || "penny_orchestration_events");
  const snapshotsTable = readTableName("penny_POSTGRES_SNAPSHOTS_TABLE", process.env.penny_SUPABASE_SNAPSHOTS_TABLE?.trim() || "penny_project_snapshots");

  if (!isSafeIdent(schema)) missing.push("penny_POSTGRES_SCHEMA");
  if (!isSafeIdent(eventsTable)) missing.push("penny_POSTGRES_EVENTS_TABLE");
  if (!isSafeIdent(snapshotsTable)) missing.push("penny_POSTGRES_SNAPSHOTS_TABLE");

  let settings: DatabaseSettings | null = null;
  if (rawUrl) {
    try {
      settings = parseDatabaseUrl(rawUrl);
    } catch {
      missing.push("DATABASE_URL");
    }
  }

  const fallbackSettings: DatabaseSettings = {
    connectionString: "",
    host: "",
    port: 5432,
    database: "",
    user: "postgres",
    ssl: true,
    rejectUnauthorized: false,
  };
  const resolved = settings ?? fallbackSettings;

  return {
    configured: missing.length === 0,
    missing,
    host: resolved.host,
    port: resolved.port,
    database: resolved.database,
    user: resolved.user,
    ssl: resolved.ssl,
    connectionLabel: settings ? maskDatabaseUrl(settings) : "",
    eventsTable,
    snapshotsTable,
    schema,
  };
}

/** Supabase pooler (session mode, port 5432) caps total clients at pool_size — one shared pool avoids exhausting it. */
function resolvePoolMax(): number {
  const raw = process.env.PG_POOL_MAX ?? process.env.penny_PG_POOL_MAX ?? "5";
  const maxPoolSize = Number.parseInt(raw, 10);
  if (!Number.isFinite(maxPoolSize) || maxPoolSize < 1) return 5;
  return Math.min(maxPoolSize, 30);
}

export class PostgresPool {
  private readonly pool: Pool;

  constructor(settings: DatabaseSettings) {
    const config: PoolConfig = {
      connectionString: settings.connectionString,
      max: resolvePoolMax(),
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 15_000,
      ssl: settings.ssl
        ? {
            rejectUnauthorized: settings.rejectUnauthorized,
          }
        : false,
    };
    this.pool = new Pool(config);
  }

  async query(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    const result = await this.pool.query(sql, params);
    return result.rows as Record<string, unknown>[];
  }

  /**
   * Run statements on one connection with BEGIN/COMMIT (or ROLLBACK on error).
   * Use for multi-step deletes so partial cleanup cannot leave inconsistent state.
   */
  async transaction<T>(
    fn: (query: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const query = async (sql: string, params: unknown[] = []) => {
        const result = await client.query(sql, params);
        return result.rows as Record<string, unknown>[];
      };
      const out = await fn(query);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  /** Close all pool clients. Use in scripts (e.g. migrations); avoid on the shared app pool during requests. */
  async end(): Promise<void> {
    await this.pool.end();
  }
}

let sharedPostgresPool: PostgresPool | null = null;

/**
 * Returns one process-wide pool. Callers must not create ad-hoc pools — Supabase session pooler
 * limits total connections; multiple `new Pool()` instances each default to max≈10 and exhaust the cap.
 */
export function createPostgresPool(): PostgresPool {
  if (sharedPostgresPool) return sharedPostgresPool;
  const rawUrl = readFirstDefinedEnv(["DATABASE_URL", "penny_DATABASE_URL", "penny_SUPABASE_URL"]);
  if (!rawUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const settings = parseDatabaseUrl(rawUrl);
  sharedPostgresPool = new PostgresPool(settings);
  return sharedPostgresPool;
}

export function generateUuid(): string {
  return randomUUID();
}
