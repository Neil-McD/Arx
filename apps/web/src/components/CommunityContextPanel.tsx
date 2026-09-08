import { useCallback, useEffect, useId, useRef, useState, type UIEvent } from "react";
import { Check, ChevronDown, Lock, MessageCircle, X } from "lucide-react";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { formatRelativeTimeFromIso } from "../../../../shared/contentFormatting";
import type {
  CommunityDirectoryMember,
  CommunityPresenceFace,
} from "../../../../shared/communityTypes";

const PENDING_JOIN_REQUEST_DISPLAY_LIMIT = 200;

export type { CommunityPresenceFace } from "../../../../shared/communityTypes";
export type CommunityRailMember = CommunityDirectoryMember;

export type CommunityAdmissionEntryPolicy = "open" | "approval" | "paid_subscription";

export type CommunityAdmissionJoinRequest = {
  id: string;
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarFocusX?: number | null;
  avatarFocusY?: number | null;
  avatarZoom?: number | null;
  message: string | null;
  createdAtLabel: string;
};

type CommunityContextPanelProps = {
  communityName: string;
  onlineFaces?: CommunityPresenceFace[] | null;
  onlineCount?: number | null;
  onlineCountCapped?: boolean;
  memberCount?: number | null;
  members?: CommunityRailMember[] | null;
  membersHasMore?: boolean;
  isLoadingMembers?: boolean;
  isLoadingMoreMembers?: boolean;
  membersLoadError?: string | null;
  onLoadMoreMembers?: () => void;
  isLoadingPresence?: boolean;
  onlineUserIds?: Set<string> | null;
  ownerId?: string | null;
  canManageMembers?: boolean;
  canReviewJoinRequests?: boolean;
  joinReviewMode?: "paid" | "free_auto" | "free_approval" | null;
  pendingJoinRequests?: CommunityAdmissionJoinRequest[] | null;
  isLoadingJoinRequests?: boolean;
  joinRequestsError?: string | null;
  decidingJoinRequestId?: string | null;
  onApproveJoinRequest?: (requestId: string) => Promise<void> | void;
  onDenyJoinRequest?: (requestId: string) => Promise<void> | void;
  /* Visitor mode: sections render a visible lock body instead of live data.
     Headers keep their true counts — gate the content, show the metadata. */
  lockedSections?: { members?: boolean; memory?: boolean } | null;
  onLockedSectionActivate?: (section: "members" | "memory") => void;
  /* Visitor mode: up to 5 real faces render above the frost; everyone else
     is a glassed glimpse plus a true count. */
  membersPreview?: CommunityPresenceFace[] | null;
  onOpenMemberSettings?: (member: CommunityRailMember) => void;
  onOpenMemberProfile?: (userId: string) => void;
  onMessageMember?: (userId: string) => void;
  currentUserId?: string | null;
  displayName: (userId: string) => string;
  getInitials: (value: string) => string;
  getAvatarColor: (seed: string) => string;
  sectionMode?: "all" | "members";
};

const LOAD_MORE_SCROLL_THRESHOLD_PX = 96;

function isAdminRole(member: CommunityRailMember, ownerId?: string | null): boolean {
  return (
    member.user_id === ownerId
    || member.role === "owner"
    || member.role === "admin"
    || member.role === "moderator"
  );
}


function formatMemberActivityLabel(lastActiveAt: string | null | undefined, isOnline: boolean): string | null {
  if (isOnline) return "Active now";
  const normalized = String(lastActiveAt ?? "").trim();
  if (!normalized) return null;
  const relative = formatRelativeTimeFromIso(normalized);
  return relative ? `Active ${relative}` : null;
}

