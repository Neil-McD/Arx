import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Lock,
  MessageCircle,
  Users,
  MessageSquare,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  EmojiPickerButton,
  ReactionSummary,
} from "./communityInteractionRowParts";
import type {
  CommunityInteractionReplyBundle,
  CommunityInteractionRootBundle,
} from "../../../../shared/cloudCommunityInteractionsGateway";
import { youTubeEmbedsInText } from "../../../../shared/linkEmbedUi";
import { pdfLinksInText } from "../../../../shared/messagePdf";
import { type CommunityChatMediaImage } from "../../../../shared/CommunityChatMediaGrid";
import type { CommunityAdmissionJoinRequest } from "./CommunityJoinRequestReview";
import type { MentionCandidate } from "./communityMentionAutocomplete";
import {
  WebCommunityChannelHeader,
  type WebCommunityChannelHeaderChannel,
} from "./WebCommunityChannelHeader";
import type { CloudCommunityMemberBillingHistory } from "../../../../shared/cloudCommunityAdminGateway";
import type {
  CommunityTypingPresenceBundle,
  CommunityPresenceSummary,
  CommunityActivityEvent,
  UserProfile,
} from "../../../../shared/communityTypes";
import { ChannelRosterPanel } from "./ChannelRosterPanel";
import type { CommunityAdmissionControl } from "./CommunityAutoJoinControl";
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
  // Set by the community's layout: posts as cards instead of a chat timeline,
  // and the Members tab, which shows the member list as the whole page.
  presentation?: "messages" | "posts";
  surface?: "chat" | "members";
  peopleOpen?: boolean;
  onPeopleOpenChange?: (open: boolean) => void;
  admission?: CommunityAdmissionControl;
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
  // Owners, admins and moderators: Delete on anyone's post (the server decides).
  canModerateContent?: boolean;
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
  communityId?: string | null;
  communityOwnerId?: string | null;
  canManageCommunityMembers?: boolean;
  canReviewCommunityJoinRequests?: boolean;
  communityJoinReviewMode?: "paid" | "free_auto" | "free_approval" | null;
  /** Shown under the members list, e.g. the owner's other communities. */
  rosterFooter?: ReactNode;
  communityJoinRequests?: CommunityAdmissionJoinRequest[] | null;
  isLoadingCommunityJoinRequests?: boolean;
  communityJoinRequestsError?: string | null;
  decidingCommunityJoinRequestId?: string | null;
  onApproveCommunityJoinRequest?: (requestId: string) => Promise<void> | void;
  onDenyCommunityJoinRequest?: (requestId: string) => Promise<void> | void;
  canViewMemberPlanDetails?: boolean;
  isActiveCommunityOwner?: boolean;
  communityInitials?: (value: string) => string;
  onSetCommunityMemberRole?: (membershipId: string, role: "co_creator" | "admin" | "moderator" | "member") => Promise<void> | void;
  onRemoveCommunityMember?: (membershipId: string) => Promise<void> | void;
  onBanCommunityMember?: (membershipId: string) => Promise<void> | void;
  loadMemberBillingHistory?: (membershipId: string) => Promise<CloudCommunityMemberBillingHistory | null>;
};

import {
  CommunityInteractionFeedList,
  EditForm,
  InteractionAttachments,
  InteractionContent,
  MessageActions,
  ProfileHoverCard,
  TypingIndicator,
  actorLabel,
  agentBadgeLabel,
  bundleText,
  kindChipLabel,
  stripSharedAttachmentSummary,
} from "./communityInteractionFeed";
import { interactionMentionsViewer } from "../controllers/communityMentionAttention";
import { CommunityPinnedRootSurface } from "./CommunityPinnedRootSurface";
import { CommunityPostsFeed, splitPostTitle } from "./CommunityPostsFeed";
import { PostCardView, postCardTitle } from "./CommunityPostCard";
import { useCommunityAgentName } from "../../../../shared/CommunityAgentIcon";
import { useWebCommunityFrame } from "../controllers/useWebCommunityFrame";
import { WebCommunityPodPanel, unpinFromPod } from "./WebCommunityPodPanel";

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
  const text = bundleText(bundle.content_blocks, bundle.root.content_summary);
  return bundle.attachments.length > 0
    || youTubeEmbedsInText(text).length > 0
    || pdfLinksInText(text).length > 0;
}

