import { describe, it, expect } from "vitest";
import {
  penny_TO_LINEAR_STATUS,
  LINEAR_TO_penny_STATUS,
} from "@/lib/linear";
import type { FindingStatus } from "@/lib/types";

describe("Linear Status Mapping", () => {
  describe("penny_TO_LINEAR_STATUS", () => {
    it("should map all penny statuses to Linear statuses", () => {
      const pennyStatuses: FindingStatus[] = [
        "open",
        "accepted",
        "in_progress",
        "fixed_pending_verify",
        "fixed_verified",
        "wont_fix",
        "deferred",
        "duplicate",
        "converted_to_enhancement",
      ];

      for (const status of pennyStatuses) {
        expect(penny_TO_LINEAR_STATUS[status]).toBeDefined();
        expect(typeof penny_TO_LINEAR_STATUS[status]).toBe("string");
      }
    });

    it("should map open to Backlog", () => {
      expect(penny_TO_LINEAR_STATUS["open"]).toBe("Backlog");
    });

    it("should map accepted to Todo", () => {
      expect(penny_TO_LINEAR_STATUS["accepted"]).toBe("Todo");
    });

    it("should map in_progress to In Progress", () => {
      expect(penny_TO_LINEAR_STATUS["in_progress"]).toBe("In Progress");
    });

    it("should map fixed_verified to Done", () => {
      expect(penny_TO_LINEAR_STATUS["fixed_verified"]).toBe("Done");
    });

    it("should map wont_fix to Cancelled", () => {
      expect(penny_TO_LINEAR_STATUS["wont_fix"]).toBe("Cancelled");
    });

    it("should map duplicate to Cancelled", () => {
      expect(penny_TO_LINEAR_STATUS["duplicate"]).toBe("Cancelled");
    });

    it("should map deferred to Backlog", () => {
      expect(penny_TO_LINEAR_STATUS["deferred"]).toBe("Backlog");
    });

    it("should map fixed_pending_verify to In Progress", () => {
      expect(penny_TO_LINEAR_STATUS["fixed_pending_verify"]).toBe(
        "In Progress"
      );
    });

    it("should map converted_to_enhancement to Backlog", () => {
      expect(penny_TO_LINEAR_STATUS["converted_to_enhancement"]).toBe(
        "Backlog"
      );
    });
  });

  describe("LINEAR_TO_penny_STATUS", () => {
    it("should map all primary Linear statuses to penny statuses", () => {
      const linearStatuses = [
        "Backlog",
        "Triage",
        "Todo",
        "In Progress",
        "In Review",
        "Done",
        "Cancelled",
      ];

      for (const status of linearStatuses) {
        expect(LINEAR_TO_penny_STATUS[status]).toBeDefined();
        expect(typeof LINEAR_TO_penny_STATUS[status]).toBe("string");
      }
    });

    it("should map Backlog to open", () => {
      expect(LINEAR_TO_penny_STATUS["Backlog"]).toBe("open");
    });

    it("should map Triage to open", () => {
      expect(LINEAR_TO_penny_STATUS["Triage"]).toBe("open");
    });

    it("should map Todo to accepted", () => {
      expect(LINEAR_TO_penny_STATUS["Todo"]).toBe("accepted");
    });

    it("should map In Progress to in_progress", () => {
      expect(LINEAR_TO_penny_STATUS["In Progress"]).toBe("in_progress");
    });

    it("should map In Review to fixed_pending_verify", () => {
      expect(LINEAR_TO_penny_STATUS["In Review"]).toBe("fixed_pending_verify");
    });

    it("should map Done to fixed_verified", () => {
      expect(LINEAR_TO_penny_STATUS["Done"]).toBe("fixed_verified");
    });

    it("should map Cancelled to wont_fix", () => {
      expect(LINEAR_TO_penny_STATUS["Cancelled"]).toBe("wont_fix");
    });
  });

  describe("Round-trip consistency", () => {
    it("should handle round-trip conversions safely", () => {
      const testCases: Array<[FindingStatus, string]> = [
        ["open", "Backlog"],
        ["accepted", "Todo"],
        ["in_progress", "In Progress"],
        ["fixed_verified", "Done"],
        ["wont_fix", "Cancelled"],
      ];

      for (const [pennyStatus, expectedLinearStatus] of testCases) {
        // penny -> Linear
        const linearStatus = penny_TO_LINEAR_STATUS[pennyStatus];
        expect(linearStatus).toBe(expectedLinearStatus);

        // Linear -> penny
        const backTopenny = LINEAR_TO_penny_STATUS[linearStatus];
        expect(backTopenny).toBe(pennyStatus);
      }
    });

    it("should handle Triage -> open (extra Linear status)", () => {
      // Triage is a Linear status that should map to open
      expect(LINEAR_TO_penny_STATUS["Triage"]).toBe("open");

      // open should map to Backlog (the canonical Linear status)
      expect(penny_TO_LINEAR_STATUS["open"]).toBe("Backlog");

      // So Triage -> open -> Backlog (not back to Triage, but that's expected)
    });
  });

  describe("edge cases", () => {
    it("should handle case sensitivity", () => {
      // Linear statuses are case-sensitive
      expect(LINEAR_TO_penny_STATUS["backlog"]).toBeUndefined();
      expect(LINEAR_TO_penny_STATUS["Backlog"]).toBeDefined();
    });

    it("should not map invalid statuses", () => {
      expect(LINEAR_TO_penny_STATUS["InvalidStatus"]).toBeUndefined();
    });
  });
});
