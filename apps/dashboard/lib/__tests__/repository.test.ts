import { describe, it, expect } from "vitest";
import { parseOpenFindingsPayload } from "@/lib/repository";
import type { Finding, Priority, Severity } from "@/lib/types";

function finding(overrides: Partial<Finding> & Pick<Finding, "finding_id" | "title">): Finding {
  return {
    type: "bug",
    severity: "major",
    priority: "P1",
    status: "open",
    ...overrides,
  };
}

describe("Repository", () => {
  describe("parseOpenFindingsPayload", () => {
    it("should parse findings from open_findings key", () => {
      const mockFinding = finding({
        finding_id: "F001",
        title: "Test Finding",
        description: "A test finding",
        severity: "major",
        priority: "P2",
      });

      const payload = {
        open_findings: [mockFinding],
      };

      const result = parseOpenFindingsPayload(JSON.stringify(payload));
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toEqual(mockFinding);
    });

    it("should parse findings from findings key (alternate format)", () => {
      const mockFinding = finding({
        finding_id: "F002",
        title: "Another Finding",
        description: "Another test",
        severity: "minor",
        priority: "P3",
        status: "accepted",
      });

      const payload = {
        findings: [mockFinding],
      };

      const result = parseOpenFindingsPayload(JSON.stringify(payload));
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toEqual(mockFinding);
    });

    it("should prefer open_findings over findings key", () => {
      const finding1 = finding({
        finding_id: "F001",
        title: "From open_findings",
        description: "This one",
        severity: "blocker",
        priority: "P0",
      });

      const finding2 = finding({
        finding_id: "F002",
        title: "From findings",
        description: "This one",
        severity: "nit",
        priority: "P3",
      });

      const payload = {
        open_findings: [finding1],
        findings: [finding2],
      };

      const result = parseOpenFindingsPayload(JSON.stringify(payload));
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].finding_id).toBe("F001");
    });

    it("should handle empty findings array", () => {
      const payload = {
        open_findings: [],
      };

      const result = parseOpenFindingsPayload(JSON.stringify(payload));
      expect(result.findings).toEqual([]);
    });

    it("should handle multiple findings", () => {
      const severities: Severity[] = ["blocker", "major", "minor", "nit", "blocker"];
      const priorities: Priority[] = ["P0", "P1", "P2", "P3", "P0"];
      const findings: Finding[] = Array.from({ length: 5 }, (_, i) =>
        finding({
          finding_id: `F${i.toString().padStart(3, "0")}`,
          title: `Finding ${i}`,
          description: `Test finding ${i}`,
          severity: severities[i % 5],
          priority: priorities[i % 5],
        })
      );

      const payload = { open_findings: findings };
      const result = parseOpenFindingsPayload(JSON.stringify(payload));
      expect(result.findings).toHaveLength(5);
      expect(result.findings).toEqual(findings);
    });

    it("should throw when findings is not an array", () => {
      const payload = {
        open_findings: "not an array",
      };

      expect(() => {
        parseOpenFindingsPayload(JSON.stringify(payload));
      }).toThrow("No findings array found");
    });

    it("should throw when no findings key is present", () => {
      const payload = {
        metadata: { version: "1.0" },
      };

      expect(() => {
        parseOpenFindingsPayload(JSON.stringify(payload));
      }).toThrow("No findings array found");
    });

    it("should throw on invalid JSON", () => {
      const invalidJson = "{ invalid json }";

      expect(() => {
        parseOpenFindingsPayload(invalidJson);
      }).toThrow();
    });

    it("should handle findings with all optional fields", () => {
      const mockFinding = finding({
        finding_id: "F001",
        title: "Complete Finding",
        description: "Full example",
        severity: "major",
        priority: "P2",
        status: "in_progress",
        category: "performance",
        suggested_fix: { approach: "Optimize the loop" },
        proof_hooks: [{ summary: "Slow query detected" }],
        verified_at: "2026-03-20T00:00:00Z",
      });

      const payload = { findings: [mockFinding] };
      const result = parseOpenFindingsPayload(JSON.stringify(payload));
      expect(result.findings[0]).toEqual(mockFinding);
    });

    it("should parse findings with nested structures", () => {
      const mockFinding = finding({
        finding_id: "F001",
        title: "Finding with metadata",
        description: "Test",
        severity: "minor",
        priority: "P1",
        metadata: {
          source: "audit-agent",
          confidence: 0.95,
          tags: ["performance", "optimization"],
        },
      });

      const payload = { open_findings: [mockFinding] };
      const result = parseOpenFindingsPayload(JSON.stringify(payload));
      expect(result.findings[0].metadata).toEqual(mockFinding.metadata);
    });
  });
});
