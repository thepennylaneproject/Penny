interface MetricCardProps {
  label:   string;
  value:   string | number;
  sub?:    string;
  accent?: string;
}

export function MetricCard({ label, value, sub, accent }: MetricCardProps) {
  return (
    <div
      style={{
        padding:   "1rem 0",
        minWidth:  0,
      }}
    >
      <div
        style={{
          fontSize:      "9px",
          fontFamily:    "var(--font-mono)",
          fontWeight:    500,
          color:         "var(--ink-text-4)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom:  "0.375rem",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize:   "26px",
          fontWeight: 300,
          color:      accent ?? "var(--ink-text)",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize:   "11px",
            color:      "var(--ink-text-4)",
            fontFamily: "var(--font-mono)",
            marginTop:  "0.25rem",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
