import { createPostgresPool, readDatabaseConfig } from "./postgres";
import type { SyncState } from "./types";

export function linearSyncDatabaseEnabled(): boolean {
  return readDatabaseConfig().configured;
}

function emptyState(): SyncState {
  return { mappings: {}, last_sync: null };
}

function parseState(raw: unknown): SyncState {
  if (!raw || typeof raw !== "object") return emptyState();
  const stateRecord = raw as Record<string, unknown>;
  const mappings = stateRecord.mappings;
  const last_sync = stateRecord.last_sync;
  return {
    mappings:
      typeof mappings === "object" && mappings !== null && !Array.isArray(mappings)
        ? (mappings as SyncState["mappings"])
        : {},
    last_sync: last_sync != null ? String(last_sync) : null,
  };
}

export async function getProjectSyncStateFromDb(
  projectName: string
): Promise<SyncState> {
  const db = createPostgresPool();
  const rows = await db.query(
    `SELECT state FROM penny_linear_sync WHERE project_name = $1`,
    [projectName]
  );
  if (!rows[0] || rows[0].state == null) return emptyState();
  return parseState(rows[0].state);
}

export async function setProjectSyncStateInDb(
  projectName: string,
  projectState: SyncState
): Promise<void> {
  const db = createPostgresPool();
  await db.query(
    `INSERT INTO penny_linear_sync (project_name, state, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (project_name) DO UPDATE SET
       state = EXCLUDED.state,
       updated_at = now()`,
    [projectName, JSON.stringify(projectState)]
  );
}
