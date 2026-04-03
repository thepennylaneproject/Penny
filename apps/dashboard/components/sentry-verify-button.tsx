"use client";

/**
 * Dev-only control to verify Sentry client error reporting (wizard test).
 * Remove from the layout once you have confirmed events in Sentry.
 */
export function SentryVerifyButton() {
  if (process.env.NODE_ENV !== "development") return null;

  return (
    <button
      type="button"
      className="fixed bottom-4 right-4 z-[9999] rounded-md border border-amber-600/40 bg-amber-950/90 px-3 py-1.5 text-xs text-amber-100 shadow-lg hover:bg-amber-900/90"
      onClick={() => {
        throw new Error("This is your first error!");
      }}
    >
      Break the world
    </button>
  );
}
