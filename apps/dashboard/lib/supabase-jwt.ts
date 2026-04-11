/**
 * Verify Supabase-issued JWTs (HS256) using SUPABASE_JWT_SECRET.
 * Used by proxy auth and tenant-scoped Supabase clients.
 */

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return atob(padded);
  } catch {
    return null;
  }
}

/**
 * Returns true if the token is a valid, non-expired Supabase JWT for the given audience.
 */
export async function verifySupabaseAccessToken(
  token: string,
  secret: string,
  audience: string
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [headerPart, payloadPart, signaturePart] = parts;
  const payloadRaw = decodeBase64Url(payloadPart);
  if (!payloadRaw) return false;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadRaw) as Record<string, unknown>;
  } catch {
    return false;
  }

  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  if (typeof payload.sub !== "string" || payload.sub.length === 0) return false;
  if (audience) {
    const aud = payload.aud;
    const audienceOk =
      typeof aud === "string"
        ? aud === audience
        : Array.isArray(aud)
          ? aud.includes(audience)
          : false;
    if (!audienceOk) return false;
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${headerPart}.${payloadPart}`)
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return expected === signaturePart;
}
