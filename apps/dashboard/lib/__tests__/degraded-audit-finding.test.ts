import { describe, expect, it } from "vitest";
import { isDegradedAuditPlaceholderFinding } from "@/lib/degraded-audit-finding";

describe("isDegradedAuditPlaceholderFinding", () => {
  it("matches raw Lane placeholder findings", () => {
    expect(
      isDegradedAuditPlaceholderFinding({
        message: "Lane could not complete a full model-backed audit, but this project still needs a focused review for Codra.",
      })
    ).toBe(true);
  });

  it("matches Penny-shaped imported findings", () => {
    expect(
      isDegradedAuditPlaceholderFinding({
        title: "Lane could not complete a full model-backed audit, but this project still needs a focused review for Codra.",
        description: "Lane could not complete a full model-backed audit, but this project still needs a focused review for Codra.",
      })
    ).toBe(true);
  });

  it("ignores normal findings", () => {
    expect(
      isDegradedAuditPlaceholderFinding({
        message: "Submit button is disabled after successful form validation.",
      })
    ).toBe(false);
  });
});

