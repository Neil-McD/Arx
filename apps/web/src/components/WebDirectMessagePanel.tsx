import { ArrowLeft, Ban, Bell, BellOff, MessageCircle, MoreHorizontal, Paperclip, RotateCcw } from "lucide-react";
import type { ChangeEvent, ClipboardEvent, ComponentProps, DragEvent, FormEvent, MutableRefObject, ReactNode } from "react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  DirectMessage,
  DirectMessageAttachment,
  DirectMessageConversation,
  DirectMessageParticipant,
  DirectMessageTypingPresenceBundle,
} from "../../../../shared/communityTypes";
import { formatRelativeTimeFromIso } from "../../../../shared/contentFormatting";
import { renderChatInlineMarkdown } from "../../../../shared/chatInlineMarkdownUi";
import { AttachmentChipButton } from "../../../../shared/AttachmentChipButton";
import { PdfDocumentCard } from "./PdfDocumentCard";
import { MessageLinkMedia } from "./MessageLinkMedia";
import { isPdfDocument, safeDocumentUrl } from "../../../../shared/messagePdf";
import { CommunityChatMediaGrid } from "../../../../shared/CommunityChatMediaGrid";
import { CommunityChatMediaPlayers } from "../../../../shared/CommunityChatMediaPlayers";
import { partitionCommunityAttachments } from "../../../../shared/communityAttachmentUi";
import { parseMessageAttachments } from "../../../../shared/communityMessageParsing";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { VoiceInputButton } from "../../../../shared/VoiceInputButton";

type DirectMessageComposerAttachment = DirectMessageAttachment & {
  data_url?: string | null;
  uploadStatus?: "queued" | "uploading" | "ready" | "failed";
  uploadError?: string | null;
};

type DirectMessageAttachmentFileInput = FileList | readonly File[];

export type WebDirectMessagePanelMessage = DirectMessage & {
  local_id?: string;
  local_status?: "sending" | "sent" | "failed";
  local_error?: string | null;
};

type WebDirectMessagePanelProps = {
  conversation: DirectMessageConversation;
  messages: WebDirectMessagePanelMessage[];
  input: string;
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  attachments: DirectMessageComposerAttachment[];
  typingPresence: DirectMessageTypingPresenceBundle;
  isPeerBlocked?: boolean;
  isConversationMuted?: boolean;
  showBlockAction?: boolean;
  onToggleBlockPeer?: () => void | Promise<void>;
  onToggleMuteConversation?: () => void | Promise<void>;
  peerLastActiveAt?: string | null;
  sessionUserId: string | null;
  getInitials: (value: string) => string;
  getAvatarColor: (seed: string) => string;
  renderTextWithLinks: (text: string) => ReactNode;
  inputRef?: MutableRefObject<HTMLTextAreaElement | null>;
  voiceButtonProps?: ComponentProps<typeof VoiceInputButton>;
  onInputChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  onAttachmentFilesSelected?: (files: DirectMessageAttachmentFileInput) => void | Promise<void>;
  onRetryAttachment?: (id: string) => void;
  onRemoveAttachment?: (id: string) => void;
  onRetryLocalMessage?: (localId: string) => void;
  onDiscardLocalMessage?: (localId: string) => void;
  onComposerBlur?: () => void | Promise<void>;
  onReadThroughSeq?: (seq: number) => void | Promise<void>;
  onBackToInbox?: () => void;
};

const DM_AUTO_SCROLL_THRESHOLD_PX = 96;
const DM_COMPOSER_MAX_HEIGHT_PX = 148;
const DM_CLUSTER_GAP_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDayMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatDirectMessageDayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const dayMs = startOfLocalDayMs(date);
  const todayMs = startOfLocalDayMs(now);
  if (dayMs === todayMs) return "Today";
  if (dayMs === todayMs - DAY_MS) return "Yesterday";
  return date.toLocaleDateString(
    [],
    date.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
  );
}

function formatDirectMessageClusterTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function directMessageSenderKey(message: WebDirectMessagePanelMessage): string {
  return `${message.sender_type}:${String(message.sender_user_id ?? "")}`;
}

const DM_PRESENCE_ACTIVE_NOW_WINDOW_MS = 5 * 60 * 1000;

function isDirectPeerActiveNow(lastActiveAt: string | null | undefined): boolean {
  const normalized = String(lastActiveAt ?? "").trim();
  if (!normalized) return false;
  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) && Date.now() - ms <= DM_PRESENCE_ACTIVE_NOW_WINDOW_MS;
}

function getMessageText(message: DirectMessage): string {
  const content = message.content_json;
  if (typeof content === "string") return content.trim();
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return String((content as Record<string, unknown>).text ?? "").trim();
  }
  return "";
}

function getMessageAttachments(message: DirectMessage): DirectMessageAttachment[] {
  return parseMessageAttachments(message.content_json).map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    mime: attachment.mime,
    size: attachment.size,
    url: attachment.url,
    storage_id: attachment.storage_id,
  }));
}

function openAttachmentUrl(url: string | null | undefined) {
  const normalizedUrl = String(url ?? "").trim();
  if (!normalizedUrl) return;
  window.open(normalizedUrl, "_blank", "noopener,noreferrer");
}

function hasDragFiles(event: DragEvent<HTMLElement>): boolean {
  const transfer = event.dataTransfer;
  if (!transfer) return false;
  if (transfer.files && transfer.files.length > 0) return true;
  if (Array.from(transfer.types ?? []).includes("Files")) return true;
  return Array.from(transfer.items ?? []).some((item) => item.kind === "file");
}

function getDragFiles(event: DragEvent<HTMLElement>): File[] {
  const transfer = event.dataTransfer;
  if (!transfer) return [];
  const files = Array.from(transfer.files ?? []).filter((file): file is File => file instanceof File);
  if (files.length > 0) return files;
  return Array.from(transfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file instanceof File);
}

function getComposerAttachmentUploadStatus(
  attachment: DirectMessageComposerAttachment,
): "queued" | "uploading" | "ready" | "failed" {
  if (String(attachment.storage_id ?? "").trim()) return "ready";
  if (attachment.uploadStatus) return attachment.uploadStatus;
  return "failed";
}

function getComposerAttachmentUploadLabel(status: "queued" | "uploading" | "ready" | "failed"): string {
  if (status === "queued") return "Queued";
  if (status === "uploading") return "Uploading";
  if (status === "failed") return "Upload failed";
  return "";
}

