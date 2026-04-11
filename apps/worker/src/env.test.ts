import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateWorkerEnv } from "./env.js";

describe("validateWorkerEnv", () => {
  let backup: NodeJS.ProcessEnv;

  beforeEach(() => {
    backup = { ...process.env };
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      delete process.env[k];
    }
    Object.assign(process.env, backup);
  });

  it("does not throw when SKIP_ENV_VALIDATION is set", () => {
    process.env.SKIP_ENV_VALIDATION = "true";
    delete process.env.DATABASE_URL;
    delete process.env.SUPABASE_URL;
    expect(() => validateWorkerEnv()).not.toThrow();
  });

  it("does not throw when DATABASE_URL is set", () => {
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
    expect(() => validateWorkerEnv()).not.toThrow();
  });

  it("does not throw when Supabase URL + service role are set", () => {
    delete process.env.DATABASE_URL;
    process.env.SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "key";
    expect(() => validateWorkerEnv()).not.toThrow();
  });

  it("throws a deterministic error when no database configuration is present", () => {
    delete process.env.SKIP_ENV_VALIDATION;
    delete process.env.DATABASE_URL;
    delete process.env.penny_DATABASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => validateWorkerEnv()).toThrow(/Database connection required/);
  });
});
