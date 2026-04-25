import type {
  ChangeEventHandler,
  ComponentProps,
  MutableRefObject,
  ReactNode,
  UIEventHandler,
} from "react";
import { CommunityChatMessageRow } from "../../../../shared/CommunityChatMessageRow";
import type { CommunityChatMediaImage } from "../../../../shared/CommunityChatMediaGrid";
import type {
  CommunityChatMessage as SharedCommunityChatMessage,
  MessageReaction as SharedMessageReaction,
  CommunityTypingPresenceBundle as SharedCommunityTypingPresenceBundle,
  CommunityTypingPresenceUser as SharedCommunityTypingPresenceUser,
  UserProfile as SharedUserProfile,
} from "../../../../shared/communityTypes";
import {
  type CommunityMessageAttachment,
  type ReplyPrefix,
} from "../../../../shared/communityMessageParsing";
import { partitionCommunityAttachments } from "../../../../shared/communityAttachmentUi";
import { VoiceInputButton } from "../../../../shared/VoiceInputButton";
import { WebCommunityChatLightboxModal } from "./WebCommunityChatLightboxModal";

type CommunityChatMessage = SharedCommunityChatMessage<CommunityMessageAttachment>;
type MessageReaction = SharedMessageReaction;
type CommunityTypingPresenceBundle = SharedCommunityTypingPresenceBundle;
type CommunityTypingPresenceUser = SharedCommunityTypingPresenceUser;
type UserProfile = SharedUserProfile;

export type WebCommunityChatPanelProps = {
  activeCommunity: { name: string } | null;
  isResolvingSelectedCommunity: boolean;
  hasAuthenticatedPresentation: boolean;
  isAuthRecoveringSignedIn: boolean;
  hasSession: boolean;
  sessionUserId: string | null;
  canPostMessages: boolean;
  canModerateMessages: boolean;
  isLoadingChat: boolean;
  hasResolvedCommunityChat: boolean;
  isLoadingMoreChat: boolean;
  communityChatHasMore: boolean;
  communityMessages: CommunityChatMessage[];
  communityMessageById: Map<string, CommunityChatMessage>;
  messageReactions: MessageReaction[];
  typingPresence: CommunityTypingPresenceBundle;
  profilesByUserId: Record<string, UserProfile>;
  editingMessageId: string | null;
  editingMessageText: string;
  reactionPickerMessageId: string | null;
  replyingToMessage: Pick<CommunityChatMessage, "id" | "sender_id" | "body"> | null;
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
  onScrollToBottom: () => void;
  onSetReplyingToMessage: (message: CommunityChatMessage | null) => void;
  onRemoveCommunityAttachment: (id: string) => void;
  onCommunityFileInputChange: ChangeEventHandler<HTMLInputElement>;
  onCommunityMessageInputChange: (value: string, textarea: HTMLTextAreaElement) => void;
  onSendCommunityMessage: () => void | Promise<void>;
  displayName: (userId: string) => string;
  shouldShowCommunitySenderMeta: (messages: CommunityChatMessage[], index: number) => boolean;
  shouldShowDateSeparator: (messages: CommunityChatMessage[], index: number) => string | null;
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
  onStartReply: (message: Pick<CommunityChatMessage, "id" | "sender_id" | "body">) => void;
  onCopyMessage: (messageId: string, body: string) => void | Promise<void>;
  onStartEdit: (message: Pick<CommunityChatMessage, "id" | "body">) => void;
  onDeleteMessage: (messageId: string) => void | Promise<void>;
  onEditingMessageTextChange: (value: string) => void;
  onSaveEdit: () => void | Promise<void>;
  onCancelEdit: () => void;
  voiceButtonProps: ComponentProps<typeof VoiceInputButton>;
  lightboxModalProps: ComponentProps<typeof WebCommunityChatLightboxModal>;
};

