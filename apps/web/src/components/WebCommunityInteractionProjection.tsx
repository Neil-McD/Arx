import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  MessageCircle,
  MessageSquare,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  EmojiPickerButton,
  QUICK_REACTIONS,
  ReactionSummary,
} from "./communityInteractionRowParts";
import type {
  CommunityInteractionAttachment,
  CommunityInteractionContentBlock,
  CommunityInteractionReplyBundle,
  CommunityInteractionRootBundle,
} from "../../../../shared/cloudCommunityInteractionsGateway";
import { partitionCommunityAttachments } from "../../../../shared/communityAttachmentUi";
import { firstYouTubeEmbedInText } from "../../../../shared/linkEmbedUi";
import { CommunityChatMediaGrid, type CommunityChatMediaImage } from "../../../../shared/CommunityChatMediaGrid";
import {
  CommunityContextPanel,
  type CommunityAdmissionEntryPolicy,
  type CommunityAdmissionJoinRequest,
  type CommunityPresenceFace,
  type CommunityRailMember,
} from "./CommunityContextPanel";
import type { MentionCandidate } from "./communityMentionAutocomplete";
import { CommunityChatMediaPlayers } from "../../../../shared/CommunityChatMediaPlayers";
import { CommunityMemberSettingsDialog } from "./CommunityMemberSettingsDialog";
import {
  WebCommunityChannelHeader,
  type WebCommunityChannelHeaderChannel,
} from "./WebCommunityChannelHeader";
import type { CloudCommunityMemberBillingHistory } from "../../../../shared/cloudCommunityAdminGateway";
import type {
  CommunityTypingPresenceBundle,
  CommunityTypingPresenceUser,
  CommunityPresenceSummary,
  CommunityActivityEvent,
  UserProfile,
} from "../../../../shared/communityTypes";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { ChannelRosterPanel } from "./ChannelRosterPanel";
import {
  MOBILE_READING_MODE_POLICY,
  advanceMobileReadingMode,
  beginMobileReadingModeGesture,
  createMobileReadingModeState,
  forceMobileReadingMode as forceMobileReadingModeState,
  settleMobileReadingMode,
  suppressProgrammaticMobileScroll,
} from "./mobileReadingModePolicy";

export type WebCommunityInteractionProjectionProps = {
  activeCommunityName: string;
  activeChannel?: WebCommunityChannelHeaderChannel | null;
  canManageActiveChannel?: boolean;
  managingChannelId?: string | null;
  manageChannelError?: string | null;
  onClearManageChannelError?: () => void;
  onRenameChannel?: (channelId: string, name: string) => Promise<unknown>;
  onDeleteChannel?: (channel: WebCommunityChannelHeaderChannel) => Promise<boolean>;
  pinnedRoot?: CommunityInteractionRootBundle | null;
  selectedRoot?: CommunityInteractionRootBundle | null;
  isUpdatingPinnedRoot?: boolean;
  pinnedRootError?: string | null;
  canManagePinnedRoot?: boolean;
  onSetPinnedRoot?: (rootId: string | null) => Promise<boolean> | boolean;
  roots: CommunityInteractionRootBundle[];
  activityEvents: CommunityActivityEvent[];
  selectedRootId: string | null;
  mobileThreadPage?: boolean;
  floatingComposers?: boolean;
  replies: CommunityInteractionReplyBundle[];
  isLoadingRoots: boolean;
  isLoadingReplies: boolean;
  error: string | null;
  errorActionLabel?: string;
  repliesError: string | null;
  onSelectRoot: (rootId: string) => void;
  onCloseDrawer: () => void;
  onStartRootReply?: (message: {
    id: string;
    sender_id: string;
    body: string;
    reply_author_label: string;
    mention_candidate: MentionCandidate;
    interaction_root_id: string;
    interaction_reply_id?: string | null;
    legacy_message_id?: string | null;
  }) => void;
  mainComposer?: ReactNode;
  firstRootBodyExpansion?: {
    expanded: boolean;
    onToggle: () => void;
  };
  drawerComposer?: ReactNode;
  onRetryRoots: () => void;
  onRetryReplies: (rootId: string) => void;
  profilesByUserId: Record<string, UserProfile>;
  displayName: (userId: string) => string;
  getAvatarColor: (seed: string) => string;
  getInitials: (value: string) => string;
  formatChatTime: (value: string) => string;
  renderTextWithLinks: (text: string) => ReactNode;
  onToggleReaction?: (targetType: "root" | "reply", targetId: string, emoji: string) => void;
  currentUserId?: string | null;
  onEditMessage?: (targetType: "root" | "reply", targetId: string, text: string) => void;
  onDeleteMessage?: (targetType: "root" | "reply", targetId: string) => void;
  onOpenProfile?: (userId: string) => void;
  onMessageUser?: (userId: string) => void;
  profilePanel?: ReactNode;
  onCloseProfile?: () => void;
  onRetrySend?: (idempotencyKey: string) => void;
  onDiscardPending?: (idempotencyKey: string) => void;
  typingPresence?: CommunityTypingPresenceBundle;
  chatLastSeenAt?: number | null;
  rootChangeReason?: "initial" | "newer" | "older" | "reset";
  canLoadOlderRoots?: boolean;
  isLoadingOlderRoots?: boolean;
  onLoadOlderRoots?: () => void;
  onCaughtUp?: () => void;
  onMobileReadingModeChange?: (active: boolean) => void;
  onOpenCommunityChatLightbox?: (images: CommunityChatMediaImage[], index: number) => void;
  presenceSummary?: CommunityPresenceSummary | null;
  isLoadingCommunityPresence?: boolean;
  onlineUserIds?: Set<string> | null;
  communityMemberCount?: number | null;
  communityMembers?: CommunityRailMember[] | null;
  communityMembersHasMore?: boolean;
  isLoadingCommunityMembers?: boolean;
  isLoadingMoreCommunityMembers?: boolean;
  communityMembersLoadError?: string | null;
  onLoadMoreCommunityMembers?: () => void;
  communityId?: string | null;
  communityOwnerId?: string | null;
  canManageCommunityMembers?: boolean;
  canReviewCommunityJoinRequests?: boolean;
  communityJoinReviewMode?: "paid" | "free_auto" | "free_approval" | null;
  communityJoinRequests?: CommunityAdmissionJoinRequest[] | null;
  isLoadingCommunityJoinRequests?: boolean;
  communityJoinRequestsError?: string | null;
  decidingCommunityJoinRequestId?: string | null;
  onApproveCommunityJoinRequest?: (requestId: string) => Promise<void> | void;
  onDenyCommunityJoinRequest?: (requestId: string) => Promise<void> | void;
  contextPanelLockedSections?: { members?: boolean; memory?: boolean } | null;
  onContextPanelLockedSectionActivate?: (section: "members" | "memory") => void;
  contextPanelMembersPreview?: CommunityPresenceFace[] | null;
  canViewMemberPlanDetails?: boolean;
  isActiveCommunityOwner?: boolean;
  communityInitials?: (value: string) => string;
  onSetCommunityMemberRole?: (membershipId: string, role: "admin" | "moderator" | "member") => Promise<void> | void;
  onRemoveCommunityMember?: (membershipId: string) => Promise<void> | void;
  onBanCommunityMember?: (membershipId: string) => Promise<void> | void;
  loadMemberBillingHistory?: (membershipId: string) => Promise<CloudCommunityMemberBillingHistory | null>;
};

