import type { FindingStatus } from "./types";

export const SEVERITY_ORDER: Record<string, number> = {
  blocker: 0,
  major: 1,
  minor: 2,
  nit: 3,
};

export const PRIORITY_ORDER: Record<string, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

export const SEVERITY_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  blocker: { bg: "rgba(226,75,74,0.12)", text: "#A32D2D", border: "#E24B4A" },
  major: { bg: "rgba(239,159,39,0.12)", text: "#854F0B", border: "#EF9F27" },
  minor: { bg: "rgba(56,138,221,0.12)", text: "#185FA5", border: "#378ADD" },
  nit: { bg: "rgba(136,135,128,0.10)", text: "#5F5E5A", border: "#B4B2A9" },
};

export const STATUS_GROUPS: Record<string, FindingStatus[]> = {
  active: ["open", "accepted", "in_progress"],
  pending: ["fixed_pending_verify"],
  resolved: [
    "fixed_verified",
    "wont_fix",
    "deferred",
    "duplicate",
    "converted_to_enhancement",
  ],
};

export const TYPE_ICONS: Record<string, string> = {
  bug: "\u2022",
  enhancement: "\u25B2",
  debt: "\u25C6",
  question: "?",
};

const defaultColors = {
  bg: "var(--color-background-secondary)",
  text: "var(--color-text-secondary)",
  border: "var(--color-border-tertiary)",
};

export function getSeverityColors(severity: string) {
  return SEVERITY_COLORS[severity] ?? defaultColors;
}

export function sortFindings<T extends { priority?: string; severity?: string }>(
  findings: T[]
): T[] {
  return [...findings].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority ?? ""] ?? 9;
    const pb = PRIORITY_ORDER[b.priority ?? ""] ?? 9;
    if (pa !== pb) return pa - pb;
    const sa = SEVERITY_ORDER[a.severity ?? ""] ?? 9;
    const sb = SEVERITY_ORDER[b.severity ?? ""] ?? 9;
    return sa - sb;
  });
}
