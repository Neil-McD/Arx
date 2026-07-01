import { useCallback, useEffect, useRef, type UIEvent } from "react";
import { MessageCircle, MoreHorizontal } from "lucide-react";
import { ProfileHoverCard } from "./communityInteractionFeed";
import type { UserProfile } from "../../../../shared/communityTypes";

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
  created_at?: string | null;
};

type CommunityContextPanelProps = {
  communityName: string;
  onlineFaces?: CommunityPresenceFace[] | null;
  onlineCount?: number | null;
  memberCount?: number | null;
  members?: CommunityRailMember[] | null;
  membersHasMore?: boolean;
  isLoadingMembers?: boolean;
  isLoadingMoreMembers?: boolean;
  membersLoadError?: string | null;
  onLoadMoreMembers?: () => void;
  onlineUserIds?: Set<string> | null;
  ownerId?: string | null;
  canManageMembers?: boolean;
  onOpenMemberSettings?: (member: CommunityRailMember) => void;
  onOpenMemberProfile?: (userId: string) => void;
  onMessageMember?: (userId: string) => void;
  getMemberProfile?: (userId: string) => UserProfile | null;
  currentUserId?: string | null;
  displayName: (userId: string) => string;
  getInitials: (value: string) => string;
  getAvatarColor: (seed: string) => string;
};