// Canonical community member directory and manager controls.
export function CommunityContextPanel(props: CommunityContextPanelProps) {
  const members = props.members ?? [];
  const pendingJoinRequests = props.pendingJoinRequests ?? [];
  const hasPendingJoinRequestOverflow =
    pendingJoinRequests.length > PENDING_JOIN_REQUEST_DISPLAY_LIMIT;
  const visiblePendingJoinRequests = hasPendingJoinRequestOverflow
    ? pendingJoinRequests.slice(0, PENDING_JOIN_REQUEST_DISPLAY_LIMIT)
    : pendingJoinRequests;
  const knownMemberCount = typeof props.memberCount === "number" ? props.memberCount : null;
  const loadedMemberCount = members.length;
  const lockedMembers = Boolean(props.lockedSections?.members);

  const loadedSummary = knownMemberCount !== null
    ? `Showing ${Math.min(loadedMemberCount, knownMemberCount)} of ${knownMemberCount}`
    : props.membersHasMore
      ? `Showing ${loadedMemberCount}+`
      : `Showing ${loadedMemberCount}`;
  const hasUnloadedKnownMembers =
    knownMemberCount !== null && loadedMemberCount < knownMemberCount;
  const shouldShowMembersFooter =
    loadedMemberCount > 0 || props.membersHasMore || hasUnloadedKnownMembers;
  const loadMoreRequestedRef = useRef(false);
  const membersViewportRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const [joinRequestsExpanded, setJoinRequestsExpanded] = useState(false);
  const joinRequestPanelId = useId();
  const pendingJoinRequestCount = visiblePendingJoinRequests.length;
  const canShowJoinRequests = Boolean(
    props.canReviewJoinRequests &&
      props.joinReviewMode === "free_approval" &&
      pendingJoinRequests.length > 0,
  );
  const requestCountLabel =
    hasPendingJoinRequestOverflow ? "200+" : String(pendingJoinRequestCount);
  const requestDividerLabel = `${requestCountLabel} request${
    hasPendingJoinRequestOverflow || pendingJoinRequestCount !== 1 ? "s" : ""
  } to join`;
  const requestDividerAriaLabel = hasPendingJoinRequestOverflow
    ? "200 or more requests to join"
    : requestDividerLabel;
  const isJoinRequestDecisionPending = Boolean(props.decidingJoinRequestId);
  const canShowJoinRequestLoadError = Boolean(
    props.canReviewJoinRequests &&
      props.joinReviewMode === "free_approval" &&
      pendingJoinRequests.length === 0 &&
      !props.isLoadingJoinRequests &&
      props.joinRequestsError,
  );
  const membersFooterLabel = props.membersHasMore
    ? props.isLoadingMoreMembers
      ? "Loading more..."
      : props.membersLoadError
        ? "More members available"
        : "Loading more..."
    : hasUnloadedKnownMembers
      ? "Member list out of sync"
    : loadedSummary;

  useEffect(() => {
    if (!props.isLoadingMoreMembers) loadMoreRequestedRef.current = false;
  }, [
    loadedMemberCount,
    props.isLoadingMoreMembers,
    props.membersHasMore,
    props.membersLoadError,
  ]);

  useEffect(() => {
    if (!canShowJoinRequests) setJoinRequestsExpanded(false);
  }, [canShowJoinRequests]);

  const requestLoadMoreMembers = useCallback((options?: { force?: boolean }) => {
    if (!props.membersHasMore) return;
    if (props.isLoadingMembers || props.isLoadingMoreMembers) return;
    if (!props.onLoadMoreMembers) return;
    if (props.membersLoadError && !options?.force) return;
    if (loadMoreRequestedRef.current) return;
    loadMoreRequestedRef.current = true;
    props.onLoadMoreMembers();
  }, [
    props.isLoadingMembers,
    props.isLoadingMoreMembers,
    props.membersHasMore,
    props.membersLoadError,
    props.onLoadMoreMembers,
  ]);

  const isMembersViewportNearBottom = useCallback(() => {
    const viewport = membersViewportRef.current;
    if (!viewport) return false;
    const remainingScroll = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    return remainingScroll <= LOAD_MORE_SCROLL_THRESHOLD_PX;
  }, []);

  const requestVisibleMemberPage = useCallback(() => {
    if (!isMembersViewportNearBottom()) return;
    requestLoadMoreMembers();
  }, [isMembersViewportNearBottom, requestLoadMoreMembers]);

  const handleMembersScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const remainingScroll = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remainingScroll <= LOAD_MORE_SCROLL_THRESHOLD_PX) {
      requestLoadMoreMembers();
    }
  }, [requestLoadMoreMembers]);

  useEffect(() => {
    if (!props.membersHasMore || props.isLoadingMembers || props.isLoadingMoreMembers || props.membersLoadError) {
      return;
    }
    const frame = requestAnimationFrame(requestVisibleMemberPage);
    return () => cancelAnimationFrame(frame);
  }, [
    joinRequestsExpanded,
    loadedMemberCount,
    props.isLoadingMembers,
    props.isLoadingMoreMembers,
    props.membersHasMore,
    props.membersLoadError,
    requestVisibleMemberPage,
  ]);

  useEffect(() => {
    const viewport = membersViewportRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (
      !viewport ||
      !sentinel ||
      !props.membersHasMore ||
      props.isLoadingMembers ||
      props.isLoadingMoreMembers ||
      props.membersLoadError ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) requestLoadMoreMembers();
      },
      {
        root: viewport,
        rootMargin: `${LOAD_MORE_SCROLL_THRESHOLD_PX}px 0px`,
        threshold: 0,
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    loadedMemberCount,
    props.isLoadingMembers,
    props.isLoadingMoreMembers,
    props.membersHasMore,
    props.membersLoadError,
    requestLoadMoreMembers,
  ]);

  const renderMember = (member: CommunityRailMember, isAdmin = false) => {
    const name = (member.display_name ?? "").trim() || props.displayName(member.user_id);
    const isOnline = Boolean(props.onlineUserIds?.has(member.user_id));
    const activityLabel = formatMemberActivityLabel(
      member.last_active_at,
      isOnline,
    );
    const isOwnerMember = member.user_id === props.ownerId || member.role === "owner";
    const canOpenSettings = Boolean(
      props.canManageMembers &&
        props.onOpenMemberSettings &&
        !isOwnerMember &&
        !String(member.id ?? "").startsWith("owner:"),
    );
    const canMessage = Boolean(props.onMessageMember) && member.user_id !== props.currentUserId;
    return (
      <div key={member.id} className="community-context-member">
        <button
          className="community-context-member-trigger"
          type="button"
          aria-label={`Open ${name}'s profile`}
          onClick={() => props.onOpenMemberProfile?.(member.user_id)}
        >
          <span
            className="community-context-member-avatar"
            style={!member.avatar_url ? { color: props.getAvatarColor(member.user_id) } : undefined}
          >
            <UserAvatar
              className="community-context-member-avatar-media"
              readyClassName="has-image"
              name={name}
              imageUrl={member.avatar_url}
              focusX={member.avatar_focus_x}
              focusY={member.avatar_focus_y}
              zoom={member.avatar_zoom}
              alt=""
              loading={isOnline ? "eager" : "lazy"}
              fetchPriority={isOnline ? "auto" : "low"}
              aria-hidden={true}
              fallback={<span>{props.getInitials(name)}</span>}
            />
            {isOnline ? <span className="community-context-member-dot" aria-hidden="true" /> : null}
          </span>
          <span className="community-context-member-copy">
            <span className={`community-context-member-name${isAdmin ? " is-admin" : ""}`}>{name}</span>
            <span className="community-context-member-activity">{isOwnerMember ? "Owner" : member.role || "Member"}{activityLabel ? ` · ${activityLabel}` : ""}</span>
          </span>
        </button>
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
            className="community-context-member-action community-context-member-manage"
            type="button"
            aria-label={`Manage ${name}`}
            title="Member settings"
            onClick={(event) => {
              event.stopPropagation();
              props.onOpenMemberSettings?.(member);
            }}
          >
            Manage
          </button>
        ) : null}
      </div>
    );
  };

  const renderJoinRequest = (request: CommunityAdmissionJoinRequest) => {
    const name = (request.displayName ?? "").trim() || props.displayName(request.userId);
    const isDeciding = props.decidingJoinRequestId === request.id;
    return (
      <div key={request.id} className="community-context-request-row">
        <UserAvatar
          className="community-context-request-avatar"
          readyClassName="has-image"
          name={name}
          imageUrl={request.avatarUrl}
          focusX={request.avatarFocusX ?? 0.5}
          focusY={request.avatarFocusY ?? 0.5}
          zoom={request.avatarZoom ?? 1}
          alt=""
          aria-hidden={true}
          fallback={null}
        />
        <div className="community-context-request-copy">
          <div className="community-context-request-title">
            <strong>{name}</strong>
            <span>{request.createdAtLabel}</span>
          </div>
          {request.message ? (
            <div className="community-context-request-message">{request.message}</div>
          ) : null}
        </div>
        <div className="community-context-request-actions">
          <button
            className="community-context-request-action"
            type="button"
            disabled={isJoinRequestDecisionPending}
            aria-busy={isDeciding || undefined}
            aria-label={`Approve ${name}`}
            title="Approve"
            onClick={() => void props.onApproveJoinRequest?.(request.id)}
          >
            <Check size={15} strokeWidth={1.9} aria-hidden="true" />
          </button>
          <button
            className="community-context-request-action"
            type="button"
            disabled={isJoinRequestDecisionPending}
            aria-busy={isDeciding || undefined}
            aria-label={`Deny ${name}`}
            title="Deny"
            onClick={() => void props.onDenyJoinRequest?.(request.id)}
          >
            <X size={15} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="community-context-rail">

      <div
        ref={membersViewportRef}
        className="community-context-members"
        onScroll={handleMembersScroll}
      >
        {canShowJoinRequests ? (
          <button
            className={`community-context-request-divider${joinRequestsExpanded ? " is-open" : ""}`}
            type="button"
            aria-busy={props.isLoadingJoinRequests || undefined}
            aria-controls={joinRequestPanelId}
            aria-expanded={joinRequestsExpanded}
            aria-label={requestDividerAriaLabel}
            onClick={() => setJoinRequestsExpanded((expanded) => !expanded)}
          >
            <span>
              {requestDividerLabel}
              <ChevronDown size={13} strokeWidth={2.1} aria-hidden="true" />
            </span>
          </button>
        ) : null}
        {canShowJoinRequestLoadError ? (
          <div className="community-context-admission-status" role="status">
            {props.joinRequestsError}
          </div>
        ) : null}
        {canShowJoinRequests && joinRequestsExpanded ? (
          <div className="community-context-request-panel" id={joinRequestPanelId}>
            {visiblePendingJoinRequests.map(renderJoinRequest)}
            {props.joinRequestsError ? (
              <div className="community-context-admission-status">{props.joinRequestsError}</div>
            ) : null}
          </div>
        ) : null}
        {lockedMembers && (props.membersPreview?.length ?? 0) > 0 ? (
          <button
            type="button"
            className="community-context-members-glass"
            onClick={() => props.onLockedSectionActivate?.("members")}
          >
            {(props.membersPreview ?? []).map((face) => {
              const name = (face.display_name ?? "").trim() || "Member";
              return (
                <span key={face.user_id} className="community-context-member community-context-member-inert">
                  <span
                    className="community-context-member-avatar"
                    style={!face.avatar_url && face.avatar_color ? { color: face.avatar_color } : undefined}
                  >
                    <UserAvatar
                      className="community-context-member-avatar-media"
                      readyClassName="has-image"
                      name={name}
                      imageUrl={face.avatar_url}
                      focusX={face.avatar_focus_x}
                      focusY={face.avatar_focus_y}
                      zoom={face.avatar_zoom}
                      fallback={<span>{face.initials ?? props.getInitials(name)}</span>}
                      alt=""
                      aria-hidden={true}
                    />
                  </span>
                  <span className="community-context-member-name">{name}</span>
                </span>
              );
            })}
            {/* Ghost seats: capacity, not census — silhouettes always render;
                the count line only when real members sit behind the glass. */}
            <span className="community-context-members-frost" aria-hidden="true">
              {Array.from({ length: 3 }).map((_, index) => (
                <span key={index} className="community-context-member community-context-member-ghost">
                  <span className="community-context-member-avatar" />
                  <span className="community-context-member-ghost-bar" />
                </span>
              ))}
              <span className="community-context-members-frost-more">
                <Lock size={12} strokeWidth={2} aria-hidden="true" />
                {knownMemberCount !== null && knownMemberCount > (props.membersPreview?.length ?? 0)
                  ? `+${knownMemberCount - (props.membersPreview?.length ?? 0)} more when you're in`
                  : "Members appear here as they join"}
              </span>
            </span>
          </button>
        ) : lockedMembers ? (
          <button
            type="button"
            className="community-context-locked"
            onClick={() => props.onLockedSectionActivate?.("members")}
          >
            <Lock size={15} strokeWidth={1.9} aria-hidden="true" />
            <span>See who&apos;s here when you&apos;re in.</span>
          </button>
        ) : null}
        {!lockedMembers ? members.map(member => renderMember(member, isAdminRole(member, props.ownerId))) : null}
        {!lockedMembers && (
          props.isLoadingPresence || (loadedMemberCount === 0 && props.isLoadingMembers)
        ) ? (
          <div className="community-context-members-loading" aria-label="Loading members">
            {Array.from({ length: Math.max(2, Math.min(6, loadedMemberCount || 6)) }).map((_, index) => (
              <div className="community-context-member community-context-member-skeleton" key={index}>
                <span className="community-context-member-avatar web-skeleton-block" />
                <span
                  className={`community-context-member-skeleton-name web-skeleton-row${
                    index % 3 === 1 ? " is-short" : ""
                  }`}
                />
              </div>
            ))}
          </div>
        ) : null}
        {!lockedMembers && !props.isLoadingPresence && shouldShowMembersFooter ? (
          <div
            ref={props.membersHasMore ? loadMoreSentinelRef : undefined}
            className="community-context-members-footer"
          >
            {membersFooterLabel}
          </div>
        ) : null}
        {props.membersLoadError && !props.membersHasMore ? (
          <div className="community-context-members-status">Could not load members.</div>
        ) : null}
        {props.membersLoadError && props.membersHasMore ? (
          <button
            className="community-context-members-retry"
            type="button"
            onClick={() => requestLoadMoreMembers({ force: true })}
            disabled={props.isLoadingMoreMembers}
          >
            Could not load more members. Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
