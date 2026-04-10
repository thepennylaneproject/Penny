import { readEnqueueSecret } from "@/lib/enqueue-secret-store";
import { getSupabaseBrowserClient } from "@/lib/supabase";

function mergeEnqueueSecret(headers: Headers): void {
  if (typeof window === "undefined") return;
  const secret = readEnqueueSecret();
  if (secret && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${secret}`);
  }
}

async function mergeSupabaseToken(headers: Headers): Promise<void> {
  if (typeof window === "undefined" || headers.has("Authorization")) return;
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn("Failed to read Supabase session for API auth:", error.message);
      return;
    }
    const token = data.session?.access_token?.trim();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch (error) {
    console.warn("Failed to attach Supabase session token:", error);
  }
}

/**
 * Default browser fetch for `/api/*`: session cookie only.
 * Use for project CRUD, findings, import, login, engine queue from an authenticated session.
 */
export function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  return mergeSupabaseToken(headers).then(() =>
    fetch(input, {
      ...init,
      headers,
      credentials: "include",
    })
  );
}

/**
 * Same as {@link apiFetch} but also sends `Authorization: Bearer <secret>` when the user
 * has set an enqueue/orchestration secret in this tab. The secret is read from the in-memory
 * store (`readEnqueueSecret`), not from Web Storage, except a one-time legacy migration
 * that clears any previous sessionStorage copy (f-8603ee3b).
 */
export function apiFetchWithEnqueueSecret(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  mergeEnqueueSecret(headers);
  return mergeSupabaseToken(headers).then(() =>
    fetch(input, {
      ...init,
      headers,
      credentials: "include",
    })
  );
}
