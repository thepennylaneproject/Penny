import { describe, expect, it } from "vitest";
import {
  findingImportFingerprint,
  mergeImportedFindings,
} from "../import-summary";
import type { Finding } from "../types";

function base(
  id: string,
  title: string,
  status: Finding["status"] = "open"
): Finding {
  return {
    finding_id: id,
    title,
    description: "",
    type: "bug",
    severity: "minor",
    priority: "P2",
    status,
  };
}

describe("import-summary", () => {
  it("mergeImportedFindings counts added", () => {
    const existing = [base("a", "A")];
    const imported = [base("a", "A"), base("b", "B")];
    const r = mergeImportedFindings(existing, imported);
    expect(r.added).toBe(1);
    expect(r.updated).toBe(0);
    expect(r.unchanged).toBe(1);
    expect(r.findings).toHaveLength(2);
  });

  it("mergeImportedFindings counts updated when fingerprint changes", () => {
    const existing = [base("a", "Old")];
    const imported = [base("a", "New")];
    const r = mergeImportedFindings(existing, imported);
    expect(r.added).toBe(0);
    expect(r.updated).toBe(1);
    expect(r.unchanged).toBe(0);
    expect(r.findings[0].title).toBe("New");
  });

  it("findingImportFingerprint ignores unrelated fields", () => {
    const a: Finding = {
      ...base("x", "T"),
      proof_hooks: [{ hook_type: "file", file: "a.ts" }],
    };
    const b: Finding = { ...a, proof_hooks: [] };
    expect(findingImportFingerprint(a)).toBe(findingImportFingerprint(b));
  });

  it("skips imported rows without finding_id", () => {
    const existing: Finding[] = [];
    const imported: Finding[] = [
      base("ok", "OK"),
      { ...base("x", "Bad"), finding_id: "" },
    ];
    const r = mergeImportedFindings(existing, imported);
    expect(r.findings).toHaveLength(1);
    expect(r.added).toBe(1);
  });
});
