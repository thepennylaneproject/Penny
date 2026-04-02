import { describe, expect, it } from "vitest";
import {
  findDetailForProject,
  forensicsLinesForProject,
  redactAuditRunPayload,
  concatRawLlmForProject,
  runSeriesAlerts,
  scopeFingerprintForRunCompare,
  effectiveCoverageComplete,
} from "../audit-run-forensics";
import type { pennyAuditRunRow } from "../orchestration-jobs";

function minimalRun(
  partial: Partial<pennyAuditRunRow> & Pick<pennyAuditRunRow, "id" | "created_at">
): pennyAuditRunRow {
  return {
    job_id: null,
    job_type: "re_audit_project",
    project_name: null,
    status: "completed",
    summary: null,
    findings_added: 0,
    manifest_revision: null,
    checklist_id: null,
    coverage_complete: null,
    completion_confidence: null,
    exhaustiveness: null,
    payload: {},
    ...partial,
  };
}

describe("audit-run-forensics", () => {
  const payload = {
    audit_kind: "full",
    project_audit_details: [
      {
        project: "Codra",
        scope_type: "project",
        scope_paths: ["src/a.ts"],
        files_in_scope: ["src/a.ts", "src/b.ts"],
        files_reviewed: ["src/a.ts"],
        findings_added: 2,
        findings_returned: 3,
        coverage_complete: true,
        completion_confidence: "high",
        checklist_id: "penny-bounded-audit-v1",
        manifest_revision: "abc123def",
        exhaustiveness: "sampled",
        raw_llm_output: "SECRET_MODEL_TEXT",
      },
    ],
  };

  it("findDetailForProject matches case-insensitively", () => {
    expect(findDetailForProject(payload, "codra")?.findings_added).toBe(2);
    expect(findDetailForProject(payload, "Other")).toBeNull();
  });

  it("redactAuditRunPayload strips raw_llm_output", () => {
    const red = redactAuditRunPayload(payload);
    const details = red.project_audit_details as Array<Record<string, unknown>>;
    expect(details[0].raw_llm_output).toMatch(/omitted/i);
    expect(String(details[0].raw_llm_output)).not.toContain("SECRET");
  });

  it("concatRawLlmForProject returns original trace", () => {
    expect(concatRawLlmForProject(payload, "Codra")).toBe("SECRET_MODEL_TEXT");
  });

  it("forensicsLinesForProject includes key fields", () => {
    const lines = forensicsLinesForProject(payload, "Codra");
    const labels = lines.map((l) => l.label);
    expect(labels).toContain("Scope type");
    expect(labels).toContain("Manifest mode");
    expect(lines.some((l) => l.value.includes("reviewed"))).toBe(true);
  });

  it("runSeriesAlerts flags coverage regression", () => {
    const runs: pennyAuditRunRow[] = [
      minimalRun({
        id: "1",
        project_name: "X",
        findings_added: 1,
        coverage_complete: false,
        completion_confidence: "medium",
        exhaustiveness: "sampled",
        created_at: "2026-03-21T10:00:00.000Z",
      }),
      minimalRun({
        id: "2",
        project_name: "X",
        findings_added: 0,
        coverage_complete: true,
        completion_confidence: "high",
        exhaustiveness: "exhaustive",
        created_at: "2026-03-20T10:00:00.000Z",
      }),
    ];
    const alerts = runSeriesAlerts(runs);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].tone).toBe("amber");
    expect(alerts[0].message).toMatch(/partial coverage/i);
  });

  it("effectiveCoverageComplete falls back to payload when column null", () => {
    const run = minimalRun({
      id: "1",
      project_name: "Codra",
      coverage_complete: null,
      payload,
      created_at: "",
    });
    expect(effectiveCoverageComplete(run, "Codra")).toBe(true);
  });

  it("runSeriesAlerts uses payload coverage when DB columns null", () => {
    const slice = {
      project: "Z",
      scope_type: "project",
      scope_paths: [] as string[],
      scan_roots: [] as string[],
      manifest_revision: "rev",
      checklist_id: "penny-bounded-audit-v1",
      exhaustiveness: "sampled",
    };
    const runs: pennyAuditRunRow[] = [
      minimalRun({
        id: "1",
        project_name: "Z",
        findings_added: 0,
        coverage_complete: null,
        exhaustiveness: "sampled",
        payload: {
          audit_kind: "full",
          project_audit_details: [{ ...slice, coverage_complete: false }],
        },
        created_at: "2026-03-21T10:00:00.000Z",
      }),
      minimalRun({
        id: "2",
        project_name: "Z",
        findings_added: 0,
        coverage_complete: null,
        exhaustiveness: "sampled",
        payload: {
          audit_kind: "full",
          project_audit_details: [{ ...slice, coverage_complete: true }],
        },
        created_at: "2026-03-20T10:00:00.000Z",
      }),
    ];
    const alerts = runSeriesAlerts(runs, { projectName: "Z" });
    expect(alerts.some((a) => a.message.includes("partial coverage"))).toBe(true);
  });

  it("scopeFingerprintForRunCompare ignores path order", () => {
    const baseDetail = {
      project: "P",
      scope_type: "file",
      scope_paths: ["x/a.ts", "x/b.ts"],
      scan_roots: ["root-a", "root-b"],
      manifest_revision: "m1",
      checklist_id: "c1",
      exhaustiveness: "sampled",
    };
    const a = minimalRun({
      id: "a",
      project_name: "P",
      payload: { audit_kind: "logic", project_audit_details: [baseDetail] },
      created_at: "",
    });
    const b = minimalRun({
      id: "b",
      project_name: "P",
      payload: {
        audit_kind: "logic",
        project_audit_details: [
          {
            ...baseDetail,
            scope_paths: ["x/b.ts", "x/a.ts"],
            scan_roots: ["root-b", "root-a"],
          },
        ],
      },
      created_at: "",
    });
    expect(scopeFingerprintForRunCompare(a, "P")).toBe(scopeFingerprintForRunCompare(b, "P"));
  });

  it("runSeriesAlerts warns when two consecutive runs add zero with same scope", () => {
    const detail = {
      project: "Q",
      scope_type: "project",
      scope_paths: [] as string[],
      scan_roots: ["src"],
      manifest_revision: "mr",
      checklist_id: "ck",
      exhaustiveness: "sampled",
      coverage_complete: true,
    };
    const runs: pennyAuditRunRow[] = [
      minimalRun({
        id: "1",
        project_name: "Q",
        findings_added: 0,
        payload: { audit_kind: "full", project_audit_details: [detail] },
        created_at: "2026-03-21T10:00:00.000Z",
      }),
      minimalRun({
        id: "2",
        project_name: "Q",
        findings_added: 0,
        payload: { audit_kind: "full", project_audit_details: [detail] },
        created_at: "2026-03-20T10:00:00.000Z",
      }),
    ];
    const alerts = runSeriesAlerts(runs, { projectName: "Q" });
    expect(alerts.some((x) => x.message.includes("Two consecutive runs"))).toBe(true);
  });

  it("runSeriesAlerts does not warn on zero-add when scope paths change", () => {
    const mk = (paths: string[]) => ({
      project: "Q",
      scope_type: "file" as const,
      scope_paths: paths,
      scan_roots: [] as string[],
      manifest_revision: "mr",
      checklist_id: "ck",
      exhaustiveness: "sampled",
      coverage_complete: true,
    });
    const runs: pennyAuditRunRow[] = [
      minimalRun({
        id: "1",
        project_name: "Q",
        findings_added: 0,
        payload: { audit_kind: "full", project_audit_details: [mk(["a.ts"])] },
        created_at: "2026-03-21T10:00:00.000Z",
      }),
      minimalRun({
        id: "2",
        project_name: "Q",
        findings_added: 0,
        payload: { audit_kind: "full", project_audit_details: [mk(["b.ts"])] },
        created_at: "2026-03-20T10:00:00.000Z",
      }),
    ];
    const alerts = runSeriesAlerts(runs, { projectName: "Q" });
    expect(alerts.some((x) => x.message.includes("Two consecutive runs"))).toBe(false);
  });

  it("runSeriesAlerts empty when fewer than 2 runs", () => {
    expect(runSeriesAlerts([])).toEqual([]);
    expect(
      runSeriesAlerts([
        minimalRun({
          id: "1",
          job_type: "x",
          coverage_complete: true,
          created_at: "",
        }),
      ])
    ).toEqual([]);
  });
});
