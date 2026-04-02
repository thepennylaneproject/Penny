"use client";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="penny-confirm-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        background: "rgba(0,0,0,0.35)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "var(--ink-bg-raised)",
          border: "0.5px solid var(--ink-border)",
          borderRadius: "var(--radius-lg)",
          padding: "1.25rem 1.5rem",
          boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
        }}
      >
        <h2
          id="penny-confirm-title"
          style={{
            fontSize: "14px",
            fontWeight: 500,
            margin: "0 0 0.75rem",
            color: "var(--ink-text)",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontSize: "12px",
            color: "var(--ink-text-3)",
            lineHeight: 1.55,
            margin: "0 0 1.25rem",
          }}
        >
          {body}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              padding: "5px 12px",
              border: "0.5px solid var(--ink-border-faint)",
              background: "transparent",
              color: "var(--ink-text-3)",
              cursor: "pointer",
              borderRadius: "var(--radius-md)",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              padding: "5px 12px",
              border: `0.5px solid ${danger ? "var(--ink-red)" : "var(--ink-border)"}`,
              background: danger ? "var(--ink-bg-sunken)" : "var(--ink-bg-raised)",
              color: danger ? "var(--ink-red)" : "var(--ink-text)",
              cursor: "pointer",
              borderRadius: "var(--radius-md)",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
