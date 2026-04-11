import { afterEach, describe, expect, it, vi } from "vitest";
import { validateDashboardEnv } from "./env";

describe("validateDashboardEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not throw when SKIP_ENV_VALIDATION is set in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SKIP_ENV_VALIDATION", "1");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("DASHBOARD_API_SECRET", "");
    vi.stubEnv("SUPABASE_JWT_SECRET", "");
    expect(() => validateDashboardEnv()).not.toThrow();
  });

  it("skips validation during next production build phase", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("DASHBOARD_API_SECRET", "");
    expect(() => validateDashboardEnv()).not.toThrow();
  });

  it("throws a deterministic error when production API auth is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("penny_ALLOW_OPEN_API", "");
    vi.stubEnv("DASHBOARD_API_SECRET", "");
    vi.stubEnv("ORCHESTRATION_ENQUEUE_SECRET", "");
    vi.stubEnv("SUPABASE_JWT_SECRET", "");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
    expect(() => validateDashboardEnv()).toThrow(/Missing API auth in production/);
  });

  it("allows production when penny_ALLOW_OPEN_API is set without API secrets", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("penny_ALLOW_OPEN_API", "1");
    vi.stubEnv("DASHBOARD_API_SECRET", "");
    vi.stubEnv("ORCHESTRATION_ENQUEUE_SECRET", "");
    vi.stubEnv("SUPABASE_JWT_SECRET", "");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
    expect(() => validateDashboardEnv()).not.toThrow();
  });

  it("throws a deterministic error when DATABASE_URL is missing in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_API_SECRET", "secret");
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("penny_DATABASE_URL", "");
    expect(() => validateDashboardEnv()).toThrow(
      /DATABASE_URL \(or penny_DATABASE_URL\) is required in production/
    );
  });
});
