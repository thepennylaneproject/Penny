/**
 * Enqueue/orchestration Bearer token for the current tab.
 * The live secret is kept in module memory only — it is not written to sessionStorage,
 * localStorage, or cookies. A one-time read of a legacy sessionStorage key may migrate
 * an old value into memory and then delete that key (f-8603ee3b).
 */
import { penny_ENQUEUE_SECRET_LEGACY_STORAGE_KEY } from "@/lib/auth-constants";

let memorySecret: string | null = null;
let migratedLegacy = false;

function migrateLegacySessionStorage(): void {
  if (typeof window === "undefined" || migratedLegacy) return;
  migratedLegacy = true;
  try {
    const legacy = sessionStorage
      .getItem(penny_ENQUEUE_SECRET_LEGACY_STORAGE_KEY)
      ?.trim();
    if (legacy) {
      memorySecret = legacy;
      sessionStorage.removeItem(penny_ENQUEUE_SECRET_LEGACY_STORAGE_KEY);
    }
  } catch {
    /* private mode / disabled storage */
  }
}

/** Orchestration enqueue secret for this tab only (not persisted to Web Storage). */
export function readEnqueueSecret(): string | null {
  if (typeof window !== "undefined") migrateLegacySessionStorage();
  return memorySecret?.trim() || null;
}

export function writeEnqueueSecret(value: string | null): void {
  const v = value?.trim() || null;
  memorySecret = v;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(penny_ENQUEUE_SECRET_LEGACY_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
