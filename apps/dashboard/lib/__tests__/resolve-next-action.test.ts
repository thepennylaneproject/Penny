import { describe, it, expect } from "vitest";
import type { Project } from "@/lib/types";
import { resolveNextAction } from "../resolve-next-action";

function project(partial: Partial<Project> & { name: string }): Project {
  return {
    name: partial.name,
    findings: partial.findings ?? [],
    maintenanceBacklog: partial.maintenanceBacklog,
  };
}

describe("resolveNextAction", () => {
  it("prefers backlog over active findings", () => {
    const projects: Project[] = [
      project({
        name: "a",
        findings: [
          {
            finding_id: "f1",
            title: "Critical bug",
            type: "bug",
            severity: "blocker",
            priority: "P0",
            status: "open",
          },
        ],
        maintenanceBacklog: [
          {
            id: "b1",
            project_name: "a",
            title: "Backlog task",
            canonical_status: "open",
            source_type: "finding",
            priority: "P2",
            severity: "nit",
            risk_class: "low",
            next_action: "review",
            finding_ids: ["fx"],
          },
        ],
      }),
    ];
    const r = resolveNextAction(projects);
    expect(r?.source).toBe("backlog");
    expect(r?.title).toBe("Backlog task");
    expect(r?.findingId).toBe("fx");
    expect(r?.backlogRiskClass).toBe("low");
    expect(r?.backlogNextAction).toBe("review");
  });

  it("within one project, picks highest-priority backlog row regardless of array order", () => {
    const projects: Project[] = [
      project({
        name: "solo",
        maintenanceBacklog: [
          {
            id: "later",
            project_name: "solo",
            title: "P2 first in array",
            canonical_status: "open",
            source_type: "finding",
            priority: "P2",
            severity: "blocker",
            risk_class: "low",
            next_action: "review",
            finding_ids: ["low"],
          },
          {
            id: "earlier",
            project_name: "solo",
            title: "P0 second in array",
            canonical_status: "open",
            source_type: "finding",
            priority: "P0",
            severity: "nit",
            risk_class: "low",
            next_action: "review",
            finding_ids: ["high"],
          },
        ],
      }),
    ];
    const r = resolveNextAction(projects);
    expect(r?.source).toBe("backlog");
    expect(r?.title).toBe("P0 second in array");
    expect(r?.findingId).toBe("high");
  });

  it("picks lower priority backlog across projects (P0 beats P1)", () => {
    const projects: Project[] = [
      project({
        name: "late",
        maintenanceBacklog: [
          {
            id: "b1",
            project_name: "late",
            title: "P1 task",
            canonical_status: "open",
            source_type: "finding",
            priority: "P1",
            severity: "major",
            risk_class: "low",
            next_action: "review",
            finding_ids: ["a"],
          },
        ],
      }),
      project({
        name: "early",
        maintenanceBacklog: [
          {
            id: "b2",
            project_name: "early",
            title: "P0 task",
            canonical_status: "open",
            source_type: "finding",
            priority: "P0",
            severity: "nit",
            risk_class: "low",
            next_action: "review",
            finding_ids: ["b"],
          },
        ],
      }),
    ];
    const r = resolveNextAction(projects);
    expect(r?.source).toBe("backlog");
    expect(r?.title).toBe("P0 task");
    expect(r?.projectName).toBe("early");
  });

  it("same priority: more severe backlog wins", () => {
    const projects: Project[] = [
      project({
        name: "minor",
        maintenanceBacklog: [
          {
            id: "b1",
            project_name: "minor",
            title: "minor sev",
            canonical_status: "open",
            source_type: "finding",
            priority: "P1",
            severity: "minor",
            risk_class: "low",
            next_action: "review",
            finding_ids: ["x"],
          },
        ],
      }),
      project({
        name: "blocker",
        maintenanceBacklog: [
          {
            id: "b2",
            project_name: "blocker",
            title: "blocker sev",
            canonical_status: "open",
            source_type: "finding",
            priority: "P1",
            severity: "blocker",
            risk_class: "high",
            next_action: "review",
            finding_ids: ["y"],
          },
        ],
      }),
    ];
    const r = resolveNextAction(projects);
    expect(r?.title).toBe("blocker sev");
    expect(r?.projectName).toBe("blocker");
  });

  it("falls back to top active finding when no backlog", () => {
    const projects: Project[] = [
      project({
        name: "p2",
        findings: [
          {
            finding_id: "low",
            title: "P2 finding",
            type: "bug",
            severity: "nit",
            priority: "P2",
            status: "open",
          },
        ],
      }),
      project({
        name: "p0",
        findings: [
          {
            finding_id: "high",
            title: "P0 finding",
            type: "bug",
            severity: "minor",
            priority: "P0",
            status: "open",
          },
        ],
      }),
    ];
    const r = resolveNextAction(projects);
    expect(r?.source).toBe("finding");
    expect(r?.findingId).toBe("high");
    expect(r?.projectName).toBe("p0");
  });

  it("returns null when no backlog and no active findings", () => {
    const projects: Project[] = [
      project({
        name: "x",
        findings: [
          {
            finding_id: "d",
            title: "done",
            type: "bug",
            severity: "nit",
            priority: "P3",
            status: "fixed_verified",
          },
        ],
      }),
    ];
    expect(resolveNextAction(projects)).toBeNull();
  });
});
