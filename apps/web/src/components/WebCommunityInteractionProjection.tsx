import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CornerUpLeft,
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
  CommunityInteractionEmbed,
  CommunityInteractionReplyBundle,
  CommunityInteractionRootBundle,
} from "../../../../shared/cloudCommunityInteractionsGateway";
import { partitionCommunityAttachments } from "../../../../shared/communityAttachmentUi";
import { CommunityChatMediaGrid, type CommunityChatMediaImage } from "../../../../shared/CommunityChatMediaGrid";
import {
  CommunityContextPanel,
  type CommunityAdmissionEntryPolicy,
  type CommunityAdmissionJoinRequest,
  type CommunityPresenceFace,
  type CommunityRailMember,
} from "./CommunityContextPanel";
import { CommunityChatMediaPlayers } from "../../../../shared/CommunityChatMediaPlayers";
import { CommunityMemberSettingsDialog } from "./CommunityMemberSettingsDialog";
import type { CloudCommunityMemberBillingHistory } from "../../../../shared/cloudCommunityAdminGateway";
import type {
  CommunityTypingPresenceBundle,
  CommunityTypingPresenceUser,
  UserProfile,
} from "../../../../shared/communityTypes";
import { UserAvatar } from "../../../../shared/UserAvatar";
import type {
  CloudCommunityPolynetOverview,
  CloudCommunityPolynetOverviewNode,
} from "../../../../shared/cloudCommunityPolynetGateway";

