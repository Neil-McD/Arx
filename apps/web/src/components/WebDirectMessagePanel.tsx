import { ArrowLeft, Ban, Bell, BellOff, MoreHorizontal, Paperclip, RotateCcw } from "lucide-react";
import { enterSendsMessage, isImeComposing } from "../controllers/communityComposerTextEditing";
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
import type { VoiceInputButton } from "../../../../shared/VoiceInputButton";
import { askInApp } from "../../../../shared/inAppConfirm";
import { Icon, KitApp, Rail, cx } from "../v1/kit";
import { inboxTimeFor } from "./WebDirectMessageInboxPanel";
import { fitComposerHeight } from "../../../../shared/composerHeight";
import { ChannelFeedSkeleton } from "./WebLoadingSkeleton";
import { CommunityChannelSessionContext } from "./CommunityChannelSessionContext";
import { KitProfileFor } from "../v1/KitProfile";

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
  // The signed-in session: the person's profile opens here, read in the
  // community the conversation started in.
  session?: unknown;
  getInitials: (value: string) => string;
  getAvatarColor: (seed: string) => string;
  renderTextWithLinks: (text: string) => ReactNode;
  inputRef?: MutableRefObject<HTMLTextAreaElement | null>;
  voiceButtonProps?: ComponentProps<typeof VoiceInputButton>;
  onInputChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  onAttachmentFilesSelected?: (files: DirectMessageAttachmentFileInput) => void | Promise<void>;
  // Fetches a sent file's bytes; the server gives them only to the two people in the conversation.
  onLoadAttachment?: (attachmentId: string) => Promise<Blob>;
  onRetryAttachment?: (id: string) => void;
  onRemoveAttachment?: (id: string) => void;
  onRetryLocalMessage?: (localId: string) => void;
  onDiscardLocalMessage?: (localId: string) => void;
  onComposerBlur?: () => void | Promise<void>;
  onReadThroughSeq?: (seq: number) => void | Promise<void>;
  // Reports whether the thread viewport is currently at the bottom following
  // live messages (false while scrolled up reading older history).
  onFollowingLiveChange?: (following: boolean) => void;
  // The first touch of a conversation that was opened for you (design v1).
  onEngage?: () => void;
  // Design system v1: shown beside the Inbox list, so it needs no way back.
  besideInbox?: boolean;
  onBackToInbox?: () => void;
};

const DM_AUTO_SCROLL_THRESHOLD_PX = 96;
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

// A file in a sent message. The message carries only its name and kind; the
// bytes come through the server, which checks you are in the conversation.
// A picture loads by itself; any other file downloads when clicked.
function SentAttachment(props: { attachment: DirectMessageAttachment; onLoad?: (attachmentId: string) => Promise<Blob> }) {
  const { attachment, onLoad } = props;
  const isImage = attachment.type === "image" && /^image\//.test(attachment.mime ?? "");
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!isImage || !onLoad) return;
    let live = true;
    let made: string | null = null;
    setUrl(null); setFailed(false);
    onLoad(attachment.id).then((bytes) => {
      if (!live) return;
      made = URL.createObjectURL(new Blob([bytes], { type: attachment.mime ?? "application/octet-stream" }));
      setUrl(made);
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [attachment.id, attachment.mime, isImage, onLoad]);
  if (isImage) {
    return url
      ? <button type="button" className="community-dm-sent-image" onClick={() => window.open(url, "_blank", "noopener,noreferrer")} aria-label={`Open ${attachment.name}`}><img src={url} alt={attachment.name} /></button>
      : <div className={`community-dm-sent-image is-waiting${failed ? " is-failed" : ""}`} role={failed ? "alert" : undefined}>{failed ? "This picture is unavailable." : ""}</div>;
  }
  const save = async () => {
    if (!onLoad || busy) return;
    setBusy(true); setFailed(false);
    try {
      const bytes = await onLoad(attachment.id);
      const saveUrl = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
      const link = document.createElement("a");
      link.href = saveUrl; link.download = attachment.name; link.click();
      URL.revokeObjectURL(saveUrl);
    } catch { setFailed(true); } finally { setBusy(false); }
  };
  return (
    <button type="button" className="attachment-item community-dm-attachment-item community-dm-sent-file" onClick={() => void save()} disabled={busy || !onLoad} title={failed ? "This file is unavailable." : `Download ${attachment.name}`}>
      <span className="attachment-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg></span>
      <span className="attachment-name">{failed ? "Unavailable" : busy ? "Opening…" : attachment.name}</span>
    </button>
  );
}

