interface EmptyStateProps {
  icon?:   string;
  title:   string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, action }: EmptyStateProps) {
  return (
    <div
      style={{
        padding:   "3rem 1rem",
        textAlign: "center",
        color:     "var(--ink-text-4)",
      }}
    >
      {icon && (
        <div
          style={{
            fontSize:     "18px",
            marginBottom: "0.75rem",
            opacity:      0.35,
            fontFamily:   "var(--font-mono)",
          }}
        >
          {icon}
        </div>
      )}
      <div
        style={{
          fontSize:     "13px",
          color:        "var(--ink-text-3)",
          marginBottom: "1rem",
        }}
      >
        {title}
      </div>
      {action}
    </div>
  );
}
