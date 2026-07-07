import type { PremiumMemberBadgeSummary } from "./communityTypes";

type PremiumMemberBadgeProps = {
  badge?: PremiumMemberBadgeSummary | null;
  className?: string;
};

// Connected-nodes mark (network glyph): premium members are full nodes in the
// Polynet. Custom SVG — deliberately not a stock icon-library mark. Exported
// so every premium-labeled surface (pills, gates) uses this exact mark.
export function PremiumNodeGlyph() {
  // Bold small-size cut: filled, fattened edge nodes and thicker strokes so
  // the mark stays crisp at 10-14px row sizes. Inline styles beat the
  // surrounding badge/pill CSS (fill: none) on purpose.
  const edgeNodeStyle = { fill: "currentColor", stroke: "none" } as const;
  return (
    <svg viewBox="0 0 24 24" strokeWidth="2.4" aria-hidden="true">
      <path d="M5.931 6.936l1.275 4.249m5.607 5.609l4.251 1.275" />
      <path d="M11.683 12.317l5.759 -5.759" />
      <circle cx="5.5" cy="5.5" r="2.3" style={edgeNodeStyle} />
      <circle cx="18.5" cy="5.5" r="2.3" style={edgeNodeStyle} />
      <circle cx="18.5" cy="18.5" r="2.3" style={edgeNodeStyle} />
      <circle cx="8.5" cy="15.5" r="4.5" />
    </svg>
  );
}

export function PremiumMemberBadge({ badge, className }: PremiumMemberBadgeProps) {
  if (!badge) return null;
  const label = badge.label || "Premium";
  return (
    <span
      className={`premium-member-badge${className ? ` ${className}` : ""}`}
      title="Polynet Premium member"
      aria-label="Polynet Premium member"
    >
      <PremiumNodeGlyph />
      <span className="premium-member-badge-label">{label}</span>
    </span>
  );
}
