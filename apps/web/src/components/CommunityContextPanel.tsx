export type CommunityPresenceFace = {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_color?: string | null;
  initials?: string | null;
};

export type CommunityRailMember = {
  id: string;
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  role: string;
};

type CommunityContextPanelProps = {
  communityName: string;
  onlineFaces?: CommunityPresenceFace[] | null;
  onlineCount?: number | null;
  members?: CommunityRailMember[] | null;
  onlineUserIds?: Set<string> | null;
  ownerId?: string | null;
  displayName: (userId: string) => string;
  getInitials: (value: string) => string;
  getAvatarColor: (seed: string) => string;
};

const FACE_LIMIT = 7;

function isAdminRole(member: CommunityRailMember, ownerId?: string | null): boolean {
  return (
    member.user_id === ownerId
    || member.role === "owner"
    || member.role === "admin"
    || member.role === "moderator"
  );
}

// The community context rail (chat right column, resting state): community name,
// a face pile of who's online (Skool), a memory section that fills in as the room
// accumulates knowledge (Polynet), and a grouped member roster (Discord).
export function CommunityContextPanel(props: CommunityContextPanelProps) {
  const online = props.onlineUserIds ?? new Set<string>();
  const members = props.members ?? [];
  const faces = (props.onlineFaces ?? []).slice(0, FACE_LIMIT);
  const onlineTotal = typeof props.onlineCount === "number" ? props.onlineCount : faces.length;
  const extraFaces = Math.max(0, onlineTotal - faces.length);

  const admins = members.filter((member) => isAdminRole(member, props.ownerId));
  const rest = members.filter((member) => !isAdminRole(member, props.ownerId));
  const onlineMembers = rest.filter((member) => online.has(member.user_id));
  const offlineMembers = rest.filter((member) => !online.has(member.user_id));

  const renderMember = (member: CommunityRailMember, isAdmin = false) => {
    const name = (member.display_name ?? "").trim() || props.displayName(member.user_id);
    const isOnline = online.has(member.user_id);
    return (
      <div key={member.id} className={`community-context-member${isOnline ? "" : " is-offline"}`}>
        <span
          className="community-context-member-avatar"
          style={!member.avatar_url ? { color: props.getAvatarColor(member.user_id) } : undefined}
        >
          {member.avatar_url ? <img src={member.avatar_url} alt="" /> : <span>{props.getInitials(name)}</span>}
          {isOnline ? <span className="community-context-member-dot" aria-hidden="true" /> : null}
        </span>
        <span className={`community-context-member-name${isAdmin ? " is-admin" : ""}`}>{name}</span>
      </div>
    );
  };

  return (
    <div className="community-context-rail">
      <div className="community-context-rail-head">
        <span className="community-context-rail-name">{props.communityName}</span>
      </div>

      {faces.length > 0 ? (
        <div className="community-context-facepile">
          {faces.map((face) => (
            <span
              key={face.user_id}
              className="community-context-face"
              style={!face.avatar_url && face.avatar_color ? { color: face.avatar_color } : undefined}
              title={face.display_name ?? undefined}
            >
              {face.avatar_url ? <img src={face.avatar_url} alt="" /> : <span>{face.initials ?? "?"}</span>}
            </span>
          ))}
          {extraFaces > 0 ? (
            <span className="community-context-face community-context-face-more">+{extraFaces}</span>
          ) : null}
        </div>
      ) : null}

      <div className="community-context-memory">
        <div className="community-context-section">Memory</div>
        <div className="community-context-memory-empty">
          <svg viewBox="0 0 32 32" width="22" height="22" fill="none" aria-hidden="true">
            <line x1="8" y1="10" x2="16" y2="20" stroke="currentColor" strokeWidth="1.4" />
            <line x1="24" y1="9" x2="16" y2="20" stroke="currentColor" strokeWidth="1.4" />
            <line x1="8" y1="10" x2="24" y2="9" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="8" cy="10" r="2.2" fill="currentColor" />
            <circle cx="24" cy="9" r="2.2" fill="currentColor" />
            <circle cx="16" cy="20" r="3" fill="currentColor" />
          </svg>
          <span>Builds as the room shares knowledge</span>
        </div>
      </div>

      <div className="community-context-members">
        {admins.length > 0 ? (
          <>
            <div className="community-context-section">Admins — {admins.length}</div>
            {admins.map((member) => renderMember(member, true))}
          </>
        ) : null}
        {onlineMembers.length > 0 ? (
          <>
            <div className="community-context-section">Online — {onlineMembers.length}</div>
            {onlineMembers.map((member) => renderMember(member))}
          </>
        ) : null}
        {offlineMembers.length > 0 ? (
          <>
            <div className="community-context-section">Offline — {offlineMembers.length}</div>
            {offlineMembers.map((member) => renderMember(member))}
          </>
        ) : null}
      </div>
    </div>
  );
}
