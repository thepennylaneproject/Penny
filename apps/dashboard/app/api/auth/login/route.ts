import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { createAuthSessionToken } from "@/lib/auth-session";
import {
  DASHBOARD_MISCONFIGURED_MESSAGE,
  getDashboardApiSecret,
  isOpenApiAllowedWithoutSecret,
} from "@/lib/dashboard-secret";

/** Normalize for comparison: trim and strip newlines (env / paste often have trailing newline). */
function normalizeSecret(s: string): string {
  return s.trim().replace(/\r?\n/g, "").trim();
}

export async function POST(request: Request) {
  const secret = getDashboardApiSecret();
  if (!secret) {
    if (!isOpenApiAllowedWithoutSecret()) {
      return NextResponse.json(
        { error: "misconfigured", message: DASHBOARD_MISCONFIGURED_MESSAGE },
        { status: 503 }
      );
    }
    return NextResponse.json({
      ok: true,
      auth_required: false,
      message: "No DASHBOARD_API_SECRET or ORCHESTRATION_ENQUEUE_SECRET; APIs are open.",
    });
  }

  const body = await request.json().catch(() => ({}));
  const provided =
    typeof body.secret === "string" ? normalizeSecret(body.secret) : "";
  const expected = normalizeSecret(secret);
  if (provided !== expected) {
    return NextResponse.json(
      {
        error: "Invalid secret",
        hint: "Use the same value as ORCHESTRATION_ENQUEUE_SECRET or DASHBOARD_API_SECRET in dashboard/.env.local (local) or Netlify env (production). Check for extra spaces or newlines.",
      },
      { status: 401 }
    );
  }

  const token = createAuthSessionToken(secret);
  const res = NextResponse.json({ ok: true, auth_required: true });
  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
