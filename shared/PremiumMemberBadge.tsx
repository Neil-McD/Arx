import type { PremiumMemberBadgeSummary } from "./communityTypes";

type PremiumMemberBadgeProps = {
  badge?: PremiumMemberBadgeSummary | null;
  className?: string;
};

// Connected-nodes mark (network glyph): premium members are full nodes in the
// Polynet. Custom SVG — deliberately not a stock icon-library mark.
function PremiumNodeGlyph() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="2" aria-hidden="true">
      <path d="M5.931 6.936l1.275 4.249m5.607 5.609l4.251 1.275" />
      <path d="M11.683 12.317l5.759 -5.759" />
      <circle cx="5.5" cy="5.5" r="1.5" />
      <circle cx="18.5" cy="5.5" r="1.5" />
      <circle cx="18.5" cy="18.5" r="1.5" />
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
