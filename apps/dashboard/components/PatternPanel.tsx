"use client";

import type { Project, FindingType, Severity } from "@/lib/types";
import { STATUS_GROUPS } from "@/lib/constants";
import { topFragileShortPaths } from "@/lib/fragile-files";

interface PatternPanelProps {
  projects: Project[];
}

const SEVERITY_COLORS: Record<Severity, string> = {
  blocker: "var(--ink-red)",
  major:   "var(--ink-amber)",
  minor:   "var(--ink-blue)",
  nit:     "var(--ink-text-4)",
};

const TYPE_LABELS: Record<string, string> = {
  bug:         "bug",
  enhancement: "enhancement",
  debt:        "tech debt",
  question:    "open question",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize:      "9px",
        fontFamily:    "var(--font-mono)",
        fontWeight:    500,
        color:         "var(--ink-text-4)",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        marginBottom:  "0.75rem",
      }}
    >
      {children}
    </div>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <div
        style={{
          display:        "flex",
          justifyContent: "space-between",
          marginBottom:   "0.25rem",
        }}
      >
        <span style={{ fontSize: "11px", color: "var(--ink-text-2)", fontFamily: "var(--font-mono)" }}>
          {label}
        </span>
        <span style={{ fontSize: "10px", color: "var(--ink-text-4)", fontFamily: "var(--font-mono)" }}>
          {value}
        </span>
      </div>
      <div
        style={{
          height:       4,
          background:   "var(--ink-border-faint)",
          borderRadius: 2,
          overflow:     "hidden",
        }}
      >
        <div
          style={{
            width:      `${pct}%`,
            height:     "100%",
            background: color,
            borderRadius: 2,
            transition: "width 0.5s ease",
          }}
        />
      </div>
    </div>
  );
}

export function PatternPanel({ projects }: PatternPanelProps) {
  if (projects.length === 0) return null;

  const allFindings = projects.flatMap((p) => p.findings ?? []);
  const activeFindings = allFindings.filter((f) => STATUS_GROUPS.active.includes(f.status));

  if (allFindings.length === 0) return null;

  // ── Category frequency ──
  const categoryCount: Record<string, number> = {};
  for (const f of activeFindings) {
    const cat = f.category ?? f.type ?? "unknown";
    categoryCount[cat] = (categoryCount[cat] ?? 0) + 1;
  }
  const topCategories = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxCat = topCategories[0]?.[1] ?? 1;

  // ── Type distribution ──
  const typeCount: Record<string, number> = {};
  for (const f of activeFindings) {
    const t = f.type ?? "bug";
    typeCount[t] = (typeCount[t] ?? 0) + 1;
  }

  // ── Severity distribution (across all, not just active) ──
  const sevCount: Record<string, number> = { blocker: 0, major: 0, minor: 0, nit: 0 };
  for (const f of allFindings) {
    if (f.severity && f.severity in sevCount) {
      sevCount[f.severity] = (sevCount[f.severity] ?? 0) + 1;
    }
  }
  const maxSev = Math.max(...Object.values(sevCount), 1);

  const fragileFiles = topFragileShortPaths(projects, 5);
  const maxFile = fragileFiles[0]?.[1] ?? 1;

  return (
    <div
      id="penny-pattern-panel"
      style={{
        marginTop:     "2.5rem",
        paddingTop:    "2rem",
        borderTop:     "0.5px solid var(--ink-border-faint)",
      }}
    >
      <div
        style={{
          fontSize:      "9px",
          fontFamily:    "var(--font-mono)",
          fontWeight:    500,
          color:         "var(--ink-text-4)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom:  "1.75rem",
        }}
      >
        Patterns
      </div>

      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap:                 "2.5rem 3rem",
        }}
      >
        {/* Severity distribution */}
        <div>
          <SectionLabel>Severity — all findings</SectionLabel>
          {(["blocker", "major", "minor", "nit"] as Severity[]).map((sev) => (
            <Bar
              key={sev}
              label={sev}
              value={sevCount[sev] ?? 0}
              max={maxSev}
              color={SEVERITY_COLORS[sev]}
            />
          ))}
        </div>

        {/* Top categories */}
        {topCategories.length > 0 && (
          <div>
            <SectionLabel>Issue categories — active</SectionLabel>
            {topCategories.map(([cat, count]) => (
              <Bar
                key={cat}
                label={cat}
                value={count}
                max={maxCat}
                color="var(--ink-text-3)"
              />
            ))}
          </div>
        )}

        {/* Type distribution */}
        <div>
          <SectionLabel>Type — active</SectionLabel>
          {(["bug", "debt", "enhancement", "question"] as FindingType[]).map((t) => (
            <Bar
              key={t}
              label={TYPE_LABELS[t] ?? t}
              value={typeCount[t] ?? 0}
              max={Math.max(...Object.values(typeCount), 1)}
              color="var(--ink-text-3)"
            />
          ))}
        </div>

        {/* Fragile files */}
        {fragileFiles.length > 0 && (
          <div>
            <SectionLabel>Fragile files</SectionLabel>
            {fragileFiles.map(([file, count]) => (
              <Bar
                key={file}
                label={file}
                value={count}
                max={maxFile}
                color="var(--ink-amber)"
              />
            ))}
            <div
              style={{
                fontSize:   "10px",
                fontFamily: "var(--font-mono)",
                color:      "var(--ink-text-4)",
                marginTop:  "0.5rem",
              }}
            >
              files appearing in multiple active findings
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