import {
  ActorAvatar,
  CommunityInteractionFeedList,
  EditForm,
  InteractionAttachments,
  InteractionContent,
  MessageActions,
  OverflowMenu,
  ProfileHoverCard,
  TypingIndicator,
  actorLabel,
  agentBadgeLabel,
  blockText,
  bundleText,
  formatRelativeTime,
  hostnameOf,
  kindChipLabel,
  sortedBlocks,
  stripSharedAttachmentSummary,
} from "./communityInteractionFeed";
import { interactionMentionsViewer } from "../controllers/communityMentionAttention";
import { CommunityPinnedRootSurface } from "./CommunityPinnedRootSurface";

const COMMUNITY_CONTEXT_PROJECTION_KEYS = [
  "activeCommunityName",
  "presenceSummary",
  "isLoadingCommunityPresence",
  "onlineUserIds",
  "communityMemberCount",
  "communityMembers",
  "communityMembersHasMore",
  "isLoadingCommunityMembers",
  "isLoadingMoreCommunityMembers",
  "communityMembersLoadError",
  "onLoadMoreCommunityMembers",
  "communityId",
  "communityOwnerId",
  "canManageCommunityMembers",
  "canReviewCommunityJoinRequests",
  "communityJoinReviewMode",
  "communityJoinRequests",
  "isLoadingCommunityJoinRequests",
  "communityJoinRequestsError",
  "decidingCommunityJoinRequestId",
  "onApproveCommunityJoinRequest",
  "onDenyCommunityJoinRequest",
  "contextPanelLockedSections",
  "onContextPanelLockedSectionActivate",
  "contextPanelMembersPreview",
  "onOpenProfile",
  "onMessageUser",
  "currentUserId",
  "displayName",
  "getInitials",
  "getAvatarColor",
  "canViewMemberPlanDetails",
  "isActiveCommunityOwner",
  "communityInitials",
  "onSetCommunityMemberRole",
  "onRemoveCommunityMember",
  "onBanCommunityMember",
  "loadMemberBillingHistory",
] as const satisfies readonly (keyof WebCommunityInteractionProjectionProps)[];

type CommunityContextProjectionProps = Pick<
  WebCommunityInteractionProjectionProps,
  (typeof COMMUNITY_CONTEXT_PROJECTION_KEYS)[number]
> & {
  containerClassName?: string;
  ariaLabel?: string;
  sectionMode?: "all" | "members";
};

function pickCommunityContextProjection(
  props: WebCommunityInteractionProjectionProps & {
    containerClassName?: string;
    ariaLabel?: string;
    sectionMode?: "all" | "members";
  },
): CommunityContextProjectionProps {
  return {
    ...Object.fromEntries(
      COMMUNITY_CONTEXT_PROJECTION_KEYS.map((key) => [key, props[key]]),
    ) as Pick<WebCommunityInteractionProjectionProps, (typeof COMMUNITY_CONTEXT_PROJECTION_KEYS)[number]>,
    containerClassName: props.containerClassName,
    ariaLabel: props.ariaLabel,
    sectionMode: props.sectionMode,
  };
}

