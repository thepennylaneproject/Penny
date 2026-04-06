/**
 * Lane API client for the Penny worker.
 *
 * Lane is the self-hosted coding agent that runs audit passes and generates
 * repair patches. This module handles Supabase-backed auth and wraps Lane's
 * /audit and /generate-patch endpoints for server-side use.
 */

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

interface SupabaseTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let _cachedToken: CachedToken | null = null;

/** True if LANE_API_BASE_URL, LANE_WORKER_EMAIL, and LANE_SERVICE_TOKEN are all set. */
export function isLaneConfigured(): boolean {
  return (
    !!process.env.LANE_API_BASE_URL?.trim() &&
    !!process.env.LANE_WORKER_EMAIL?.trim() &&
    !!process.env.LANE_SERVICE_TOKEN?.trim()
  );
}

function laneBaseUrl(): string {
  return (process.env.LANE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
}

/** Sign in to the shared Supabase instance and cache the resulting JWT. */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (_cachedToken && _cachedToken.expiresAt - TOKEN_REFRESH_BUFFER_MS > now) {
    return _cachedToken.token;
  }

  const supabaseUrl = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const email = (process.env.LANE_WORKER_EMAIL ?? "").trim();
  const password = (process.env.LANE_SERVICE_TOKEN ?? "").trim();

  if (!supabaseUrl || !email || !password) {
    throw new Error(
      "[lane-client] Missing SUPABASE_URL, LANE_WORKER_EMAIL, or LANE_SERVICE_TOKEN"
    );
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(anonKey ? { apikey: anonKey } : {}),
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[lane-client] Supabase sign-in failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as SupabaseTokenResponse;
  _cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return _cachedToken.token;
}

/** POST a JSON request to Lane and return the `data` field of the response envelope. */
async function lanePost<T>(path: string, body: unknown): Promise<T> {
  const token = await getAccessToken();
  const url = `${laneBaseUrl()}${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const envelope = (await res.json().catch(() => ({}))) as
    | { status: string; data: T }
    | { detail?: string; error?: string };

  if (!res.ok) {
    const msg =
      (envelope as { detail?: string }).detail ??
      (envelope as { error?: string }).error ??
      `Lane ${path} failed (${res.status})`;
    throw new Error(`[lane-client] ${msg}`);
  }

  if (!("data" in envelope)) {
    throw new Error(`[lane-client] Lane ${path} returned no data`);
  }

  return (envelope as { data: T }).data;
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface LaneAuditFinding {
  id: string;
  type: string;
  severity: string;
  file: string;
  message: string;
}

export interface LaneAuditResponse {
  run_id: string;
  status: "queued" | "running" | "completed" | "failed";
  summary: string;
  findings: LaneAuditFinding[];
}

export interface LaneAuditRequest {
  mode?: "audit";
  project_id: string;
  repository: string;
  prompt?: string;
  project_name?: string;
  scope_paths?: string[];
  metadata?: Record<string, unknown>;
}

export async function laneAudit(req: LaneAuditRequest): Promise<LaneAuditResponse> {
  return lanePost<LaneAuditResponse>("/audit", { mode: "audit", ...req });
}

// ─── Patch ────────────────────────────────────────────────────────────────────

export interface LanePatchFinding {
  id: string;
  type?: string;
  severity?: string;
  file?: string;
  message: string;
}

export interface LanePatchResponse {
  patch_id: string;
  status: "queued" | "running" | "completed" | "failed";
  file: string;
  diff: string;
  confidence: number;
}

export interface LanePatchRequest {
  mode?: "patch";
  project_id: string;
  repository: string;
  finding: LanePatchFinding;
  prompt?: string;
  metadata?: Record<string, unknown>;
}

export async function lanePatch(req: LanePatchRequest): Promise<LanePatchResponse> {
  return lanePost<LanePatchResponse>("/generate-patch", { mode: "patch", ...req });
}
