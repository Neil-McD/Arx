import { useCallback, useEffect, useRef, useState, type UIEvent } from "react";
import { Check, ChevronDown, Lock, MessageCircle, MoreHorizontal, X } from "lucide-react";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { CommunityMemoryGraphPreview } from "./CommunityMemoryGraphPreview";
import type {
  CloudCommunityPolynetOverview,
  CloudCommunityPolynetOverviewNode,
} from "../../../../shared/cloudCommunityPolynetGateway";

const PENDING_JOIN_REQUEST_DISPLAY_LIMIT = 200;

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
  entryPolicy?: CommunityAdmissionEntryPolicy | null;
  canSetFreeAccessMode?: boolean;
  isSettingFreeAccessMode?: boolean;
  freeAccessModeError?: string | null;
  onSetFreeAccessMode?: (mode: "open" | "approval") => Promise<void> | void;
  canReviewJoinRequests?: boolean;
  joinReviewMode?: "paid" | "free_auto" | "free_approval" | null;
  pendingJoinRequests?: CommunityAdmissionJoinRequest[] | null;
  isLoadingJoinRequests?: boolean;
  joinRequestsError?: string | null;
  decidingJoinRequestId?: string | null;
  onApproveJoinRequest?: (requestId: string) => Promise<void> | void;
  onDenyJoinRequest?: (requestId: string) => Promise<void> | void;
  memoryOverview?: CloudCommunityPolynetOverview | null;
  isLoadingMemory?: boolean;
  memoryLoadError?: string | null;
  onRefreshMemory?: () => void;
  onOpenMemory?: () => void;
  /* Visitor mode: sections render a visible lock body instead of live data.
     Headers keep their true counts — gate the content, show the metadata. */
  lockedSections?: { members?: boolean; memory?: boolean } | null;
  onLockedSectionActivate?: (section: "members" | "memory") => void;
  memoryCountLabelOverride?: string | null;
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

