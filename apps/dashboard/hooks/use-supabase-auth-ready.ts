"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

/** If Supabase never responds (offline, blocker, bad network), still unblock the shell. */
const SESSION_WAIT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * Waits until Supabase has finished handling the current URL (PKCE `?code=`, hash tokens)
 * before callers run authenticated `/api/*` fetches. Avoids a race where the first request
 * runs without a Bearer token and returns 401 while the session is still being established.
 */
export function useSupabaseAuthReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setReady(true);
      return;
    }

    let cancelled = false;
    const sb = client;

    async function init() {
      try {
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          if (url.searchParams.has("code")) {
            const { error } = await withTimeout(
              sb.auth.exchangeCodeForSession(window.location.href),
              SESSION_WAIT_MS,
              "exchangeCodeForSession"
            );
            if (error) {
              console.warn("exchangeCodeForSession:", error.message);
            } else {
              const path = `${url.pathname}${url.hash}`;
              window.history.replaceState({}, "", path);
            }
          }
        }
        await withTimeout(sb.auth.getSession(), SESSION_WAIT_MS, "getSession");
      } catch (e) {
        console.warn("Supabase auth URL handling:", e);
      }
      if (!cancelled) setReady(true);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
