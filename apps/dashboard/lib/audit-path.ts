import path from "path";

/**
 * Repo-root `audits/` resolved from this file's location (no `process.cwd()` by default)
 * so Turbopack output tracing stays scoped. Overrides use `penny_AUDIT_DIR`.
 */
const DEFAULT_AUDIT_DIR = path.join(__dirname, "..", "..", "..", "audits");

export function resolveAuditDir(): string {
  const raw = process.env.penny_AUDIT_DIR?.trim();
  if (!raw) return DEFAULT_AUDIT_DIR;
  return path.isAbsolute(raw)
    ? raw
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), raw);
}
