import { ArrowLeft, MessageCircle, Paperclip } from "lucide-react";
import type { ChangeEvent, DragEvent, FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DirectMessage,
  DirectMessageAttachment,
  DirectMessageConversation,
  DirectMessageParticipant,
  DirectMessageTypingPresenceBundle,
} from "../../../../shared/communityTypes";
import { AttachmentChipButton } from "../../../../shared/AttachmentChipButton";
import { CommunityChatMediaGrid } from "../../../../shared/CommunityChatMediaGrid";
import { partitionCommunityAttachments } from "../../../../shared/communityAttachmentUi";
import { parseMessageAttachments } from "../../../../shared/communityMessageParsing";
import { UserAvatar } from "../../../../shared/UserAvatar";

type DirectMessageComposerAttachment = DirectMessageAttachment & {
  data_url?: string | null;
};

type DirectMessageAttachmentFileInput = FileList | readonly File[];

type WebDirectMessagePanelProps = {
  conversation: DirectMessageConversation;
  messages: DirectMessage[];
  input: string;
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  attachments: DirectMessageComposerAttachment[];
  typingPresence: DirectMessageTypingPresenceBundle;
  sessionUserId: string | null;
  getInitials: (value: string) => string;
  getAvatarColor: (seed: string) => string;
  renderTextWithLinks: (text: string) => ReactNode;
  onInputChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  onAttachmentFilesSelected?: (files: DirectMessageAttachmentFileInput) => void | Promise<void>;
  onRemoveAttachment?: (id: string) => void;
  onComposerBlur?: () => void | Promise<void>;
  onReadThroughSeq?: (seq: number) => void | Promise<void>;
  onBackToInbox?: () => void;
};

const DM_AUTO_SCROLL_THRESHOLD_PX = 96;

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

function DirectMessageAttachmentViews(props: {
  attachments: DirectMessageComposerAttachment[];
  isComposer?: boolean;
  onRemoveAttachment?: (id: string) => void;
}) {
  const { imageAttachments, fileAttachments } = partitionCommunityAttachments(props.attachments);
  if (imageAttachments.length === 0 && fileAttachments.length === 0) return null;
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
            {imageAttachments.map((item) => (
              <div key={item.attachment.id} className="chat-media-item chat-media-item-static">
                <img src={item.previewUrl} alt={item.name} />
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
            ))}
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
      {fileAttachments.length > 0 ? (
        <div className="attachments-preview community-dm-attachments-preview">
          {fileAttachments.map((attachment) =>
            props.isComposer ? (
              <div key={attachment.id} className="attachment-item" title={attachment.name}>
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
            ) : (
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
            ),
          )}
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const shouldFollowMessagesRef = useRef(true);
  const previousConversationIdRef = useRef<string | null>(null);
  const previousLastMessageIdRef = useRef<string | null>(null);
  const [isAttachmentDragOver, setIsAttachmentDragOver] = useState(false);
  const peer = resolveDirectMessagePeer(props.conversation, props.sessionUserId);
  const peerLabel = String(peer?.display_name ?? peer?.user_id ?? "Direct message").trim() || "Direct message";
  const peerAvatarSeed = peer?.user_id ?? peerLabel;
  const communityName = props.conversation.created_from_community?.name ?? "shared community";
  const lastMessage = props.messages[props.messages.length - 1] ?? null;
  const lastMessageId = lastMessage?.id ?? null;
  const lastMessageSeq = Math.max(0, Math.floor(Number(lastMessage?.seq ?? 0)));
  const lastMessageIsOwn = Boolean(lastMessage?.sender_user_id && lastMessage.sender_user_id === props.sessionUserId);
  const typingLabel = formatDirectTypingLabel(props.typingPresence, peerLabel);

  const scrollMessagesToBottom = useCallback(() => {
    const messagesElement = messagesRef.current;
    if (!messagesElement) return;
    messagesElement.scrollTop = messagesElement.scrollHeight;
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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

  const canAcceptAttachmentDrop = Boolean(props.onAttachmentFilesSelected) && !props.isSending;

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
        <div className="community-dm-panel-title-block">
          <div className="community-dm-panel-title">{peerLabel}</div>
          <div className="community-dm-panel-context">From {communityName}</div>
        </div>
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
          props.messages.map((message) => {
            const isOwn = message.sender_user_id === props.sessionUserId;
            const text = getMessageText(message);
            const attachments = getMessageAttachments(message);
            const hasText = text.length > 0;
            const hasAttachments = attachments.length > 0;
            const isMediaOnly = !hasText && attachments.some((attachment) => attachment.type === "image");
            if (!hasText && !hasAttachments) return null;
            return (
              <div
                key={message.id}
                className={`community-dm-panel-message${isOwn ? " is-own" : ""}${isMediaOnly ? " is-media-only" : ""}`}
              >
                {isMediaOnly ? (
                  <div className="community-dm-panel-media-only">
                    <DirectMessageAttachmentViews attachments={attachments} />
                  </div>
                ) : (
                  <div className="community-dm-panel-message-bubble">
                    {hasText ? <div className="community-dm-panel-message-text">{props.renderTextWithLinks(text)}</div> : null}
                    <DirectMessageAttachmentViews attachments={attachments} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div
        className={`community-dm-panel-typing${typingLabel ? "" : " is-empty"}`}
        aria-live="polite"
      >
        {typingLabel}
      </div>

      {props.error ? <div className="community-dm-panel-error">{props.error}</div> : null}

      {props.attachments.length > 0 ? (
        <div className="community-dm-composer-attachments">
          <DirectMessageAttachmentViews
            attachments={props.attachments}
            isComposer={true}
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
          disabled={props.isSending}
          aria-label="Attach files"
          title="Attach files"
        >
          <Paperclip aria-hidden="true" />
        </button>
        <textarea
          className="community-dm-panel-input"
          value={props.input}
          onChange={(event) => props.onInputChange(event.target.value)}
          onBlur={() => {
            void props.onComposerBlur?.();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void props.onSend();
            }
          }}
          placeholder={`Message ${peerLabel}`}
          rows={1}
          disabled={props.isSending}
        />
        <button
          className="community-dm-panel-send chat-send ask-send-btn ask-send-btn-v2"
          type="submit"
          disabled={props.isSending || (props.input.trim().length === 0 && props.attachments.length === 0)}
          aria-label="Send direct message"
          title="Send"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 17V8M8.5 11.5 12 8l3.5 3.5" />
          </svg>
        </button>
      </form>
    </aside>
  );
}
