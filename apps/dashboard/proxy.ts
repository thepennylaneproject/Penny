import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import {
  DASHBOARD_MISCONFIGURED_MESSAGE,
  isOpenApiAllowedWithoutSecret,
} from "@/lib/dashboard-secret";

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return atob(padded);
  } catch {
    return null;
  }
}

async function verifySupabaseJwt(
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

async function verifySessionCookie(
  token: string,
  secret: string
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [exp, hexSig] = parts;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now()) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`penny|${exp}`)
  );
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === hexSig;
}

export async function proxy(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (pathname === "/api/health" && request.method === "GET") {
    return NextResponse.next();
  }

  const raw =
    process.env.DASHBOARD_API_SECRET?.trim() ||
    process.env.ORCHESTRATION_ENQUEUE_SECRET?.trim();
  const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET?.trim() || "";
  const supabaseAudience = process.env.SUPABASE_JWT_AUDIENCE?.trim() || "authenticated";

  if (!raw && !supabaseJwtSecret) {
    if (!isOpenApiAllowedWithoutSecret()) {
      return NextResponse.json(
        { error: "misconfigured", message: DASHBOARD_MISCONFIGURED_MESSAGE },
        { status: 503 }
      );
    }
    // penny_ALLOW_OPEN_API is set — all APIs are unauthenticated.
    // This is only safe for local development. Log a loud warning so
    // it is visible in Railway/Netlify function logs if accidentally set in production.
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[penny] SECURITY WARNING: penny_ALLOW_OPEN_API is set in a production environment. " +
        "All /api/* routes are unauthenticated. Set DASHBOARD_API_SECRET or SUPABASE_JWT_SECRET to secure the dashboard."
      );
    }
    return NextResponse.next();
  }

  if (pathname === "/api/auth/login" && request.method === "POST") {
    return NextResponse.next();
  }

  const norm = (s: string) => s.trim().replace(/\r?\n/g, "").trim();
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (raw && norm(token) === norm(raw)) {
      return NextResponse.next();
    }
    if (supabaseJwtSecret && (await verifySupabaseJwt(token, supabaseJwtSecret, supabaseAudience))) {
      return NextResponse.next();
    }
  }
  const headerVal = request.headers.get("x-penny-api-secret");
  if (raw && headerVal != null && norm(headerVal) === norm(raw)) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (raw && cookie && (await verifySessionCookie(cookie, raw))) {
    return NextResponse.next();
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: "/api/:path*",
};