export function WebCommunityInteractionProjection(props: WebCommunityInteractionProjectionProps) {
  const agentName = useCommunityAgentName(props.activeCommunityName);
  const hasChannelContext = Boolean(props.communityId && props.activeChannel);
  // A pod keeps its pinned post in the pod panel instead of a banner over the
  // chat. In Channels the panel takes the member list's column; in Classroom
  // it sits in the page's right column (WebCommunityHost).
  const pods = useWebCommunityFrame().pods;
  const podMode = props.activeChannel && pods?.pods.some((pod) => pod.id === props.activeChannel!.id) ? pods.mode : null;
  // The Members page is the member list kept open.
  const peopleOpen = Boolean((props.peopleOpen || props.surface === "members") && hasChannelContext);
  const closePeople = useCallback(() => {
    props.onPeopleOpenChange?.(false);
  }, [props.onPeopleOpenChange]);
  useEffect(() => {
    if (props.peopleOpen && (!hasChannelContext || props.selectedRootId || props.profilePanel)) props.onPeopleOpenChange?.(false);
  }, [props.peopleOpen, hasChannelContext, props.selectedRootId, props.profilePanel, props.onPeopleOpenChange]);
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
    ? actorLabel(selectedRoot.root, props.displayName, agentName)
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
  // The Members page shows profiles only; a post left open on the chat tab
  // stays closed here.
  const showThreadDrawer = Boolean(selectedRoot) && props.surface !== "members";
  const hasDetailPanel = Boolean(showThreadDrawer || props.profilePanel);

  const replyById = new Map(props.replies.map((bundle) => [bundle.reply.id, bundle] as const));
  const isPostsPresentation = props.presentation === "posts" && props.surface !== "members";
  // Page layouts (posts, Members) open a post or profile over the page, like a
  // dialog, instead of squeezing the page beside a drawer.
  const detailAsDialog = hasDetailPanel && !isMobileThreadPage && (isPostsPresentation || props.surface === "members");
  const closeDetail = props.profilePanel ? props.onCloseProfile : props.onCloseDrawer;
  // A post opened as a dialog reads like an article: its title on top (or its
  // first line, the same way its card shows it), then the byline and body.
  const dialogPost = detailAsDialog && selectedRoot
    ? (selectedRoot.post_card ? { title: postCardTitle(selectedRoot), body: "" } : splitPostTitle(selectedRoot.root.title, selectedRootText))
    : null;
  useEffect(() => {
    if (!detailAsDialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) closeDetail?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailAsDialog, closeDetail]);

  return (
    <>
    <div className={`community-interaction-projection${hasDetailPanel ? " has-drawer" : hasChannelContext ? " has-channel-context" : ""}${isMobileThreadPage ? " mobile-thread-page-open" : ""}${peopleOpen && !hasDetailPanel ? " people-panel-open" : ""}${props.surface === "members" ? " is-members-page" : ""}${isPostsPresentation ? " is-posts-presentation" : ""}${detailAsDialog ? " detail-as-dialog" : ""}`}>
      <div className="community-interaction-main" ref={mainRef}>
        {isPostsPresentation ? (
          <div className="community-posts-scroll">
            <CommunityPostsFeed
              roots={props.roots}
              pinnedRoot={props.pinnedRoot}
              selectedRootId={props.selectedRootId}
              isLoadingRoots={props.isLoadingRoots}
              error={props.error}
              errorActionLabel={props.errorActionLabel}
              onRetryRoots={props.onRetryRoots}
              onSelectRoot={props.onSelectRoot}
              onToggleReaction={props.onToggleReaction}
              canLoadOlderRoots={props.canLoadOlderRoots}
              isLoadingOlderRoots={props.isLoadingOlderRoots}
              onLoadOlderRoots={props.onLoadOlderRoots}
              composer={props.mainComposer}
              channelName={props.activeChannel?.name ?? null}
              activeCommunityName={props.activeCommunityName}
              currentUserId={props.currentUserId}
              profilesByUserId={props.profilesByUserId}
              displayName={props.displayName}
              getAvatarColor={props.getAvatarColor}
              getInitials={props.getInitials}
              renderTextWithLinks={props.renderTextWithLinks}
            />
          </div>
        ) : null}
        {!isPostsPresentation && props.activeChannel ? (
          <WebCommunityChannelHeader
            trailingAction={!hasDetailPanel && props.communityId ? <button
              type="button"
              className="community-channel-header-menu-trigger channel-people-trigger"
              aria-label="Show channel people and agents" aria-expanded={peopleOpen}
              onClick={() => props.onPeopleOpenChange?.(true)}
            ><Users size={18} aria-hidden="true" /></button> : null}
            channel={props.activeChannel}
            canManage={Boolean(props.canManageActiveChannel)}
            managingChannelId={props.managingChannelId}
            manageChannelError={props.manageChannelError}
            clearManageChannelError={props.onClearManageChannelError}
            onRenameChannel={props.onRenameChannel}
            onDeleteChannel={props.onDeleteChannel}
          />
        ) : null}
        {!isPostsPresentation && !podMode && props.pinnedRoot ? (
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
              agentName,
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
        {isPostsPresentation ? null : <div
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
        </div>}
        {!isPostsPresentation && showJumpToLatest ? (
          <button type="button" className="community-interaction-jump-latest" onClick={scrollToLatest}>
            <span aria-hidden="true">↓</span> New messages
          </button>
        ) : null}
        {!isPostsPresentation && !props.floatingComposers ? (
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
        {!isPostsPresentation && props.mainComposer ? (
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

      {detailAsDialog ? <div className="community-detail-dialog-backdrop" aria-hidden="true" onClick={closeDetail} /> : null}
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
      ) : showThreadDrawer && selectedRoot ? (
        <ThreadSurface
          className={`community-interaction-drawer community-interaction-thread-drawer${isMobileThreadPage ? " community-interaction-thread-page" : ""}`}
          aria-label={isMobileThreadPage ? "Thread" : "Thread replies"}
        >
          {detailAsDialog ? (
            <div className="community-post-dialog-bar">
              <span className="community-post-dialog-channel">
                {props.activeChannel?.name ? `# ${props.activeChannel.name}` : "Post"}
              </span>
              <button type="button" className="community-post-dialog-close" onClick={props.onCloseDrawer} aria-label="Close post">
                <X size={20} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          ) : !isMobileThreadPage ? <div className="community-interaction-drawer-back">
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
              {dialogPost?.title ? <h2 className="community-post-dialog-title">{dialogPost.title}</h2> : null}
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
                  {selectedRoot.root.title && !dialogPost ? (
                    <div className="community-interaction-title">{selectedRoot.root.title}</div>
                  ) : null}
                  {selectedRoot.post_card ? (
                    <PostCardView bundle={selectedRoot} showQuestion={!dialogPost} />
                  ) : <InteractionContent
                    text={dialogPost ? dialogPost.body : selectedRootText}
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
                      communityAgentDisplayName: agentName,
                    }}
                    afterBody={(
                      <InteractionAttachments
                        attachments={selectedRoot.attachments}
                        onOpenImage={props.onOpenCommunityChatLightbox}
                      />
                    )}
                  />}
                  <div className="community-interaction-thread-anchor-actions">
                    <ReactionSummary
                      rows={selectedRoot.root.reaction_summary}
                      viewerEmojis={selectedRoot.root.viewer_emojis}
                      onToggle={(emoji) => props.onToggleReaction?.("root", selectedRoot.root.id, emoji)}
                      target={{ type: "root", id: selectedRoot.root.id }}
                      whoVariant={isPostsPresentation ? "faces" : "names"}
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
              <div className="community-interaction-drawer-empty">
                {detailAsDialog ? "No comments yet. Start the conversation below." : "No replies yet."}
              </div>
            ) : (
              <>
              {detailAsDialog ? (
                <div className="community-post-dialog-comments-label">
                  {props.replies.length === 1 ? "1 comment" : `${props.replies.length} comments`}
                </div>
              ) : null}
              <div className="community-interaction-reply-list">
                {props.replies.map((bundle) => {
                  const reply = bundle.reply;
                  const label = actorLabel(reply, props.displayName, agentName);
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
                          displayName: agentName,
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
                                id: reply.id,
                                sender_id: reply.actor_user_id ?? "community_agent",
                                body,
                                reply_author_label: replyMentionCandidate.displayName,
                                mention_candidate: replyMentionCandidate,
                                interaction_root_id: reply.root_id,
                                interaction_reply_id: reply.id,
                              })
                            : undefined}
                          replyLabel="Reply to this message"
                          onEdit={
                            isOwnReply && props.onEditMessage
                              ? () => startEdit("reply", reply.id, body)
                              : undefined
                          }
                          onDelete={
                            (isOwnReply || props.canModerateContent) && props.onDeleteMessage
                              ? () => {
                                  if (window.confirm(isOwnReply ? "Delete this reply?" : "Remove this reply for everyone?")) {
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
                                communityAgentDisplayName: agentName,
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
                            target={{ type: "reply", id: reply.id }}
                            whoVariant={isPostsPresentation ? "faces" : "names"}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
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
      {podMode === "channels" && props.surface !== "members" ? (
        <aside className="community-context-panel channel-roster-panel community-pod-panel-column" aria-label="Pod">
          {/* The same head row as the member list: it lines up with the chat's
              header and keeps the cards clear of the top-right buttons. */}
          <div className="community-context-rail-head community-pod-panel-head">
            {/* Narrow windows open the panel full screen from the people button. */}
            <div className="channel-people-back">
              <button className="back-to-workspace" type="button" aria-label="Back to pod" onClick={closePeople}>
                <svg viewBox="0 0 24 24" className="back-icon" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              </button>
            </div>
            <span><Lock size={13} aria-hidden="true" /> Private pod</span>
          </div>
          <WebCommunityPodPanel
            podId={props.activeChannel!.id}
            pinnedRoot={props.pinnedRoot}
            roots={props.roots}
            onOpenPost={props.onSelectRoot}
            canManage={Boolean(props.canManageActiveChannel)}
            onUnpin={props.canManagePinnedRoot && props.onSetPinnedRoot ? () => unpinFromPod(props.onSetPinnedRoot!) : undefined}
          />
        </aside>
      ) : podMode === "classroom" && props.surface !== "members" ? null : props.communityId && props.activeChannel ? <ChannelRosterPanel
        page={props.surface === "members"}
        onCloseNarrow={closePeople}
        narrowOpen={peopleOpen}
        joinReview={{
          canReviewJoinRequests: props.canReviewCommunityJoinRequests,
          joinReviewMode: props.communityJoinReviewMode,
          pendingJoinRequests: props.communityJoinRequests,
          isLoadingJoinRequests: props.isLoadingCommunityJoinRequests,
          joinRequestsError: props.communityJoinRequestsError,
          decidingJoinRequestId: props.decidingCommunityJoinRequestId,
          onApproveJoinRequest: props.onApproveCommunityJoinRequest,
          onDenyJoinRequest: props.onDenyCommunityJoinRequest,
          displayName: props.displayName,
        }}
        admission={props.admission}
        footer={props.rosterFooter}
        key={`${props.communityId}:${props.activeChannel?.id ?? "general"}`}
        communityName={props.activeCommunityName} presenceSummary={props.presenceSummary} isLoadingPresence={props.isLoadingCommunityPresence}
        currentUserId={props.currentUserId} onMessageUser={props.onMessageUser}
        memberDetailOpen={hasDetailPanel}
        memberSettings={{
          activeCommunity: { id: props.communityId, owner_id: props.communityOwnerId ?? null },
          canManageMembers: Boolean(props.canManageCommunityMembers && props.onSetCommunityMemberRole && props.onRemoveCommunityMember && props.onBanCommunityMember),
          canViewMemberPlanDetails: Boolean(props.canViewMemberPlanDetails), isActiveCommunityOwner: Boolean(props.isActiveCommunityOwner),
          displayName: props.displayName, getInitials: props.getInitials, communityInitials: props.communityInitials ?? props.getInitials,
          handleSetCommunityMemberRole: (id, role) => props.onSetCommunityMemberRole?.(id, role),
          handleRemoveCommunityMember: id => props.onRemoveCommunityMember?.(id),
          handleBanCommunityMember: id => props.onBanCommunityMember?.(id),
          loadMemberBillingHistory: id => props.loadMemberBillingHistory?.(id) ?? Promise.resolve(null),
        }}
        channelId={props.activeChannel?.is_general ? undefined : props.activeChannel?.id}
        onOpenProfile={props.onOpenProfile} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials}
      /> : null}
    </div>
    </>
  );
}