export type WebCommunityInteractionProjectionProps = {
  activeCommunityName: string;
  roots: CommunityInteractionRootBundle[];
  selectedRootId: string | null;
  replies: CommunityInteractionReplyBundle[];
  isLoadingRoots: boolean;
  isLoadingReplies: boolean;
  error: string | null;
  repliesError: string | null;
  onSelectRoot: (rootId: string) => void;
  onCloseDrawer: () => void;
  onStartRootReply?: (message: {
    id: string;
    sender_id: string;
    body: string;
    interaction_root_id: string;
    legacy_message_id?: string | null;
  }) => void;
  mainComposer?: ReactNode;
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
  onlineUserIds?: Set<string>;
  chatLastSeenAt?: number | null;
  rootChangeReason?: "initial" | "newer" | "older" | "reset";
  canLoadOlderRoots?: boolean;
  isLoadingOlderRoots?: boolean;
  onLoadOlderRoots?: () => void;
  onCaughtUp?: () => void;
  onOpenCommunityChatLightbox?: (images: CommunityChatMediaImage[], index: number) => void;
  presenceSummary?: {
    member_count?: number | null;
    admin_count?: number | null;
    online_count?: number | null;
    online_faces?: CommunityPresenceFace[] | null;
  } | null;
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
  communityEntryPolicy?: CommunityAdmissionEntryPolicy | null;
  canSetCommunityFreeAccessMode?: boolean;
  isSettingCommunityFreeAccessMode?: boolean;
  communityFreeAccessModeError?: string | null;
  onSetCommunityFreeAccessMode?: (mode: "open" | "approval") => Promise<void> | void;
  canReviewCommunityJoinRequests?: boolean;
  communityJoinReviewMode?: "paid" | "free_auto" | "free_approval" | null;
  communityJoinRequests?: CommunityAdmissionJoinRequest[] | null;
  isLoadingCommunityJoinRequests?: boolean;
  communityJoinRequestsError?: string | null;
  decidingCommunityJoinRequestId?: string | null;
  onApproveCommunityJoinRequest?: (requestId: string) => Promise<void> | void;
  onDenyCommunityJoinRequest?: (requestId: string) => Promise<void> | void;
  communityMemoryOverview?: CloudCommunityPolynetOverview | null;
  isLoadingCommunityMemory?: boolean;
  communityMemoryError?: string | null;
  onRefreshCommunityMemory?: () => void;
  onOpenCommunityMemory?: () => void;
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
  EmbedCards,
  InteractionAttachments,
  InteractionBody,
  MessageActions,
  OverflowMenu,
  ProfileHoverCard,
  QuoteChip,
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


export function WebCommunityInteractionProjection(props: WebCommunityInteractionProjectionProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const requestedOlderRootsRef = useRef(false);
  const pendingOlderAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const seenReplyIds = useRef<Set<string>>(new Set());
  const repliesLoadedOnce = useRef(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [editing, setEditing] = useState<{ type: "root" | "reply"; id: string } | null>(null);
  const [editText, setEditText] = useState("");
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
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setShowJumpToLatest(false);
  };

  const handleFeedScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 120;
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

  useEffect(() => {
    if (!props.isLoadingOlderRoots) requestedOlderRootsRef.current = false;
  }, [props.isLoadingOlderRoots]);

  const rootWindowSignature = useMemo(
    () => props.roots.map((bundle) => bundle.root.id).join("|"),
    [props.roots],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const reason = props.rootChangeReason ?? "newer";
    if (reason === "reset") {
      pendingOlderAnchorRef.current = null;
      setShowJumpToLatest(false);
      return;
    }
    if (reason === "older") {
      const anchor = pendingOlderAnchorRef.current;
      pendingOlderAnchorRef.current = null;
      if (anchor) {
        el.scrollTop = Math.max(0, el.scrollHeight - anchor.scrollHeight + anchor.scrollTop);
      }
      return;
    }
    if (reason === "initial") {
      el.scrollTop = el.scrollHeight;
      isNearBottomRef.current = true;
      setShowJumpToLatest(false);
      props.onCaughtUp?.();
      return;
    }
    if (reason === "newer") {
      if (isNearBottomRef.current) {
        el.scrollTop = el.scrollHeight;
        setShowJumpToLatest(false);
        props.onCaughtUp?.();
      } else {
        setShowJumpToLatest(true);
      }
    }
  }, [props.rootChangeReason, rootWindowSignature]);

  // Reset reply animation tracking on thread switch so a thread's initial replies don't animate.
  useEffect(() => {
    repliesLoadedOnce.current = false;
    seenReplyIds.current = new Set();
  }, [props.selectedRootId]);

  useEffect(() => {
    for (const bundle of props.replies) seenReplyIds.current.add(bundle.reply.id);
    repliesLoadedOnce.current = true;
  }, [props.replies]);

  const selectedRoot = props.selectedRootId
    ? props.roots.find((bundle) => bundle.root.id === props.selectedRootId) ?? null
    : null;
  const selectedRootLabel = selectedRoot ? actorLabel(selectedRoot.root, props.displayName) : "";
  const selectedRootText = selectedRoot
    ? stripSharedAttachmentSummary(
        bundleText(selectedRoot.content_blocks, selectedRoot.root.content_summary),
        selectedRoot.attachments.length > 0,
      )
    : "";
  const selectedRootChip = selectedRoot ? kindChipLabel(selectedRoot.root.kind) : null;
  const selectedRootBadge = selectedRoot ? agentBadgeLabel(selectedRoot.root.actor_type) : null;

  const replyById = new Map(props.replies.map((bundle) => [bundle.reply.id, bundle] as const));

  return (
    <>
    <div className={`community-interaction-projection${selectedRoot || props.profilePanel ? " has-drawer" : " has-context-panel"}`}>
      <div className="community-interaction-main">
        <div className="community-interaction-feed-scroll" ref={scrollRef} onScroll={handleFeedScroll}>
          <CommunityInteractionFeedList
            {...props}
            density="full"
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
        <TypingIndicator
          users={(props.typingPresence?.users ?? []).filter(
            (user) => user.user_id !== props.currentUserId && !user.root_id,
          )}
          displayName={props.displayName}
          getAvatarColor={props.getAvatarColor}
          getInitials={props.getInitials}
        />
        {props.mainComposer ? (
          <div className="community-interaction-main-composer">{props.mainComposer}</div>
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
        <aside className="community-interaction-drawer" aria-label="Thread replies">
          <div className="community-interaction-drawer-back">
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
          </div>
          <div className="community-interaction-drawer-scroll">
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
                  <InteractionBody text={selectedRootText} renderTextWithLinks={props.renderTextWithLinks} />
                  <InteractionAttachments attachments={selectedRoot.attachments} onOpenImage={props.onOpenCommunityChatLightbox} />
                  <EmbedCards embeds={selectedRoot.embeds} />
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
                  const label = actorLabel(reply, props.displayName);
                  const profile = reply.actor_user_id ? props.profilesByUserId[reply.actor_user_id] ?? null : null;
                  const body = stripSharedAttachmentSummary(
                    bundleText(bundle.content_blocks, reply.content_summary),
                    bundle.attachments.length > 0,
                  );
                  const badge = agentBadgeLabel(reply.actor_type);
                  const isOwnReply = Boolean(
                    props.currentUserId && reply.actor_user_id && reply.actor_user_id === props.currentUserId,
                  );
                  const isEditingReply = editing?.type === "reply" && editing.id === reply.id;
                  const isNewReply = repliesLoadedOnce.current && !seenReplyIds.current.has(reply.id);
                  return (
                    <div key={reply.id} className={`community-interaction-reply${isNewReply ? " is-new" : ""}${bundle.pending ? ` is-pending is-pending-${bundle.pending}` : ""}`}>
                      {bundle.pending ? null : (
                        <MessageActions
                          onReact={(emoji) => props.onToggleReaction?.("reply", reply.id, emoji)}
                          onReply={() => {
                            if (!reply.actor_user_id) return;
                            props.onStartRootReply?.({
                              id: reply.legacy_message_id ?? reply.id,
                              sender_id: reply.actor_user_id,
                              body,
                              interaction_root_id: reply.root_id,
                              legacy_message_id: reply.legacy_message_id ?? null,
                            });
                          }}
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
                        {reply.target_reply_id ? (
                          <QuoteChip quoted={replyById.get(reply.target_reply_id)} displayName={props.displayName} />
                        ) : null}
                        {isEditingReply ? (
                          <EditForm
                            value={editText}
                            onChange={setEditText}
                            onSave={saveEdit}
                            onCancel={cancelEdit}
                          />
                        ) : (
                          <>
                            <InteractionBody text={body} renderTextWithLinks={props.renderTextWithLinks} />
                            <InteractionAttachments attachments={bundle.attachments} onOpenImage={props.onOpenCommunityChatLightbox} />
                            <EmbedCards embeds={bundle.embeds} />
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
          <TypingIndicator
            users={(props.typingPresence?.users ?? []).filter(
              (user) => user.user_id !== props.currentUserId && user.root_id === selectedRoot.root.id,
            )}
            displayName={props.displayName}
            getAvatarColor={props.getAvatarColor}
            getInitials={props.getInitials}
          />
          {props.drawerComposer ? (
            <div className="community-interaction-drawer-composer">{props.drawerComposer}</div>
          ) : null}
        </aside>
      ) : (
        <aside className="community-interaction-drawer community-context-panel" aria-label="Community">
          <CommunityContextPanel
            communityName={props.activeCommunityName}
            onlineFaces={props.presenceSummary?.online_faces ?? null}
            onlineCount={props.presenceSummary?.online_count ?? null}
            memberCount={props.communityMemberCount ?? props.presenceSummary?.member_count ?? null}
            members={props.communityMembers ?? null}
            membersHasMore={props.communityMembersHasMore}
            isLoadingMembers={props.isLoadingCommunityMembers}
            isLoadingMoreMembers={props.isLoadingMoreCommunityMembers}
            membersLoadError={props.communityMembersLoadError}
            onLoadMoreMembers={props.onLoadMoreCommunityMembers}
            onlineUserIds={props.onlineUserIds ?? null}
            ownerId={props.communityOwnerId ?? null}
            canManageMembers={canManageCommunityMembers}
            entryPolicy={props.communityEntryPolicy ?? null}
            canSetFreeAccessMode={props.canSetCommunityFreeAccessMode}
            isSettingFreeAccessMode={props.isSettingCommunityFreeAccessMode}
            freeAccessModeError={props.communityFreeAccessModeError}
            onSetFreeAccessMode={props.onSetCommunityFreeAccessMode}
            canReviewJoinRequests={props.canReviewCommunityJoinRequests}
            joinReviewMode={props.communityJoinReviewMode}
            pendingJoinRequests={props.communityJoinRequests ?? null}
            isLoadingJoinRequests={props.isLoadingCommunityJoinRequests}
            joinRequestsError={props.communityJoinRequestsError}
            decidingJoinRequestId={props.decidingCommunityJoinRequestId}
            onApproveJoinRequest={props.onApproveCommunityJoinRequest}
            onDenyJoinRequest={props.onDenyCommunityJoinRequest}
            memoryOverview={props.communityMemoryOverview ?? null}
            isLoadingMemory={props.isLoadingCommunityMemory}
            memoryLoadError={props.communityMemoryError}
            onRefreshMemory={props.onRefreshCommunityMemory}
            onOpenMemory={props.onOpenCommunityMemory}
            onOpenMemberSettings={(member) => setSelectedCommunityMemberId(member.id)}
            onOpenMemberProfile={props.onOpenProfile}
            onMessageMember={props.onMessageUser}
            currentUserId={props.currentUserId}
            displayName={props.displayName}
            getInitials={props.getInitials}
            getAvatarColor={props.getAvatarColor}
          />
        </aside>
      )}
    </div>
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
}
