import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import type { AuthSession } from "../auth";
import type { CommittedMention } from "../components/communityMentionAutocomplete";
import {
  isLikelyImageFile,
  isLikelyMediaFile,
  isLikelyTextFile,
  isSupportedChatRasterImage,
  readChatImageAsDataUrl,
  readTextAttachmentPreview,
} from "../../../../shared/attachmentHelpers";
import { copyTextToClipboard } from "../../../../shared/chatUi";
import {
  createCloudCommunityInteractionComposerMessageRows,
} from "../../../../shared/cloudCommunityInteractionsGateway";
import {
  uploadCloudCommunityChatAttachmentFile,
} from "../../../../shared/cloudCommunityChatGateway";
import {
  buildReplyPrefix,
  extractTextFromContentJson,
  parseMessageAttachments,
  parseReplyPrefix,
  type CommunityMessageAttachment,
} from "../../../../shared/communityMessageParsing";
import type {
  ChatLightboxImage,
  CommunityActivityEvent,
  CommunityChatMessage as SharedCommunityChatMessage,
  MessageReaction,
} from "../../../../shared/communityTypes";
import { useCommunityChatDataController } from "../../../../shared/useCommunityChatDataController";
import { useCommunityChatLightbox } from "../../../../shared/useCommunityChatLightbox";
import { useCommunityChatMutationController } from "../../../../shared/useCommunityChatMutationController";
import { useCommunityChatRealtime } from "../../../../shared/useCommunityChatRealtime";
import { useCommunityChatViewport } from "../../../../shared/useCommunityChatViewport";
import { useMessageAttachmentInputController } from "../../../../shared/useMessageAttachmentInputController";

const COMMUNITY_CHAT_PAGE_SIZE = 50;
const COMMUNITY_CHAT_LOAD_MORE_THRESHOLD_PX = 140;
const MAX_WEB_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_WEB_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_WEB_MEDIA_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_WEB_FILE_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_WEB_TEXT_ATTACHMENT_BYTES = 200 * 1024;
const MAX_WEB_IMAGE_DATA_URL_CHARS = 600_000;
export const WEB_COMMUNITY_REACTION_EMOJIS = [
  "👍",
  "❤️",
  "😂",
  "🔥",
  "🫡",
  "🎉",
];

export type WebCommunityMessageAttachment = CommunityMessageAttachment & {
  file?: File | null;
};

export type WebCommunityChatMessage =
  SharedCommunityChatMessage<WebCommunityMessageAttachment>;

export type WebCommunityReplyTarget = Pick<
  WebCommunityChatMessage,
  "id" | "sender_id" | "body"
> & {
  interaction_root_id?: string | null;
  interaction_reply_id?: string | null;
  legacy_message_id?: string | null;
};

type EnsureAuthSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

type CommunityInteractionComposerBoundary = {
  enabled: boolean;
  error: string | null;
  selectedRootId: string | null;
  insertOptimistic: (pending: {
    idempotencyKey: string;
    communityId: string;
    kind: "root" | "reply";
    rootId: string | null;
    replyToMessageId: string | null;
    text: string;
    attachments: WebCommunityMessageAttachment[];
    serializedAttachments: unknown[];
    createdAt: string;
    senderId: string;
  }) => void;
  settleOptimistic: (settlement: {
    idempotencyKey: string;
    status: "failed";
  }) => void;
  loadRoots: (
    communityId?: string | null,
    session?: AuthSession | null,
  ) => Promise<void>;
  loadReplies: (
    rootId: string,
    session?: AuthSession | null,
  ) => Promise<void>;
};

type UseWebCommunityChatControllerParams = {
  activeCommunityId: string | null;
  canonicalSessionUserId: string | null;
  ensureSession: EnsureAuthSession;
  hasActiveCommunity: boolean;
  interaction: CommunityInteractionComposerBoundary;
  isCommunityChatActive: boolean;
  isCommunityPageActive: boolean;
  isProfileSetupComplete: boolean;
  loadProfiles: (userIds: string[], session: AuthSession) => Promise<void>;
  onMessageSent: (event: {
    communityId: string;
    hasAttachments: boolean;
    hasReply: boolean;
  }) => void;
  onOpenProfileSetup: () => void;
  session: AuthSession | null;
  canMentionEverybodyRef: MutableRefObject<boolean>;
};

