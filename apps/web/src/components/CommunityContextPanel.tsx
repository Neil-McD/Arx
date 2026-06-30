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
  // The knowledge-graph preview fills the graph section. When absent, a calm
  // empty state holds the space instead.
  graphPreview?: ReactNode;
};

const FACE_LIMIT = 5;

function formatCount(value?: number | null): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
}

// The community context rail — the chat right column's resting "home": a
// full-height panel of bands (identity, stats, online, knowledge graph). The
// graph section flexes to fill the remaining height. Threads/profiles
// temporarily take over this same column; closing them returns here.
export function CommunityContextPanel(props: CommunityContextPanelProps) {
  const faces = (props.onlineFaces ?? []).slice(0, FACE_LIMIT);
  const onlineTotal = typeof props.onlineCount === "number" ? props.onlineCount : faces.length;

  return (
    <div className="community-rail">
      <div className="community-rail-banner">
        <span className="community-rail-name">{props.communityName}</span>
      </div>

      <div className="community-rail-stats">
        <div className="community-rail-stat">
          <span className="community-rail-stat-value">{formatCount(props.memberCount)}</span>
          <span className="community-rail-stat-label">Members</span>
        </div>
        <div className="community-rail-stat">
          <span className="community-rail-stat-value">
            <span className="community-rail-online-dot" aria-hidden="true" />
            {formatCount(props.onlineCount)}
          </span>
          <span className="community-rail-stat-label">Online</span>
        </div>
        <div className="community-rail-stat">
          <span className="community-rail-stat-value">{formatCount(props.adminCount)}</span>
          <span className="community-rail-stat-label">Admin</span>
        </div>
      </div>

      {faces.length > 0 ? (
        <div className="community-rail-online">
          <div className="community-rail-online-faces">
            {faces.map((face) => (
              <span
                key={face.user_id}
                className="community-rail-face"
                style={!face.avatar_url && face.avatar_color ? { background: face.avatar_color } : undefined}
                title={face.display_name ?? undefined}
              >
                {face.avatar_url ? <img src={face.avatar_url} alt="" /> : <span>{face.initials ?? "?"}</span>}
              </span>
            ))}
          </div>
          <span className="community-rail-online-label">{onlineTotal} online now</span>
        </div>
      ) : null}

      <div className="community-rail-graph">
        {props.graphPreview ?? (
          <div className="community-rail-graph-empty">
            <svg viewBox="0 0 32 32" width="26" height="26" fill="none" aria-hidden="true">
              <line x1="8" y1="10" x2="16" y2="20" stroke="currentColor" strokeWidth="1.4" />
              <line x1="24" y1="9" x2="16" y2="20" stroke="currentColor" strokeWidth="1.4" />
              <line x1="8" y1="10" x2="24" y2="9" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="8" cy="10" r="2.4" fill="currentColor" />
              <circle cx="24" cy="9" r="2.4" fill="currentColor" />
              <circle cx="16" cy="20" r="3.2" fill="currentColor" />
            </svg>
            <span>The room's memory will appear here.</span>
          </div>
        )}
      </div>
    </div>
  );
}
