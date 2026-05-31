import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { AttachmentChipButton } from "./AttachmentChipButton";
import { CommunityChatMediaGrid, type CommunityChatMediaImage } from "./CommunityChatMediaGrid";
import { UserAvatar } from "./UserAvatar";
import { partitionCommunityAttachments } from "./communityAttachmentUi";

type CommunityMessageAttachment = {
  id: string;
  type: string;
  name: string;
  url?: string | null;
  data_url?: string | null;
};

type CommunityChatMessageRecord = {
  id: string;
  sender_id: string;
  body: string;
  attachments?: CommunityMessageAttachment[];
  reply_to_id?: string | null;
  created_at: string;
};

type MessageReactionRecord = {
  message_id: string;
  user_id: string;
  emoji: string;
};

type ReplyPrefix = {
  sender: string;
  preview: string;
  rest: string;
};

type CommunityChatMessageRowProps = {
  message: CommunityChatMessageRecord;
  copied: boolean;
  dateSeparator: string | null;
  isPending: boolean;
  showMeta: boolean;
  isOwn: boolean;
  canModerateContent: boolean;
  senderLabel: string;
  senderHandle?: string | null;
  senderBio?: string | null;
  avatarUrl: string | null;
  avatarFocusX?: number | null;
  avatarFocusY?: number | null;
  avatarZoom?: number | null;
  avatarColor: string;
  shortTime: string;
  formattedTime: string;
  isEditing: boolean;
  editingMessageText: string;
  isReactionPickerOpen: boolean;
  messageReactions: MessageReactionRecord[];
  sessionUserId: string | null | undefined;
  replyToId: string | null;
  replyTarget: CommunityChatMessageRecord | null;
  reactionEmojis: string[];
  getInitials: (label: string) => string;
  displayName: (userId: string) => string;
  parseReplyPrefix: (body: string) => ReplyPrefix | null;
  truncateReplyPreview: (value: string) => string;
  renderTextWithLinks: (text: string) => ReactNode;
  onScrollToReplyMessage: (replyMessageId: string) => void;
  onOpenCommunityChatLightbox: (images: CommunityChatMediaImage[], index: number) => void;
  onToggleReaction: (messageId: string, emoji: string) => void | Promise<void>;
  onSetReactionPickerMessageId: (messageId: string | null) => void;
  onStartReply: (message: CommunityChatMessageRecord) => void;
  onCopyMessage: (messageId: string, body: string) => void | Promise<void>;
  onStartEdit: (message: CommunityChatMessageRecord) => void;
  onDeleteMessage: (messageId: string) => void | Promise<void>;
  onEditingMessageTextChange: (value: string) => void;
  onSaveEdit: () => void | Promise<void>;
  onCancelEdit: () => void;
};

