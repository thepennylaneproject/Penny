import { createSupabaseBrowserClient } from "@/lib/supabase";

export interface LaneAuditFinding {
  id: string;
  type: string;
  severity: string;
  file: string;
  message: string;
}

export interface LaneAuditRequest {
  mode: "audit";
  project_id: string;
  project_name?: string;
  repository: string;
  prompt?: string;
  scope_paths?: string[];
  metadata?: Record<string, unknown>;
}

export interface LaneAuditResponse {
  run_id: string;
  status: "queued" | "running" | "completed" | "failed";
  summary: string;
  findings: LaneAuditFinding[];
}

export interface LanePatchFinding {
  id: string;
  type: string;
  severity: string;
  file: string;
  message: string;
}

export interface LanePatchRequest {
  mode: "patch";
  project_id: string;
  repository: string;
  prompt?: string;
  finding: LanePatchFinding;
  metadata?: Record<string, unknown>;
}

export interface LanePatchResponse {
  patch_id: string;
  status: "queued" | "running" | "completed" | "failed";
  file: string;
  diff: string;
  confidence: number;
}

interface ApiEnvelope<T> {
  status: string;
  data: T;
}

function resolveLaneBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_LANE_API_BASE_URL ??
    process.env.LANE_API_BASE_URL ??
    ""
  ).trim().replace(/\/+$/, "");
}

async function getLaneAccessToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase client is not configured for Lane requests.");
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }
  const token = data.session?.access_token?.trim();
  if (!token) {
    throw new Error("Sign in with Supabase before using Lane actions.");
  }
  return token;
}

async function laneFetch<T>(path: string, init: RequestInit): Promise<T> {
  const baseUrl = resolveLaneBaseUrl();
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_LANE_API_BASE_URL is not configured.");
  }

  const token = await getLaneAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });

  const body = (await response.json().catch(() => ({}))) as
    | ApiEnvelope<T>
    | { detail?: string; error?: string };
  const errorBody = body as { detail?: string; error?: string };

  if (!response.ok) {
    const message =
      typeof errorBody.detail === "string"
        ? errorBody.detail
        : typeof errorBody.error === "string"
          ? errorBody.error
          : `Lane request failed (${response.status})`;
    throw new Error(message);
  }

  if (!("data" in body)) {
    throw new Error("Lane response was missing data.");
  }

  return body.data;
}

export async function runLaneAudit(
  payload: LaneAuditRequest
): Promise<LaneAuditResponse> {
  return laneFetch<LaneAuditResponse>("/audit", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function generateLanePatch(
  payload: LanePatchRequest
): Promise<LanePatchResponse> {
  return laneFetch<LanePatchResponse>("/generate-patch", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