const FACE_LIMIT = 7;
const LOAD_MORE_SCROLL_THRESHOLD_PX = 96;

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
  const knownMemberCount = typeof props.memberCount === "number" ? props.memberCount : null;
  const loadedMemberCount = members.length;
  const memberCountLabel = knownMemberCount !== null
    ? String(knownMemberCount)
    : `${loadedMemberCount}${props.membersHasMore ? "+" : ""}`;

  const onlineMembers = members.filter((member) => online.has(member.user_id));
  const offlineMembers = members.filter((member) => !online.has(member.user_id));
  const offlineTotal = knownMemberCount !== null
    ? Math.max(0, knownMemberCount - onlineTotal)
    : offlineMembers.length;
  const offlineCountLabel = knownMemberCount !== null
    ? String(offlineTotal)
    : `${offlineMembers.length}${props.membersHasMore ? "+" : ""}`;
  const loadedSummary = knownMemberCount !== null
    ? `Showing ${Math.min(loadedMemberCount, knownMemberCount)} of ${knownMemberCount}`
    : props.membersHasMore
      ? `Showing ${loadedMemberCount}+`
      : `Showing ${loadedMemberCount}`;
  const loadMoreRequestedRef = useRef(false);

  useEffect(() => {
    if (!props.isLoadingMoreMembers) loadMoreRequestedRef.current = false;
  }, [
    loadedMemberCount,
    props.isLoadingMoreMembers,
    props.membersHasMore,
    props.membersLoadError,
  ]);

  const requestLoadMoreMembers = useCallback(() => {
    if (!props.membersHasMore) return;
    if (props.isLoadingMembers || props.isLoadingMoreMembers) return;
    if (!props.onLoadMoreMembers) return;
    if (loadMoreRequestedRef.current) return;
    loadMoreRequestedRef.current = true;
    props.onLoadMoreMembers();
  }, [
    props.isLoadingMembers,
    props.isLoadingMoreMembers,
    props.membersHasMore,
    props.onLoadMoreMembers,
  ]);

  const handleMembersScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const remainingScroll = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remainingScroll <= LOAD_MORE_SCROLL_THRESHOLD_PX) {
      requestLoadMoreMembers();
    }
  }, [requestLoadMoreMembers]);

  const renderMember = (member: CommunityRailMember, isAdmin = false) => {
    const name = (member.display_name ?? "").trim() || props.displayName(member.user_id);
    const isOnline = online.has(member.user_id);
    const isOwnerMember = member.user_id === props.ownerId || member.role === "owner";
    const canOpenSettings = Boolean(
      props.canManageMembers &&
        props.onOpenMemberSettings &&
        !isOwnerMember &&
        !String(member.id ?? "").startsWith("owner:"),
    );
    const canMessage = Boolean(props.onMessageMember) && member.user_id !== props.currentUserId;
    // Prefer the hydrated profile (bio, @handle, avatar focus/zoom) already cached for the
    // community; fall back to the thin roster fields so first paint never shows an empty card.
    const profile = props.getMemberProfile?.(member.user_id)
      ?? { user_id: member.user_id, display_name: name, avatar_url: member.avatar_url ?? null };
    return (
      <div key={member.id} className={`community-context-member${isOnline ? "" : " is-offline"}`}>
        <ProfileHoverCard
          userId={member.user_id}
          label={name}
          seed={member.user_id}
          profile={profile}
          getAvatarColor={props.getAvatarColor}
          getInitials={props.getInitials}
          currentUserId={props.currentUserId}
          onOpenProfile={props.onOpenMemberProfile}
          onMessageUser={props.onMessageMember}
          online={isOnline}
          triggerClassName="community-context-member-trigger"
        >
          <span
            className="community-context-member-avatar"
            style={!member.avatar_url ? { color: props.getAvatarColor(member.user_id) } : undefined}
          >
            {member.avatar_url ? <img src={member.avatar_url} alt="" /> : <span>{props.getInitials(name)}</span>}
            {isOnline ? <span className="community-context-member-dot" aria-hidden="true" /> : null}
          </span>
          <span className={`community-context-member-name${isAdmin ? " is-admin" : ""}`}>{name}</span>
        </ProfileHoverCard>
        {canMessage ? (
          <button
            className="community-context-member-action"
            type="button"
            aria-label={`Message ${name}`}
            title="Direct message"
            onClick={(event) => {
              event.stopPropagation();
              props.onMessageMember?.(member.user_id);
            }}
          >
            <MessageCircle size={16} strokeWidth={1.9} aria-hidden="true" />
          </button>
        ) : null}
        {canOpenSettings ? (
          <button
            className="community-context-member-action"
            type="button"
            aria-label={`Open settings for ${name}`}
            title="Member settings"
            onClick={(event) => {
              event.stopPropagation();
              props.onOpenMemberSettings?.(member);
            }}
          >
            <MoreHorizontal size={16} strokeWidth={1.9} aria-hidden="true" />
          </button>
        ) : null}
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

      <div className="community-context-members" onScroll={handleMembersScroll}>
        <div className="community-context-section community-context-members-total">
          Members — {memberCountLabel}
        </div>
        {onlineTotal > 0 ? (
          <>
            <div className="community-context-section">Online — {onlineTotal}</div>
            {onlineMembers.map((member) => renderMember(member, isAdminRole(member, props.ownerId)))}
          </>
        ) : null}
        {offlineTotal > 0 || offlineMembers.length > 0 ? (
          <>
            <div className="community-context-section">Offline — {offlineCountLabel}</div>
            {offlineMembers.map((member) => renderMember(member, isAdminRole(member, props.ownerId)))}
          </>
        ) : null}
        {loadedMemberCount === 0 && props.isLoadingMembers ? (
          <div className="community-context-members-status">Loading members...</div>
        ) : null}
        {loadedMemberCount > 0 || props.membersHasMore ? (
          <div className="community-context-members-footer">
            {props.isLoadingMoreMembers ? "Loading more..." : loadedSummary}
          </div>
        ) : null}
        {props.membersLoadError && !props.membersHasMore ? (
          <div className="community-context-members-status">Could not load members.</div>
        ) : null}
        {props.membersLoadError && props.membersHasMore ? (
          <button
            className="community-context-members-retry"
            type="button"
            onClick={requestLoadMoreMembers}
            disabled={props.isLoadingMoreMembers}
          >
            Could not load more members. Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
