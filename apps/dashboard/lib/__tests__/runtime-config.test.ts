import { describe, expect, it } from "vitest";
import { resolveDashboardRuntimeConfig } from "../runtime-config.server";

describe("resolveDashboardRuntimeConfig", () => {
  it("prefers NEXT_PUBLIC lane URL", () => {
    const config = resolveDashboardRuntimeConfig({
        NEXT_PUBLIC_LANE_API_BASE_URL: "https://lane-public.example.com/",
        LANE_API_BASE_URL: "https://lane-server.example.com/",
      });
    expect(config.laneBaseUrl).toBe("https://lane-public.example.com");
    expect(config.laneServerConfigured).toBe(true);
  });

  it("does not expose server-only lane URL to the browser config", () => {
    const config = resolveDashboardRuntimeConfig({
        LANE_API_BASE_URL: "https://lane-server.example.com///",
      });
    expect(config.laneBaseUrl).toBeNull();
    expect(config.laneServerConfigured).toBe(true);
  });

  it("returns null when no lane URL exists", () => {
    const config = resolveDashboardRuntimeConfig({});
    expect(config.laneBaseUrl).toBeNull();
    expect(config.laneServerConfigured).toBe(false);
  });
});
