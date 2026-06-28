import type {
  ChangeEventHandler,
  ClipboardEventHandler,
  ComponentProps,
  DragEventHandler,
  MutableRefObject,
  ReactNode,
  UIEventHandler,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommunityChatMessageRow } from "../../../../shared/CommunityChatMessageRow";
import type { CommunityChatMediaImage } from "../../../../shared/CommunityChatMediaGrid";
import type {
  CommunityActivityEvent as SharedCommunityActivityEvent,
  CommunityChatMessage as SharedCommunityChatMessage,
  ProfileCommunityContext as SharedProfileCommunityContext,
  MessageReaction as SharedMessageReaction,
  CommunityTypingPresenceBundle as SharedCommunityTypingPresenceBundle,
  CommunityTypingPresenceUser as SharedCommunityTypingPresenceUser,
  UserProfile as SharedUserProfile,
} from "../../../../shared/communityTypes";
import { fetchCloudProfileCommunityContext } from "../../../../shared/cloudProfilesGateway";
import { formatDateSeparator } from "../../../../shared/chatUi";
import {
  type CommunityMessageAttachment,
  type ReplyPrefix,
} from "../../../../shared/communityMessageParsing";
import { partitionCommunityAttachments } from "../../../../shared/communityAttachmentUi";
import { VoiceInputButton } from "../../../../shared/VoiceInputButton";
import { WebCommunityChatLightboxModal } from "./WebCommunityChatLightboxModal";
import {
  WebCommunityInteractionProjection,
  type WebCommunityInteractionProjectionProps,
} from "./WebCommunityInteractionProjection";
import { WebCommunityProfilePanel } from "./WebCommunityProfilePanel";

type CommunityChatMessage = SharedCommunityChatMessage<CommunityMessageAttachment>;
type CommunityActivityEvent = SharedCommunityActivityEvent;
type MessageReaction = SharedMessageReaction;
type CommunityTypingPresenceBundle = SharedCommunityTypingPresenceBundle;
type CommunityTypingPresenceUser = SharedCommunityTypingPresenceUser;
type UserProfile = SharedUserProfile;
type ProfileCommunityContext = SharedProfileCommunityContext;
type CommunityReplyTarget = Pick<CommunityChatMessage, "id" | "sender_id" | "body">;

type CommunityChatSendDraft = {
  text?: string;
  attachments?: CommunityMessageAttachment[];
  replyingToMessage?: CommunityReplyTarget | null;
  inputRef?: MutableRefObject<HTMLTextAreaElement | null> | null;
  clearDraft?: () => void;
  restoreDraft?: () => void;
};

type CommunityChatMessageViewModel = {
  message: CommunityChatMessage;
  showMeta: boolean;
  isOwn: boolean;
  isPending: boolean;
  senderLabel: string;
  senderProfile: UserProfile | null;
  avatarUrl: string | null;
  avatarColor: string;
  shortTime: string;
  formattedTime: string;
  replyToId: string | null;
  replyTarget: CommunityChatMessage | null;
  reactions: MessageReaction[];
};

type CommunityChatTimelineItem =
  | {
      kind: "activity";
      key: string;
      createdAt: string;
      dateSeparator: string | null;
      event: CommunityActivityEvent;
    }
  | {
      kind: "message";
      key: string;
      createdAt: string;
      dateSeparator: string | null;
      viewModel: CommunityChatMessageViewModel;
    };

type CommunityChatTimelineDraftItem =
  | {
      kind: "activity";
      key: string;
      createdAt: string;
      event: CommunityActivityEvent;
    }
  | {
      kind: "message";
      key: string;
      createdAt: string;
      viewModel: CommunityChatMessageViewModel;
    };

const EMPTY_MESSAGE_REACTIONS: MessageReaction[] = [];
const EMPTY_PROFILE_COMMUNITY_CONTEXT: ProfileCommunityContext = {
  owned_communities: [],
  mutual_communities: [],
  is_self: false,
  can_message: false,
  message_context_community_id: null,
  message_unavailable_reason: "no_mutual_community",
};

