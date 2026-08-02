import {
  useCallback,
  useEffect,
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
import {
  createCloudCommunityInteractionComposerMessageRows,
} from "../../../../shared/cloudCommunityInteractionsGateway";
import {
  uploadCloudCommunityChatAttachmentFile,
} from "../../../../shared/cloudCommunityChatGateway";
import {
  type CommunityMessageAttachment,
} from "../../../../shared/communityMessageParsing";
import { resolveAuthSubject } from "../../../../shared/authSession";
import { resolveUsableSession } from "../../../../shared/ensureUsableSession";
import { textContainsMentionToken } from "../../../../shared/communityMentionRendering";
import type { ChatLightboxImage } from "../../../../shared/communityTypes";
import { useCommunityChatLightbox } from "../../../../shared/useCommunityChatLightbox";
import { useMessageAttachmentInputController } from "../../../../shared/useMessageAttachmentInputController";

const MAX_WEB_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_WEB_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_WEB_MEDIA_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_WEB_FILE_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_WEB_TEXT_ATTACHMENT_BYTES = 200 * 1024;
const MAX_WEB_IMAGE_DATA_URL_CHARS = 600_000;
export type WebCommunityMessageAttachment = CommunityMessageAttachment & {
  file?: File | null;
};

export type WebCommunityReplyTarget = {
  id: string;
  sender_id: string;
  body: string;
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
  error: string | null;
  insertOptimistic: (pending: {
    idempotencyKey: string;
    communityId: string;
    channelId: string | null;
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
  activeChannelId: string | null;
  canonicalSessionUserId: string | null;
  ensureSession: EnsureAuthSession;
  interaction: CommunityInteractionComposerBoundary;
  isProfileSetupComplete: boolean;
  onMessageSent: (event: {
    communityId: string;
    hasAttachments: boolean;
    hasReply: boolean;
  }) => void;
  onOpenProfileSetup: () => void;
  session: AuthSession | null;
  canMentionEverybodyRef: MutableRefObject<boolean>;
};

type WebCommunityMessageSendDraft = {
  text?: string;
  attachments?: WebCommunityMessageAttachment[];
  mentions?: CommittedMention[];
  replyingToMessage?: WebCommunityReplyTarget | null;
  inputRef?: MutableRefObject<HTMLTextAreaElement | null> | null;
  clearDraft?: () => void;
  restoreDraft?: () => void;
};

const EVERYBODY_MENTION_ROLE_KEY = "everybody";
const EVERYBODY_MENTION_TOKENS = ["@everybody", "@everyone"] as const;

function mentionTokenIsEverybody(rawToken: unknown): boolean {
  const token = String(rawToken ?? "").trim().toLowerCase();
  return EVERYBODY_MENTION_TOKENS.some((candidate) => token === candidate);
}

function textContainsEverybodyMentionToken(text: string): boolean {
  return EVERYBODY_MENTION_TOKENS.some((token) =>
    textContainsMentionToken(text, token),
  );
}

function isProfileSetupRequiredError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";
  return message.includes("profile_setup_required");
}

function mapCommunityComposerErrorMessage(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "Failed to send message.";
  if (message.includes("profile_setup_required")) {
    return "Finish your profile before posting in communities.";
  }
  if (message.includes("message_attachment_limit_exceeded")) {
    return "You can attach up to 8 files per message.";
  }
  if (message.includes("message_attachment_payload_too_large")) {
    return "One attachment preview is too large. Try a smaller image.";
  }
  if (
    message.includes("community_interaction_reply_target_unmapped") ||
    message.includes("interaction_legacy_reply_target") ||
    message.includes("interaction_target_reply_invalid")
  ) {
    return "Reply target is unavailable. Reopen the thread and try again.";
  }
  if (message.includes("interaction_mention_everybody_reply_not_allowed")) {
    return "@everybody can only be used in top-level community posts.";
  }
  if (message.includes("interaction_mention_everybody_edit_create_not_allowed")) {
    return "Create a new top-level post to notify everybody.";
  }
  return message;
}

function createCommunityComposerIdempotencyKey(
  communityId: string,
  channelId: string | null,
  rootId: string | null,
): string {
  return [
    "community-composer",
    communityId,
    channelId ?? "general",
    rootId ? `reply:${rootId}` : "root",
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 10),
  ].join(":");
}

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
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const [messageInput, setMessageInput] = useState("");
  const [messageMentions, setMessageMentions] = useState<CommittedMention[]>([]);
  const [attachments, setAttachments] = useState<WebCommunityMessageAttachment[]>([]);
  const attachmentsRef = useRef<WebCommunityMessageAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [replyingToMessage, setReplyingToMessage] =
    useState<WebCommunityReplyTarget | null>(null);

  useEffect(() => {
    if (!messageInput) setMessageMentions([]);
  }, [messageInput]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

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

  const handleStartReply = useCallback((message: WebCommunityReplyTarget) => {
    if (message.id.startsWith("pending-")) return;
    setReplyingToMessage(message);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleSendCommunityMessage = useCallback(async (
    draft?: WebCommunityMessageSendDraft,
  ) => {
    const current = paramsRef.current;
    const activeCommunityId = current.activeCommunityId;
    if (!activeCommunityId) return;
    const activeSession = await resolveUsableSession(
      current.session,
      current.ensureSession,
    );
    if (!activeSession) return;
    const sessionUserId =
      String(current.canonicalSessionUserId ?? "").trim() ||
      resolveAuthSubject(activeSession);
    if (!sessionUserId) return;

    const rawText = String(draft?.text ?? messageInput).trim();
    const attachmentsToSend = draft?.attachments
      ? [...draft.attachments]
      : [...attachmentsRef.current];
    if (!rawText && attachmentsToSend.length === 0) return;
    if (!current.isProfileSetupComplete) {
      current.onOpenProfileSetup();
      setError("Finish your profile before posting in communities.");
      return;
    }

    const replySnapshot = draft
      ? draft.replyingToMessage ?? null
      : replyingToMessage;
    const replyRootId =
      String(replySnapshot?.interaction_root_id ?? "").trim() || null;
    if (replySnapshot && !replyRootId) {
      setError("Reply target is unavailable. Reopen the thread and try again.");
      return;
    }
    const interactionReplyToId =
      String(replySnapshot?.interaction_reply_id ?? "").trim() || null;
    const legacyReplyToMessageId =
      String(replySnapshot?.legacy_message_id ?? "").trim() || null;
    const canonicalReplyToMessageId =
      interactionReplyToId ?? legacyReplyToMessageId;
    if (replySnapshot && textContainsEverybodyMentionToken(rawText)) {
      setError("@everybody can only be used in top-level community posts.");
      return;
    }

    const mentionDraft = draft?.mentions ?? messageMentions;
    const mentionsToSend: {
      userId?: string;
      agentKey?: string;
      roleKey?: string;
    }[] = [];
    const seenMentionKeys = new Set<string>();
    for (const mention of mentionDraft) {
      const mentionKey =
        mention.kind === "role"
          ? `role:${mention.roleKey ?? EVERYBODY_MENTION_ROLE_KEY}`
          : mention.kind === "community_agent"
            ? `agent:${mention.agentKey ?? "community_agent"}`
            : `user:${mention.userId}`;
      if (seenMentionKeys.has(mentionKey)) continue;
      if (!textContainsMentionToken(rawText, mention.token)) continue;
      seenMentionKeys.add(mentionKey);
      if (mention.kind === "role") {
        mentionsToSend.push({
          roleKey: mention.roleKey ?? EVERYBODY_MENTION_ROLE_KEY,
        });
      } else if (mention.kind === "community_agent") {
        mentionsToSend.push({ agentKey: mention.agentKey ?? "community_agent" });
      } else if (mention.userId) {
        mentionsToSend.push({ userId: mention.userId });
      }
    }
    const committedEverybodyMention = mentionDraft.find(
      (mention) =>
        (mention.kind === "role" || mentionTokenIsEverybody(mention.token)) &&
        (mention.roleKey ?? EVERYBODY_MENTION_ROLE_KEY) ===
          EVERYBODY_MENTION_ROLE_KEY &&
        textContainsMentionToken(rawText, mention.token),
    );
    if (
      current.canMentionEverybodyRef.current &&
      !replySnapshot &&
      !seenMentionKeys.has(`role:${EVERYBODY_MENTION_ROLE_KEY}`) &&
      !committedEverybodyMention &&
      textContainsEverybodyMentionToken(rawText)
    ) {
      mentionsToSend.push({ roleKey: EVERYBODY_MENTION_ROLE_KEY });
    }
    if (mentionsToSend.some((mention) => mention.roleKey === EVERYBODY_MENTION_ROLE_KEY)) {
      const emailMode = committedEverybodyMention?.emailMode ?? null;
      const confirmation =
        emailMode === "in_app_only"
          ? "This @everybody mention will notify members in app only. The email blast is on cooldown."
          : emailMode === "in_app_and_email"
            ? "This @everybody mention will notify members in app. Unread members may also get an email after 15 minutes. Email blasts are limited to once every 72 hours."
            : "This @everybody mention will notify members in app. If the email blast is available, unread members may also get an email after 15 minutes.";
      if (typeof window !== "undefined" && !window.confirm(confirmation)) return;
    }

    const restoreDraft = () => {
      if (draft?.restoreDraft) {
        draft.restoreDraft();
        return;
      }
      setMessageInput(rawText);
      setAttachments(attachmentsToSend);
      setReplyingToMessage(replySnapshot);
    };
    if (draft?.clearDraft) {
      draft.clearDraft();
    } else {
      setMessageInput("");
      setMessageMentions([]);
      setAttachments([]);
      setReplyingToMessage(null);
    }
    const composerInputRef = draft?.inputRef ?? inputRef;
    if (composerInputRef?.current) composerInputRef.current.style.height = "auto";

    const idempotencyKey = createCommunityComposerIdempotencyKey(
      activeCommunityId,
      current.activeChannelId,
      replyRootId,
    );
    const createdAt = new Date().toISOString();
    let insertedOptimistic = false;
    setIsSendingMessage(true);
    setError(null);
    try {
      const preparedAttachments = await prepareAttachmentsForSend(
        attachmentsToSend,
        activeSession,
        activeCommunityId,
      );
      const serializedAttachments =
        serializeAttachmentsForWrite(preparedAttachments);
      current.interaction.insertOptimistic({
        idempotencyKey,
        communityId: activeCommunityId,
        channelId: current.activeChannelId,
        kind: replyRootId ? "reply" : "root",
        rootId: replyRootId,
        replyToMessageId: canonicalReplyToMessageId,
        text: rawText,
        attachments: preparedAttachments,
        serializedAttachments,
        createdAt,
        senderId: sessionUserId,
      });
      insertedOptimistic = true;
      await createCloudCommunityInteractionComposerMessageRows<AuthSession>({
        session: activeSession,
        communityId: activeCommunityId,
        channelId: current.activeChannelId,
        idempotencyKey,
        text: rawText,
        rootId: replyRootId,
        replyToMessageId: canonicalReplyToMessageId,
        mentions: mentionsToSend,
        attachments: serializedAttachments,
      });
      current.onMessageSent({
        communityId: activeCommunityId,
        hasAttachments: preparedAttachments.length > 0,
        hasReply: Boolean(replySnapshot),
      });
      void current.interaction.loadRoots(activeCommunityId, activeSession);
      if (replyRootId) {
        void current.interaction.loadReplies(replyRootId, activeSession);
      }
    } catch (sendError) {
      if (isProfileSetupRequiredError(sendError)) current.onOpenProfileSetup();
      if (insertedOptimistic) {
        current.interaction.settleOptimistic({
          idempotencyKey,
          status: "failed",
        });
      }
      setError(mapCommunityComposerErrorMessage(sendError));
      restoreDraft();
    } finally {
      setIsSendingMessage(false);
    }
  }, [messageInput, messageMentions, replyingToMessage]);

  const resetChatState = useCallback(() => {
    setError(null);
    setMessageInput("");
    setMessageMentions([]);
    setAttachments([]);
    setIsSendingMessage(false);
    setReplyingToMessage(null);
    if (inputRef.current) inputRef.current.style.height = "auto";
  }, []);

  useEffect(() => {
    resetChatState();
  }, [params.activeCommunityId, resetChatState]);

  useEffect(() => {
    setError(null);
    setMessageInput("");
    setMessageMentions([]);
    setAttachments([]);
    setIsSendingMessage(false);
    setReplyingToMessage(null);
    if (inputRef.current) inputRef.current.style.height = "auto";
  }, [params.activeChannelId]);

  useEffect(() => {
    const setupGateMessage =
      [error, params.interaction.error].find((message) =>
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
    params.onOpenProfileSetup();
  }, [error, params.interaction.error, params.onOpenProfileSetup]);

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
    messageInput,
    setMessageInput,
    messageMentions,
    setMessageMentions,
    attachments,
    error,
    setError,
    isSendingMessage,
    replyingToMessage,
    setReplyingToMessage,
    resetChatState,
    inputRef,
    fileInputRef,
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
    handleStartReply,
    handleSendCommunityMessage,
    setMessageInputFromTextarea,
  };
}