function formatMemoryLabel(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "Untitled";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatMemoryCount(overview: CloudCommunityPolynetOverview | null): string | null {
  if (!overview) return null;
  const count = overview.memory.total_visible_nodes;
  if (!Number.isFinite(count)) return null;
  return `${count}${overview.memory.node_counts_are_lower_bound ? "+" : ""}`;
}

function isDirectoryMemoryNode(node: CloudCommunityPolynetOverviewNode): boolean {
  return node.kind === "directory_node";
}

// The community context rail (chat right column, resting state): community name,
// a face pile of who's online (Skool), a memory section that fills in as the room
// accumulates knowledge (Polynet), and a grouped member roster (Discord).
export function CommunityContextPanel(props: CommunityContextPanelProps) {
  const online = props.onlineUserIds ?? new Set<string>();
  const members = props.members ?? [];
  const faces = (props.onlineFaces ?? []).slice(0, FACE_LIMIT);
  const pendingJoinRequests = props.pendingJoinRequests ?? [];
  const hasPendingJoinRequestOverflow =
    pendingJoinRequests.length > PENDING_JOIN_REQUEST_DISPLAY_LIMIT;
  const visiblePendingJoinRequests = hasPendingJoinRequestOverflow
    ? pendingJoinRequests.slice(0, PENDING_JOIN_REQUEST_DISPLAY_LIMIT)
    : pendingJoinRequests;
  const onlineTotal = typeof props.onlineCount === "number" ? props.onlineCount : faces.length;
  const extraFaces = Math.max(0, onlineTotal - faces.length);
  const knownMemberCount = typeof props.memberCount === "number" ? props.memberCount : null;
  const loadedMemberCount = members.length;
  const memberCountLabel = knownMemberCount !== null
    ? String(knownMemberCount)
    : `${loadedMemberCount}${props.membersHasMore ? "+" : ""}`;
  const memoryOverview = props.memoryOverview ?? null;
  const hasRetainedMemory = (memoryOverview?.graph.nodes ?? []).some(isDirectoryMemoryNode);
  const lockedMembers = Boolean(props.lockedSections?.members);
  const lockedMemory = Boolean(props.lockedSections?.memory);
  /* Visitor lens: an empty memory is young, not locked — plain header, the
     member view's own "builds as the room shares knowledge" state. */
  const showLockedEmptyMemory = lockedMemory && Boolean(memoryOverview) && !hasRetainedMemory;
  const memoryCountLabel = showLockedEmptyMemory
    ? null
    : formatMemoryCount(memoryOverview) ?? props.memoryCountLabelOverride ?? null;
  const memorySectionLabel = memoryCountLabel ? `Memory — ${memoryCountLabel}` : "Memory";
  const memoryActivityLabel = memoryOverview
    ? formatMemoryLabel(memoryOverview.agent.activity_state || memoryOverview.agent.status)
    : null;

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
  const hasUnloadedKnownMembers =
    knownMemberCount !== null && loadedMemberCount < knownMemberCount;
  const shouldShowMembersFooter =
    loadedMemberCount > 0 || props.membersHasMore || hasUnloadedKnownMembers;
  const loadMoreRequestedRef = useRef(false);
  const membersViewportRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const [joinRequestsExpanded, setJoinRequestsExpanded] = useState(false);
  const entryPolicy = props.entryPolicy ?? null;
  const isFreeAdmissionMode = entryPolicy === "open" || entryPolicy === "approval";
  const autoJoinEnabled = entryPolicy === "open";
  const canShowFreeAccessSwitch = Boolean(
    isFreeAdmissionMode &&
      props.canSetFreeAccessMode &&
      props.onSetFreeAccessMode,
  );
  const pendingJoinRequestCount = visiblePendingJoinRequests.length;
  const canShowJoinRequests = Boolean(
    props.canReviewJoinRequests &&
      props.joinReviewMode === "free_approval" &&
      (pendingJoinRequests.length > 0 || props.isLoadingJoinRequests || props.joinRequestsError),
  );
  const requestCountLabel =
    hasPendingJoinRequestOverflow ? "200+" : String(pendingJoinRequestCount);
  const requestChipLabel =
    pendingJoinRequestCount > 0 ? requestCountLabel : "Requests";
  const requestChipAriaLabel = hasPendingJoinRequestOverflow
    ? "200 or more pending join requests"
    : pendingJoinRequestCount > 0
      ? `${pendingJoinRequestCount} pending join request${pendingJoinRequestCount === 1 ? "" : "s"}`
      : "Join requests";
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

  const handleToggleFreeAccessMode = useCallback(() => {
    if (!canShowFreeAccessSwitch || props.isSettingFreeAccessMode) return;
    const nextMode = autoJoinEnabled ? "approval" : "open";
    void props.onSetFreeAccessMode?.(nextMode);
  }, [
    autoJoinEnabled,
    canShowFreeAccessSwitch,
    props.isSettingFreeAccessMode,
    props.onSetFreeAccessMode,
  ]);

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
    return (
      <div key={member.id} className={`community-context-member${isOnline ? "" : " is-offline"}`}>
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
            {member.avatar_url ? <img src={member.avatar_url} alt="" /> : <span>{props.getInitials(name)}</span>}
            {isOnline ? <span className="community-context-member-dot" aria-hidden="true" /> : null}
          </span>
          <span className={`community-context-member-name${isAdmin ? " is-admin" : ""}`}>{name}</span>
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
            disabled={isDeciding}
            aria-label={`Approve ${name}`}
            title="Approve"
            onClick={() => void props.onApproveJoinRequest?.(request.id)}
          >
            <Check size={14} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button
            className="community-context-request-action is-danger"
            type="button"
            disabled={isDeciding}
            aria-label={`Deny ${name}`}
            title="Deny"
            onClick={() => void props.onDenyJoinRequest?.(request.id)}
          >
            <X size={14} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
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
        <div className="community-context-memory-head">
          <div className="community-context-section">{memorySectionLabel}</div>
        </div>
        {lockedMemory && memoryOverview ? (
          <div className="community-context-memory-summary">
            <div
              className="community-context-memory-preview community-context-memory-inert"
              aria-label="Community memory graph preview"
            >
              <CommunityMemoryGraphPreview overview={memoryOverview} />
            </div>
            {showLockedEmptyMemory ? (
              <div className="community-context-memory-status">
                <span>Builds as the room shares knowledge</span>
              </div>
            ) : (
              <button
                type="button"
                className="community-context-locked-hint"
                onClick={() => props.onLockedSectionActivate?.("memory")}
              >
                <Lock size={12} strokeWidth={2} aria-hidden="true" />
                <span>Everything this community has learned. Unlocks when you join.</span>
              </button>
            )}
          </div>
        ) : lockedMemory ? (
          /* Overview still in flight: render nothing rather than a card that
             the graph will replace a beat later — absent beats flicker. */
          null
        ) : props.isLoadingMemory && !memoryOverview ? (
          <div className="community-context-memory-empty">
            <span>Loading memory...</span>
          </div>
        ) : props.memoryLoadError ? (
          <div className="community-context-memory-error">
            <span>Could not load memory.</span>
            {props.onRefreshMemory ? (
              <button type="button" onClick={props.onRefreshMemory}>
                Retry
              </button>
            ) : null}
          </div>
        ) : memoryOverview ? (
          <div className="community-context-memory-summary">
            {props.onOpenMemory ? (
              <button
                type="button"
                className="community-context-memory-preview is-interactive"
                onClick={props.onOpenMemory}
                aria-label="Open community memory"
                title="Open community memory"
              >
                <CommunityMemoryGraphPreview overview={memoryOverview} />
              </button>
            ) : (
              <div className="community-context-memory-preview">
                <CommunityMemoryGraphPreview overview={memoryOverview} />
              </div>
            )}
            <div className="community-context-memory-status">
              {hasRetainedMemory ? (
                <>
                  <span>{memoryActivityLabel ?? "Memory active"}</span>
                  {memoryOverview.graph.has_more_nodes ? <span>More retained</span> : null}
                </>
              ) : (
                <>
                  <span>Builds as the room shares knowledge</span>
                  {memoryActivityLabel ? <span>{memoryActivityLabel}</span> : null}
                </>
              )}
            </div>
          </div>
        ) : (
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
        )}
      </div>

      <div
        ref={membersViewportRef}
        className="community-context-members"
        onScroll={handleMembersScroll}
      >
        <div className="community-context-section community-context-members-total">
          <span>Members — {memberCountLabel}</span>
          <div className="community-context-members-controls">
            {canShowFreeAccessSwitch ? (
              <button
                className={`community-context-autojoin${autoJoinEnabled ? " is-on" : ""}`}
                type="button"
                role="switch"
                aria-checked={autoJoinEnabled}
                aria-label={`Auto-join is ${autoJoinEnabled ? "on" : "off"}`}
                disabled={props.isSettingFreeAccessMode}
                onClick={handleToggleFreeAccessMode}
                title={autoJoinEnabled ? "Auto-join on" : "Auto-join off"}
              >
                <span className="community-context-autojoin-label">Auto-join</span>
                <span className="community-context-autojoin-track" aria-hidden="true">
                  <span className="community-context-autojoin-thumb" />
                </span>
              </button>
            ) : null}
            {canShowJoinRequests ? (
              <button
                className={`community-context-request-chip${joinRequestsExpanded ? " is-open" : ""}`}
                type="button"
                aria-expanded={joinRequestsExpanded}
                aria-label={requestChipAriaLabel}
                onClick={() => setJoinRequestsExpanded((expanded) => !expanded)}
              >
                <span>{requestChipLabel}</span>
                <ChevronDown size={13} strokeWidth={2.1} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
        {props.freeAccessModeError ? (
          <div className="community-context-admission-status">{props.freeAccessModeError}</div>
        ) : null}
        {canShowJoinRequests && joinRequestsExpanded ? (
          <div className="community-context-request-panel">
            {props.isLoadingJoinRequests && pendingJoinRequestCount === 0 ? (
              <div className="community-context-admission-status">Loading requests...</div>
            ) : null}
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
                    {face.avatar_url ? (
                      <img src={face.avatar_url} alt="" />
                    ) : (
                      <span>{face.initials ?? props.getInitials(name)}</span>
                    )}
                  </span>
                  <span className="community-context-member-name">{name}</span>
                </span>
              );
            })}
            {knownMemberCount !== null && knownMemberCount > (props.membersPreview?.length ?? 0) ? (
              <span className="community-context-members-frost" aria-hidden="true">
                {Array.from({ length: Math.min(3, knownMemberCount - (props.membersPreview?.length ?? 0)) }).map(
                  (_, index) => (
                    <span key={index} className="community-context-member community-context-member-ghost">
                      <span className="community-context-member-avatar" />
                      <span className="community-context-member-ghost-bar" />
                    </span>
                  ),
                )}
                <span className="community-context-members-frost-more">
                  <Lock size={12} strokeWidth={2} aria-hidden="true" />+
                  {knownMemberCount - (props.membersPreview?.length ?? 0)} more when you&apos;re in
                </span>
              </span>
            ) : null}
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
        {!lockedMembers && onlineTotal > 0 ? (
          <>
            <div className="community-context-section">Online — {onlineTotal}</div>
            {onlineMembers.map((member) => renderMember(member, isAdminRole(member, props.ownerId)))}
          </>
        ) : null}
        {!lockedMembers && (offlineTotal > 0 || offlineMembers.length > 0) ? (
          <>
            <div className="community-context-section">Offline — {offlineCountLabel}</div>
            {offlineMembers.map((member) => renderMember(member, isAdminRole(member, props.ownerId)))}
          </>
        ) : null}
        {!lockedMembers && loadedMemberCount === 0 && props.isLoadingMembers ? (
          <div className="community-context-members-status">Loading members...</div>
        ) : null}
        {!lockedMembers && shouldShowMembersFooter ? (
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