function displayNameForAttachmentFile(file: File, fallbackIndex: number): string {
  const existingName = (file.name ?? "").trim();
  if (existingName) return existingName;
  const mime = (file.type ?? "").toLowerCase();
  const extension =
    mime === "image/png"
      ? "png"
      : mime === "image/jpeg"
        ? "jpg"
        : mime === "image/webp"
          ? "webp"
          : mime === "image/gif"
            ? "gif"
            : mime === "application/pdf"
              ? "pdf"
              : "bin";
  return `${mime.startsWith("image/") ? "Pasted image" : "Attachment"} ${fallbackIndex + 1}.${extension}`;
}

async function ingestAttachments(
  files: FileList | readonly File[],
  existing: WebCommunityMessageAttachment[],
  onError: (message: string) => void,
): Promise<WebCommunityMessageAttachment[]> {
  if (files.length === 0) return existing;
  const remaining = Math.max(0, MAX_WEB_ATTACHMENTS_PER_MESSAGE - existing.length);
  if (remaining === 0) {
    onError(`You can attach up to ${MAX_WEB_ATTACHMENTS_PER_MESSAGE} files per message.`);
    return existing;
  }

  const picked = Array.from(files).slice(0, remaining);
  const next: WebCommunityMessageAttachment[] = [];
  for (const [index, file] of picked.entries()) {
    if (!file) continue;
    const name = displayNameForAttachmentFile(file, index);
    const isImage = isLikelyImageFile(file);
    const isMedia = !isImage && isLikelyMediaFile(file);
    const maxBytes = isImage
      ? MAX_WEB_IMAGE_UPLOAD_BYTES
      : isMedia
        ? MAX_WEB_MEDIA_UPLOAD_BYTES
        : MAX_WEB_FILE_UPLOAD_BYTES;
    if (file.size > maxBytes) {
      onError(`${name} is too large (max ${(maxBytes / (1024 * 1024)).toFixed(0)}MB).`);
      continue;
    }
    const attachment: WebCommunityMessageAttachment = {
      id: crypto.randomUUID(),
      name,
      type: "file",
      mime: (file.type ?? "").trim() || null,
      size: file.size,
      file,
    };
    try {
      if (isImage) {
        if (!isSupportedChatRasterImage(file)) {
          onError(`${name}: unsupported image format. Please use PNG, JPG, GIF, WEBP, or AVIF.`);
          continue;
        }
        attachment.type = "image";
        attachment.data_url = await readChatImageAsDataUrl(file, MAX_WEB_IMAGE_DATA_URL_CHARS);
        next.push(attachment);
        continue;
      }
      if (isLikelyTextFile(file)) {
        const { text, truncated } = await readTextAttachmentPreview(
          file,
          MAX_WEB_TEXT_ATTACHMENT_BYTES,
        );
        attachment.text = text;
        attachment.truncated = truncated;
        next.push(attachment);
        continue;
      }
    } catch (readError) {
      const message =
        typeof readError === "string"
          ? readError
          : readError instanceof Error
            ? readError.message
            : "Failed to read file.";
      onError(`${name}: ${message}`);
      continue;
    }
    next.push(attachment);
  }

  return [...existing, ...next];
}

async function prepareAttachmentsForSend(
  attachments: WebCommunityMessageAttachment[],
  session: AuthSession,
  communityId: string,
): Promise<WebCommunityMessageAttachment[]> {
  const prepared: WebCommunityMessageAttachment[] = [];
  for (const attachment of attachments) {
    const currentStorageId = String(attachment.storage_id ?? "").trim();
    let nextStorageId = currentStorageId || null;
    if (!nextStorageId && attachment.file instanceof File) {
      nextStorageId = await uploadCloudCommunityChatAttachmentFile({
        session,
        communityId,
        file: attachment.file,
      });
    }
    prepared.push({
      ...attachment,
      storage_id: nextStorageId,
      file: null,
    });
  }
  return prepared;
}

function serializeAttachmentsForWrite(
  attachments: WebCommunityMessageAttachment[],
): unknown[] {
  const serialized: unknown[] = [];
  for (const attachment of attachments) {
    const storageId = String(attachment.storage_id ?? "").trim();
    const dataUrl =
      typeof attachment.data_url === "string" && attachment.data_url.trim().startsWith("data:")
        ? attachment.data_url.trim()
        : "";
    if (!storageId && !dataUrl) continue;
    serialized.push({
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      mime: attachment.mime ?? null,
      size: attachment.size,
      ...(storageId ? { storageId } : null),
      ...(dataUrl ? { data_url: dataUrl } : null),
      ...(attachment.text ? { text: attachment.text } : null),
      ...(typeof attachment.truncated === "boolean"
        ? { truncated: attachment.truncated }
        : null),
    });
  }
  return serialized;
}