// A message's files: one still on its way shows the picture the sender picked;
// a sent one is fetched from the server.
function MessageAttachments(props: { attachments: DirectMessageAttachment[]; onLoad?: (attachmentId: string) => Promise<Blob> }) {
  const local = props.attachments.filter((attachment) => attachment.url);
  const sent = props.attachments.filter((attachment) => !attachment.url);
  return (
    <>
      {local.length ? <DirectMessageAttachmentViews attachments={local} /> : null}
      {sent.length ? <div className="community-dm-sent-files">{sent.map((attachment) => <SentAttachment key={attachment.id} attachment={attachment} onLoad={props.onLoad} />)}</div> : null}
    </>
  );
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
  if (String(attachment.attachment_id ?? "").trim()) return "ready";
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
  const peer = resolveDirectMessagePeer(props.conversation, props.sessionUserId);
  const peerLabel = String(peer?.display_name ?? peer?.user_id ?? "Direct message").trim() || "Direct message";
  const peerAvatarSeed = peer?.user_id ?? peerLabel;
  const communityName = props.conversation.created_from_community?.name ?? "shared community";
  const peerLastActiveAt = props.peerLastActiveAt;
  const peerPresenceKnown = peerLastActiveAt !== undefined;
  const peerActiveNow = isDirectPeerActiveNow(peerLastActiveAt);
  const peerPresenceText = peerPresenceKnown && peerLastActiveAt
    ? `${peerActiveNow ? "Active now" : `Active ${formatRelativeTimeFromIso(peerLastActiveAt)}`} · ${communityName}`
    : `From ${communityName}`;
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

  // The person's profile in place of the conversation (their face or name).
  const [showingProfile, setShowingProfile] = useState(false);
  useEffect(() => {
    setIsMenuOpen(false);
    setShowingProfile(false);
  }, [props.conversation.id]);
  const profileCommunityId = props.conversation.created_from_community?.id ?? null;
  const canShowProfile = Boolean(props.session && profileCommunityId && peer?.user_id);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuWrapRef.current?.contains(target)) return;
      setIsMenuOpen(false);
    };
    // Capture phase so Escape closes just the menu before the host's
    // document-level listener closes the whole DM panel.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setIsMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isMenuOpen]);

  const handleBlockActionClick = async () => {
    if (!props.onToggleBlockPeer) return;
    setIsMenuOpen(false);
    if (!isPeerBlocked) {
      const confirmed = await askInApp({
        message: `Block ${peerLabel}? They won't be able to message you until you unblock them.`,
        yes: "Block",
        no: "Cancel",
        danger: true,
      });
      if (!confirmed) return;
    }
    void props.onToggleBlockPeer();
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
    fitComposerHeight(textarea);
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

  // A pasted screenshot or file is attached, as a dropped one is. Pasted
  // text has no files and is left to the box.
  const onAttachmentPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = event.clipboardData?.files;
    if (!canAcceptAttachmentDrop || !files || files.length === 0) return;
    event.preventDefault();
    void props.onAttachmentFilesSelected?.(files);
  };

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

  useEffect(() => {
    const conversationChanged = previousConversationIdRef.current !== props.conversation.id;
    const messageChanged = previousLastMessageIdRef.current !== lastMessageId;
    previousConversationIdRef.current = props.conversation.id;
    previousLastMessageIdRef.current = lastMessageId;

    if (conversationChanged) {
      shouldFollowMessagesRef.current = true;
      props.onFollowingLiveChange?.(true);
    }
    if (!messageChanged && !conversationChanged) return;

    const shouldScroll =
      conversationChanged ||
      props.isLoading ||
      shouldFollowMessagesRef.current ||
      lastMessageIsOwn;
    if (!shouldScroll) return;

    if (!shouldFollowMessagesRef.current && lastMessageIsOwn) {
      shouldFollowMessagesRef.current = true;
      props.onFollowingLiveChange?.(true);
    }
    if (lastMessageSeq > 0) {
      void props.onReadThroughSeq?.(lastMessageSeq);
    }
    requestAnimationFrame(scrollMessagesToBottom);
  }, [
    props.conversation.id,
    props.isLoading,
    props.onFollowingLiveChange,
    props.onReadThroughSeq,
    lastMessageId,
    lastMessageIsOwn,
    lastMessageSeq,
    scrollMessagesToBottom,
  ]);

  const optionsMenu = props.showBlockAction && props.onToggleBlockPeer ? (
      <div className="community-dm-panel-menu-wrap" ref={menuWrapRef}>
        <button
          className={`community-dm-panel-menu-button${isMenuOpen ? " is-open" : ""}`}
          type="button"
          onClick={() => setIsMenuOpen((current) => !current)}
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
              className="community-dm-panel-menu-item"
              type="button"
              role="menuitem"
              onClick={() => void handleBlockActionClick()}
            >
              <Ban aria-hidden="true" />
              <span>{isPeerBlocked ? `Unblock ${peerLabel}` : `Block ${peerLabel}`}</span>
            </button>
          </div>
        ) : null}
      </div>
    ) : null;

  // Unified v1 Kit conversation view for both desktop Inbox right column and phones.
  return (
    <aside
      className={`community-dm-panel is-kit community-dm-attachment-drop-surface${isAttachmentDragOver ? " drag-over" : ""}`}
      role="dialog"
      aria-label={`${peerLabel} direct message`}
      onDrop={canAcceptAttachmentDrop ? onAttachmentDrop : undefined}
      onDragEnter={canAcceptAttachmentDrop ? onAttachmentDragEnter : undefined}
      onDragOver={canAcceptAttachmentDrop ? onAttachmentDragOver : undefined}
      onDragLeave={canAcceptAttachmentDrop ? onAttachmentDragLeave : undefined}
      // A click or a key press, not focus: the reply box focuses itself.
      onPointerDownCapture={props.onEngage}
      onKeyDownCapture={props.onEngage}
    >
      {isAttachmentDragOver ? (
        <div className="drop-overlay community-dm-drop-overlay" aria-hidden="true">
          <Paperclip aria-hidden="true" />
          <span>Drop files to attach</span>
        </div>
      ) : null}
      <KitApp view="inbox" part="rail">
        <Rail index={3} label={showingProfile ? `${peerLabel}'s profile` : `Conversation with ${peerLabel}`}
          className={`community-dm-kit-rail${showingProfile ? " is-showing-profile" : ""}`}>
          {/* Their profile takes the column; the conversation stays mounted
              underneath (its draft, its scroll), hidden until you go back. */}
          {showingProfile && canShowProfile ? (
            <div className="community-dm-kit-profile">
              <button type="button" className="community-dm-kit-profile-back" onClick={() => setShowingProfile(false)}>
                <ArrowLeft aria-hidden="true" />Back to conversation
              </button>
              <CommunityChannelSessionContext.Provider value={{ session: props.session, communityId: profileCommunityId! }}>
                <KitProfileFor target={{ userId: peer?.user_id ?? "" }}
                  communityName={props.conversation.created_from_community?.name ?? null}
                  communitySlug={props.conversation.created_from_community?.slug ?? null}
                  fallback={<p className={cx("sub")}>{peerLabel} is no longer in {communityName}, so there is no profile to show.</p>}
                  getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} />
              </CommunityChannelSessionContext.Provider>
            </div>
          ) : null}
          <div className="community-dm-kit-head">
            {/* Narrower windows and phones show Inbox as layers: back to the list. */}
            {props.onBackToInbox ? (
              <button
                className={`community-dm-panel-back${props.besideInbox ? " is-layered-only" : ""}`}
                type="button"
                onClick={props.onBackToInbox}
                aria-label="Back to Inbox"
                title="Inbox"
              >
                <ArrowLeft aria-hidden="true" />
              </button>
            ) : null}
            {canShowProfile ? (
              <button type="button" className="community-dm-kit-peer" onClick={() => setShowingProfile(true)}
                aria-label={`${peerLabel}'s profile`} title="Profile">
              <span className="community-dm-kit-avatar-wrap">
                <span className={cx("av")}>
                  <UserAvatar
                    className="community-dm-kit-avatar"
                    readyClassName="has-image"
                    name={peerLabel}
                    imageUrl={peer?.avatar_url ?? null}
                    focusX={peer?.avatar_focus_x ?? 0.5}
                    focusY={peer?.avatar_focus_y ?? 0.5}
                    zoom={peer?.avatar_zoom ?? 1}
                    alt=""
                    fallback={<span>{props.getInitials(peerLabel)}</span>}
                    fallbackStyle={{ backgroundColor: props.getAvatarColor(peerAvatarSeed) }}
                  />
                </span>
                {peerPresenceKnown ? (
                  <span
                    className={`community-dm-inbox-presence-dot${peerActiveNow ? " is-active-now" : ""}`}
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{peerLabel}</div>
                <div className={cx("sub")}>{peerPresenceText}</div>
              </div>
              </button>
            ) : (
              <>
              <span className="community-dm-kit-avatar-wrap">
                <span className={cx("av")}>
                  <UserAvatar
                    className="community-dm-kit-avatar"
                    readyClassName="has-image"
                    name={peerLabel}
                    imageUrl={peer?.avatar_url ?? null}
                    focusX={peer?.avatar_focus_x ?? 0.5}
                    focusY={peer?.avatar_focus_y ?? 0.5}
                    zoom={peer?.avatar_zoom ?? 1}
                    alt=""
                    fallback={<span>{props.getInitials(peerLabel)}</span>}
                    fallbackStyle={{ backgroundColor: props.getAvatarColor(peerAvatarSeed) }}
                  />
                </span>
                {peerPresenceKnown ? (
                  <span
                    className={`community-dm-inbox-presence-dot${peerActiveNow ? " is-active-now" : ""}`}
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{peerLabel}</div>
                <div className={cx("sub")}>{peerPresenceText}</div>
              </div>
              </>
            )}
            {optionsMenu}
          </div>
          <div className={`${cx("sep")} community-dm-kit-sep`} />
          <div ref={messagesRef} className={`${cx("dm")} community-dm-kit-thread`} aria-live="polite" onScroll={(event) => {
            const target = event.currentTarget;
            const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
            const isNearBottom = distanceFromBottom <= DM_AUTO_SCROLL_THRESHOLD_PX;
            if (shouldFollowMessagesRef.current !== isNearBottom) {
              shouldFollowMessagesRef.current = isNearBottom;
              props.onFollowingLiveChange?.(isNearBottom);
            }
            if (isNearBottom && lastMessageSeq > 0) void props.onReadThroughSeq?.(lastMessageSeq);
          }}>
            {props.isLoading ? (
              <ChannelFeedSkeleton rows={3} />
            ) : props.messages.length === 0 ? (
              <span className={cx("sub")}>Say hello to {peerLabel}.</span>
            ) : (
              threadEntries.map(({ message, isNewDay, isClusterEnd }) => {
                const isOwn = message.sender_user_id === props.sessionUserId;
                const text = getMessageText(message);
                const attachments = getMessageAttachments(message);
                const pictures = attachments.filter((attachment) => attachment.type === "image");
                const otherFiles = attachments.filter((attachment) => attachment.type !== "image");
                const isMediaOnly = !text && pictures.length > 0 && otherFiles.length === 0;
                const isFailedEcho = message.local_status === "failed";
                const echoLocalId = String(message.local_id ?? "").trim();
                return (
                  <Fragment key={message.id}>
                    {isNewDay ? <div className={cx("day")} style={{ margin: "0 0 4px" }}>{formatDirectMessageDayLabel(message.created_at)}</div> : null}
                    <div className={`community-dm-panel-message${isOwn ? " is-own" : ""}${isMediaOnly ? " is-media-only" : ""}`}>
                      {/* A picture stands on its own, outside any bubble (as in a channel); words and other files keep the bubble. */}
                      {pictures.length ? (
                        <div className={`community-dm-standalone-media${isOwn ? " is-own" : ""}${message.local_status === "sending" ? " is-sending" : ""}`}>
                          <MessageAttachments attachments={pictures} onLoad={props.onLoadAttachment} />
                        </div>
                      ) : null}
                      {text || otherFiles.length ? (
                        <div className={`${cx(isOwn ? "mine" : "bub")}${message.local_status === "sending" ? " is-sending" : ""}`}>
                          {text ? <div className="community-dm-panel-message-text">{renderChatInlineMarkdown(text, { renderTextRun: props.renderTextWithLinks })}</div> : null}
                          {text ? <MessageLinkMedia text={text} /> : null}
                          {otherFiles.length ? <MessageAttachments attachments={otherFiles} onLoad={props.onLoadAttachment} /> : null}
                        </div>
                      ) : null}
                      {isFailedEcho ? (
                        <div className="community-dm-panel-message-send-failed" role="alert">
                          <span>{String(message.local_error ?? "").trim() || "Not sent."}</span>
                          {echoLocalId && props.onRetryLocalMessage ? <button type="button" onClick={() => props.onRetryLocalMessage?.(echoLocalId)}>Retry</button> : null}
                          {echoLocalId && props.onDiscardLocalMessage ? <button type="button" onClick={() => props.onDiscardLocalMessage?.(echoLocalId)}>Discard</button> : null}
                        </div>
                      ) : isClusterEnd ? (
                        <span className={cx("sub")} style={{ fontSize: 12 }}>
                          {isOwn ? "You" : peerLabel.split(/\s+/)[0]} · {(() => {
                            const when = inboxTimeFor(message.created_at);
                            return when === "now" ? "just now" : /(min| h)$/.test(when) ? `${when} ago` : when;
                          })()}{message.via_ai ? " · via AI" : ""}
                        </span>
                      ) : message.via_ai ? (
                        // Sent through their own AI: both people see it on the message.
                        <span className={cx("sub")} style={{ fontSize: 12 }}>via AI</span>
                      ) : null}
                    </div>
                  </Fragment>
                );
              })
            )}
          </div>
          <div ref={composerFloatRef} className="community-dm-kit-composer">
            {typingLabel ? <span className={cx("sub")} aria-live="polite">{typingLabel}</span> : null}
            {props.error ? <div className="community-dm-panel-error">{props.error}</div> : null}
            {isPeerBlocked ? (
              <div className="community-dm-panel-blocked-notice">
                <span>You blocked this person. Unblock to message them.</span>
                {props.onToggleBlockPeer ? <button type="button" onClick={() => { void props.onToggleBlockPeer?.(); }}>Unblock</button> : null}
              </div>
            ) : null}
            {props.attachments.length > 0 ? (
              <div className="community-dm-composer-attachments">
                <DirectMessageAttachmentViews attachments={props.attachments} isComposer={true} onRetryAttachment={props.onRetryAttachment} onRemoveAttachment={props.onRemoveAttachment} />
              </div>
            ) : null}
            {/* The kit's composer, like Home's: the text across the top, then
                attach and voice on the left and send on the right (Nov 13). */}
            <form className={cx("ask")} onSubmit={onSubmit}>
              <input ref={fileInputRef} className="community-dm-panel-file-input" type="file" multiple
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/markdown,text/csv,application/json,.csv,.doc,.docx,.json,.md,.pdf,.ppt,.pptx,.rtf,.txt,.xls,.xlsx"
                onChange={onFileInputChange} />
              <textarea
                className="kit-ask-text"
                ref={(node) => {
                  composerTextareaRef.current = node;
                  if (props.inputRef) props.inputRef.current = node;
                }}
                value={props.input}
                onChange={(event) => props.onInputChange(event.target.value)}
                onBlur={() => { void props.onComposerBlur?.(); }}
                onPaste={onAttachmentPaste}
                onKeyDown={(event) => {
                  if (isImeComposing(event)) return;
                  if (enterSendsMessage(event)) {
                    event.preventDefault();
                    if (!canSendDirectMessage) return;
                    void props.onSend();
                  }
                }}
                placeholder={isPeerBlocked ? "You blocked this person" : `Reply to ${peerLabel.split(/\s+/)[0]}`}
                aria-label={`Reply to ${peerLabel}`}
                rows={1}
                disabled={props.isSending || isPeerBlocked}
              />
              <button type="button" className={cx("ib")} onClick={() => fileInputRef.current?.click()} disabled={props.isSending || isPeerBlocked} aria-label="Attach files" title="Attach files">
                <Icon name="plus" />
              </button>
              {props.voiceButtonProps ? (
                <button type="button" className={cx("ib")} onClick={props.voiceButtonProps.onClick} disabled={props.voiceButtonProps.disabled}
                  aria-label={props.voiceButtonProps.title} title={props.voiceButtonProps.title} aria-pressed={props.voiceButtonProps.state === "recording"}
                  style={props.voiceButtonProps.state === "idle" ? undefined : { color: "var(--aurora-ink)" }}>
                  <Icon name="mic" />
                </button>
              ) : null}
              <button type="submit" className={cx("send")} disabled={!canSendDirectMessage} aria-label="Send direct message" title="Send">
                <Icon name="up" />
              </button>
            </form>
          </div>
        </Rail>
      </KitApp>
    </aside>
  );
}
