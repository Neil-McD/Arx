import type { ChangeEvent, MutableRefObject, RefObject } from "react";
import { CommunityChatMessageRow } from "../../shared/CommunityChatMessageRow";
import { VoiceInputButton } from "../../shared/VoiceInputButton";
import { partitionCommunityAttachments } from "../../shared/communityAttachmentUi";

type DesktopCommunityChatTabProps = {
  showChat: boolean;
  session: { user: { id: string } } | null;
  activeCommunity: { name: string } | null;
  isLoadingChat: boolean;
  communityMessages: any[];
  communityChatListRef: RefObject<HTMLDivElement | null>;
  handleChatScroll: () => void;
  isLoadingMoreChat: boolean;
  communityChatHasMore: boolean;
  shouldShowCommunitySenderMeta: (messages: any[], index: number, opts?: unknown) => boolean;
  shouldShowDateSeparator: (messages: any[], index: number) => string | null;
  displayName: (userId: string) => string;
  profileAvatarUrl: string | null;
  profilesByUserId: Record<string, { avatar_url?: string | null }>;
  getAvatarColor: (seed: string) => string;
  communityMessageById: Map<string, any>;
  editingMessageId: string | null;
  editingMessageText: string;
  reactionPickerMessageId: string | null;
  messageReactions: Record<string, any[]>;
  REACTION_EMOJIS: string[];
  getInitials: (name: string) => string;
  parseReplyPrefix: (value: string) => { replyToName: string | null; replyText: string };
  truncateReplyPreview: (value: string) => string;
  renderTextWithLinks: (value: string) => any;
  scrollToCommunityMessage: (messageId: string) => void;
  openCommunityChatLightbox: (url: string, name: string) => void;
  handleToggleReaction: (messageId: string, emoji: string) => Promise<void> | void;
  setReactionPickerMessageId: (value: string | null) => void;
  handleStartReply: (message: any) => void;
  copyTextToClipboard: (value: string) => Promise<boolean>;
  handleStartEdit: (message: any) => void;
  handleDeleteMessage: (message: any) => Promise<void> | void;
  setEditingMessageText: (value: string) => void;
  handleSaveEdit: (message: any) => Promise<void> | void;
  handleCancelEdit: () => void;
  formatChatTime: (value: string) => string;
  isUserAtBottom: boolean;
  setIsUserAtBottom: (value: boolean) => void;
  isUserAtBottomRef: MutableRefObject<boolean>;
  setUnreadCount: (value: number) => void;
  unreadCount: number;
  replyingToMessage: any | null;
  setReplyingToMessage: (value: any | null) => void;
  communityTypingUserIds: string[];
  communityAttachments: any[];
  removeCommunityAttachment: (id: string) => void;
  communityFileInputRef: RefObject<HTMLInputElement | null>;
  canPostMessagesActiveCommunity: boolean;
  isSendingCommunityMessage: boolean;
  handleCommunityFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  chatInputRef: RefObject<HTMLTextAreaElement | null>;
  communityMessageInput: string;
  setCommunityMessageInput: (value: string) => void;
  maybeBroadcastCommunityTyping: (value: string) => void;
  handleSendCommunityMessage: () => Promise<void> | void;
  communityVoiceUiState: "idle" | "recording" | "processing";
  communityVoiceIntent: { title: string };
  handleVoiceInputClick: (target: "workspace" | "community") => Promise<void> | void;
  communityChatError: string | null;
};

