import type { ReactNode } from "react";

function SkeletonShell(props: {
  className: string;
  label?: string | null;
  quiet?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`web-loading-skeleton ${props.className}${props.quiet ? " is-quiet" : ""}`}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      {props.label ? <span className="web-loading-sr">{props.label}</span> : null}
      {props.children}
    </div>
  );
}

const CHANNEL_ROW_PATTERNS: ReadonlyArray<{ nameW: string; line1W: string; line2W?: string }> = [
  { nameW: "92px", line1W: "72%", line2W: "48%" },
  { nameW: "118px", line1W: "64%" },
  { nameW: "84px", line1W: "82%", line2W: "36%" },
  { nameW: "104px", line1W: "56%" },
];

export function ChannelFeedSkeleton(props: {
  label?: string | null;
  quiet?: boolean;
  rows?: number;
}) {
  const rows = CHANNEL_ROW_PATTERNS.slice(0, props.rows ?? 4);
  return (
    <SkeletonShell
      className="web-skeleton-channel"
      label={props.label === undefined ? "Loading messages…" : props.label}
      quiet={props.quiet}
    >
      {rows.map((row, index) => (
        <div className="web-skeleton-message-row" key={index} aria-hidden="true">
          <span className="web-skeleton-avatar web-skeleton-block" />
          <div className="web-skeleton-message-body">
            <div className="web-skeleton-message-meta">
              <span className="web-skeleton-pill web-skeleton-line-sm" style={{ width: row.nameW }} />
              <span className="web-skeleton-pill web-skeleton-line-xs" style={{ width: "44px" }} />
            </div>
            <span className="web-skeleton-pill web-skeleton-line" style={{ width: row.line1W }} />
            {row.line2W ? (
              <span className="web-skeleton-pill web-skeleton-line" style={{ width: row.line2W }} />
            ) : null}
          </div>
        </div>
      ))}
    </SkeletonShell>
  );
}

const REPLY_ROW_PATTERNS: ReadonlyArray<{ nameW: string; line1W: string; line2W?: string }> = [
  { nameW: "88px", line1W: "76%", line2W: "42%" },
  { nameW: "108px", line1W: "58%" },
];

export function ThreadRepliesSkeleton(props: { label?: string | null }) {
  return (
    <SkeletonShell
      className="web-skeleton-replies"
      label={props.label === undefined ? "Loading replies…" : props.label}
    >
      {REPLY_ROW_PATTERNS.map((row, index) => (
        <div className="web-skeleton-message-row is-compact" key={index} aria-hidden="true">
          <span className="web-skeleton-avatar is-compact web-skeleton-block" />
          <div className="web-skeleton-message-body">
            <div className="web-skeleton-message-meta">
              <span className="web-skeleton-pill web-skeleton-line-sm" style={{ width: row.nameW }} />
              <span className="web-skeleton-pill web-skeleton-line-xs" style={{ width: "38px" }} />
            </div>
            <span className="web-skeleton-pill web-skeleton-line" style={{ width: row.line1W }} />
            {row.line2W ? (
              <span className="web-skeleton-pill web-skeleton-line" style={{ width: row.line2W }} />
            ) : null}
          </div>
        </div>
      ))}
    </SkeletonShell>
  );
}

export function CourseCatalogSkeleton(props: { label?: string | null; cards?: number }) {
  const count = props.cards ?? 3;
  return (
    <SkeletonShell
      className="web-skeleton-course-grid"
      label={props.label === undefined ? "Loading knowledge…" : props.label}
    >
      {Array.from({ length: count }).map((_, index) => (
        <div className="web-skeleton-course-card" key={index} aria-hidden="true">
          <div className="web-skeleton-course-cover web-skeleton-block" />
          <div className="web-skeleton-course-body">
            <span className="web-skeleton-pill web-skeleton-line-title" style={{ width: index === 1 ? "64%" : "76%" }} />
            <span className="web-skeleton-pill web-skeleton-line-sm" style={{ width: index === 2 ? "80%" : "90%" }} />
            <span className="web-skeleton-pill web-skeleton-line-xs" style={{ width: "42%" }} />
          </div>
        </div>
      ))}
    </SkeletonShell>
  );
}

const EVENT_ROW_PATTERNS: ReadonlyArray<{ titleW: string; subW: string }> = [
  { titleW: "56%", subW: "38%" },
  { titleW: "68%", subW: "44%" },
  { titleW: "48%", subW: "34%" },
];

export function EventListSkeleton(props: { label?: string | null; rows?: number }) {
  const rows = EVENT_ROW_PATTERNS.slice(0, props.rows ?? 3);
  return (
    <SkeletonShell
      className="web-skeleton-event-list"
      label={props.label === undefined ? "Loading events…" : props.label}
    >
      {rows.map((row, index) => (
        <div className="web-skeleton-event-row" key={index} aria-hidden="true">
          <span className="web-skeleton-event-date web-skeleton-block" />
          <div className="web-skeleton-event-body">
            <span className="web-skeleton-pill web-skeleton-line-title" style={{ width: row.titleW }} />
            <span className="web-skeleton-pill web-skeleton-line-sm" style={{ width: row.subW }} />
          </div>
        </div>
      ))}
    </SkeletonShell>
  );
}

export function PodGridSkeleton(props: { label?: string | null; cards?: number }) {
  const count = props.cards ?? 3;
  return (
    <SkeletonShell
      className="web-skeleton-pod-grid"
      label={props.label === undefined ? "Loading pods…" : props.label}
    >
      {Array.from({ length: count }).map((_, index) => (
        <div className="web-skeleton-pod-card" key={index} aria-hidden="true">
          <div className="web-skeleton-message-meta">
            <span className="web-skeleton-pod-icon web-skeleton-block" />
            <span className="web-skeleton-pill web-skeleton-line-title" style={{ width: index === 1 ? "58%" : "68%" }} />
          </div>
          <span className="web-skeleton-pill web-skeleton-line-sm" style={{ width: index === 2 ? "84%" : "92%" }} />
          <span className="web-skeleton-pill web-skeleton-line-sm" style={{ width: "62%" }} />
          <span className="web-skeleton-pill web-skeleton-line-xs web-skeleton-pod-meta" style={{ width: "48%" }} />
        </div>
      ))}
    </SkeletonShell>
  );
}

const PANEL_BLOCK_PATTERNS: ReadonlyArray<{ labelW: string; line1W: string; line2W?: string }> = [
  { labelW: "78px", line1W: "86%", line2W: "58%" },
  { labelW: "96px", line1W: "74%" },
  { labelW: "68px", line1W: "80%", line2W: "46%" },
];

export function PanelBlockSkeleton(props: {
  label?: string | null;
  rows?: number;
  compact?: boolean;
}) {
  const rows = PANEL_BLOCK_PATTERNS.slice(0, props.rows ?? 3);
  return (
    <SkeletonShell
      className={`web-skeleton-panel${props.compact ? " is-compact" : ""}`}
      label={props.label === undefined ? "Loading…" : props.label}
    >
      {rows.map((row, index) => (
        <div className="web-skeleton-panel-section" key={index} aria-hidden="true">
          <span className="web-skeleton-pill web-skeleton-line-xs" style={{ width: row.labelW }} />
          <span className="web-skeleton-pill web-skeleton-line" style={{ width: row.line1W }} />
          {row.line2W ? (
            <span className="web-skeleton-pill web-skeleton-line-sm" style={{ width: row.line2W }} />
          ) : null}
        </div>
      ))}
    </SkeletonShell>
  );
}
