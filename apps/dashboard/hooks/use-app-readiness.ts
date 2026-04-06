"use client";

/**
 * Consolidated app readiness state.
 *
 * Instead of scattered booleans (needsAuth, hostMisconfigured, projectsError),
 * this hook derives a single AppReadinessState that clearly signals what to show.
 */

export type AppReadinessState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "needs_auth"; hint: string }
  | { status: "misconfigured"; message: string }
  | { status: "error"; error: string };

export interface AppReadinessInput {
  projectsLoading: boolean;
  queueLoading: boolean;
  needsAuth: boolean;
  hostMisconfigured: string | null;
  projectsError: string | null;
  loginHint: string | null;
}

/**
 * Derive a single, clear readiness state from scattered loading/error flags.
 *
 * Priority (first match wins):
 * 1. Loading (if either projects or queue are still loading)
 * 2. Misconfigured (env vars missing)
 * 3. Needs auth (Supabase session expired or not authenticated)
 * 4. Error (network or other transient error)
 * 5. Ready (all data loaded, no errors)
 */
export function resolveAppReadiness(input: AppReadinessInput): AppReadinessState {
  const {
    projectsLoading,
    queueLoading,
    needsAuth,
    hostMisconfigured,
    projectsError,
    loginHint,
  } = input;

  // Still loading? Don't show anything else.
  if (projectsLoading || queueLoading) {
    return { status: "loading" };
  }

  // Misconfigured takes priority over auth/error
  if (hostMisconfigured) {
    return { status: "misconfigured", message: hostMisconfigured };
  }

  // Auth needed is next priority
  if (needsAuth) {
    return {
      status: "needs_auth",
      hint: loginHint || "Please sign in to continue.",
    };
  }

  // Then other errors
  if (projectsError) {
    return { status: "error", error: projectsError };
  }

  // If we got here, we're ready
  return { status: "ready" };
}
