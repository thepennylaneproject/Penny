import { describe, expect, it } from "vitest";
import {
  isRepairProofReviewable,
  parseRepairProof,
  repairLedgerCaption,
} from "@/lib/repair-proof";
import type { RepairJob, RepairProof } from "@/lib/types";

const validProof: RepairProof = {
  source: "repair_engine",
  generated_at: "2026-03-25T00:00:00.000Z",
  selected_node_id: "node-1",
  artifacts: {
    summary_path: "audits/repair_runs/run-1/summary.json",
    tree_path: "audits/repair_runs/run-1/tree.json",
  },
  evaluation: {
    candidate_passed: true,
    apply_ok: true,
    compile_ok: true,
    lint_ok: true,
    tests_ok: true,
    warnings: 0,
    exit_code: 0,
    reasons: ["tests passed"],
  },
  verification: {
    status: "passed",
    summary: "Evaluator checks passed; review artifacts before final verification.",
    commands_declared: ["npm test"],
  },
};

function repairJob(overrides: Partial<RepairJob> = {}): RepairJob {
  return {
    finding_id: "finding-1",
    project_name: "Codra",
    queued_at: "2026-03-25T00:00:00.000Z",
    status: "completed",
    patch_applied: true,
    applied_files: ["src/app.ts"],
    repair_proof: validProof,
    ...overrides,
  };
}

describe("repair proof contract", () => {
  it("accepts a complete proof payload", () => {
    expect(parseRepairProof(validProof)).toEqual(validProof);
  });

  it("rejects malformed proof payloads", () => {
    expect(
      parseRepairProof({
        ...validProof,
        verification: { ...validProof.verification, status: "maybe" },
      })
    ).toBeNull();
  });

  it("requires proof, applied files, and passing evaluation to be reviewable", () => {
    expect(isRepairProofReviewable(validProof, ["src/app.ts"])).toBe(true);
    expect(isRepairProofReviewable(validProof, [])).toBe(false);
    expect(
      isRepairProofReviewable(
        {
          ...validProof,
          evaluation: { ...validProof.evaluation, candidate_passed: false },
        },
        ["src/app.ts"]
      )
    ).toBe(false);
  });

  it("describes reviewable applied patches clearly", () => {
    expect(repairLedgerCaption(repairJob(), false)).toContain("reviewable proof");
  });

  it("warns when a patch was reported without reviewable proof", () => {
    expect(
      repairLedgerCaption(
        repairJob({ repair_proof: undefined, reported_status: "applied" }),
        false
      )
    ).toContain("proof is missing");
  });

  it("explains stale repair recovery as retryable timeout handling", () => {
    expect(
      repairLedgerCaption(
        repairJob({
          status: "failed",
          patch_applied: undefined,
          error:
            "Recovered stale running repair job after 30m without completion. Queue the repair again to retry.",
        }),
        false
      )
    ).toContain("timed out");
  });
});