const StableCommunityInteractionContextPanelSurface = memo(function StableCommunityInteractionContextPanelSurface(
  props: CommunityContextProjectionProps,
) {
  const [selectedCommunityMemberId, setSelectedCommunityMemberId] = useState<string | null>(null);
  const selectedCommunityMember = useMemo(() => {
    if (!selectedCommunityMemberId) return null;
    return (props.communityMembers ?? []).find((member) => member.id === selectedCommunityMemberId) ?? null;
  }, [props.communityMembers, selectedCommunityMemberId]);
  const canManageCommunityMembers = Boolean(
    props.canManageCommunityMembers &&
      props.communityId &&
      props.onSetCommunityMemberRole &&
      props.onRemoveCommunityMember &&
      props.onBanCommunityMember,
  );
  const communityMemberSettingsCommunity = props.communityId
    ? {
        id: props.communityId,
        owner_id: props.communityOwnerId ?? null,
      }
    : null;

  useEffect(() => {
    if (!selectedCommunityMemberId) return;
    if (!canManageCommunityMembers) {
      setSelectedCommunityMemberId(null);
      return;
    }
    if (selectedCommunityMember) return;
    setSelectedCommunityMemberId(null);
  }, [canManageCommunityMembers, selectedCommunityMember, selectedCommunityMemberId]);

  return (
    <>
      <aside
        className={props.containerClassName ?? "community-interaction-drawer community-context-panel"}
        aria-label={props.ariaLabel ?? "Community"}
      >
        <CommunityContextPanel
          sectionMode={props.sectionMode}
          communityName={props.activeCommunityName}
          onlineFaces={props.presenceSummary?.online_faces ?? null}
          onlineCount={props.presenceSummary?.online_count ?? null}
          onlineCountCapped={Boolean(props.presenceSummary?.online_count_capped)}
          isLoadingPresence={props.isLoadingCommunityPresence}
          onlineUserIds={props.onlineUserIds ?? null}
          memberCount={props.communityMemberCount ?? props.presenceSummary?.member_count ?? null}
          members={props.communityMembers ?? null}
          membersHasMore={props.communityMembersHasMore}
          isLoadingMembers={props.isLoadingCommunityMembers}
          isLoadingMoreMembers={props.isLoadingMoreCommunityMembers}
          membersLoadError={props.communityMembersLoadError}
          onLoadMoreMembers={props.onLoadMoreCommunityMembers}
          ownerId={props.communityOwnerId ?? null}
          canManageMembers={canManageCommunityMembers}
          canReviewJoinRequests={props.canReviewCommunityJoinRequests}
          joinReviewMode={props.communityJoinReviewMode}
          pendingJoinRequests={props.communityJoinRequests ?? null}
          isLoadingJoinRequests={props.isLoadingCommunityJoinRequests}
          joinRequestsError={props.communityJoinRequestsError}
          decidingJoinRequestId={props.decidingCommunityJoinRequestId}
          onApproveJoinRequest={props.onApproveCommunityJoinRequest}
          onDenyJoinRequest={props.onDenyCommunityJoinRequest}
          lockedSections={props.contextPanelLockedSections ?? null}
          onLockedSectionActivate={props.onContextPanelLockedSectionActivate}
          membersPreview={props.contextPanelMembersPreview ?? null}
          onOpenMemberSettings={(member) => setSelectedCommunityMemberId(member.id)}
          onOpenMemberProfile={props.onOpenProfile}
          onMessageMember={props.onMessageUser}
          currentUserId={props.currentUserId}
          displayName={props.displayName}
          getInitials={props.getInitials}
          getAvatarColor={props.getAvatarColor}
        />
      </aside>
      <CommunityMemberSettingsDialog
        member={selectedCommunityMember}
        activeCommunity={communityMemberSettingsCommunity}
        canManageMembers={canManageCommunityMembers}
        canViewMemberPlanDetails={Boolean(props.canViewMemberPlanDetails)}
        isActiveCommunityOwner={Boolean(props.isActiveCommunityOwner)}
        onClose={() => setSelectedCommunityMemberId(null)}
        displayName={props.displayName}
        getInitials={props.getInitials}
        communityInitials={props.communityInitials ?? props.getInitials}
        handleSetCommunityMemberRole={(membershipId, role) =>
          props.onSetCommunityMemberRole?.(membershipId, role)
        }
        handleRemoveCommunityMember={(membershipId) =>
          props.onRemoveCommunityMember?.(membershipId)
        }
        handleBanCommunityMember={(membershipId) =>
          props.onBanCommunityMember?.(membershipId)
        }
        loadMemberBillingHistory={(membershipId) =>
          props.loadMemberBillingHistory?.(membershipId) ?? Promise.resolve(null)
        }
      />
    </>
  );
});

export function CommunityInteractionContextPanelSurface(
  props: WebCommunityInteractionProjectionProps & {
    containerClassName?: string;
    ariaLabel?: string;
    sectionMode?: "all" | "members";
  },
) {
  return <StableCommunityInteractionContextPanelSurface {...pickCommunityContextProjection(props)} />;
}

export function resolveSelectedCommunityInteractionRoot(
  roots: CommunityInteractionRootBundle[],
  selectedRoot: CommunityInteractionRootBundle | null | undefined,
  pinnedRoot: CommunityInteractionRootBundle | null | undefined,
  selectedRootId: string | null,
): CommunityInteractionRootBundle | null {
  if (!selectedRootId) return null;
  return roots.find((bundle) => bundle.root.id === selectedRootId)
    ?? (selectedRoot?.root.id === selectedRootId ? selectedRoot : null)
    ?? (pinnedRoot?.root.id === selectedRootId ? pinnedRoot : null);
}

export function communityInteractionRootHasRichContent(
  bundle: CommunityInteractionRootBundle,
): boolean {
  return bundle.attachments.length > 0
    || firstYouTubeEmbedInText(bundleText(bundle.content_blocks, bundle.root.content_summary)) !== null;
}


