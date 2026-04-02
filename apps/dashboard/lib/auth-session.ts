import { createHmac } from "crypto";
import { AUTH_COOKIE_NAME } from "./auth-constants";

export { AUTH_COOKIE_NAME };

/** HMAC-SHA256(secret, `penny|${exp}`) as hex — verified in middleware (Web Crypto). */
export function createAuthSessionToken(
  secret: string,
  ttlMs = 7 * 24 * 3600 * 1000
): string {
  const exp = Date.now() + ttlMs;
  const sig = createHmac("sha256", secret)
    .update(`penny|${exp}`)
    .digest("hex");
  return `${exp}.${sig}`;
}