export type WebCommunityChatPanelProps = {
  activeCommunity: { id: string; name: string; owner_id?: string | null } | null;
  session: unknown | null;
  isResolvingSelectedCommunity: boolean;
  hasAuthenticatedPresentation: boolean;
  isAuthRecoveringSignedIn: boolean;
  hasSession: boolean;
  onOpenDirectMessageFromCommunity?: (targetUserId: string, communityId: string) => void;
  sessionUserId: string | null;
  canPostMessages: boolean;
  isProfileSetupComplete: boolean;
  canModerateMessages: boolean;
  isLoadingChat: boolean;
  hasResolvedCommunityChat: boolean;
  isLoadingMoreChat: boolean;
  communityChatHasMore: boolean;
  communityMessages: CommunityChatMessage[];
  communityActivityEvents: CommunityActivityEvent[];
  communityMessageById: Map<string, CommunityChatMessage>;
  messageReactions: MessageReaction[];
  typingPresence: CommunityTypingPresenceBundle;
  profilesByUserId: Record<string, UserProfile>;
  editingMessageId: string | null;
  editingMessageText: string;
  reactionPickerMessageId: string | null;
  replyingToMessage: CommunityReplyTarget | null;
  communityAttachments: CommunityMessageAttachment[];
  communityMessageInput: string;
  isSendingCommunityMessage: boolean;
  communityChatError: string | null;
  isUserAtBottom: boolean;
  unreadCount: number;
  copiedCommunityMessageId: string | null;
  reactionEmojis: string[];
  messageListRef: MutableRefObject<HTMLDivElement | null>;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  chatInputRef: MutableRefObject<HTMLTextAreaElement | null>;
  onChatScroll: UIEventHandler<HTMLDivElement>;
  onRequireSignIn: () => void;
  onFinishProfileSetup: () => void;
  onScrollToBottom: () => void;
  onSetReplyingToMessage: (message: CommunityReplyTarget | null) => void;
  onRemoveCommunityAttachment: (id: string) => void;
  onCommunityFileInputChange: ChangeEventHandler<HTMLInputElement>;
  onCommunityAttachmentDrop: DragEventHandler<HTMLDivElement>;
  onCommunityAttachmentDragEnter: DragEventHandler<HTMLDivElement>;
  onCommunityAttachmentDragOver: DragEventHandler<HTMLDivElement>;
  onCommunityAttachmentDragLeave: DragEventHandler<HTMLDivElement>;
  onCommunityAttachmentPaste: ClipboardEventHandler<HTMLTextAreaElement>;
  isCommunityAttachmentDragOver: boolean;
  onCommunityMessageInputChange: (value: string, textarea: HTMLTextAreaElement) => void;
  onSendCommunityMessage: (draft?: CommunityChatSendDraft) => void | Promise<void>;
  displayName: (userId: string) => string;
  shouldShowCommunitySenderMeta: (messages: CommunityChatMessage[], index: number) => boolean;
  getAvatarColor: (seed: string) => string;
  getInitials: (value: string) => string;
  formatChatTime: (value: string) => string;
  parseReplyPrefix: (body: string) => ReplyPrefix | null;
  truncateReplyPreview: (value: string) => string;
  renderTextWithLinks: (text: string) => ReactNode;
  onScrollToReplyMessage: (replyMessageId: string) => void;
  onOpenCommunityChatLightbox: (images: CommunityChatMediaImage[], index: number) => void;
  onToggleReaction: (messageId: string, emoji: string) => void | Promise<void>;
  onSetReactionPickerMessageId: (messageId: string | null) => void;
  onStartReply: (message: CommunityReplyTarget) => void;
  onCopyMessage: (messageId: string, body: string) => void | Promise<void>;
  onStartEdit: (message: Pick<CommunityChatMessage, "id" | "body">) => void;
  onDeleteMessage: (messageId: string) => void | Promise<void>;
  onEditingMessageTextChange: (value: string) => void;
  onSaveEdit: () => void | Promise<void>;
  onCancelEdit: () => void;
  voiceButtonProps: ComponentProps<typeof VoiceInputButton>;
  lightboxModalProps: ComponentProps<typeof WebCommunityChatLightboxModal>;
  interactionProjection?: Omit<
    WebCommunityInteractionProjectionProps,
    "activeCommunityName" | "displayName" | "getAvatarColor" | "getInitials" | "formatChatTime" | "renderTextWithLinks"
  > & {
    enabled: boolean;
  };
};

function parseTimelineTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function resolveTimelineDateSeparator(createdAt: string, previousCreatedAt: string | null): string | null {
  const current = new Date(createdAt);
  if (!Number.isFinite(current.getTime())) return null;
  if (!previousCreatedAt) return formatDateSeparator(current);
  const previous = new Date(previousCreatedAt);
  if (!Number.isFinite(previous.getTime())) return formatDateSeparator(current);
  return previous.toDateString() === current.toDateString() ? null : formatDateSeparator(current);
}