export function WebCommunityInteractionProjection(props: WebCommunityInteractionProjectionProps) {
  const mainRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const drawerScrollRef = useRef<HTMLDivElement | null>(null);
  const drawerComposerRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const isMainComposerFocusedRef = useRef(false);
  const mobileReadingModeStateRef = useRef(createMobileReadingModeState());
  const pendingMobileScrollFrameRef = useRef<number | null>(null);
  const mobileScrollSettleTimerRef = useRef<number | null>(null);
  const requestedOlderRootsRef = useRef(false);
  const pendingOlderAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const seenReplyIds = useRef<Set<string>>(new Set());
  const repliesLoadedOnce = useRef(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [editing, setEditing] = useState<{ type: "root" | "reply"; id: string } | null>(null);
  const [editText, setEditText] = useState("");

  const publishMobileReadingMode = useCallback((active: boolean) => {
    props.onMobileReadingModeChange?.(active);
  }, [props.onMobileReadingModeChange]);

  const forceMobileReadingMode = useCallback((active: boolean) => {
    const result = forceMobileReadingModeState(
      mobileReadingModeStateRef.current,
      active,
      performance.now(),
    );
    mobileReadingModeStateRef.current = result.state;
    if (result.changed) publishMobileReadingMode(result.state.active);
  }, [publishMobileReadingMode]);

  const prepareProgrammaticMobileScroll = useCallback((
    durationMs: number,
    forceVisible = false,
  ) => {
    const result = suppressProgrammaticMobileScroll(
      mobileReadingModeStateRef.current,
      performance.now(),
      durationMs,
      forceVisible,
    );
    mobileReadingModeStateRef.current = result.state;
    if (result.changed) publishMobileReadingMode(result.state.active);
  }, [publishMobileReadingMode]);

  const startEdit = (type: "root" | "reply", id: string, body: string) => {
    setEditing({ type, id });
    setEditText(body);
  };
  const cancelEdit = () => setEditing(null);
  const saveEdit = () => {
    if (!editing) return;
    const text = editText.trim();
    if (text) props.onEditMessage?.(editing.type, editing.id, text);
    setEditing(null);
  };

  const scrollToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    prepareProgrammaticMobileScroll(
      MOBILE_READING_MODE_POLICY.smoothProgrammaticScrollLockMs,
      true,
    );
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setShowJumpToLatest(false);
  };

  const processFeedScroll = () => {
    pendingMobileScrollFrameRef.current = null;
    const el = scrollRef.current;
    if (!el) return;
    const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    const clampedScrollTop = Math.min(Math.max(0, el.scrollTop), maxScrollTop);
    const distanceFromBottom = maxScrollTop - clampedScrollTop;
    isNearBottomRef.current = distanceFromBottom < 120;

    if (props.onMobileReadingModeChange) {
      const result = advanceMobileReadingMode(mobileReadingModeStateRef.current, {
        scrollTop: el.scrollTop,
        maxScrollTop,
        nowMs: performance.now(),
        composerFocused: isMainComposerFocusedRef.current,
      });
      mobileReadingModeStateRef.current = result.state;
      if (result.changed) publishMobileReadingMode(result.state.active);
    }
    if (distanceFromBottom < 120) {
      setShowJumpToLatest(false);
      props.onCaughtUp?.();
    }
    if (
      el.scrollTop < 180
      && props.canLoadOlderRoots
      && !props.isLoadingOlderRoots
      && !requestedOlderRootsRef.current
    ) {
      pendingOlderAnchorRef.current = {
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
      };
      requestedOlderRootsRef.current = true;
      props.onLoadOlderRoots?.();
    }
  };

  const handleFeedScroll = () => {
    if (props.onMobileReadingModeChange) {
      if (mobileScrollSettleTimerRef.current !== null) {
        window.clearTimeout(mobileScrollSettleTimerRef.current);
      }
      mobileScrollSettleTimerRef.current = window.setTimeout(() => {
        mobileScrollSettleTimerRef.current = null;
        const el = scrollRef.current;
        if (!el) return;
        const result = settleMobileReadingMode(mobileReadingModeStateRef.current, {
          scrollTop: el.scrollTop,
          maxScrollTop: Math.max(0, el.scrollHeight - el.clientHeight),
          nowMs: performance.now(),
          composerFocused: isMainComposerFocusedRef.current,
        });
        mobileReadingModeStateRef.current = result.state;
        if (result.changed) publishMobileReadingMode(result.state.active);
      }, MOBILE_READING_MODE_POLICY.scrollSettleMs);
    }
    if (pendingMobileScrollFrameRef.current !== null) return;
    pendingMobileScrollFrameRef.current = requestAnimationFrame(processFeedScroll);
  };

  const handleFeedTouchStart = () => {
    if (!props.onMobileReadingModeChange) return;
    const el = scrollRef.current;
    if (!el) return;
    if (mobileScrollSettleTimerRef.current !== null) {
      window.clearTimeout(mobileScrollSettleTimerRef.current);
      mobileScrollSettleTimerRef.current = null;
    }
    mobileReadingModeStateRef.current = beginMobileReadingModeGesture(
      mobileReadingModeStateRef.current,
      el.scrollTop,
      Math.max(0, el.scrollHeight - el.clientHeight),
      performance.now(),
    );
  };

  useEffect(() => {
    if (!props.isLoadingOlderRoots) requestedOlderRootsRef.current = false;
  }, [props.isLoadingOlderRoots]);

  useEffect(() => {
    if (props.onMobileReadingModeChange) return;
    mobileReadingModeStateRef.current = createMobileReadingModeState();
  }, [props.onMobileReadingModeChange]);

  useEffect(() => () => {
    if (pendingMobileScrollFrameRef.current !== null) {
      cancelAnimationFrame(pendingMobileScrollFrameRef.current);
      pendingMobileScrollFrameRef.current = null;
    }
    if (mobileScrollSettleTimerRef.current !== null) {
      window.clearTimeout(mobileScrollSettleTimerRef.current);
      mobileScrollSettleTimerRef.current = null;
    }
    props.onMobileReadingModeChange?.(false);
  }, [props.onMobileReadingModeChange]);

  useLayoutEffect(() => {
    const main = mainRef.current;
    const composer = composerRef.current;
    if (!main || !composer) {
      main?.style.removeProperty("--mobile-community-composer-height");
      return;
    }

    const syncComposerHeight = () => {
      main.style.setProperty(
        "--mobile-community-composer-height",
        `${Math.ceil(composer.getBoundingClientRect().height)}px`,
      );
      if (props.floatingComposers && isNearBottomRef.current) {
        requestAnimationFrame(() => {
          const scroll = scrollRef.current;
          if (scroll) {
            prepareProgrammaticMobileScroll(
              MOBILE_READING_MODE_POLICY.instantProgrammaticScrollLockMs,
              true,
            );
            scroll.scrollTop = scroll.scrollHeight;
          }
        });
      }
    };
    syncComposerHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncComposerHeight);
    observer.observe(composer);
    return () => {
      observer.disconnect();
      main.style.removeProperty("--mobile-community-composer-height");
    };
  }, [prepareProgrammaticMobileScroll, props.floatingComposers, props.mainComposer]);

  useLayoutEffect(() => {
    const composer = drawerComposerRef.current;
    if (!composer || !props.selectedRootId || !props.floatingComposers) return;

    const followLatestAfterComposerResize = () => {
      const scroll = drawerScrollRef.current;
      const shouldFollowReplies = scroll && repliesLoadedOnce.current
        ? scroll.scrollHeight <= scroll.clientHeight || (
            scroll.scrollTop > 0 &&
            scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 120
          )
        : false;
      if (shouldFollowReplies) {
        requestAnimationFrame(() => {
          const nextScroll = drawerScrollRef.current;
          if (nextScroll) nextScroll.scrollTop = nextScroll.scrollHeight;
        });
      }
    };

    followLatestAfterComposerResize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(followLatestAfterComposerResize);
    observer.observe(composer);
    return () => observer.disconnect();
  }, [props.drawerComposer, props.floatingComposers, props.selectedRootId]);

  const rootWindowSignature = useMemo(
    () => props.roots.map((bundle) => bundle.root.id).join("|"),
    [props.roots],
  );
  const activityWindowSignature = useMemo(
    () => props.activityEvents.map((event) => event.id).join("|"),
    [props.activityEvents],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const reason = props.rootChangeReason ?? "newer";
    if (reason === "reset") {
      pendingOlderAnchorRef.current = null;
      prepareProgrammaticMobileScroll(
        MOBILE_READING_MODE_POLICY.instantProgrammaticScrollLockMs,
        true,
      );
      setShowJumpToLatest(false);
      return;
    }
    if (reason === "older") {
      const anchor = pendingOlderAnchorRef.current;
      pendingOlderAnchorRef.current = null;
      if (anchor) {
        prepareProgrammaticMobileScroll(
          MOBILE_READING_MODE_POLICY.instantProgrammaticScrollLockMs,
        );
        el.scrollTop = Math.max(0, el.scrollHeight - anchor.scrollHeight + anchor.scrollTop);
      }
      return;
    }
    if (reason === "initial") {
      prepareProgrammaticMobileScroll(
        MOBILE_READING_MODE_POLICY.instantProgrammaticScrollLockMs,
        true,
      );
      el.scrollTop = el.scrollHeight;
      isNearBottomRef.current = true;
      setShowJumpToLatest(false);
      props.onCaughtUp?.();
      return;
    }
    if (reason === "newer") {
      if (isNearBottomRef.current) {
        prepareProgrammaticMobileScroll(
          MOBILE_READING_MODE_POLICY.instantProgrammaticScrollLockMs,
          true,
        );
        el.scrollTop = el.scrollHeight;
        setShowJumpToLatest(false);
        props.onCaughtUp?.();
      } else {
        setShowJumpToLatest(true);
      }
    }
  }, [
    activityWindowSignature,
    prepareProgrammaticMobileScroll,
    props.rootChangeReason,
    rootWindowSignature,
  ]);

  // Reset reply animation tracking on thread switch so a thread's initial replies don't animate.
  useEffect(() => {
    repliesLoadedOnce.current = false;
    seenReplyIds.current = new Set();
  }, [props.selectedRootId]);

  useEffect(() => {
    for (const bundle of props.replies) seenReplyIds.current.add(bundle.reply.id);
    repliesLoadedOnce.current = true;
  }, [props.replies]);

  const selectedRoot = resolveSelectedCommunityInteractionRoot(
    props.roots,
    props.selectedRoot,
    props.pinnedRoot,
    props.selectedRootId,
  );
  const selectedRootLabel = selectedRoot
    ? actorLabel(selectedRoot.root, props.displayName, props.activeCommunityName)
    : "";
  const selectedRootText = selectedRoot
    ? stripSharedAttachmentSummary(
        bundleText(selectedRoot.content_blocks, selectedRoot.root.content_summary),
        selectedRoot.attachments.length > 0,
      )
    : "";
  const selectedRootChip = selectedRoot ? kindChipLabel(selectedRoot.root.kind) : null;
  const selectedRootBadge = selectedRoot ? agentBadgeLabel(selectedRoot.root.actor_type) : null;
  const isMobileThreadPage = Boolean(props.mobileThreadPage && selectedRoot && !props.profilePanel);
  const ThreadSurface = isMobileThreadPage ? "section" : "aside";
  const hasDetailPanel = Boolean(selectedRoot || props.profilePanel);

  const replyById = new Map(props.replies.map((bundle) => [bundle.reply.id, bundle] as const));

  return (
    <>
    <div className={`community-interaction-projection${hasDetailPanel ? " has-drawer" : props.communityId ? " has-channel-context" : ""}${isMobileThreadPage ? " mobile-thread-page-open" : ""}`}>
      <div className="community-interaction-main" ref={mainRef}>
        {props.activeChannel ? (
          <WebCommunityChannelHeader
            channel={props.activeChannel}
            canManage={Boolean(props.canManageActiveChannel)}
            managingChannelId={props.managingChannelId}
            manageChannelError={props.manageChannelError}
            clearManageChannelError={props.onClearManageChannelError}
            onRenameChannel={props.onRenameChannel}
            onDeleteChannel={props.onDeleteChannel}
          />
        ) : null}
        {props.pinnedRoot ? (
          <CommunityPinnedRootSurface
            hasRichContent={communityInteractionRootHasRichContent(props.pinnedRoot)}
            selected={props.pinnedRoot.root.id === props.selectedRootId}
            canUnpin={Boolean(props.canManagePinnedRoot && props.onSetPinnedRoot)}
            isUnpinning={Boolean(props.isUpdatingPinnedRoot)}
            onUnpin={() => void props.onSetPinnedRoot?.(null)}
            onOpen={() => props.onSelectRoot(props.pinnedRoot!.root.id)}
            openLabel={`View full pinned post by ${actorLabel(
              props.pinnedRoot.root,
              props.displayName,
              props.activeCommunityName,
            )}`}
          >
            <CommunityInteractionFeedList
              {...props}
              key={props.pinnedRoot.root.id}
              roots={[props.pinnedRoot]}
              activityEvents={[]}
              selectedRootId={null}
              chatLastSeenAt={null}
              error={null}
              isLoadingRoots={false}
              firstRootBodyExpansion={undefined}
              canManagePinnedRoot={false}
              onSetPinnedRoot={undefined}
              onEditMessage={undefined}
              onDeleteMessage={undefined}
              showDayDividers={false}
              editing={null}
              editText={editText}
              onStartEdit={startEdit}
              onEditTextChange={setEditText}
              onSaveEdit={saveEdit}
              onCancelEdit={cancelEdit}
            />
          </CommunityPinnedRootSurface>
        ) : null}
        {props.pinnedRootError ? (
          <div className="community-channel-pinned-root-error" role="status">
            {props.pinnedRootError}
          </div>
        ) : null}
        <div
          className="community-interaction-feed-scroll"
          ref={scrollRef}
          onScroll={handleFeedScroll}
          onTouchStart={handleFeedTouchStart}
        >
          <CommunityInteractionFeedList
            {...props}
            editing={editing}
            editText={editText}
            onStartEdit={startEdit}
            onEditTextChange={setEditText}
            onSaveEdit={saveEdit}
            onCancelEdit={cancelEdit}
          />
        </div>
        {showJumpToLatest ? (
          <button type="button" className="community-interaction-jump-latest" onClick={scrollToLatest}>
            <span aria-hidden="true">↓</span> New messages
          </button>
        ) : null}
        {!props.floatingComposers ? (
          <TypingIndicator
            users={(props.typingPresence?.users ?? []).filter(
              (user) => user.user_id !== props.currentUserId && !user.root_id,
            )}
            countCapped={Boolean(props.typingPresence?.total_count_capped)}
            displayName={props.displayName}
            getAvatarColor={props.getAvatarColor}
            getInitials={props.getInitials}
          />
        ) : null}
        {props.mainComposer ? (
          <div
            className="community-interaction-main-composer"
            ref={composerRef}
            onFocusCapture={() => {
              isMainComposerFocusedRef.current = true;
              forceMobileReadingMode(false);
            }}
            onBlurCapture={(event) => {
              const nextTarget = event.relatedTarget;
              if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
              isMainComposerFocusedRef.current = false;
            }}
          >
            {props.floatingComposers ? (
              <TypingIndicator
                users={(props.typingPresence?.users ?? []).filter(
                  (user) => user.user_id !== props.currentUserId && !user.root_id,
                )}
                countCapped={Boolean(props.typingPresence?.total_count_capped)}
                displayName={props.displayName}
                getAvatarColor={props.getAvatarColor}
                getInitials={props.getInitials}
              />
            ) : null}
            {props.mainComposer}
          </div>
        ) : null}
      </div>

      {props.profilePanel ? (
        <aside className="community-interaction-drawer" aria-label="Profile">
          <div className="community-interaction-drawer-back">
            <button
              className="back-to-workspace"
              type="button"
              onClick={props.onCloseProfile}
              title="Back"
            >
              <svg viewBox="0 0 24 24" className="back-icon" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="back-path">profile</span>
            </button>
          </div>
          <div className="community-interaction-drawer-scroll">{props.profilePanel}</div>
        </aside>
      ) : selectedRoot ? (
        <ThreadSurface
          className={`community-interaction-drawer community-interaction-thread-drawer${isMobileThreadPage ? " community-interaction-thread-page" : ""}`}
          aria-label={isMobileThreadPage ? "Thread" : "Thread replies"}
        >
          {!isMobileThreadPage ? <div className="community-interaction-drawer-back">
            <button
              className="back-to-workspace"
              type="button"
              onClick={props.onCloseDrawer}
              title="Back to channel"
            >
              <svg viewBox="0 0 24 24" className="back-icon" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="back-path">thread</span>
            </button>
          </div> : null}
          <div className="community-interaction-drawer-scroll" ref={drawerScrollRef}>
            <div className="community-interaction-drawer-root">
              <div className="community-interaction-thread-anchor">
                <ProfileHoverCard
                  userId={selectedRoot.root.actor_user_id}
                  label={selectedRootLabel}
                  seed={selectedRoot.root.actor_user_id ?? selectedRoot.root.actor_agent_key ?? selectedRoot.root.id}
                  profile={
                    selectedRoot.root.actor_user_id
                      ? props.profilesByUserId[selectedRoot.root.actor_user_id] ?? null
                      : null
                  }
                  getAvatarColor={props.getAvatarColor}
                  getInitials={props.getInitials}
                  currentUserId={props.currentUserId}
                  onOpenProfile={props.onOpenProfile}
                  onMessageUser={props.onMessageUser}
                />
                <div className="community-interaction-thread-anchor-content">
                  <div className="community-interaction-meta-row">
                    <ProfileHoverCard
                      userId={selectedRoot.root.actor_user_id}
                      label={selectedRootLabel}
                      seed={selectedRoot.root.actor_user_id ?? selectedRoot.root.actor_agent_key ?? selectedRoot.root.id}
                      profile={
                        selectedRoot.root.actor_user_id
                          ? props.profilesByUserId[selectedRoot.root.actor_user_id] ?? null
                          : null
                      }
                      getAvatarColor={props.getAvatarColor}
                      getInitials={props.getInitials}
                      currentUserId={props.currentUserId}
                      onOpenProfile={props.onOpenProfile}
                      onMessageUser={props.onMessageUser}
                      triggerClassName="community-interaction-author-trigger"
                    >
                      <span className="community-interaction-author">{selectedRootLabel}</span>
                    </ProfileHoverCard>
                    {selectedRootBadge ? (
                      <span className="community-interaction-badge">{selectedRootBadge}</span>
                    ) : null}
                    {selectedRootChip ? (
                      <span className="community-interaction-kind">{selectedRootChip}</span>
                    ) : null}
                    <span>{props.formatChatTime(selectedRoot.root.created_at)}</span>
                  </div>
                  {selectedRoot.root.title ? (
                    <div className="community-interaction-title">{selectedRoot.root.title}</div>
                  ) : null}
                  <InteractionContent
                    text={selectedRootText}
                    renderTextWithLinks={props.renderTextWithLinks}
                    mentionContext={{
                      mentions: selectedRoot.mentions ?? [],
                      displayName: props.displayName,
                      profilesByUserId: props.profilesByUserId,
                      currentUserId: props.currentUserId,
                      onOpenProfile: props.onOpenProfile,
                      onMessageUser: props.onMessageUser,
                      getAvatarColor: props.getAvatarColor,
                      getInitials: props.getInitials,
                      communityAgentDisplayName: props.activeCommunityName,
                    }}
                    afterBody={(
                      <InteractionAttachments
                        attachments={selectedRoot.attachments}
                        onOpenImage={props.onOpenCommunityChatLightbox}
                      />
                    )}
                  />
                  <div className="community-interaction-thread-anchor-actions">
                    <ReactionSummary
                      rows={selectedRoot.root.reaction_summary}
                      viewerEmojis={selectedRoot.root.viewer_emojis}
                      onToggle={(emoji) => props.onToggleReaction?.("root", selectedRoot.root.id, emoji)}
                    />
                    <EmojiPickerButton
                      className="community-interaction-reaction-add"
                      label="Add reaction"
                      onPick={(emoji) => props.onToggleReaction?.("root", selectedRoot.root.id, emoji)}
                    />
                  </div>
                </div>
              </div>
            </div>
            {props.repliesError ? (
              <div className="community-interaction-state" role="alert">
                <div>{props.repliesError}</div>
                <button type="button" onClick={() => props.onRetryReplies(selectedRoot.root.id)}>Retry</button>
              </div>
            ) : props.isLoadingReplies && props.replies.length === 0 ? (
              <div className="community-interaction-state" aria-live="polite">
                <div>Loading replies...</div>
                <div className="community-interaction-loading web-skeleton-pill" aria-hidden="true" />
              </div>
            ) : props.replies.length === 0 ? (
              <div className="community-interaction-drawer-empty">No replies yet.</div>
            ) : (
              <div className="community-interaction-reply-list">
                {props.replies.map((bundle) => {
                  const reply = bundle.reply;
                  const label = actorLabel(reply, props.displayName, props.activeCommunityName);
                  const profile = reply.actor_user_id ? props.profilesByUserId[reply.actor_user_id] ?? null : null;
                  const body = stripSharedAttachmentSummary(
                    bundleText(bundle.content_blocks, reply.content_summary),
                    bundle.attachments.length > 0,
                  );
                  const badge = agentBadgeLabel(reply.actor_type);
                  const normalizedHandle = String(profile?.handle ?? "").trim().replace(/^@+/, "");
                  const replyMentionCandidate: MentionCandidate | null =
                    reply.actor_type === "community_agent"
                      ? {
                          userId: "community_agent",
                          displayName: props.activeCommunityName,
                          handle: null,
                          avatarUrl: null,
                          kind: "community_agent",
                        }
                      : reply.actor_user_id && normalizedHandle
                        ? {
                            userId: reply.actor_user_id,
                            displayName: label,
                            handle: normalizedHandle,
                            avatarUrl: profile?.avatar_url ?? null,
                            kind: "user",
                          }
                        : null;
                  const isOwnReply = Boolean(
                    props.currentUserId && reply.actor_user_id && reply.actor_user_id === props.currentUserId,
                  );
                  const isEditingReply = editing?.type === "reply" && editing.id === reply.id;
                  const isNewReply = repliesLoadedOnce.current && !seenReplyIds.current.has(reply.id);
                  return (
                    <div key={reply.id} className={`community-interaction-reply${isNewReply ? " is-new" : ""}${interactionMentionsViewer(bundle.mentions, props.currentUserId, reply.actor_user_id) ? " is-self-mentioned" : ""}${bundle.pending ? ` is-pending is-pending-${bundle.pending}` : ""}`}>
                      {bundle.pending ? null : (
                        <MessageActions
                          onReact={(emoji) => props.onToggleReaction?.("reply", reply.id, emoji)}
                          onReply={replyMentionCandidate && props.onStartRootReply
                            ? () => props.onStartRootReply?.({
                                id: reply.legacy_message_id ?? reply.id,
                                sender_id: reply.actor_user_id ?? "community_agent",
                                body,
                                reply_author_label: replyMentionCandidate.displayName,
                                mention_candidate: replyMentionCandidate,
                                interaction_root_id: reply.root_id,
                                interaction_reply_id: reply.id,
                                legacy_message_id: reply.legacy_message_id ?? null,
                              })
                            : undefined}
                          replyLabel="Reply to this message"
                          onEdit={
                            isOwnReply && props.onEditMessage
                              ? () => startEdit("reply", reply.id, body)
                              : undefined
                          }
                          onDelete={
                            isOwnReply && props.onDeleteMessage
                              ? () => {
                                  if (window.confirm("Delete this reply?")) {
                                    props.onDeleteMessage?.("reply", reply.id);
                                  }
                                }
                              : undefined
                          }
                        />
                      )}
                      <ProfileHoverCard
                        userId={reply.actor_user_id}
                        label={label}
                        seed={reply.actor_user_id ?? reply.actor_agent_key ?? reply.id}
                        profile={profile}
                        getAvatarColor={props.getAvatarColor}
                        getInitials={props.getInitials}
                        currentUserId={props.currentUserId}
                        onOpenProfile={props.onOpenProfile}
                        onMessageUser={props.onMessageUser}
                      />
                      <div className="community-interaction-reply-content">
                        <div className="community-interaction-meta-row">
                          <ProfileHoverCard
                            userId={reply.actor_user_id}
                            label={label}
                            seed={reply.actor_user_id ?? reply.actor_agent_key ?? reply.id}
                            profile={profile}
                            getAvatarColor={props.getAvatarColor}
                            getInitials={props.getInitials}
                            currentUserId={props.currentUserId}
                            onOpenProfile={props.onOpenProfile}
                            onMessageUser={props.onMessageUser}
                            triggerClassName="community-interaction-author-trigger"
                          >
                            <span className="community-interaction-author">{label}</span>
                          </ProfileHoverCard>
                          {badge ? <span className="community-interaction-badge">{badge}</span> : null}
                          <span>{props.formatChatTime(reply.created_at)}</span>
                        </div>
                        {isEditingReply ? (
                          <EditForm
                            value={editText}
                            onChange={setEditText}
                            onSave={saveEdit}
                            onCancel={cancelEdit}
                          />
                        ) : (
                          <>
                            <InteractionContent
                              text={body}
                              renderTextWithLinks={props.renderTextWithLinks}
                              mentionContext={{
                                mentions: bundle.mentions ?? [],
                                displayName: props.displayName,
                                profilesByUserId: props.profilesByUserId,
                                currentUserId: props.currentUserId,
                                onOpenProfile: props.onOpenProfile,
                                onMessageUser: props.onMessageUser,
                                getAvatarColor: props.getAvatarColor,
                                getInitials: props.getInitials,
                                communityAgentDisplayName: props.activeCommunityName,
                              }}
                              afterBody={(
                                <InteractionAttachments
                                  attachments={bundle.attachments}
                                  onOpenImage={props.onOpenCommunityChatLightbox}
                                />
                              )}
                            />
                            {reply.edited_at ? (
                              <span className="community-interaction-edited">(edited)</span>
                            ) : null}
                          </>
                        )}
                        {bundle.pending === "sending" ? (
                          <span className="community-interaction-sending-spinner" role="status" aria-label="Sending message" />
                        ) : bundle.pending === "failed" ? (
                          <div className="community-interaction-pending-status is-failed">
                            <span>Failed to send.</span>
                            <button type="button" onClick={() => props.onRetrySend?.(reply.idempotency_key)}>
                              Retry
                            </button>
                            <button type="button" onClick={() => props.onDiscardPending?.(reply.idempotency_key)}>
                              Discard
                            </button>
                          </div>
                        ) : (
                          <ReactionSummary
                            rows={reply.reaction_summary}
                            viewerEmojis={reply.viewer_emojis}
                            onToggle={(emoji) => props.onToggleReaction?.("reply", reply.id, emoji)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {!props.floatingComposers ? (
            <TypingIndicator
              users={(props.typingPresence?.users ?? []).filter(
                (user) => user.user_id !== props.currentUserId && user.root_id === selectedRoot.root.id,
              )}
              countCapped={Boolean(props.typingPresence?.total_count_capped)}
              displayName={props.displayName}
              getAvatarColor={props.getAvatarColor}
              getInitials={props.getInitials}
            />
          ) : null}
          {props.drawerComposer ? (
            <div className="community-interaction-drawer-composer" ref={drawerComposerRef}>
              {props.floatingComposers ? (
                <TypingIndicator
                  users={(props.typingPresence?.users ?? []).filter(
                    (user) => user.user_id !== props.currentUserId && user.root_id === selectedRoot.root.id,
                  )}
                  countCapped={Boolean(props.typingPresence?.total_count_capped)}
                  displayName={props.displayName}
                  getAvatarColor={props.getAvatarColor}
                  getInitials={props.getInitials}
                />
              ) : null}
              {props.drawerComposer}
            </div>
          ) : null}
        </ThreadSurface>
      ) : null}
      {!hasDetailPanel && props.communityId ? <ChannelRosterPanel
        key={`${props.communityId}:${props.activeChannel?.id ?? "general"}`}
        communityName={props.activeCommunityName} presenceSummary={props.presenceSummary} isLoadingPresence={props.isLoadingCommunityPresence}
        channelId={props.activeChannel?.is_general ? undefined : props.activeChannel?.id}
        onOpenProfile={props.onOpenProfile} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials}
      /> : null}
    </div>
    </>
  );
}
