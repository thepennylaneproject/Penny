import type { Finding } from "./types";

/** Response field from POST /api/import (client + server). */
export interface ImportSummary {
  mode: "merge" | "replace";
  created: boolean;
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  total_before: number;
  total_after: number;
}

const FINGERPRINT_KEYS = [
  "status",
  "title",
  "description",
  "severity",
  "priority",
  "type",
  "category",
  "confidence",
] as const;

/** Stable subset for “same finding row” vs file update. */
export function findingImportFingerprint(f: Finding): string {
  const o: Record<string, unknown> = {};
  const rec = f as unknown as Record<string, unknown>;
  for (const k of FINGERPRINT_KEYS) {
    o[k] = rec[k] ?? null;
  }
  return JSON.stringify(o);
}

export function mergeImportedFindings(
  existing: Finding[],
  imported: Finding[]
): { findings: Finding[]; added: number; updated: number; unchanged: number } {
  const existingById = new Map(existing.map((f) => [f.finding_id, f]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const f of imported) {
    if (typeof f.finding_id !== "string" || !f.finding_id.trim()) continue;
    const prev = existingById.get(f.finding_id);
    if (!prev) {
      existingById.set(f.finding_id, f);
      added += 1;
    } else if (findingImportFingerprint(prev) === findingImportFingerprint(f)) {
      unchanged += 1;
    } else {
      existingById.set(f.finding_id, f);
      updated += 1;
    }
  }

  return {
    findings: [...existingById.values()],
    added,
    updated,
    unchanged,
  };
}
