import { describe, expect, it } from "vitest";
import type { Project } from "@/lib/types";
import {
  fragileShortPathSet,
  findingOverlapsFragilePaths,
  overlappingFragileShortPaths,
  proofHookShortPath,
  topFragileShortPaths,
} from "../fragile-files";

function project(partial: Partial<Project> & { name: string }): Project {
  return {
    name: partial.name,
    findings: partial.findings ?? [],
    maintenanceBacklog: partial.maintenanceBacklog,
  };
}

describe("fragile-files", () => {
  it("proofHookShortPath uses last two segments", () => {
    expect(proofHookShortPath("apps/web/src/foo/bar.tsx")).toBe("foo/bar.tsx");
  });

  it("fragileShortPathSet marks paths touched by >1 active finding", () => {
    const projects: Project[] = [
      project({
        name: "a",
        findings: [
          {
            finding_id: "1",
            title: "x",
            type: "bug",
            severity: "minor",
            priority: "P2",
            status: "open",
            proof_hooks: [{ file: "src/shared/util.ts" }],
          },
          {
            finding_id: "2",
            title: "y",
            type: "bug",
            severity: "minor",
            priority: "P2",
            status: "open",
            proof_hooks: [{ file: "lib/shared/util.ts" }],
          },
        ],
      }),
    ];
    const fragile = fragileShortPathSet(projects);
    expect(fragile.has("shared/util.ts")).toBe(true);
  });

  it("findingOverlapsFragilePaths", () => {
    const projects: Project[] = [
      project({
        name: "a",
        findings: [
          {
            finding_id: "1",
            title: "x",
            type: "bug",
            severity: "minor",
            priority: "P2",
            status: "open",
            proof_hooks: [{ file: "src/a.ts" }],
          },
          {
            finding_id: "2",
            title: "y",
            type: "bug",
            severity: "minor",
            priority: "P2",
            status: "open",
            proof_hooks: [{ file: "src/a.ts" }],
          },
        ],
      }),
    ];
    const fragile = fragileShortPathSet(projects);
    const f = projects[0].findings![0];
    expect(findingOverlapsFragilePaths(f, fragile)).toBe(true);
  });

  it("topFragileShortPaths sorts by count", () => {
    const projects: Project[] = [
      project({
        name: "a",
        findings: [
          {
            finding_id: "1",
            title: "x",
            type: "bug",
            severity: "minor",
            priority: "P2",
            status: "open",
            proof_hooks: [{ file: "src/pkg/util.ts" }],
          },
          {
            finding_id: "2",
            title: "y",
            type: "bug",
            severity: "minor",
            priority: "P2",
            status: "open",
            proof_hooks: [{ file: "lib/pkg/util.ts" }],
          },
          {
            finding_id: "3",
            title: "z",
            type: "bug",
            severity: "minor",
            priority: "P2",
            status: "open",
            proof_hooks: [{ file: "b/other.ts" }],
          },
        ],
      }),
    ];
    const top = topFragileShortPaths(projects, 5);
    expect(top[0]?.[0]).toBe("pkg/util.ts");
    expect(top[0]?.[1]).toBe(2);
  });

  it("overlappingFragileShortPaths caps list", () => {
    const fragile = new Set(["a/a", "b/b", "c/c", "d/d"]);
    const finding = {
      finding_id: "x",
      title: "t",
      type: "bug" as const,
      severity: "minor" as const,
      priority: "P2" as const,
      status: "open" as const,
      proof_hooks: [
        { file: "x/a/a" },
        { file: "x/b/b" },
        { file: "x/c/c" },
        { file: "x/d/d" },
      ],
    };
    expect(overlappingFragileShortPaths(finding, fragile, 2)).toEqual(["a/a", "b/b"]);
  });
});
