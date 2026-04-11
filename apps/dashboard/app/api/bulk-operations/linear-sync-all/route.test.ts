import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.fn();

vi.mock("@/lib/postgres", () => ({
  createPostgresPool: () => ({
    query: queryMock,
  }),
}));

vi.mock("@/lib/durable-state", () => ({
  recordDurableEventBestEffort: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "./route";

describe("POST /api/bulk-operations/linear-sync-all", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("penny_projects")) {
        return [
          {
            name: "Alpha",
            project_json: {
              findings: [{ finding_id: "f-1" }, { finding_id: "f-2" }],
            },
          },
          {
            name: "Beta",
            project_json: { findings: [{ finding_id: "f-3" }] },
          },
        ];
      }
      return [];
    });
  });

  it("uses a single UNNEST batch upsert for all findings, not one INSERT per finding", async () => {
    const req = new Request("http://localhost/api/bulk-operations/linear-sync-all", {
      method: "POST",
      body: JSON.stringify({ team_key: "ENG" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.ok).toBe(true);

    const unnestCalls = queryMock.mock.calls.filter(([sql]) =>
      String(sql).includes("UNNEST")
    );
    expect(unnestCalls.length).toBe(1);
    expect(queryMock.mock.calls.length).toBe(2);

    const [, params] = unnestCalls[0] as [string, unknown[]];
    expect(params).toEqual([
      "ENG",
      ["Alpha", "Alpha", "Beta"],
      ["f-1", "f-2", "f-3"],
    ]);
  });
});
