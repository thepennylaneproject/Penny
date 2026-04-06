"use client";

/**
 * Page-level loading skeleton shown while projects and queue are being fetched.
 *
 * Replaces the awkward partial-UI states where some data is ready and some isn't.
 */

export function PageLoadingSkeleton() {
  return (
    <div style={{ padding: "2rem", maxWidth: "800px" }}>
      {/* Header placeholder */}
      <div
        style={{
          height: "24px",
          width: "200px",
          backgroundColor: "var(--ink-bg-2)",
          borderRadius: "4px",
          marginBottom: "1.5rem",
          animation: "pulse 2s infinite",
        }}
      />

      {/* Card placeholders */}
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            padding: "1rem",
            marginBottom: "1rem",
            backgroundColor: "var(--ink-bg-1)",
            borderRadius: "6px",
            border: "1px solid var(--ink-border)",
          }}
        >
          <div
            style={{
              height: "16px",
              width: "60%",
              backgroundColor: "var(--ink-bg-2)",
              borderRadius: "3px",
              marginBottom: "0.75rem",
              animation: "pulse 2s infinite",
            }}
          />
          <div
            style={{
              height: "12px",
              width: "40%",
              backgroundColor: "var(--ink-bg-2)",
              borderRadius: "3px",
              animation: "pulse 2s infinite",
            }}
          />
        </div>
      ))}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
