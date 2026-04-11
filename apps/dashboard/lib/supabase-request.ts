import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseServiceRoleClient,
  createSupabaseUserClient,
} from "@/lib/supabase";
import { verifySupabaseAccessToken } from "@/lib/supabase-jwt";

function normalizeSecret(s: string): string {
  return s.trim().replace(/\r?\n/g, "").trim();
}

/**
 * Resolves a Supabase client for routes that must enforce RLS via the end-user JWT.
 *
 * - Valid `Authorization: Bearer <Supabase access_token>` → user-scoped client (RLS).
 * - Production without a verifiable user token → 401 / 503.
 * - Non-production: service-role fallback with console warning (local DX when JWT is unset).
 */
export async function requireTenantSupabaseClient(
  request: Request
): Promise<
  { ok: true; client: SupabaseClient } | { ok: false; response: NextResponse }
> {
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  const raw =
    process.env.DASHBOARD_API_SECRET?.trim() ||
    process.env.ORCHESTRATION_ENQUEUE_SECRET?.trim();

  if (bearer && raw && normalizeSecret(bearer) === normalizeSecret(raw)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "forbidden",
          message:
            "API secret authentication cannot access tenant-scoped data. Send Authorization: Bearer <Supabase access_token> from a signed-in user session.",
        },
        { status: 403 }
      ),
    };
  }

  const jwtSecret = process.env.SUPABASE_JWT_SECRET?.trim() || "";
  const audience =
    process.env.SUPABASE_JWT_AUDIENCE?.trim() || "authenticated";

  if (bearer && jwtSecret) {
    const valid = await verifySupabaseAccessToken(bearer, jwtSecret, audience);
    if (valid) {
      const client = createSupabaseUserClient(bearer);
      if (!client) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: "Supabase not configured" },
            { status: 503 }
          ),
        };
      }
      return { ok: true, client };
    }
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Unauthorized",
          message: "Invalid or expired Supabase token.",
        },
        { status: 401 }
      ),
    };
  }

  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const client = createSupabaseServiceRoleClient();
    if (client) {
      if (bearer && !jwtSecret) {
        console.warn(
          "[penny] Tenant API: SUPABASE_JWT_SECRET unset; using service role (dev only)."
        );
      } else if (!bearer) {
        console.warn(
          "[penny] Tenant API: no Bearer token; using service role (dev only)."
        );
      }
      return { ok: true, client };
    }
  }

  if (!bearer) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Unauthorized",
          message:
            "Tenant data requires Authorization: Bearer <Supabase access_token>. Sign in via Supabase in the dashboard.",
        },
        { status: 401 }
      ),
    };
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: "misconfigured",
        message:
          "SUPABASE_JWT_SECRET is required in production to verify Supabase access tokens for tenant routes.",
      },
      { status: 503 }
    ),
  };
}
