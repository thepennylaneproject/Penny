const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  blocker: { bg: "var(--ink-red-bg)",   text: "var(--ink-red)",   border: "var(--ink-red-border)" },
  major:   { bg: "var(--ink-amber-bg)", text: "var(--ink-amber)", border: "var(--ink-amber-border)" },
  minor:   { bg: "var(--ink-blue-bg)",  text: "var(--ink-blue)",  border: "var(--ink-blue-border)" },
  nit:     { bg: "var(--ink-gray-bg)",  text: "var(--ink-gray)",  border: "var(--ink-gray-border)" },
};

interface BadgeProps {
  children: React.ReactNode;
  color?:   string;
  small?:   boolean;
}

export function Badge({ children, color = "gray", small = false }: BadgeProps) {
  const c = SEVERITY_COLORS[color] ?? {
    bg:     "var(--ink-gray-bg)",
    text:   "var(--ink-text-3)",
    border: "var(--ink-gray-border)",
  };
  return (
    <span
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        padding:       small ? "1px 7px" : "2px 9px",
        borderRadius:  "var(--radius-md)",
        background:    c.bg,
        color:         c.text,
        fontSize:      small ? "10px" : "11px",
        fontWeight:    500,
        fontFamily:    "var(--font-mono)",
        border:        `0.5px solid ${c.border}`,
        whiteSpace:    "nowrap",
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </span>
  );
}
