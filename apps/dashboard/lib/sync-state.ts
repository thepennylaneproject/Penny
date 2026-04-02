/**
 * Persist Linear sync mappings per project.
 * When DATABASE_URL is configured, uses Postgres (`penny_linear_sync`).
 * Otherwise uses `data/linear_sync.json` (local dev only; not durable on serverless).
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import type { SyncState } from "./types";
import {
  getProjectSyncStateFromDb,
  linearSyncDatabaseEnabled,
  setProjectSyncStateInDb,
} from "./linear-sync-pg";

export type ProjectSyncState = SyncState;

const FILENAME = "linear_sync.json";

function getDataDir(): string {
  const env = process.env.penny_DASHBOARD_DATA_DIR;
  if (env && typeof env === "string" && env.trim()) return env.trim();
  return join(process.cwd(), "data");
}

function getFilePath(): string {
  return join(getDataDir(), FILENAME);
}

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

function defaultProjectState(): SyncState {
  return { mappings: {}, last_sync: null };
}

async function loadSyncStateFromFile(): Promise<Record<string, SyncState>> {
  const filePath = getFilePath();
  try {
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data !== "object" || data === null) return {};
    return Object.fromEntries(
      Object.entries(data).filter(([k]) => k !== "_updatedAt")
    ) as Record<string, SyncState>;
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
      return {};
    }
    throw e;
  }
}

async function saveSyncStateToFile(
  state: Record<string, SyncState>
): Promise<void> {
  const filePath = getFilePath();
  await ensureDir(filePath);
  await writeFile(
    filePath,
    JSON.stringify(
      { ...state, _updatedAt: new Date().toISOString() },
      null,
      2
    ),
    "utf-8"
  );
}

export async function getProjectSyncState(
  projectName: string
): Promise<SyncState> {
  if (linearSyncDatabaseEnabled()) {
    return getProjectSyncStateFromDb(projectName);
  }
  const all = await loadSyncStateFromFile();
  return all[projectName] ?? defaultProjectState();
}

export async function setProjectSyncState(
  projectName: string,
  projectState: SyncState
): Promise<void> {
  if (linearSyncDatabaseEnabled()) {
    await setProjectSyncStateInDb(projectName, projectState);
    return;
  }
  const all = await loadSyncStateFromFile();
  all[projectName] = projectState;
  await saveSyncStateToFile(all);
}
