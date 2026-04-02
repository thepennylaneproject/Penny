import { penny_ENQUEUE_SECRET_STORAGE_KEY } from "@/lib/auth-constants";

function mergeEnqueueSecretFromStorage(headers: Headers): void {
  if (typeof window === "undefined") return;
  try {
    const secret = sessionStorage
      .getItem(penny_ENQUEUE_SECRET_STORAGE_KEY)
      ?.trim();
    if (secret && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${secret}`);
    }
  } catch {
    /* private mode / disabled storage */
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
  return fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });
}

/**
 * Same as {@link apiFetch} but also sends `Authorization: Bearer <secret>` when the user
 * has stored an enqueue/orchestration secret in session storage. Use for orchestration
 * and job endpoints that may require the shared secret alongside or instead of cookie auth.
 */
export function apiFetchWithEnqueueSecret(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  mergeEnqueueSecretFromStorage(headers);
  return fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });
}