function CommunityChatMessageRowComponent({
  message,
  copied,
  dateSeparator,
  isPending,
  showMeta,
  isOwn,
  canModerateContent,
  senderLabel,
  senderHandle,
  senderBio,
  avatarUrl,
  avatarFocusX,
  avatarFocusY,
  avatarZoom,
  avatarColor,
  shortTime,
  formattedTime,
  isEditing,
  editingMessageText,
  isReactionPickerOpen,
  messageReactions,
  sessionUserId,
  replyToId,
  replyTarget,
  reactionEmojis,
  getInitials,
  displayName,
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
}: CommunityChatMessageRowProps) {
  const { imageAttachments, fileAttachments } = useMemo(
    () => partitionCommunityAttachments(message.attachments),
    [message.attachments],
  );
  const [isProfileHoverOpen, setIsProfileHoverOpen] = useState(false);
  const profileHoverCloseTimerRef = useRef<number | null>(null);
  const lightboxImages: CommunityChatMediaImage[] = useMemo(
    () => imageAttachments.map((item) => ({
      id: item.attachment.id,
      url: item.previewUrl,
      previewUrl: item.previewUrl,
      fullUrl: item.fullUrl,
      name: item.name,
    })),
    [imageAttachments],
  );

  const groupedReactions = useMemo(() => {
    const groups: Record<string, MessageReactionRecord[]> = {};
    for (const reaction of messageReactions) {
      if (!groups[reaction.emoji]) groups[reaction.emoji] = [];
      groups[reaction.emoji].push(reaction);
    }
    return groups;
  }, [messageReactions]);

  const profileHandleLabel = useMemo(() => {
    const normalizedHandle = String(senderHandle ?? "").trim().replace(/^@+/, "");
    return normalizedHandle ? `@${normalizedHandle}` : "No handle yet";
  }, [senderHandle]);
  const profileBio = String(senderBio ?? "").trim();
  const profileHoverCardId = `chat-profile-hover-${message.id}`;

  const clearProfileHoverCloseTimer = useCallback(() => {
    if (profileHoverCloseTimerRef.current === null) return;
    window.clearTimeout(profileHoverCloseTimerRef.current);
    profileHoverCloseTimerRef.current = null;
  }, []);

  const openProfileHover = useCallback(() => {
    if (!showMeta) return;
    clearProfileHoverCloseTimer();
    setIsProfileHoverOpen(true);
  }, [clearProfileHoverCloseTimer, showMeta]);

  const scheduleProfileHoverClose = useCallback(() => {
    clearProfileHoverCloseTimer();
    profileHoverCloseTimerRef.current = window.setTimeout(() => {
      setIsProfileHoverOpen(false);
      profileHoverCloseTimerRef.current = null;
    }, 140);
  }, [clearProfileHoverCloseTimer]);

  const closeProfileHover = useCallback(() => {
    clearProfileHoverCloseTimer();
    setIsProfileHoverOpen(false);
  }, [clearProfileHoverCloseTimer]);

  useEffect(() => clearProfileHoverCloseTimer, [clearProfileHoverCloseTimer]);

  return (
    <Fragment>
      {dateSeparator && (
        <div className="chat-date-separator">
          <span>{dateSeparator}</span>
        </div>
      )}
      <div
        id={`msg-${message.id}`}
        className={`chat-message${isPending ? " pending" : ""}${!showMeta ? " grouped" : ""}`}
        data-time={shortTime}
      >
        <UserAvatar
          className="chat-avatar"
          readyClassName="has-image"
          name={senderLabel}
          imageUrl={avatarUrl}
          focusX={avatarFocusX}
          focusY={avatarFocusY}
          zoom={avatarZoom}
          alt={senderLabel}
          fallback={<span>{getInitials(senderLabel)}</span>}
          fallbackStyle={{ backgroundColor: avatarColor }}
          title={senderLabel}
          onMouseEnter={openProfileHover}
          onMouseLeave={scheduleProfileHoverClose}
        />
        {showMeta ? (
          <div
            id={profileHoverCardId}
            className={`chat-profile-hover-card${isProfileHoverOpen ? " is-open" : ""}`}
            role="group"
            aria-label={`${senderLabel} profile preview`}
            onMouseEnter={openProfileHover}
            onMouseLeave={scheduleProfileHoverClose}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeProfileHover();
            }}
          >
            <div className="chat-profile-hover-main">
              <UserAvatar
                className="chat-profile-hover-avatar"
                readyClassName="has-image"
                name={senderLabel}
                imageUrl={avatarUrl}
                focusX={avatarFocusX}
                focusY={avatarFocusY}
                zoom={avatarZoom}
                alt={senderLabel}
                fallback={<span>{getInitials(senderLabel)}</span>}
                fallbackStyle={{ backgroundColor: avatarColor }}
              />
              <div className="chat-profile-hover-identity">
                <div className="chat-profile-hover-name">{senderLabel}</div>
                <div className="chat-profile-hover-handle">{profileHandleLabel}</div>
              </div>
            </div>
            <div className={`chat-profile-hover-bio${profileBio ? "" : " is-empty"}`}>
              {profileBio || "No bio yet."}
            </div>
            <button
              type="button"
              className="chat-profile-message-button"
              disabled
              title="Direct messages are coming soon"
            >
              <MessageCircle aria-hidden="true" />
              <span>Message</span>
            </button>
          </div>
        ) : null}
        <div className="chat-content">
          <div className="chat-header">
            <button
              type="button"
              className="chat-sender chat-profile-name-trigger"
              aria-describedby={isProfileHoverOpen ? profileHoverCardId : undefined}
              onMouseEnter={openProfileHover}
              onMouseLeave={scheduleProfileHoverClose}
              onFocus={openProfileHover}
              onBlur={scheduleProfileHoverClose}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeProfileHover();
              }}
            >
              {senderLabel}
            </button>
            <span className="chat-time">{formattedTime}</span>
          </div>
          {isEditing ? (
            <div className="chat-edit-form">
              <textarea
                className="chat-edit-input"
                value={editingMessageText}
                onChange={(event) => onEditingMessageTextChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void onSaveEdit();
                  }
                  if (event.key === "Escape") {
                    onCancelEdit();
                  }
                }}
                autoFocus
                rows={1}
              />
              <div className="chat-edit-actions">
                <button
                  className="platform-save-button platform-save-button--compact"
                  onClick={() => void onSaveEdit()}
                >
                  Save
                </button>
                <button className="chat-edit-btn cancel" onClick={onCancelEdit}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {replyTarget && (
                <button
                  type="button"
                  className="chat-reply-quote"
                  onClick={() => {
                    if (!replyToId) return;
                    onScrollToReplyMessage(replyToId);
                  }}
                  title="Jump to replied message"
                >
                  {(() => {
                    const thumb = replyTarget.attachments?.find(
                      (attachment) =>
                        attachment.type === "image" &&
                        (
                          (typeof attachment.url === "string" && attachment.url.trim().length > 0) ||
                          (typeof attachment.data_url === "string" && attachment.data_url.trim().length > 0)
                        ),
                    );
                    const thumbUrl =
                      typeof thumb?.url === "string" && thumb.url.trim()
                        ? thumb.url.trim()
                        : typeof thumb?.data_url === "string" && thumb.data_url.trim()
                          ? thumb.data_url.trim()
                          : null;
                    const text = truncateReplyPreview(
                      (parseReplyPrefix(replyTarget.body)?.rest ?? replyTarget.body).trim() ||
                      (thumb ? "Image" : "Message"),
                    );
                    return (
                      <>
                        <svg className="chat-reply-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 14 4 9 9 4" />
                          <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                        </svg>
                        {thumbUrl && (
                          <img
                            className="chat-reply-thumb"
                            src={thumbUrl}
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                          />
                        )}
                        <span className="chat-reply-sender">{displayName(replyTarget.sender_id)}</span>
                        <span className="chat-reply-text">{text}</span>
                      </>
                    );
                  })()}
                </button>
              )}
              {!replyTarget && replyToId && (
                <div className="chat-reply-quote" title={`Reply to ${replyToId}`}>
                  <svg className="chat-reply-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 14 4 9 9 4" />
                    <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                  </svg>
                  <span className="chat-reply-sender">Reply</span>
                  <span className="chat-reply-text">Replied message not loaded</span>
                </div>
              )}
              <div className="chat-body">
                {renderTextWithLinks(message.body)}
              </div>
            </>
          )}

          <CommunityChatMediaGrid
            images={lightboxImages}
            onOpenImage={onOpenCommunityChatLightbox}
          />

          {fileAttachments.length > 0 && (
            <div className="attachments-preview chat-attachments-preview">
              {fileAttachments.map((attachment) => (
                <AttachmentChipButton
                  key={attachment.id}
                  name={attachment.name}
                  onClick={
                    typeof attachment.url === "string" && attachment.url.trim().length > 0
                      ? () => {
                          window.open(attachment.url!, "_blank", "noopener,noreferrer");
                        }
                      : null
                  }
                  disabled={!(typeof attachment.url === "string" && attachment.url.trim().length > 0)}
                />
              ))}
            </div>
          )}

          {isReactionPickerOpen && (
            <div className="reaction-picker">
              {reactionEmojis.map((emoji) => (
                <button
                  key={emoji}
                  className="reaction-picker-btn"
                  onClick={() => {
                    void onToggleReaction(message.id, emoji);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {messageReactions.length > 0 && (
            <div className="chat-reactions">
              {Object.entries(groupedReactions).map(([emoji, reactions]) => {
                const hasOwn = reactions.some((reaction) => reaction.user_id === sessionUserId);
                return (
                  <button
                    key={emoji}
                    className={`reaction-badge${hasOwn ? " own" : ""}`}
                    onClick={() => {
                      void onToggleReaction(message.id, emoji);
                    }}
                    title={reactions.map((reaction) => displayName(reaction.user_id)).join(", ")}
                  >
                    <span className="reaction-emoji">{emoji}</span>
                    <span className="reaction-count">{reactions.length}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="chat-actions">
          <button
            className="chat-action-btn"
            onClick={() =>
              onSetReactionPickerMessageId(isReactionPickerOpen ? null : message.id)
            }
            title="Add reaction"
          >
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></svg>
          </button>
          {!isPending && (
            <button
              className="chat-action-btn"
              onClick={() => onStartReply(message)}
              title="Reply"
            >
              <svg viewBox="0 0 24 24">
                <path d="M9 17l-5-5 5-5" />
                <path d="M4 12h9a7 7 0 0 1 7 7v2" />
              </svg>
            </button>
          )}
          <button
            className={`chat-action-btn${copied ? " copied" : ""}`}
            onClick={() => {
              void onCopyMessage(message.id, message.body);
            }}
            title={copied ? "Copied" : "Copy message"}
          >
            <svg viewBox="0 0 24 24">
              {copied ? (
                <polyline points="20 6 9 17 4 12" />
              ) : (
                <>
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </>
              )}
            </svg>
          </button>
          {(isOwn || canModerateContent) && !isPending && (
            <>
              <button
                className="chat-action-btn"
                onClick={() => onStartEdit(message)}
                title="Edit"
              >
                <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
              <button
                className="chat-action-btn delete"
                onClick={() => {
                  void onDeleteMessage(message.id);
                }}
                title="Delete"
              >
                <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
              </button>
            </>
          )}
        </div>
      </div>
    </Fragment>
  );
}

export const CommunityChatMessageRow = memo(CommunityChatMessageRowComponent);
