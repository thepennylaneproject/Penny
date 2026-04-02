interface ProgressBarProps {
  value:    number;
  max:      number;
  color?:   string;
  segments?: { value: number; color: string }[];
}

export function ProgressBar({ value, max, color = "var(--ink-green)", segments }: ProgressBarProps) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
      <div
        style={{
          flex:         1,
          height:       5,
          background:   "var(--ink-border-faint)",
          borderRadius: 3,
          overflow:     "hidden",
          position:     "relative",
        }}
      >
        {segments ? (
          // Segmented bar: stacked proportional sections
          <div style={{ display: "flex", height: "100%", width: "100%" }}>
            {segments.map((seg, i) => {
              const segPct = max > 0 ? (seg.value / max) * 100 : 0;
              return (
                <div
                  key={i}
                  style={{
                    width:      `${segPct}%`,
                    height:     "100%",
                    background: seg.color,
                    transition: "width 0.4s ease",
                  }}
                />
              );
            })}
          </div>
        ) : (
          <div
            style={{
              width:      `${pct}%`,
              height:     "100%",
              background: color,
              borderRadius: 3,
              transition: "width 0.4s ease",
            }}
          />
        )}
      </div>
      <span
        style={{
          fontSize:   "11px",
          fontFamily: "var(--font-mono)",
          color:      "var(--ink-text-4)",
          minWidth:   "2rem",
          textAlign:  "right",
        }}
      >
        {pct}%
      </span>
    </div>
  );
}