export function WebCommunityChatPanel(props: WebCommunityChatPanelProps) {
  const {
    activeCommunity,
    isResolvingSelectedCommunity,
    hasAuthenticatedPresentation,
    isAuthRecoveringSignedIn,
    hasSession,
    sessionUserId,
    canPostMessages,
    canModerateMessages,
    isLoadingChat,
    hasResolvedCommunityChat,
    isLoadingMoreChat,
    communityChatHasMore,
    communityMessages,
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
    onScrollToBottom,
    onSetReplyingToMessage,
    onRemoveCommunityAttachment,
    onCommunityFileInputChange,
    onCommunityMessageInputChange,
    onSendCommunityMessage,
    displayName,
    shouldShowCommunitySenderMeta,
    shouldShowDateSeparator,
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
  } = props;

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

  const showCommunityChatBootstrap =
    hasAuthenticatedPresentation &&
    (isAuthRecoveringSignedIn ||
    (isResolvingSelectedCommunity ||
      (!!activeCommunity &&
        communityMessages.length === 0 &&
        !communityChatError &&
        (isLoadingChat || !hasResolvedCommunityChat))));

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
      <div className="community-chat">
        <div className="workspace-body chat-feed">
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
              {activeCommunity && hasResolvedCommunityChat && !isLoadingChat && communityMessages.length === 0 && communityChatError && (
                <div className="chat-messages-state-shell">
                  <div className="chat-empty">
                    <div>{communityChatError}</div>
                  </div>
                </div>
              )}
              {activeCommunity && hasResolvedCommunityChat && !isLoadingChat && communityMessages.length === 0 && !communityChatError && (
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
                communityMessages.map((message, index) => {
                  const isOwn = message.sender_id === sessionUserId;
                  const isPending = message.id.startsWith("pending-");
                  const showMeta = shouldShowCommunitySenderMeta(communityMessages, index);
                  const dateSeparator = shouldShowDateSeparator(communityMessages, index);
                  const senderLabel = displayName(message.sender_id);
                  const avatarUrl = profilesByUserId[message.sender_id]?.avatar_url ?? null;
                  const avatarColor = getAvatarColor(message.sender_id);
                  const shortTime = new Date(message.created_at).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  });
                  const replyToId = message.reply_to_id ?? null;
                  const replyTarget = replyToId ? communityMessageById.get(replyToId) ?? null : null;
                  return (
                    <CommunityChatMessageRow
                      key={message.id}
                      message={message}
                      copied={copiedCommunityMessageId === message.id}
                      dateSeparator={dateSeparator}
                      isPending={isPending}
                      showMeta={showMeta}
                      isOwn={isOwn}
                      canModerateContent={canModerateMessages}
                      senderLabel={senderLabel}
                      avatarUrl={avatarUrl}
                      avatarColor={avatarColor}
                      shortTime={shortTime}
                      formattedTime={formatChatTime(message.created_at)}
                      editingMessageId={editingMessageId}
                      editingMessageText={editingMessageText}
                      reactionPickerMessageId={reactionPickerMessageId}
                      messageReactions={messageReactions}
                      sessionUserId={sessionUserId}
                      replyToId={replyToId}
                      replyTarget={replyTarget}
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
                    />
                  );
                })}
              {activeCommunity && !isLoadingChat && typingLabel && (
                <div className="chat-typing-indicator" aria-live="polite">
                  {typingLabel}
                </div>
              )}
            </div>
          </div>

          {!isUserAtBottom && (
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
              !canPostMessages ||
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
                  : !canPostMessages
                    ? "Join this community to chat..."
                    : "Message the community..."
            }
            value={communityMessageInput}
            onChange={(event) => onCommunityMessageInputChange(event.target.value, event.target)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (isAuthRecoveringSignedIn) return;
                void onSendCommunityMessage();
              }
            }}
            disabled={isAuthRecoveringSignedIn || !hasSession || !activeCommunity || !canPostMessages}
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
              !canPostMessages ||
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

        {communityChatError && <div className="auth-error">{communityChatError}</div>}
      </div>

      <WebCommunityChatLightboxModal {...lightboxModalProps} />
    </>
  );
}