function formatCommunityActivityLabel(
  event: CommunityActivityEvent,
  displayName: (userId: string) => string,
): string {
  const title = String(event.target_title ?? "").trim();
  const titleSuffix = title ? `: ${title}` : "";
  switch (event.type) {
    case "member_joined": {
      const actorName = event.actor_user_id ? displayName(event.actor_user_id) : "A member";
      return `${actorName} joined the community`;
    }
    case "resource_added":
      return `New resource added${titleSuffix}`;
    case "ai_feed_post_added":
      return `New AI Feed post added${titleSuffix}`;
    case "event_soon":
      return title ? `${title} starts soon` : "Event starts soon";
    case "event_starting":
      return title ? `${title} is starting now` : "Event is starting now";
    default:
      return "Community activity";
  }
}

export function WebCommunityChatPanel(props: WebCommunityChatPanelProps) {
  const {
    activeCommunity,
    session,
    isResolvingSelectedCommunity,
    hasAuthenticatedPresentation,
    isAuthRecoveringSignedIn,
    hasSession,
    onOpenDirectMessageFromCommunity,
    sessionUserId,
    canPostMessages,
    isProfileSetupComplete,
    canModerateMessages,
    isLoadingChat,
    hasResolvedCommunityChat,
    isLoadingMoreChat,
    communityChatHasMore,
    communityMessages,
    communityActivityEvents,
    communityMessageById,
    messageReactions,
    typingPresence,
    profilesByUserId,
    editingMessageId,
    editingMessageText,
    reactionPickerMessageId,
    replyingToMessage,
    communityAttachments,
    communityMessageInput,
    isSendingCommunityMessage,
    communityChatError,
    isUserAtBottom,
    unreadCount,
    copiedCommunityMessageId,
    reactionEmojis,
    messageListRef,
    fileInputRef,
    chatInputRef,
    onChatScroll,
    onRequireSignIn,
    onFinishProfileSetup,
    onScrollToBottom,
    onSetReplyingToMessage,
    onRemoveCommunityAttachment,
    onCommunityFileInputChange,
    onCommunityAttachmentDrop,
    onCommunityAttachmentDragEnter,
    onCommunityAttachmentDragOver,
    onCommunityAttachmentDragLeave,
    onCommunityAttachmentPaste,
    isCommunityAttachmentDragOver,
    onCommunityMessageInputChange,
    onSendCommunityMessage,
    displayName,
    shouldShowCommunitySenderMeta,
    getAvatarColor,
    getInitials,
    formatChatTime,
    parseReplyPrefix,
    truncateReplyPreview,
    renderTextWithLinks,
    onScrollToReplyMessage,
    onOpenCommunityChatLightbox,
    onToggleReaction,
    onSetReactionPickerMessageId,
    onStartReply,
    onCopyMessage,
    onStartEdit,
    onDeleteMessage,
    onEditingMessageTextChange,
    onSaveEdit,
    onCancelEdit,
    voiceButtonProps,
    lightboxModalProps,
    interactionProjection,
  } = props;
  const isProfileSetupGateActive = hasSession && Boolean(activeCommunity) && canPostMessages && !isProfileSetupComplete;
  const canUseComposer = canPostMessages && !isProfileSetupGateActive;
  const [profilePanelUserId, setProfilePanelUserId] = useState<string | null>(null);
  const [profileCommunityContextByUserId, setProfileCommunityContextByUserId] = useState<
    Record<string, ProfileCommunityContext>
  >({});
  const [drawerReplyTarget, setDrawerReplyTarget] = useState<CommunityReplyTarget | null>(null);
  const [drawerReplyInput, setDrawerReplyInput] = useState("");
  const drawerReplyInputRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedInteractionRootId = interactionProjection?.selectedRootId ?? null;

  const typingUsers = typingPresence.users;
  const typingTotalCount = Math.max(typingUsers.length, Math.floor(Number(typingPresence.total_count ?? 0)));
  const typingLabel =
    typingTotalCount === 0
      ? null
      : typingTotalCount === 1 && typingUsers[0]
        ? `${typingUsers[0].display_name || displayName(typingUsers[0].user_id)} is typing...`
        : typingTotalCount === 2 && typingUsers[0] && typingUsers[1]
          ? `${typingUsers[0].display_name || displayName(typingUsers[0].user_id)} and ${typingUsers[1].display_name || displayName(typingUsers[1].user_id)} are typing...`
          : typingUsers[0]
            ? `${typingUsers[0].display_name || displayName(typingUsers[0].user_id)} and ${typingTotalCount - 1} others are typing...`
            : `${typingTotalCount} people are typing...`;

  const reactionsByMessageId = useMemo(() => {
    const byMessageId = new Map<string, MessageReaction[]>();
    for (const reaction of messageReactions) {
      const reactions = byMessageId.get(reaction.message_id);
      if (reactions) {
        reactions.push(reaction);
      } else {
        byMessageId.set(reaction.message_id, [reaction]);
      }
    }
    return byMessageId;
  }, [messageReactions]);

  const messageViewModels = useMemo<CommunityChatMessageViewModel[]>(() => {
    return communityMessages.map((message, index) => {
      const senderProfile = profilesByUserId[message.sender_id] ?? null;
      const replyToId = message.reply_to_id ?? null;
      return {
        message,
        showMeta: shouldShowCommunitySenderMeta(communityMessages, index),
        isOwn: message.sender_id === sessionUserId,
        isPending: message.id.startsWith("pending-"),
        senderLabel: displayName(message.sender_id),
        senderProfile,
        avatarUrl: senderProfile?.avatar_url ?? null,
        avatarColor: getAvatarColor(message.sender_id),
        shortTime: new Date(message.created_at).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
        formattedTime: formatChatTime(message.created_at),
        replyToId,
        replyTarget: replyToId ? communityMessageById.get(replyToId) ?? null : null,
        reactions: reactionsByMessageId.get(message.id) ?? EMPTY_MESSAGE_REACTIONS,
      };
    });
  }, [
    communityMessageById,
    communityMessages,
    displayName,
    formatChatTime,
    getAvatarColor,
    profilesByUserId,
    reactionsByMessageId,
    sessionUserId,
    shouldShowCommunitySenderMeta,
  ]);

  const timelineItems = useMemo<CommunityChatTimelineItem[]>(() => {
    const items: CommunityChatTimelineDraftItem[] = [
      ...messageViewModels.map((viewModel) => ({
        kind: "message" as const,
        key: `message:${viewModel.message.id}`,
        createdAt: viewModel.message.created_at,
        viewModel,
      })),
      ...communityActivityEvents.map((event) => ({
        kind: "activity" as const,
        key: `activity:${event.id}`,
        createdAt: event.created_at,
        event,
      })),
    ];
    items.sort((a, b) => {
      const byTime = parseTimelineTime(a.createdAt) - parseTimelineTime(b.createdAt);
      if (byTime !== 0) return byTime;
      if (a.kind === b.kind) return a.key.localeCompare(b.key);
      return a.kind === "activity" ? -1 : 1;
    });
    let previousCreatedAt: string | null = null;
    return items.map((item) => {
      const dateSeparator = resolveTimelineDateSeparator(item.createdAt, previousCreatedAt);
      previousCreatedAt = item.createdAt;
      return { ...item, dateSeparator };
    });
  }, [communityActivityEvents, messageViewModels]);

  const hasCommunityTimelineItems = communityMessages.length > 0 || communityActivityEvents.length > 0;
  const profilePanelProfile = profilePanelUserId ? profilesByUserId[profilePanelUserId] ?? null : null;
  const profilePanelDisplayName = profilePanelUserId
    ? String(profilePanelProfile?.display_name ?? displayName(profilePanelUserId) ?? "").trim() ||
      displayName(profilePanelUserId)
    : "";
  const profilePanelAvatarColor = profilePanelUserId ? getAvatarColor(profilePanelUserId) : "transparent";
  const loadedProfilePanelCommunityContext = profilePanelUserId
    ? profileCommunityContextByUserId[profilePanelUserId] ?? null
    : null;
  const profilePanelCommunityContext = loadedProfilePanelCommunityContext ?? EMPTY_PROFILE_COMMUNITY_CONTEXT;
  const canOpenDirectMessageFromCommunity = Boolean(
    hasSession && activeCommunity?.id && onOpenDirectMessageFromCommunity,
  );
  const showInteractionProjection = Boolean(
    interactionProjection?.enabled &&
    activeCommunity &&
    hasAuthenticatedPresentation &&
    hasResolvedCommunityChat &&
    !isLoadingChat,
  );

  useEffect(() => {
    setProfilePanelUserId(null);
    setProfileCommunityContextByUserId({});
  }, [activeCommunity?.id]);

  useEffect(() => {
    setDrawerReplyTarget(null);
    setDrawerReplyInput("");
    if (drawerReplyInputRef.current) {
      drawerReplyInputRef.current.style.height = "auto";
    }
  }, [activeCommunity?.id, selectedInteractionRootId]);

  useEffect(() => {
    setProfileCommunityContextByUserId({});
  }, [sessionUserId]);

  useEffect(() => {
    const targetUserId = profilePanelUserId;
    if (!targetUserId || !session || profileCommunityContextByUserId[targetUserId]) return;
    let cancelled = false;
    void fetchCloudProfileCommunityContext({
      session,
      targetUserId,
      preferredCommunityId: activeCommunity?.id ?? null,
    })
      .then((context) => {
        if (cancelled) return;
        setProfileCommunityContextByUserId((previous) => ({
          ...previous,
          [targetUserId]: context,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setProfileCommunityContextByUserId((previous) => ({
          ...previous,
          [targetUserId]: EMPTY_PROFILE_COMMUNITY_CONTEXT,
        }));
      })
    return () => {
      cancelled = true;
    };
  }, [activeCommunity?.id, profileCommunityContextByUserId, profilePanelUserId, session]);

  useEffect(() => {
    if (!profilePanelUserId) return;

    const handleProfilePanelPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const panel = document.querySelector(".community-profile-panel");
      if (panel?.contains(target)) return;
      setProfilePanelUserId(null);
    };

    document.addEventListener("pointerdown", handleProfilePanelPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleProfilePanelPointerDown, true);
    };
  }, [profilePanelUserId]);

  const openDirectMessage = useCallback((targetUserId: string, sourceCommunityIdOverride?: string | null) => {
    const normalizedTargetUserId = String(targetUserId ?? "").trim();
    const sourceCommunityId = String(sourceCommunityIdOverride ?? activeCommunity?.id ?? "").trim();
    if (!normalizedTargetUserId || !sourceCommunityId || !onOpenDirectMessageFromCommunity) return;
    if (normalizedTargetUserId === sessionUserId) return;
    setProfilePanelUserId(null);
    onOpenDirectMessageFromCommunity(normalizedTargetUserId, sourceCommunityId);
  }, [activeCommunity?.id, onOpenDirectMessageFromCommunity, sessionUserId]);

  const handleDrawerReplyInputChange = useCallback((value: string, textarea: HTMLTextAreaElement) => {
    setDrawerReplyInput(value);
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, []);

  const handleSendDrawerReply = useCallback(async () => {
    const target = drawerReplyTarget;
    const text = drawerReplyInput.trim();
    if (!target || !text) return;
    await onSendCommunityMessage({
      text,
      attachments: [],
      replyingToMessage: target,
      inputRef: drawerReplyInputRef,
      clearDraft: () => {
        setDrawerReplyInput("");
      },
      restoreDraft: () => {
        setDrawerReplyTarget(target);
        setDrawerReplyInput(text);
      },
    });
  }, [drawerReplyInput, drawerReplyTarget, onSendCommunityMessage]);

  const showCommunityChatBootstrap =
    hasAuthenticatedPresentation &&
    (isAuthRecoveringSignedIn ||
    (isResolvingSelectedCommunity ||
      (!!activeCommunity &&
        !hasCommunityTimelineItems &&
        !communityChatError &&
        (isLoadingChat || !hasResolvedCommunityChat))));

  const mainCommunityComposer = (
    <>
      {replyingToMessage && (
        <div className="chat-replying-bar">
          <div className="chat-replying-content">
            <span className="chat-replying-label">Replying to</span>
            <span className="chat-replying-sender">{displayName(replyingToMessage.sender_id)}</span>
            <span className="chat-replying-preview">{truncateReplyPreview(replyingToMessage.body)}</span>
          </div>
          <button
            className="chat-replying-cancel"
            type="button"
            onClick={() => onSetReplyingToMessage(null)}
            title="Cancel reply"
            aria-label="Cancel reply"
          >
            <svg viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {communityAttachments.length > 0 && (() => {
        const { imageAttachments, fileAttachments } = partitionCommunityAttachments(communityAttachments);
        const gridCount = Math.min(Math.max(imageAttachments.length, 1), 4);
        return (
          <div className="community-attachments-preview">
            {imageAttachments.length > 0 && (
              <div className={`chat-media-grid count-${gridCount} chat-media-grid-composer`}>
                {imageAttachments.map((item) => (
                  <div key={item.attachment.id} className="chat-media-item chat-media-item-static">
                    <img src={item.url} alt={item.name} />
                    <button
                      type="button"
                      className="chat-media-remove"
                      onClick={() => onRemoveCommunityAttachment(item.attachment.id)}
                      title="Remove"
                      aria-label={`Remove ${item.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {fileAttachments.length > 0 && (
              <div className="attachments-preview">
                {fileAttachments.map((att) => (
                  <div key={att.id} className="attachment-item" title={att.name}>
                    <div className="attachment-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M16 13H8" />
                        <path d="M16 17H8" />
                        <path d="M10 9H8" />
                      </svg>
                    </div>
                    <span className="attachment-name">{att.name}</span>
                    <button
                      className="attachment-remove"
                      type="button"
                      onClick={() => onRemoveCommunityAttachment(att.id)}
                      title="Remove"
                      aria-label={`Remove ${att.name}`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <div className="chat-input-bar">
        <button
          className="ask-icon-btn ask-plus"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={
            isAuthRecoveringSignedIn ||
            !hasSession ||
            !activeCommunity ||
            !canUseComposer ||
            isSendingCommunityMessage
          }
          aria-label="Attach files"
          title="Attach files"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <input
          ref={(node) => {
            fileInputRef.current = node;
          }}
          type="file"
          multiple
          accept="image/*,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.rs,.go,.html,.css,.yml,.yaml,.pdf"
          style={{ display: "none" }}
          onChange={onCommunityFileInputChange}
        />
        <textarea
          ref={(node) => {
            chatInputRef.current = node;
          }}
          className="chat-input"
          placeholder={
            !hasSession
              ? "Sign in to chat..."
              : isAuthRecoveringSignedIn
                ? "Restoring your account..."
                : isResolvingSelectedCommunity
                  ? "Loading community..."
                  : !activeCommunity
                    ? "Select a community to chat..."
                    : isProfileSetupGateActive
                      ? "Finish your profile to chat..."
                      : !canPostMessages
                        ? "Join this community to chat..."
                        : "Message the community..."
          }
          value={communityMessageInput}
          onChange={(event) => onCommunityMessageInputChange(event.target.value, event.target)}
          onPaste={onCommunityAttachmentPaste}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (isAuthRecoveringSignedIn) return;
              void onSendCommunityMessage();
            }
          }}
          disabled={isAuthRecoveringSignedIn || !hasSession || !activeCommunity || !canUseComposer}
          rows={1}
        />
        <VoiceInputButton {...voiceButtonProps} />
        <button
          className="chat-send ask-send-btn ask-send-btn-v2"
          onClick={() => void onSendCommunityMessage()}
          disabled={
            isAuthRecoveringSignedIn ||
            !hasSession ||
            !activeCommunity ||
            !canUseComposer ||
            isSendingCommunityMessage ||
            (communityMessageInput.trim().length === 0 && communityAttachments.length === 0)
          }
          type="button"
          aria-label="Send"
          title="Send"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 17V8M8.5 11.5 12 8l3.5 3.5" />
          </svg>
        </button>
      </div>
    </>
  );

  const drawerReplyComposer = drawerReplyTarget ? (
    <div className="community-interaction-reply-composer-panel">
      <div className="community-interaction-reply-composer-context">
        <div className="community-interaction-reply-composer-copy">
          <span>Replying to</span>
          <strong>{displayName(drawerReplyTarget.sender_id)}</strong>
          <em>{truncateReplyPreview(drawerReplyTarget.body)}</em>
        </div>
        <button
          className="chat-replying-cancel"
          type="button"
          onClick={() => {
            setDrawerReplyTarget(null);
            setDrawerReplyInput("");
          }}
          title="Cancel reply"
          aria-label="Cancel reply"
        >
          <svg viewBox="0 0 24 24">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="chat-input-bar community-interaction-reply-input-bar">
        <textarea
          ref={(node) => {
            drawerReplyInputRef.current = node;
          }}
          className="chat-input"
          placeholder="Reply..."
          value={drawerReplyInput}
          onChange={(event) => handleDrawerReplyInputChange(event.target.value, event.target)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (isAuthRecoveringSignedIn) return;
              void handleSendDrawerReply();
            }
          }}
          disabled={isAuthRecoveringSignedIn || !hasSession || !activeCommunity || !canUseComposer}
          rows={1}
        />
        <button
          className="chat-send ask-send-btn ask-send-btn-v2"
          onClick={() => void handleSendDrawerReply()}
          disabled={
            isAuthRecoveringSignedIn ||
            !hasSession ||
            !activeCommunity ||
            !canUseComposer ||
            isSendingCommunityMessage ||
            drawerReplyInput.trim().length === 0
          }
          type="button"
          aria-label="Send reply"
          title="Send reply"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 17V8M8.5 11.5 12 8l3.5 3.5" />
          </svg>
        </button>
      </div>
    </div>
  ) : null;

  if (showCommunityChatBootstrap) {
    return (
      <>
        <div className="community-chat community-chat-bootstrap">
          <div className="workspace-body chat-feed">
            <div className="community-chat-page-loading-shell" aria-busy="true" aria-live="polite">
              <div className="community-chat-page-loading-card">
                <div className="community-chat-page-loading-title">
                  {isResolvingSelectedCommunity ? "Opening community…" : "Loading chat…"}
                </div>
                <div className="community-chat-page-loading-copy">
                  {isResolvingSelectedCommunity
                    ? "Resolving the selected community and preparing chat."
                    : "Preparing messages and member identity."}
                </div>
                <div className="community-chat-page-loading-progress web-skeleton-pill" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
        <WebCommunityChatLightboxModal {...lightboxModalProps} />
      </>
    );
  }

  return (
    <>
      <div
        className={`community-chat community-attachment-drop-surface${isCommunityAttachmentDragOver ? " drag-over" : ""}`}
        onDrop={canUseComposer ? onCommunityAttachmentDrop : undefined}
        onDragEnter={canUseComposer ? onCommunityAttachmentDragEnter : undefined}
        onDragOver={canUseComposer ? onCommunityAttachmentDragOver : undefined}
        onDragLeave={canUseComposer ? onCommunityAttachmentDragLeave : undefined}
      >
        {canUseComposer && isCommunityAttachmentDragOver ? (
          <div className="drop-overlay community-drop-overlay" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            <span>Drop files to attach</span>
          </div>
        ) : null}
        <div className="workspace-body chat-feed">
          {showInteractionProjection && interactionProjection ? (
            <div
              className="community-interaction-scroll"
              ref={(node) => {
                messageListRef.current = node;
              }}
              onScroll={onChatScroll}
            >
              <WebCommunityInteractionProjection
                {...interactionProjection}
                activeCommunityName={activeCommunity?.name ?? "Community"}
                displayName={displayName}
                getAvatarColor={getAvatarColor}
                getInitials={getInitials}
                formatChatTime={formatChatTime}
                renderTextWithLinks={renderTextWithLinks}
                onStartRootReply={(message) => {
                  setDrawerReplyTarget(message);
                  setTimeout(() => drawerReplyInputRef.current?.focus(), 0);
                }}
                mainComposer={mainCommunityComposer}
                drawerComposer={drawerReplyComposer}
              />
            </div>
          ) : (
            <div
              className="chat-messages"
              ref={(node) => {
                messageListRef.current = node;
              }}
              onScroll={onChatScroll}
            >
              <div className="chat-messages-inner">
              {!hasAuthenticatedPresentation && (
                <div className="chat-messages-state-shell">
                  <div className="chat-empty">
                    <div>Sign in to access community chat.</div>
                    <button
                      className="secondary"
                      type="button"
                      onClick={onRequireSignIn}
                      style={{ marginTop: 12 }}
                    >
                      Sign in
                    </button>
                  </div>
                </div>
              )}
              {hasSession && !isResolvingSelectedCommunity && !activeCommunity && (
                <div className="chat-messages-state-shell">
                  <div className="chat-empty">Select a community to start chatting.</div>
                </div>
              )}
              {activeCommunity && hasResolvedCommunityChat && !isLoadingChat && !hasCommunityTimelineItems && communityChatError && (
                <div className="chat-messages-state-shell">
                  <div className="chat-empty">
                    <div>{communityChatError}</div>
                  </div>
                </div>
              )}
              {activeCommunity && hasResolvedCommunityChat && !isLoadingChat && !hasCommunityTimelineItems && !communityChatError && (
                <div className="chat-messages-state-shell">
                  <div className="chat-empty-state">
                    <div className="chat-empty-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <div className="chat-empty-title">
                      Welcome to {activeCommunity.name}
                    </div>
                    <div className="chat-empty-text">
                      This is the beginning of your community chat. Say hello!
                    </div>
                  </div>
                </div>
              )}
              {activeCommunity && !isLoadingChat && isLoadingMoreChat && (
                <div className="community-chat-history-loading" aria-live="polite">
                  <span>Loading earlier messages...</span>
                  <div className="community-chat-history-loading-progress web-skeleton-pill" aria-hidden="true" />
                </div>
              )}
              {activeCommunity && !isLoadingChat && !communityChatHasMore && communityMessages.length > 0 && (
                <div className="chat-date-separator">
                  <span>Start</span>
                </div>
              )}
              {activeCommunity &&
                !isLoadingChat &&
                timelineItems.map((item) => {
                  if (item.kind === "activity") {
                    return (
                      <div key={item.key} className="community-chat-timeline-item">
                        {item.dateSeparator ? (
                          <div className="chat-date-separator">
                            <span>{item.dateSeparator}</span>
                          </div>
                        ) : null}
                        <div className="community-activity-marker" role="note">
                          <span className="community-activity-marker-dot" aria-hidden="true" />
                          <span className="community-activity-marker-text">
                            {formatCommunityActivityLabel(item.event, displayName)}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  const viewModel = item.viewModel;
                  const { message, senderProfile } = viewModel;
                  return (
                    <div key={item.key} className="community-chat-timeline-item">
                      {item.dateSeparator ? (
                        <div className="chat-date-separator">
                          <span>{item.dateSeparator}</span>
                        </div>
                      ) : null}
                      <CommunityChatMessageRow
                        message={message}
                        copied={copiedCommunityMessageId === message.id}
                        dateSeparator={null}
                        isPending={viewModel.isPending}
                        showMeta={viewModel.showMeta}
                        isOwn={viewModel.isOwn}
                        canModerateContent={canModerateMessages}
                        senderLabel={viewModel.senderLabel}
                        senderHandle={senderProfile?.handle ?? null}
                        senderBio={senderProfile?.bio ?? null}
                        avatarUrl={viewModel.avatarUrl}
                        avatarFocusX={senderProfile?.avatar_focus_x ?? 0.5}
                        avatarFocusY={senderProfile?.avatar_focus_y ?? 0.5}
                        avatarZoom={senderProfile?.avatar_zoom ?? 1}
                        avatarColor={viewModel.avatarColor}
                        shortTime={viewModel.shortTime}
                        formattedTime={viewModel.formattedTime}
                        isEditing={editingMessageId === message.id}
                        editingMessageText={editingMessageText}
                        isReactionPickerOpen={reactionPickerMessageId === message.id}
                        messageReactions={viewModel.reactions}
                        sessionUserId={sessionUserId}
                        replyToId={viewModel.replyToId}
                        replyTarget={viewModel.replyTarget}
                        reactionEmojis={reactionEmojis}
                        getInitials={getInitials}
                        displayName={displayName}
                        parseReplyPrefix={parseReplyPrefix}
                        truncateReplyPreview={truncateReplyPreview}
                        renderTextWithLinks={renderTextWithLinks}
                        onScrollToReplyMessage={onScrollToReplyMessage}
                        onOpenCommunityChatLightbox={onOpenCommunityChatLightbox}
                        onToggleReaction={onToggleReaction}
                        onSetReactionPickerMessageId={onSetReactionPickerMessageId}
                        onStartReply={onStartReply}
                        onCopyMessage={onCopyMessage}
                        onStartEdit={onStartEdit}
                        onDeleteMessage={onDeleteMessage}
                        onEditingMessageTextChange={onEditingMessageTextChange}
                        onSaveEdit={onSaveEdit}
                        onCancelEdit={onCancelEdit}
                        onOpenSenderProfile={setProfilePanelUserId}
                        onMessageSender={canOpenDirectMessageFromCommunity ? openDirectMessage : undefined}
                      />
                    </div>
                  );
                })}
              {activeCommunity && !isLoadingChat && typingLabel && (
                <div className="chat-typing-indicator" aria-live="polite">
                  {typingLabel}
                </div>
              )}
              </div>
            </div>
          )}

          {!showInteractionProjection && !isUserAtBottom && (
            <button
              className="scroll-to-bottom workspace"
              type="button"
              onClick={onScrollToBottom}
              aria-label="Scroll to bottom"
              title="Scroll to bottom"
            >
              {unreadCount > 0 && (
                <span className="scroll-badge" aria-hidden="true">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14" />
                <path d="M19 12l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>

        {!showInteractionProjection ? mainCommunityComposer : null}

        {isProfileSetupGateActive ? (
          <div className="community-chat-profile-gate">
            <span>Finish your profile before posting in communities.</span>
            <button type="button" onClick={onFinishProfileSetup}>
              Finish profile
            </button>
          </div>
        ) : null}

        {communityChatError && <div className="auth-error">{communityChatError}</div>}
      </div>

      {profilePanelUserId ? (
        <WebCommunityProfilePanel
          profile={profilePanelProfile}
          displayName={profilePanelDisplayName}
          avatarColor={profilePanelAvatarColor}
          communityContext={profilePanelCommunityContext}
          isSelfProfile={profilePanelCommunityContext.is_self || Boolean(profilePanelUserId && sessionUserId && profilePanelUserId === sessionUserId)}
          isMessageDisabled={!canOpenDirectMessageFromCommunity || !profilePanelCommunityContext.can_message}
          onMessage={
            profilePanelUserId && profilePanelUserId !== sessionUserId && profilePanelCommunityContext.message_context_community_id
              ? () => openDirectMessage(profilePanelUserId, profilePanelCommunityContext.message_context_community_id)
              : undefined
          }
          getInitials={getInitials}
        />
      ) : null}

      <WebCommunityChatLightboxModal {...lightboxModalProps} />
    </>
  );
}
