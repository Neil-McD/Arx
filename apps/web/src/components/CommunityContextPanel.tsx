import type { ReactNode } from "react";

export type CommunityPresenceFace = {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_color?: string | null;
  initials?: string | null;
};

type CommunityContextPanelProps = {
  communityName: string;
  memberCount?: number | null;
  onlineCount?: number | null;
  adminCount?: number | null;
  onlineFaces?: CommunityPresenceFace[] | null;
  // Phase 2 slot — the knowledge-graph preview renders here when wired.
  graphPreview?: ReactNode;
};

const FACE_LIMIT = 5;

function formatCount(value?: number | null): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
}

// Skool-style community card for the chat right panel's resting state: banner,
// name, member/online/admin counts, and online faces. The knowledge-graph
// preview slots in below via `graphPreview` (Phase 2).
export function CommunityContextPanel(props: CommunityContextPanelProps) {
  const faces = (props.onlineFaces ?? []).slice(0, FACE_LIMIT);
  const onlineTotal = typeof props.onlineCount === "number" ? props.onlineCount : faces.length;
  const extraOnline = Math.max(0, onlineTotal - faces.length);
  return (
    <div className="community-context-card">
      <div className="community-context-banner">
        <span className="community-context-banner-name">{props.communityName}</span>
      </div>
      <div className="community-context-stats">
        <div className="community-context-stat">
          <span className="community-context-stat-value">{formatCount(props.memberCount)}</span>
          <span className="community-context-stat-label">Members</span>
        </div>
        <div className="community-context-stat">
          <span className="community-context-stat-value">
            <span className="community-context-online-dot" aria-hidden="true" />
            {formatCount(props.onlineCount)}
          </span>
          <span className="community-context-stat-label">Online</span>
        </div>
        <div className="community-context-stat">
          <span className="community-context-stat-value">{formatCount(props.adminCount)}</span>
          <span className="community-context-stat-label">Admin</span>
        </div>
      </div>
      {faces.length > 0 ? (
        <div className="community-context-faces">
          {faces.map((face) => (
            <span
              key={face.user_id}
              className="community-context-face"
              style={!face.avatar_url && face.avatar_color ? { background: face.avatar_color } : undefined}
              title={face.display_name ?? undefined}
            >
              {face.avatar_url ? (
                <img src={face.avatar_url} alt="" />
              ) : (
                <span>{face.initials ?? "?"}</span>
              )}
            </span>
          ))}
          {extraOnline > 0 ? (
            <span className="community-context-faces-more">+{extraOnline} more</span>
          ) : null}
        </div>
      ) : null}
      {props.graphPreview ? (
        <div className="community-context-graph">{props.graphPreview}</div>
      ) : null}
    </div>
  );
}
