import type { Finding } from "@/lib/types";
import { Badge } from "./Badge";
import { STATUS_GROUPS } from "@/lib/constants";

const SEVERITY_STRIPE: Record<string, string> = {
  blocker: "var(--ink-red)",
  major:   "var(--ink-amber)",
  minor:   "var(--ink-blue)",
  nit:     "var(--ink-border)",
};

const TYPE_ICONS: Record<string, string> = {
  bug:         "·",
  enhancement: "▲",
  debt:        "◆",
  question:    "?",
};

interface FindingRowProps {
  finding: Finding;
  onClick: () => void;
  selected?: boolean;
  onSelect?: (findingId: string, checked: boolean) => void;
}

export function FindingRow({ finding, onClick, selected, onSelect }: FindingRowProps) {
  const stripe  = SEVERITY_STRIPE[finding.severity ?? ""] ?? "var(--ink-border)";
  const isActive = STATUS_GROUPS.active.includes(finding.status);

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display:       "flex",
        alignItems:    "flex-start",
        gap:           "0.875rem",
        padding:       "0.625rem 0.75rem",
        borderRadius:  "var(--radius-md)",
        cursor:        "pointer",
        borderLeft:    `2.5px solid ${stripe}`,
        opacity:       isActive ? 1 : 0.45,
        transition:    "background 0.1s ease",
        background:    selected ? "var(--ink-bg-raised)" : "transparent",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "var(--ink-bg-raised)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = selected ? "var(--ink-bg-raised)" : "transparent";
      }}
    >
      {onSelect && (
        <input
          type="checkbox"
          checked={selected ?? false}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(finding.finding_id, e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select finding: ${finding.title}`}
          style={{
            marginTop:   "2px",
            flexShrink:  0,
            cursor:      "pointer",
            accentColor: "var(--ink-text-2)",
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title */}
        <div
          style={{
            fontSize:     "13px",
            fontWeight:   500,
            color:        "var(--ink-text)",
            lineHeight:   1.4,
            marginBottom: "0.25rem",
          }}
        >
          {finding.title}
        </div>

        {/* Meta row */}
        <div
          style={{
            display:    "flex",
            alignItems: "center",
            gap:        "0.5rem",
            flexWrap:   "wrap",
          }}
        >
          <Badge color={finding.severity} small>{finding.severity}</Badge>
          <Badge small>{finding.priority}</Badge>
          <span
            style={{
              fontSize:   "10px",
              color:      "var(--ink-text-4)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {TYPE_ICONS[finding.type ?? ""] ?? ""} {finding.type}
          </span>
          {finding.confidence && (
            <span
              style={{
                fontSize:   "10px",
                color:      "var(--ink-text-4)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {finding.confidence}
            </span>
          )}
          <span
            style={{
              fontSize:   "10px",
              color:      "var(--ink-text-4)",
              fontFamily: "var(--font-mono)",
              marginLeft: "auto",
            }}
          >
            {finding.status?.replace(/_/g, " ")}
          </span>
        </div>
      </div>
    </div>
  );
}
