/**
 * Portfolio “fragile hotspots”: proof-hook path segments touched by more than one active finding.
 * Logic matches PatternPanel — keep in sync via this module only.
 */

import { STATUS_GROUPS } from "@/lib/constants";
import type { Finding, Project } from "@/lib/types";

/** Last two path segments (same as PatternPanel). */
export function proofHookShortPath(file: string): string {
  return file.split("/").slice(-2).join("/");
}

/** How many active findings reference each short path (once per finding per path). */
export function fragileShortPathCounts(projects: Project[]): Map<string, number> {
  const fileCount = new Map<string, number>();
  for (const p of projects) {
    for (const f of p.findings ?? []) {
      if (!STATUS_GROUPS.active.includes(f.status)) continue;
      const files = new Set(
        (f.proof_hooks ?? [])
          .map((h) => h.file)
          .filter((x): x is string => Boolean(x))
          .map(proofHookShortPath)
      );
      for (const file of files) {
        fileCount.set(file, (fileCount.get(file) ?? 0) + 1);
      }
    }
  }
  return fileCount;
}

/** Short paths that appear in more than one active finding. */
export function fragileShortPathSet(projects: Project[]): Set<string> {
  const out = new Set<string>();
  for (const [path, n] of fragileShortPathCounts(projects)) {
    if (n > 1) out.add(path);
  }
  return out;
}

/** Top fragile paths for charts (sorted by count desc). */
export function topFragileShortPaths(
  projects: Project[],
  limit = 5
): Array<[string, number]> {
  return [...fragileShortPathCounts(projects).entries()]
    .filter(([, v]) => v > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

export function findingOverlapsFragilePaths(
  finding: Finding | undefined,
  fragile: Set<string>
): boolean {
  if (!finding) return false;
  for (const fp of proofHookShortPathsForFinding(finding)) {
    if (fragile.has(fp)) return true;
  }
  return false;
}

function proofHookShortPathsForFinding(finding: Finding): Set<string> {
  return new Set(
    (finding.proof_hooks ?? [])
      .map((h) => h.file)
      .filter((x): x is string => Boolean(x))
      .map(proofHookShortPath)
  );
}

/** Short paths for this finding that are also portfolio fragile hotspots. */
export function overlappingFragileShortPaths(
  finding: Finding | undefined,
  fragile: Set<string>,
  max = 3
): string[] {
  if (!finding) return [];
  const out: string[] = [];
  for (const fp of proofHookShortPathsForFinding(finding)) {
    if (fragile.has(fp)) out.push(fp);
  }
  return out.slice(0, max);
}
