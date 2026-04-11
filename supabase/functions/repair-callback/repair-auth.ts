/**
 * Bearer auth for repair-callback: misconfiguration detection + timing-safe secret compare.
 */

const textEncoder = new TextEncoder();

/** Constant-time comparison of two strings (UTF-8). Returns false if lengths differ. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const ba = textEncoder.encode(a);
  const bb = textEncoder.encode(b);
  if (ba.length !== bb.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < ba.length; i++) {
    mismatch |= ba[i] ^ bb[i];
  }
  return mismatch === 0;
}

export type RepairAuthResult =
  | { ok: true }
  | { ok: false; status: 401; error: string }
  | { ok: false; status: 503; error: string };

/**
 * Validates Authorization: Bearer against REPAIR_SERVICE_SECRET.
 * - Missing/blank secret → 503 (misconfiguration)
 * - Missing/malformed header or wrong token → 401
 */
export function validateRepairServiceBearer(
  authHeader: string | null,
  secretFromEnv: string | undefined,
): RepairAuthResult {
  const secret = secretFromEnv?.trim() ?? "";
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "Service misconfigured",
    };
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const token = authHeader.slice(7);
  if (!timingSafeEqualString(token, secret)) {
    return { ok: false, status: 401, error: "Invalid token" };
  }

  return { ok: true };
}
