/** Shared secret verification for ingest-audit (Bearer or x-penny-api-secret). */

export function timingSafeEqualUtf8(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  return crypto.subtle.timingSafeEqual(ba, bb);
}

export function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const t = auth.slice(7).trim();
  return t.length > 0 ? t : null;
}

export type VerifyIngestResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

/**
 * Validates caller against AUDIT_INGEST_SECRET.
 * Use Bearer token, or x-penny-api-secret when Authorization cannot be used.
 */
export function verifyAuditIngestRequest(
  req: Request,
  expectedSecret: string | undefined | null,
): VerifyIngestResult {
  const secret = expectedSecret?.trim() ?? "";
  if (secret.length === 0) {
    return {
      ok: false,
      status: 500,
      message: "AUDIT_INGEST_SECRET is not configured",
    };
  }
  const bearer = getBearerToken(req);
  const headerVal = req.headers.get("x-penny-api-secret")?.trim() ?? "";
  const token = bearer ?? (headerVal.length > 0 ? headerVal : null);
  if (!token) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  if (!timingSafeEqualUtf8(token, secret)) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  return { ok: true };
}