function DirectMessageAttachmentViews(props: {
  attachments: DirectMessageComposerAttachment[];
  isComposer?: boolean;
  onRetryAttachment?: (id: string) => void;
  onRemoveAttachment?: (id: string) => void;
}) {
  const { imageAttachments, videoAttachments, audioAttachments, fileAttachments } = partitionCommunityAttachments(props.attachments);
  if (
    imageAttachments.length === 0 &&
    videoAttachments.length === 0 &&
    audioAttachments.length === 0 &&
    fileAttachments.length === 0
  ) {
    return null;
  }
  const imageViews = imageAttachments.map((item) => ({
    id: item.attachment.id,
    url: item.url,
    previewUrl: item.previewUrl,
    fullUrl: item.fullUrl,
    name: item.name,
  }));
  return (
    <>
      {imageViews.length > 0 ? (
        props.isComposer ? (
          <div className={`chat-media-grid count-${Math.min(Math.max(imageViews.length, 1), 4)} chat-media-grid-composer community-dm-media-grid`}>
            {imageAttachments.map((item) => {
              const uploadStatus = getComposerAttachmentUploadStatus(item.attachment);
              const uploadLabel = getComposerAttachmentUploadLabel(uploadStatus);
              return (
                <div
                  key={item.attachment.id}
                  className={`chat-media-item chat-media-item-static community-dm-composer-media-item is-${uploadStatus}`}
                >
                  <img src={item.previewUrl} alt={item.name} />
                  {uploadStatus !== "ready" ? (
                    <div className="community-dm-attachment-state-overlay" aria-live="polite">
                      <span>{uploadLabel}</span>
                      {uploadStatus === "failed" ? (
                        <button
                          type="button"
                          className="community-dm-attachment-retry"
                          onClick={() => props.onRetryAttachment?.(item.attachment.id)}
                          title={item.attachment.uploadError ?? "Retry upload"}
                          aria-label={`Retry upload for ${item.name}`}
                        >
                          <RotateCcw aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="chat-media-remove"
                    onClick={() => props.onRemoveAttachment?.(item.attachment.id)}
                    title="Remove"
                    aria-label={`Remove ${item.name}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <CommunityChatMediaGrid
            images={imageViews}
            className="community-dm-media-grid"
            onOpenImage={(images, index) => {
              openAttachmentUrl(images[index]?.fullUrl ?? images[index]?.url ?? null);
            }}
          />
        )
      ) : null}
      {!props.isComposer && (videoAttachments.length > 0 || audioAttachments.length > 0) ? (
        <CommunityChatMediaPlayers videos={videoAttachments} audios={audioAttachments} />
      ) : null}
      {fileAttachments.length > 0 ? (
        <div className="attachments-preview community-dm-attachments-preview">
          {fileAttachments.map((attachment) => {
            if (props.isComposer) {
              const uploadStatus = getComposerAttachmentUploadStatus(attachment);
              const uploadLabel = getComposerAttachmentUploadLabel(uploadStatus);
              return (
                <div
                  key={attachment.id}
                  className={`attachment-item community-dm-attachment-item is-${uploadStatus}`}
                  title={attachment.uploadError ?? attachment.name}
                >
                  <div className="attachment-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                      <path d="M16 13H8" />
                      <path d="M16 17H8" />
                      <path d="M10 9H8" />
                    </svg>
                  </div>
                  <span className="attachment-name">{attachment.name}</span>
                  {uploadStatus !== "ready" ? (
                    <span className="community-dm-attachment-state">{uploadLabel}</span>
                  ) : null}
                  {uploadStatus === "failed" ? (
                    <button
                      className="community-dm-attachment-retry"
                      type="button"
                      onClick={() => props.onRetryAttachment?.(attachment.id)}
                      title={attachment.uploadError ?? "Retry upload"}
                      aria-label={`Retry upload for ${attachment.name}`}
                    >
                      <RotateCcw aria-hidden="true" />
                    </button>
                  ) : null}
                  <button
                    className="attachment-remove"
                    type="button"
                    onClick={() => props.onRemoveAttachment?.(attachment.id)}
                    title="Remove"
                    aria-label={`Remove ${attachment.name}`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            }
            if (safeDocumentUrl(attachment.url) && isPdfDocument(attachment.name, attachment.mime)) {
              return <PdfDocumentCard key={attachment.id} url={attachment.url!} name={attachment.name} />;
            }
            return (
              <AttachmentChipButton
                key={attachment.id}
                name={attachment.name}
                onClick={
                  typeof attachment.url === "string" && attachment.url.trim().length > 0
                    ? () => openAttachmentUrl(attachment.url)
                    : null
                }
                disabled={!(typeof attachment.url === "string" && attachment.url.trim().length > 0)}
              />
            );
          })}
        </div>
      ) : null}
    </>
  );
}

function resolveDirectMessagePeer(
  conversation: DirectMessageConversation,
  sessionUserId: string | null,
): DirectMessageParticipant | null {
  const activeParticipants = conversation.participants.filter((participant) => participant.status === "active");
  return (
    activeParticipants.find(
      (participant) => participant.participant_type === "user" && participant.user_id !== sessionUserId,
    ) ??
    activeParticipants.find((participant) => participant.participant_type === "user") ??
    activeParticipants[0] ??
    null
  );
}

function formatDirectTypingLabel(
  typingPresence: DirectMessageTypingPresenceBundle,
  fallbackName: string,
): string | null {
  const users = typingPresence.users;
  const totalCount = Math.max(users.length, Math.floor(Number(typingPresence.total_count ?? 0)));
  if (totalCount <= 0) return null;
  if (totalCount === 1) {
    const label = String(users[0]?.display_name ?? fallbackName ?? "Someone").trim() || "Someone";
    return `${label} is typing...`;
  }
  return `${totalCount} people are typing...`;
}

export function WebDirectMessagePanel(props: WebDirectMessagePanelProps) {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const composerFloatRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const shouldFollowMessagesRef = useRef(true);
  const previousConversationIdRef = useRef<string | null>(null);
  const previousLastMessageIdRef = useRef<string | null>(null);
  const [isAttachmentDragOver, setIsAttachmentDragOver] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);
  const threadEntries = useMemo(() => {
    type ThreadEntry = {
      message: WebDirectMessagePanelMessage;
      isNewDay: boolean;
      isClusterStart: boolean;
      isClusterEnd: boolean;
    };
    const renderable = props.messages.filter(
      (message) => getMessageText(message).length > 0 || getMessageAttachments(message).length > 0,
    );
    const entries: ThreadEntry[] = renderable.map((message, index) => {
      const previous = renderable[index - 1] ?? null;
      const createdMs = new Date(message.created_at).getTime();
      const previousMs = previous ? new Date(previous.created_at).getTime() : Number.NaN;
      const isNewDay =
        !previous ||
        Number.isNaN(createdMs) ||
        Number.isNaN(previousMs) ||
        startOfLocalDayMs(new Date(createdMs)) !== startOfLocalDayMs(new Date(previousMs));
      const isClusterStart =
        isNewDay ||
        !previous ||
        directMessageSenderKey(previous) !== directMessageSenderKey(message) ||
        !Number.isFinite(createdMs - previousMs) ||
        createdMs - previousMs > DM_CLUSTER_GAP_MS;
      return { message, isNewDay, isClusterStart, isClusterEnd: false };
    });
    for (const [index, entry] of entries.entries()) {
      entry.isClusterEnd = index === entries.length - 1 || entries[index + 1]!.isClusterStart;
    }
    return entries;
  }, [props.messages]);
  const [isConfirmingBlock, setIsConfirmingBlock] = useState(false);
  const confirmBlockTimeoutRef = useRef<number | null>(null);
  const peer = resolveDirectMessagePeer(props.conversation, props.sessionUserId);
  const peerLabel = String(peer?.display_name ?? peer?.user_id ?? "Direct message").trim() || "Direct message";
  const peerAvatarSeed = peer?.user_id ?? peerLabel;
  const communityName = props.conversation.created_from_community?.name ?? "shared community";
  const peerLastActiveAt = props.peerLastActiveAt;
  const peerPresenceKnown = peerLastActiveAt !== undefined;
  const peerActiveNow = isDirectPeerActiveNow(peerLastActiveAt);
  const lastMessage = props.messages[props.messages.length - 1] ?? null;
  const lastMessageId = lastMessage?.id ?? null;
  const lastMessageSeq = Math.max(0, Math.floor(Number(lastMessage?.seq ?? 0)));
  const lastMessageIsOwn = Boolean(lastMessage?.sender_user_id && lastMessage.sender_user_id === props.sessionUserId);
  const typingLabel = formatDirectTypingLabel(props.typingPresence, peerLabel);
  const hasAttachmentBlockers = props.attachments.some(
    (attachment) => getComposerAttachmentUploadStatus(attachment) !== "ready",
  );
  const hasComposerPayload = props.input.trim().length > 0 || props.attachments.length > 0;
  const isPeerBlocked = Boolean(props.isPeerBlocked);
  const canSendDirectMessage =
    !props.isSending && hasComposerPayload && !hasAttachmentBlockers && !isPeerBlocked;

  useEffect(() => {
    setIsConfirmingBlock(false);
    setIsMenuOpen(false);
    return () => {
      if (confirmBlockTimeoutRef.current !== null) {
        window.clearTimeout(confirmBlockTimeoutRef.current);
        confirmBlockTimeoutRef.current = null;
      }
    };
  }, [props.conversation.id]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuWrapRef.current?.contains(target)) return;
      setIsMenuOpen(false);
      setIsConfirmingBlock(false);
    };
    // Capture phase so Escape closes just the menu before the host's
    // document-level listener closes the whole DM panel.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setIsMenuOpen(false);
      setIsConfirmingBlock(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isMenuOpen]);

  const handleBlockActionClick = () => {
    if (!props.onToggleBlockPeer) return;
    if (isPeerBlocked || isConfirmingBlock) {
      if (confirmBlockTimeoutRef.current !== null) {
        window.clearTimeout(confirmBlockTimeoutRef.current);
        confirmBlockTimeoutRef.current = null;
      }
      setIsConfirmingBlock(false);
      setIsMenuOpen(false);
      void props.onToggleBlockPeer();
      return;
    }
    setIsConfirmingBlock(true);
    confirmBlockTimeoutRef.current = window.setTimeout(() => {
      setIsConfirmingBlock(false);
      confirmBlockTimeoutRef.current = null;
    }, 3000);
  };

  const scrollMessagesToBottom = useCallback(() => {
    const messagesElement = messagesRef.current;
    if (!messagesElement) return;
    messagesElement.scrollTop = messagesElement.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    const messagesElement = messagesRef.current;
    const composerFloat = composerFloatRef.current;
    if (!messagesElement || !composerFloat) return;

    const syncComposerClearance = () => {
      messagesElement.style.setProperty(
        "--community-dm-composer-float-height",
        `${Math.ceil(composerFloat.getBoundingClientRect().height)}px`,
      );
      if (shouldFollowMessagesRef.current) {
        requestAnimationFrame(scrollMessagesToBottom);
      }
    };

    syncComposerClearance();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncComposerClearance);
    observer.observe(composerFloat);
    return () => {
      observer.disconnect();
      messagesElement.style.removeProperty("--community-dm-composer-float-height");
    };
  }, [scrollMessagesToBottom]);

  // Grow the composer upward as the draft wraps; the measured floating layer
  // keeps the feed clearance synchronized with the rendered pill height.
  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, DM_COMPOSER_MAX_HEIGHT_PX)}px`;
    if (shouldFollowMessagesRef.current) {
      scrollMessagesToBottom();
    }
  }, [props.input, scrollMessagesToBottom]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSendDirectMessage) return;
    void props.onSend();
  };

  const onFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = input.files;
    if (files && files.length > 0) {
      void props.onAttachmentFilesSelected?.(files);
    }
    input.value = "";
  };

  const canAcceptAttachmentDrop =
    Boolean(props.onAttachmentFilesSelected) && !props.isSending && !isPeerBlocked;

  const onAttachmentDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!canAcceptAttachmentDrop || !hasDragFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    dragDepthRef.current += 1;
    setIsAttachmentDragOver(true);
  };

  const onAttachmentDragOver = (event: DragEvent<HTMLElement>) => {
    if (!canAcceptAttachmentDrop || !hasDragFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsAttachmentDragOver(true);
  };

  const onAttachmentDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!hasDragFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsAttachmentDragOver(false);
    }
  };

  const onAttachmentDrop = (event: DragEvent<HTMLElement>) => {
    if (!canAcceptAttachmentDrop || !hasDragFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsAttachmentDragOver(false);
    const files = getDragFiles(event);
    if (files.length > 0) {
      void props.onAttachmentFilesSelected?.(files);
    }
  };

  // Ctrl+V / Cmd+V of a screenshot or copied file attaches it, the same as channels do.
  const onComposerPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!canAcceptAttachmentDrop) return;
    const files = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file instanceof File);
    if (files.length === 0) return;
    event.preventDefault();
    void props.onAttachmentFilesSelected?.(files);
  };

  useEffect(() => {
    const conversationChanged = previousConversationIdRef.current !== props.conversation.id;
    const messageChanged = previousLastMessageIdRef.current !== lastMessageId;
    previousConversationIdRef.current = props.conversation.id;
    previousLastMessageIdRef.current = lastMessageId;

    if (conversationChanged) {
      shouldFollowMessagesRef.current = true;
    }
    if (!messageChanged && !conversationChanged) return;

    const shouldScroll =
      conversationChanged ||
      props.isLoading ||
      shouldFollowMessagesRef.current ||
      lastMessageIsOwn;
    if (!shouldScroll) return;

    if (lastMessageSeq > 0) {
      void props.onReadThroughSeq?.(lastMessageSeq);
    }
    requestAnimationFrame(scrollMessagesToBottom);
  }, [
    props.conversation.id,
    props.isLoading,
    props.onReadThroughSeq,
    lastMessageId,
    lastMessageIsOwn,
    lastMessageSeq,
    scrollMessagesToBottom,
  ]);

  return (
    <aside
      className={`community-dm-panel community-dm-attachment-drop-surface${isAttachmentDragOver ? " drag-over" : ""}`}
      role="dialog"
      aria-label={`${peerLabel} direct message`}
      onDrop={canAcceptAttachmentDrop ? onAttachmentDrop : undefined}
      onDragEnter={canAcceptAttachmentDrop ? onAttachmentDragEnter : undefined}
      onDragOver={canAcceptAttachmentDrop ? onAttachmentDragOver : undefined}
      onDragLeave={canAcceptAttachmentDrop ? onAttachmentDragLeave : undefined}
    >
      {isAttachmentDragOver ? (
        <div className="drop-overlay community-dm-drop-overlay" aria-hidden="true">
          <Paperclip aria-hidden="true" />
          <span>Drop files to attach</span>
        </div>
      ) : null}
      <div className="community-dm-panel-header">
        {props.onBackToInbox ? (
          <button
            className="community-dm-panel-back"
            type="button"
            onClick={props.onBackToInbox}
            aria-label="Back to direct messages"
            title="Direct messages"
          >
            <ArrowLeft aria-hidden="true" />
          </button>
        ) : null}
        <span className="community-dm-panel-avatar-wrap">
          <UserAvatar
            className="community-dm-panel-avatar"
            readyClassName="has-image"
            name={peerLabel}
            imageUrl={peer?.avatar_url ?? null}
            focusX={peer?.avatar_focus_x ?? 0.5}
            focusY={peer?.avatar_focus_y ?? 0.5}
            zoom={peer?.avatar_zoom ?? 1}
            alt={peerLabel}
            fallback={<span>{props.getInitials(peerLabel)}</span>}
            fallbackStyle={{ backgroundColor: props.getAvatarColor(peerAvatarSeed) }}
          />
          {peerPresenceKnown ? (
            <span
              className={`community-dm-inbox-presence-dot${peerActiveNow ? " is-active-now" : ""}`}
              aria-hidden="true"
            />
          ) : null}
        </span>
        <div className="community-dm-panel-title-block">
          <div className="community-dm-panel-title-row">
            <div className="community-dm-panel-title">{peerLabel}</div>
          </div>
          {peerPresenceKnown && peerLastActiveAt ? (
            <div className={`community-dm-panel-context is-presence${peerActiveNow ? " is-active-now" : ""}`}>
              {peerActiveNow
                ? "Active now"
                : `Active ${formatRelativeTimeFromIso(peerLastActiveAt)}`}
              {` · ${communityName}`}
            </div>
          ) : (
            <div className="community-dm-panel-context">From {communityName}</div>
          )}
        </div>
        {props.showBlockAction && props.onToggleBlockPeer ? (
          <div className="community-dm-panel-menu-wrap" ref={menuWrapRef}>
            <button
              className={`community-dm-panel-menu-button${isMenuOpen ? " is-open" : ""}`}
              type="button"
              onClick={() => {
                setIsMenuOpen((current) => !current);
                setIsConfirmingBlock(false);
              }}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              aria-label="Conversation options"
              title="Options"
            >
              <MoreHorizontal aria-hidden="true" />
            </button>
            {isMenuOpen ? (
              <div className="community-dm-panel-menu" role="menu">
                {props.onToggleMuteConversation ? (
                  <button
                    className="community-dm-panel-menu-item"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsConfirmingBlock(false);
                      void props.onToggleMuteConversation?.();
                    }}
                  >
                    {props.isConversationMuted ? (
                      <Bell aria-hidden="true" />
                    ) : (
                      <BellOff aria-hidden="true" />
                    )}
                    <span>{props.isConversationMuted ? "Unmute conversation" : "Mute conversation"}</span>
                  </button>
                ) : null}
                <button
                  className={`community-dm-panel-menu-item${isConfirmingBlock ? " is-confirming" : ""}`}
                  type="button"
                  role="menuitem"
                  onClick={handleBlockActionClick}
                >
                  <Ban aria-hidden="true" />
                  <span>
                    {isPeerBlocked
                      ? `Unblock ${peerLabel}`
                      : isConfirmingBlock
                        ? "Tap again to block"
                        : `Block ${peerLabel}`}
                  </span>
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        ref={messagesRef}
        className="community-dm-panel-messages"
        aria-live="polite"
        onScroll={(event) => {
          const target = event.currentTarget;
          const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
          const isNearBottom = distanceFromBottom <= DM_AUTO_SCROLL_THRESHOLD_PX;
          shouldFollowMessagesRef.current = isNearBottom;
          if (isNearBottom && lastMessageSeq > 0) {
            void props.onReadThroughSeq?.(lastMessageSeq);
          }
        }}
      >
        {props.isLoading ? (
          <div className="community-dm-panel-empty">Loading messages...</div>
        ) : props.messages.length === 0 ? (
          <div className="community-dm-panel-empty">
            <MessageCircle aria-hidden="true" />
            <span>Start a direct message from this shared community.</span>
          </div>
        ) : (
          threadEntries.map(({ message, isNewDay, isClusterStart, isClusterEnd }) => {
            const isOwn = message.sender_user_id === props.sessionUserId;
            const text = getMessageText(message);
            const attachments = getMessageAttachments(message);
            const hasText = text.length > 0;
            const hasAttachments = attachments.length > 0;
            const isMediaOnly = !hasText && attachments.some((attachment) => attachment.type === "image");
            const shouldSeparateAttachments = hasText && hasAttachments;
            const isSendingEcho = message.local_status === "sending";
            const isFailedEcho = message.local_status === "failed";
            const echoLocalId = String(message.local_id ?? "").trim();
            const clusterTimeLabel =
              isClusterEnd && !isFailedEcho ? formatDirectMessageClusterTime(message.created_at) : "";
            return (
              <Fragment key={message.id}>
              {isNewDay ? (
                <div className="community-dm-day" role="separator">
                  <span>{formatDirectMessageDayLabel(message.created_at)}</span>
                </div>
              ) : null}
              <div
                className={`community-dm-panel-message${isOwn ? " is-own" : ""}${isMediaOnly ? " is-media-only" : ""}${isSendingEcho ? " is-sending" : ""}${isFailedEcho ? " is-send-failed" : ""}${isClusterStart ? " is-cluster-start" : ""}${isClusterEnd ? " is-cluster-end" : ""}`}
              >
                {isMediaOnly ? (
                  <div className="community-dm-panel-media-only">
                    <DirectMessageAttachmentViews attachments={attachments} />
                  </div>
                ) : shouldSeparateAttachments ? (
                  <div className="community-dm-panel-message-stack">
                    <div className="community-dm-panel-message-bubble">
                      <div className="community-dm-panel-message-text">
                        {renderChatInlineMarkdown(text, { renderTextRun: props.renderTextWithLinks })}
                      </div>
                      <MessageLinkMedia text={text} />
                    </div>
                    <div className="community-dm-panel-media-only">
                      <DirectMessageAttachmentViews attachments={attachments} />
                    </div>
                  </div>
                ) : (
                  <div className="community-dm-panel-message-bubble">
                    {hasText ? (
                      <div className="community-dm-panel-message-text">
                        {renderChatInlineMarkdown(text, { renderTextRun: props.renderTextWithLinks })}
                      </div>
                    ) : null}
                    <MessageLinkMedia text={text} />
                    <DirectMessageAttachmentViews attachments={attachments} />
                  </div>
                )}
                {isFailedEcho ? (
                  <div className="community-dm-panel-message-send-failed" role="alert">
                    <span>{String(message.local_error ?? "").trim() || "Not sent."}</span>
                    {echoLocalId && props.onRetryLocalMessage ? (
                      <button type="button" onClick={() => props.onRetryLocalMessage?.(echoLocalId)}>
                        Retry
                      </button>
                    ) : null}
                    {echoLocalId && props.onDiscardLocalMessage ? (
                      <button type="button" onClick={() => props.onDiscardLocalMessage?.(echoLocalId)}>
                        Discard
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {clusterTimeLabel ? (
                  <div className="community-dm-panel-message-time">{clusterTimeLabel}</div>
                ) : null}
              </div>
              </Fragment>
            );
          })
        )}
      </div>

      <div className="community-dm-composer-float" ref={composerFloatRef}>
        <div
          className={`community-dm-panel-typing${typingLabel ? "" : " is-empty"}`}
          aria-live="polite"
        >
          {typingLabel}
        </div>

        {props.error ? <div className="community-dm-panel-error">{props.error}</div> : null}

        {isPeerBlocked ? (
          <div className="community-dm-panel-blocked-notice">
            <span>You blocked this person. Unblock to message them.</span>
            {props.onToggleBlockPeer ? (
              <button
                type="button"
                onClick={() => {
                  void props.onToggleBlockPeer?.();
                }}
              >
                Unblock
              </button>
            ) : null}
          </div>
        ) : null}

        {props.attachments.length > 0 ? (
          <div className="community-dm-composer-attachments">
            <DirectMessageAttachmentViews
              attachments={props.attachments}
              isComposer={true}
              onRetryAttachment={props.onRetryAttachment}
              onRemoveAttachment={props.onRemoveAttachment}
            />
          </div>
        ) : null}

        <form className="community-dm-panel-composer" onSubmit={onSubmit}>
          <input
            ref={fileInputRef}
            className="community-dm-panel-file-input"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/markdown,text/csv,application/json,.csv,.doc,.docx,.json,.md,.pdf,.ppt,.pptx,.rtf,.txt,.xls,.xlsx"
            onChange={onFileInputChange}
          />
          <button
            className="community-dm-panel-attach"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={props.isSending || isPeerBlocked}
            aria-label="Attach files"
            title="Attach files"
          >
            <Paperclip aria-hidden="true" />
          </button>
          <textarea
            ref={(node) => {
              composerTextareaRef.current = node;
              if (props.inputRef) props.inputRef.current = node;
            }}
            className="community-dm-panel-input"
            value={props.input}
            onChange={(event) => props.onInputChange(event.target.value)}
            onPaste={onComposerPaste}
            onBlur={() => {
              void props.onComposerBlur?.();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!canSendDirectMessage) return;
                void props.onSend();
              }
            }}
            placeholder={isPeerBlocked ? "You blocked this person" : `Message ${peerLabel}`}
            rows={1}
            disabled={props.isSending || isPeerBlocked}
          />
          {props.voiceButtonProps ? <VoiceInputButton {...props.voiceButtonProps} /> : null}
          <button
            className="community-dm-panel-send chat-send ask-send-btn ask-send-btn-v2"
            type="submit"
            disabled={!canSendDirectMessage}
            aria-label="Send direct message"
            title="Send"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 17V8M8.5 11.5 12 8l3.5 3.5" />
            </svg>
          </button>
        </form>
      </div>
    </aside>
  );
}