export function DesktopCommunityChatTab(props: DesktopCommunityChatTabProps) {
  const {
    showChat,
    session,
    activeCommunity,
    isLoadingChat,
    communityMessages,
    communityChatListRef,
    handleChatScroll,
    isLoadingMoreChat,
    communityChatHasMore,
    shouldShowCommunitySenderMeta,
    shouldShowDateSeparator,
    displayName,
    profileAvatarUrl,
    profilesByUserId,
    getAvatarColor,
    communityMessageById,
    editingMessageId,
    editingMessageText,
    reactionPickerMessageId,
    messageReactions,
    REACTION_EMOJIS,
    getInitials,
    parseReplyPrefix,
    truncateReplyPreview,
    renderTextWithLinks,
    scrollToCommunityMessage,
    openCommunityChatLightbox,
    handleToggleReaction,
    setReactionPickerMessageId,
    handleStartReply,
    copyTextToClipboard,
    handleStartEdit,
    handleDeleteMessage,
    setEditingMessageText,
    handleSaveEdit,
    handleCancelEdit,
    formatChatTime,
    isUserAtBottom,
    setIsUserAtBottom,
    isUserAtBottomRef,
    setUnreadCount,
    unreadCount,
    replyingToMessage,
    setReplyingToMessage,
    communityTypingUserIds,
    communityAttachments,
    removeCommunityAttachment,
    communityFileInputRef,
    canPostMessagesActiveCommunity,
    isSendingCommunityMessage,
    handleCommunityFileInputChange,
    chatInputRef,
    communityMessageInput,
    setCommunityMessageInput,
    maybeBroadcastCommunityTyping,
    handleSendCommunityMessage,
    communityVoiceUiState,
    communityVoiceIntent,
    handleVoiceInputClick,
    communityChatError,
  } = props;

  return (
    <>
	            {showChat && (
	              <div className="community-chat">
                <div className="workspace-body chat-feed">
                  <div
                    className="chat-messages"
                    ref={communityChatListRef}
                    onScroll={handleChatScroll}
                  >
                    {!session && (
                      <div className="chat-empty">Sign in to access community chat.</div>
                    )}
                    {session && !activeCommunity && (
                      <div className="chat-empty">Select a community to start chatting.</div>
                    )}
                    {activeCommunity && isLoadingChat && (
                      <div className="chat-loading">
                        <div className="loading-spinner" />
                        <span>Loading messages...</span>
                      </div>
                    )}
		                    {activeCommunity && !isLoadingChat && communityMessages.length === 0 && (
		                      <div className="chat-empty-state">
                        <div className="chat-empty-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                        </div>
	                        <div className="chat-empty-title">Welcome to {activeCommunity.name}</div>
	                        <div className="chat-empty-text">This is the beginning of your community chat. Say hello!</div>
		                      </div>
		                    )}
	                    {activeCommunity && !isLoadingChat && isLoadingMoreChat && (
	                      <div className="chat-loading">
	                        <div className="loading-spinner" />
	                        <span>Loading earlier messages...</span>
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
                        const isOwn = message.sender_id === session?.user.id;
                        const isPending = message.id.startsWith("pending-");
                        const showMeta = shouldShowCommunitySenderMeta(communityMessages, index, {
                          forceBeforeDateSeparator: true,
                        });
                        const dateSeparator = shouldShowDateSeparator(communityMessages, index);
                        const senderLabel = displayName(message.sender_id);
                        const avatarUrl = isOwn ? profileAvatarUrl : profilesByUserId[message.sender_id]?.avatar_url ?? null;
                        const avatarColor = getAvatarColor(message.sender_id);
                        const shortTime = new Date(message.created_at).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        });
                        const replyToId = message.reply_to_id ?? null;
                        const replyTarget = replyToId ? (communityMessageById.get(replyToId) ?? null) : null;
                        return (
                          <CommunityChatMessageRow
                            key={message.id}
                            message={message}
                            dateSeparator={dateSeparator}
                            isPending={isPending}
                            showMeta={showMeta}
                            isOwn={isOwn}
                            senderLabel={senderLabel}
                            avatarUrl={avatarUrl}
                            avatarColor={avatarColor}
                            shortTime={shortTime}
                            formattedTime={formatChatTime(message.created_at)}
                            editingMessageId={editingMessageId}
                            editingMessageText={editingMessageText}
                            reactionPickerMessageId={reactionPickerMessageId}
                            messageReactions={messageReactions}
                            sessionUserId={session?.user.id}
                            replyToId={replyToId}
                            replyTarget={replyTarget}
                            reactionEmojis={REACTION_EMOJIS}
                            getInitials={getInitials}
                            displayName={displayName}
                            parseReplyPrefix={parseReplyPrefix}
                            truncateReplyPreview={truncateReplyPreview}
                            renderTextWithLinks={renderTextWithLinks}
                            onScrollToReplyMessage={scrollToCommunityMessage}
                            onOpenCommunityChatLightbox={openCommunityChatLightbox}
                            onToggleReaction={handleToggleReaction}
                            onSetReactionPickerMessageId={setReactionPickerMessageId}
                            onStartReply={handleStartReply}
                            onCopyMessage={copyTextToClipboard}
                            onStartEdit={handleStartEdit}
                            onDeleteMessage={handleDeleteMessage}
                            onEditingMessageTextChange={setEditingMessageText}
                            onSaveEdit={handleSaveEdit}
                            onCancelEdit={handleCancelEdit}
                          />
                        );
                      })}
                  </div>
                  {!isUserAtBottom && (
                    <button
                      className="scroll-to-bottom workspace"
                      type="button"
                      onClick={() => {
                        setIsUserAtBottom(true);
                        isUserAtBottomRef.current = true;
                        setUnreadCount(0);
                        communityChatListRef.current?.scrollTo({
                          top: communityChatListRef.current.scrollHeight,
                          behavior: "smooth"
                        });
                      }}
                      aria-label="Scroll to bottom"
                      title="Scroll to bottom"
                    >
                      {unreadCount > 0 && (
                        <span className="scroll-badge" aria-hidden="true">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                      ↓
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
                      onClick={() => setReplyingToMessage(null)}
                      title="Cancel reply"
                      aria-label="Cancel reply"
                    >
                      <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}
                {communityTypingUserIds.length > 0 && (
                  <div className="chat-typing-indicator" aria-live="polite">
                    {communityTypingUserIds.length === 1
                      ? `${displayName(communityTypingUserIds[0])} is typing…`
                      : communityTypingUserIds.length === 2
                        ? `${displayName(communityTypingUserIds[0])} and ${displayName(
                            communityTypingUserIds[1],
                          )} are typing…`
                        : `${displayName(communityTypingUserIds[0])} and ${
                            communityTypingUserIds.length - 1
                          } others are typing…`}
                  </div>
                )}
                {communityAttachments.length > 0 && (() => {
                  const { imageAttachments, fileAttachments } =
                    partitionCommunityAttachments(communityAttachments);
                  const gridCount = Math.min(Math.max(imageAttachments.length, 1), 4);
                  return (
                    <>
                      {imageAttachments.length > 0 && (
                        <div className={`chat-media-grid count-${gridCount} chat-media-grid-composer`}>
                          {imageAttachments.map((item) => (
                            <div key={item.attachment.id} className="chat-media-item chat-media-item-static">
                              <img src={item.url} alt={item.name} />
                              <button
                                type="button"
                                className="chat-media-remove"
                                onClick={() => removeCommunityAttachment(item.attachment.id)}
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
                        <div className="attachments-preview chat-attachments-preview">
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
                                onClick={() => removeCommunityAttachment(att.id)}
                                title="Remove"
                                aria-label={`Remove ${att.name}`}
                              >
                                <svg viewBox="0 0 24 24">
                                  <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
                <div className="chat-input-bar">
                  <button
                    className="ask-icon-btn ask-plus"
                    type="button"
                    onClick={() => communityFileInputRef.current?.click()}
                    disabled={
                      !activeCommunity ||
                      !canPostMessagesActiveCommunity ||
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
                    ref={communityFileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.rs,.go,.html,.css,.yml,.yaml"
                    style={{ display: "none" }}
                    onChange={handleCommunityFileInputChange}
                  />
                  <textarea
                    ref={chatInputRef}
                    className="chat-input"
	                    placeholder={
	                      !activeCommunity
	                        ? "Select a community to chat..."
	                        : !canPostMessagesActiveCommunity
	                          ? "Join this community to chat..."
	                          : "Message the community..."
	                    }
                    value={communityMessageInput}
                    onChange={(event) => {
                      setCommunityMessageInput(event.target.value);
                      maybeBroadcastCommunityTyping(event.target.value);
                      // Auto-resize
                      event.target.style.height = "auto";
                      event.target.style.height = Math.min(event.target.scrollHeight, 120) + "px";
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSendCommunityMessage();
                      }
                    }}
	                    disabled={!activeCommunity || !canPostMessagesActiveCommunity}
	                    rows={1}
	                  />
			                  <VoiceInputButton
			                    state={communityVoiceUiState}
			                    title={communityVoiceIntent.title}
			                    onClick={() => void handleVoiceInputClick("community")}
			                  />
                  <button
	                    className="chat-send ask-send-btn"
                      type="button"
                      aria-label="Send"
                      title="Send"
	                    onClick={() => void handleSendCommunityMessage()}
	                    disabled={
	                      !activeCommunity ||
	                      !canPostMessagesActiveCommunity ||
	                      isSendingCommunityMessage
                        || (communityMessageInput.trim().length === 0 && communityAttachments.length === 0)
	                    }
	                  >
                    <svg viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                  </button>
                </div>
                {communityChatError && (
                  <div className="auth-error">{communityChatError}</div>
                )}
              </div>
            )}
    </>
  );
}
