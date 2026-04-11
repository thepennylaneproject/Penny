import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/routing-config", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/routing-config")>();
  return {
    ...mod,
    readFileRoutingConfig: vi.fn(),
  };
});

import { readFileRoutingConfig } from "@/lib/routing-config";

describe("GET /api/engine/routing", () => {
  beforeEach(() => {
    vi.mocked(readFileRoutingConfig).mockReset();
  });

  it("returns 503 when readFileRoutingConfig throws", async () => {
    vi.mocked(readFileRoutingConfig).mockImplementation(() => {
      throw new Error("EACCES");
    });
    const res = await GET();
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string; code: string };
    expect(json.code).toBe("routing_config_unavailable");
    expect(json.error).toBeDefined();
  });

  it("returns 200 when read succeeds with null", async () => {
    vi.mocked(readFileRoutingConfig).mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { strategy: string };
    expect(json).toHaveProperty("strategy");
  });
});
