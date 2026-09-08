import { useCallback, useEffect, useRef, useState, type UIEvent } from "react";
import { Lock, MoreHorizontal } from "lucide-react";
import { UserAvatar } from "../../../../shared/UserAvatar";
import type {
  CommunityDirectoryMember,
  CommunityPresenceFace,
} from "../../../../shared/communityTypes";

import { CommunityJoinRequestReview, type CommunityJoinRequestReviewProps } from "./CommunityJoinRequestReview";
export type { CommunityAdmissionJoinRequest } from "./CommunityJoinRequestReview";

export type { CommunityPresenceFace } from "../../../../shared/communityTypes";
export type CommunityRailMember = CommunityDirectoryMember;

export type CommunityAdmissionEntryPolicy = "open" | "approval" | "paid_subscription";

type CommunityContextPanelProps = CommunityJoinRequestReviewProps & {
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


// Canonical community member directory and manager controls.
export function CommunityContextPanel(props: CommunityContextPanelProps) {
  const members = props.members ?? [];
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
    const isOwnerMember = member.user_id === props.ownerId || member.role === "owner";
    const canOpenSettings = Boolean(
      props.canManageMembers &&
        props.onOpenMemberSettings &&
        !isOwnerMember &&
        !String(member.id ?? "").startsWith("owner:"),
    );
    return (
      <div key={member.id} className="community-context-member">
        <button
          className="community-context-member-trigger"
          type="button"
          aria-label={`Open ${name}'s profile`}
          onClick={() => props.onOpenMemberProfile?.(member.user_id)}
        >
          <span
            className="community-interaction-avatar-presence"
          >
            <UserAvatar
              className="community-interaction-avatar"
              readyClassName="has-image"
              fallbackClassName="community-interaction-avatar-fallback"
              fallbackStyle={{ backgroundColor: props.getAvatarColor(member.user_id) }}
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
            {isOnline ? <span className="community-interaction-online-dot" aria-hidden="true" /> : null}
          </span>
          <span className="community-context-member-copy">
            <span className={`community-context-member-name${isAdmin ? " is-admin" : ""}`}>{name}</span>
            <span className="community-context-member-role">{isOwnerMember ? "Owner" : member.role || "Member"}</span>
          </span>
        </button>
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
            <MoreHorizontal size={18} aria-hidden="true" />
          </button>
        ) : null}
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
        <CommunityJoinRequestReview {...props} />
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
        {!lockedMembers ? <div className="community-members-list">{members.map(member => renderMember(member, isAdminRole(member, props.ownerId)))}</div> : null}
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