export function useWebCommunityChatController(
  params: UseWebCommunityChatControllerParams,
) {
  const {
    activeCommunityId,
    canonicalSessionUserId,
    ensureSession,
    hasActiveCommunity,
    interaction,
    isCommunityChatActive,
    isCommunityPageActive,
    isProfileSetupComplete,
    loadProfiles,
    onMessageSent,
    onOpenProfileSetup,
    session,
    canMentionEverybodyRef,
  } = params;

  const [messages, setMessages] = useState<WebCommunityChatMessage[]>([]);
  const [activityEvents, setActivityEvents] = useState<CommunityActivityEvent[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [messageMentions, setMessageMentions] = useState<CommittedMention[]>([]);
  const [attachments, setAttachments] = useState<WebCommunityMessageAttachment[]>([]);
  const attachmentsRef = useRef<WebCommunityMessageAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);
  const isUserAtBottomRef = useRef(true);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const loadOlderFromScrollRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [replyingToMessage, setReplyingToMessage] =
    useState<WebCommunityReplyTarget | null>(null);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [reactionPickerMessageId, setReactionPickerMessageId] =
    useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [editingMessagePrefix, setEditingMessagePrefix] = useState<string | null>(null);
  const capturePrependAnchorRef = useRef<() => void>(() => {});
  const clearPendingPrependAnchorRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!messageInput) setMessageMentions([]);
  }, [messageInput]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    messageIdsRef.current = new Set(messages.map((message) => message.id));
  }, [messages]);

  const {
    isCommunityChatLightboxOpen,
    communityChatLightboxImages,
    communityChatLightboxIndex,
    setCommunityChatLightboxIndex,
    openCommunityChatLightbox,
    closeCommunityChatLightbox,
  } = useCommunityChatLightbox<ChatLightboxImage>();

  const {
    handleAttachmentFileInputChange,
    handleAttachmentDrop,
    handleAttachmentDragEnter,
    handleAttachmentDragOver,
    handleAttachmentDragLeave,
    handleAttachmentPaste,
    isAttachmentDragOver,
    removeAttachment,
  } = useMessageAttachmentInputController<WebCommunityMessageAttachment>({
    attachmentsRef,
    setAttachments,
    setError,
    ingestAttachmentsFromFileList: ingestAttachments,
  });

  const {
    isLoadingChat,
    isLoadingMoreChat,
    communityChatHasMore,
    hasResolvedCommunityChat,
    toCommunityChatMessage,
    ensureCommunityChatThread,
    loadCommunityChat,
    loadOlderCommunityChat,
    resetCommunityChatDataState,
  } = useCommunityChatDataController<
    AuthSession,
    WebCommunityMessageAttachment,
    WebCommunityChatMessage,
    MessageReaction
  >({
    extractTextFromContentJson,
    parseMessageAttachments,
    ensureSession,
    pageSize: COMMUNITY_CHAT_PAGE_SIZE,
    setCommunityMessages: setMessages,
    setMessageReactions: setReactions,
    setUnreadCount,
    setIsUserAtBottom,
    isUserAtBottomRef,
    capturePrependAnchor: () => capturePrependAnchorRef.current(),
    clearPendingPrependAnchor: () => clearPendingPrependAnchorRef.current(),
    onLoadChatStart: () => setError(null),
    onLoadChatError: setError,
    onHydrateProfiles: loadProfiles,
  });

  const {
    handleChatScroll,
    capturePrependAnchor,
    clearPendingPrependAnchor,
  } = useCommunityChatViewport({
    isEnabled: isCommunityChatActive,
    communityMessages: messages,
    communityChatListRef: messageListRef,
    isUserAtBottom,
    isUserAtBottomRef,
    setIsUserAtBottom,
    setUnreadCount,
    loadMoreThresholdPx: COMMUNITY_CHAT_LOAD_MORE_THRESHOLD_PX,
    canLoadOlder: Boolean(
      session
      && activeCommunityId
      && isCommunityChatActive
      && communityChatHasMore
      && !isLoadingChat
      && !isLoadingMoreChat
    ),
    onLoadOlder: () => loadOlderFromScrollRef.current?.(),
  });

  capturePrependAnchorRef.current = capturePrependAnchor;
  clearPendingPrependAnchorRef.current = clearPendingPrependAnchor;
  loadOlderFromScrollRef.current = () => {
    if (!session || !activeCommunityId) return;
    void loadOlderCommunityChat(activeCommunityId, session);
  };

  useCommunityChatRealtime({
    // Canonical roots/replies are the normal UI. This is the explicit legacy fallback.
    isEnabled:
      isCommunityPageActive
      && hasResolvedCommunityChat
      && !interaction.enabled,
    session,
    ensureSession,
    activeCommunityId,
    ensureCommunityChatThread,
    toCommunityChatMessage,
    communityMessageIdsRef: messageIdsRef,
    isUserAtBottomRef,
    setUnreadCount,
    setCommunityMessages: setMessages,
    setMessageReactions: setReactions,
    setCommunityActivityEvents: setActivityEvents,
    onLoadProfiles: loadProfiles,
  });

  useEffect(() => {
    if (!isCommunityPageActive || !activeCommunityId || !hasResolvedCommunityChat) return;
    if (isCommunityChatActive || !isUserAtBottomRef.current) return;
    setIsUserAtBottom(false);
    isUserAtBottomRef.current = false;
  }, [
    activeCommunityId,
    hasResolvedCommunityChat,
    isCommunityChatActive,
    isCommunityPageActive,
  ]);

  const {
    handleToggleReaction,
    handleStartReply,
    handleStartEdit,
    handleCancelEdit,
    handleSaveEdit,
    handleDeleteMessage,
    handleSendCommunityMessage,
  } = useCommunityChatMutationController({
    activeCommunityId,
    canMentionEverybodyRef,
    session,
    sessionUserId: canonicalSessionUserId,
    ensureSession,
    missingPayloadMessage: "Message sent, but no payload returned.",
    ensureCommunityChatThread,
    useCanonicalCommunityInteractions: Boolean(
      interaction.enabled
      && hasActiveCommunity
      && hasResolvedCommunityChat
      && !isLoadingChat
    ),
    onCanonicalOptimisticInsert: interaction.insertOptimistic,
    onCanonicalOptimisticSettle: interaction.settleOptimistic,
    createCommunityInteractionMessageRows: (writeParams) =>
      createCloudCommunityInteractionComposerMessageRows<
        AuthSession,
        Parameters<typeof toCommunityChatMessage>[0]
      >({
        session: writeParams.session,
        communityId: writeParams.communityId,
        idempotencyKey: writeParams.idempotencyKey,
        text: writeParams.text,
        rootId: writeParams.rootId ?? null,
        replyToMessageId: writeParams.replyToMessageId ?? null,
        mentions: writeParams.mentions,
        attachments: writeParams.attachments,
      }),
    toCommunityChatMessage,
    loadCommunityChat,
    parseReplyPrefix,
    buildReplyPrefix,
    beforeSendValidate: async () => {
      if (!isProfileSetupComplete) {
        onOpenProfileSetup();
        return "Finish your profile before posting in communities.";
      }
      return null;
    },
    confirmEverybodyMentionSend: async ({ emailMode }) => {
      if (typeof window === "undefined") return true;
      const message =
        emailMode === "in_app_only"
          ? "This @everybody mention will notify members in app only. The email blast is on cooldown."
          : emailMode === "in_app_and_email"
            ? "This @everybody mention will notify members in app. Unread members may also get an email after 15 minutes. Email blasts are limited to once every 72 hours."
            : "This @everybody mention will notify members in app. If the email blast is available, unread members may also get an email after 15 minutes.";
      return window.confirm(message);
    },
    onProfileSetupRequired: onOpenProfileSetup,
    prepareAttachmentsForSend,
    serializeAttachmentsForWrite,
    onOptimisticSendScrollIntent: () => {
      setIsUserAtBottom(true);
      isUserAtBottomRef.current = true;
    },
    onCommunityMessageSent: ({ communityId, hasAttachments, hasReply }) => {
      onMessageSent({ communityId, hasAttachments, hasReply });
      if (!interaction.enabled) return;
      void interaction.loadRoots(communityId, session);
      if (hasReply && interaction.selectedRootId) {
        void interaction.loadReplies(interaction.selectedRootId, session);
      }
    },
    chatInputRef: inputRef,
    communityAttachmentsRef: attachmentsRef,
    communityMessageInput: messageInput,
    communityMessageMentions: messageMentions,
    communityMessages: messages,
    messageReactions: reactions,
    replyingToMessage,
    editingMessageId,
    editingMessageText,
    editingMessagePrefix,
    setCommunityMessages: setMessages,
    setMessageReactions: setReactions,
    setCommunityMessageInput: setMessageInput,
    setCommunityAttachments: setAttachments,
    setReplyingToMessage,
    setReactionPickerMessageId,
    setEditingMessageId,
    setEditingMessageText,
    setEditingMessagePrefix,
    setIsSendingCommunityMessage: setIsSendingMessage,
    setCommunityChatError: setError,
  });

  const resetChatState = useCallback(() => {
    setError(null);
    setMessages([]);
    setActivityEvents([]);
    setMessageInput("");
    setMessageMentions([]);
    setAttachments([]);
    setUnreadCount(0);
    setIsUserAtBottom(true);
    isUserAtBottomRef.current = true;
    setIsSendingMessage(false);
    setReplyingToMessage(null);
    setReactions([]);
    setReactionPickerMessageId(null);
    setEditingMessageId(null);
    setEditingMessageText("");
    setEditingMessagePrefix(null);
    resetCommunityChatDataState();
    clearPendingPrependAnchor();
    if (inputRef.current) inputRef.current.style.height = "auto";
  }, [clearPendingPrependAnchor, resetCommunityChatDataState]);

  useEffect(() => {
    resetChatState();
  }, [activeCommunityId, resetChatState]);

  useEffect(() => {
    const setupGateMessage =
      [error, interaction.error].find((message) =>
        Boolean(
          message
          && (
            message.includes("profile_setup_required")
            || message.includes("account_setup_required")
            || message.includes("Finish your profile")
          ),
        ),
      ) ?? null;
    if (!setupGateMessage) return;
    onOpenProfileSetup();
  }, [error, interaction.error, onOpenProfileSetup]);

  const copyMessage = useCallback(async (messageId: string, text: string) => {
    await copyTextToClipboard(text);
    setCopiedMessageId(messageId);
    window.setTimeout(() => {
      setCopiedMessageId((current) => (current === messageId ? null : current));
    }, 2000);
  }, []);

  const messageById = useMemo(() => {
    const byId = new Map<string, WebCommunityChatMessage>();
    for (const message of messages) byId.set(message.id, message);
    return byId;
  }, [messages]);

  const scrollToMessage = useCallback((messageId: string) => {
    document.getElementById(`msg-${messageId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    setIsUserAtBottom(true);
    isUserAtBottomRef.current = true;
    setUnreadCount(0);
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  const markChatSelected = useCallback(() => {
    setUnreadCount(0);
    setIsUserAtBottom(true);
    isUserAtBottomRef.current = true;
  }, []);

  const setMessageInputFromTextarea = useCallback((
    value: string,
    textarea?: HTMLTextAreaElement,
  ) => {
    setMessageInput(value);
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, []);

  return {
    messages,
    activityEvents,
    messageById,
    messageInput,
    setMessageInput,
    messageMentions,
    setMessageMentions,
    attachments,
    error,
    setError,
    copiedMessageId,
    unreadCount,
    setUnreadCount,
    isUserAtBottom,
    setIsUserAtBottom,
    isUserAtBottomRef,
    isSendingMessage,
    replyingToMessage,
    setReplyingToMessage,
    reactions,
    reactionPickerMessageId,
    setReactionPickerMessageId,
    editingMessageId,
    editingMessageText,
    setEditingMessageText,
    editingMessagePrefix,
    isLoadingChat,
    isLoadingMoreChat,
    communityChatHasMore,
    hasResolvedCommunityChat,
    ensureCommunityChatThread,
    loadCommunityChat,
    resetChatState,
    messageListRef,
    inputRef,
    fileInputRef,
    handleChatScroll,
    handleAttachmentFileInputChange,
    ingestAttachmentsFromFileList: ingestAttachments,
    handleAttachmentDrop,
    handleAttachmentDragEnter,
    handleAttachmentDragOver,
    handleAttachmentDragLeave,
    handleAttachmentPaste,
    isAttachmentDragOver,
    removeAttachment,
    openCommunityChatLightbox,
    lightbox: {
      isOpen: isCommunityChatLightboxOpen,
      images: communityChatLightboxImages,
      index: communityChatLightboxIndex,
      setIndex: setCommunityChatLightboxIndex,
      onClose: closeCommunityChatLightbox,
    },
    handleToggleReaction,
    handleStartReply,
    handleStartEdit,
    handleCancelEdit,
    handleSaveEdit,
    handleDeleteMessage,
    handleSendCommunityMessage,
    copyMessage,
    scrollToMessage,
    scrollToBottom,
    markChatSelected,
    setMessageInputFromTextarea,
  };
}
