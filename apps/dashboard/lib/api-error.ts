/**
 * Safe message for 500 responses: generic in production to avoid leaking
 * DB/path details; full message in development for debugging.
 */
export function apiErrorMessage(e: unknown): string {
  if (process.env.NODE_ENV === "production") {
    return "Internal server error";
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Regex that defines valid project names: alphanumeric characters plus
 * underscores and hyphens.  Reused across multiple bulk-operation routes.
 */
export const PROJECT_NAME_REGEX = /^[a-zA-Z0-9_\-]+$/;

/**
 * Returns true when *name* is a valid project name.
 */
export function isValidProjectName(name: string): boolean {
  return PROJECT_NAME_REGEX.test(name);
}

/**
 * Safely parse the JSON body of a Request.
 * Returns an empty object instead of throwing when the body is absent or
 * malformed — the same pattern used across bulk-operation API routes.
 */
export async function parseJsonBody<T extends object = Record<string, unknown>>(
  request: Request
): Promise<T> {
  return (await request.json().catch(() => ({}))) as T;
}
