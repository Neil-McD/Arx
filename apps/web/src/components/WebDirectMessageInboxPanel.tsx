import { ArrowLeft, MessageCircle, Plus } from "lucide-react";
import { formatRelativeTimeFromIso } from "../../../../shared/contentFormatting";
import type {
  DirectMessageConversation,
  DirectMessageParticipant,
  DirectMessageRecipient,
} from "../../../../shared/communityTypes";
import { UserAvatar } from "../../../../shared/UserAvatar";

type WebDirectMessageInboxPanelProps = {
  conversations: DirectMessageConversation[];
  isLoading: boolean;
  error: string | null;
  isNewMessageMode: boolean;
  canStartConversation: boolean;
  activeCommunityName: string | null;
  recipients: DirectMessageRecipient[];
  recipientSearch: string;
  recipientsHasMore: boolean;
  isLoadingRecipients: boolean;
  recipientError: string | null;
  sessionUserId: string | null;
  getInitials: (value: string) => string;
  getAvatarColor: (seed: string) => string;
  onSelectConversation: (conversation: DirectMessageConversation) => void;
  onOpenNewMessage: () => void;
  onCloseNewMessage: () => void;
  onRecipientSearchChange: (value: string) => void;
  onLoadMoreRecipients: () => void;
  onSelectRecipient: (recipient: DirectMessageRecipient) => void | Promise<void>;
};

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

function formatInboxTime(value: string | null): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return formatRelativeTimeFromIso(normalized);
}

export function WebDirectMessageInboxPanel(props: WebDirectMessageInboxPanelProps) {
  const activeCommunityName = String(props.activeCommunityName ?? "").trim() || "current community";
  if (props.isNewMessageMode) {
    const isInitialRecipientLoad = props.isLoadingRecipients && props.recipients.length === 0;
    const hasRecipientSearch = props.recipientSearch.trim().length > 0;
    const emptyRecipientLabel =
      props.recipientsHasMore && hasRecipientSearch
        ? "No matches loaded yet."
        : "No members found.";
    const loadMoreLabel =
      props.recipientsHasMore && hasRecipientSearch
        ? "Search more"
        : "Show more";
    return (
      <aside className="community-dm-panel community-dm-inbox-panel" role="dialog" aria-label="New direct message">
        <div className="community-dm-inbox-header">
          <div className="community-dm-inbox-heading-row">
            <button
              className="community-dm-inbox-icon-button"
              type="button"
              onClick={props.onCloseNewMessage}
              aria-label="Back to direct messages"
              title="Direct messages"
            >
              <ArrowLeft aria-hidden="true" />
            </button>
            <div>
              <div className="community-dm-inbox-title">New message</div>
              <div className="community-dm-inbox-subtitle">{activeCommunityName}</div>
            </div>
          </div>
        </div>

        <label className="community-dm-recipient-search">
          <input
            value={props.recipientSearch}
            onChange={(event) => props.onRecipientSearchChange(event.target.value)}
            aria-label="Search members"
            placeholder="Search members..."
            autoFocus
          />
        </label>

        {props.recipientError ? <div className="community-dm-panel-error">{props.recipientError}</div> : null}

        <div className="community-dm-recipient-list">
          {isInitialRecipientLoad ? (
            <div className="community-dm-panel-empty">Loading members...</div>
          ) : props.recipients.length === 0 ? (
            <div className="community-dm-panel-empty">
              <MessageCircle aria-hidden="true" />
              <span>{emptyRecipientLabel}</span>
            </div>
          ) : (
            props.recipients.map((recipient) => {
              const displayName =
                String(recipient.display_name ?? recipient.handle ?? recipient.user_id ?? "Member").trim() ||
                "Member";
              const handle = String(recipient.handle ?? "").trim().replace(/^@+/, "");
              const avatarSeed = recipient.user_id ?? displayName;
              return (
                <button
                  key={`${recipient.community_id}:${recipient.user_id}`}
                  type="button"
                  className="community-dm-recipient-row"
                  onClick={() => {
                    void props.onSelectRecipient(recipient);
                  }}
                >
                  <UserAvatar
                    className="community-dm-inbox-avatar"
                    readyClassName="has-image"
                    name={displayName}
                    imageUrl={recipient.avatar_url ?? null}
                    focusX={recipient.avatar_focus_x ?? 0.5}
                    focusY={recipient.avatar_focus_y ?? 0.5}
                    zoom={recipient.avatar_zoom ?? 1}
                    alt={displayName}
                    fallback={<span>{props.getInitials(displayName)}</span>}
                    fallbackStyle={{ backgroundColor: props.getAvatarColor(avatarSeed) }}
                  />
                  <span className="community-dm-inbox-row-body">
                    <span className="community-dm-inbox-row-name">{displayName}</span>
                    {handle ? <span className="community-dm-inbox-row-meta">@{handle}</span> : null}
                  </span>
                </button>
              );
            })
          )}
          {props.recipientsHasMore ? (
            <button
              type="button"
              className="community-dm-recipient-more"
              onClick={props.onLoadMoreRecipients}
              disabled={props.isLoadingRecipients}
            >
              {props.isLoadingRecipients ? "Loading..." : loadMoreLabel}
            </button>
          ) : null}
        </div>
      </aside>
    );
  }

  return (
    <aside className="community-dm-panel community-dm-inbox-panel" role="dialog" aria-label="Direct messages">
      <div className="community-dm-inbox-header">
        <div>
          <div className="community-dm-inbox-title">Direct messages</div>
          <div className="community-dm-inbox-subtitle">Private conversations from shared communities</div>
        </div>
        {props.canStartConversation ? (
          <button
            className="community-dm-inbox-icon-button"
            type="button"
            onClick={props.onOpenNewMessage}
            aria-label="New direct message"
            title="New direct message"
          >
            <Plus aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {props.error ? <div className="community-dm-panel-error">{props.error}</div> : null}

      <div className="community-dm-inbox-list">
        {props.isLoading ? (
          <div className="community-dm-panel-empty">Loading direct messages...</div>
        ) : props.conversations.length === 0 ? (
          <div className="community-dm-panel-empty">
            <MessageCircle aria-hidden="true" />
            <span>No direct messages yet.</span>
          </div>
        ) : (
          props.conversations.map((conversation) => {
            const peer = resolveDirectMessagePeer(conversation, props.sessionUserId);
            const peerLabel = String(peer?.display_name ?? peer?.user_id ?? "Direct message").trim() || "Direct message";
            const peerAvatarSeed = peer?.user_id ?? peerLabel;
            const communityName = conversation.created_from_community?.name ?? "shared community";
            const timeLabel = formatInboxTime(conversation.last_message_at ?? conversation.updated_at);
            const unreadCount = Math.max(0, Math.floor(Number(conversation.unread_count ?? 0)));
            const hasUnread = Boolean(conversation.has_unread || unreadCount > 0);
            return (
              <button
                key={conversation.id}
                type="button"
                className={`community-dm-inbox-row${hasUnread ? " is-unread" : ""}`}
                onClick={() => props.onSelectConversation(conversation)}
              >
                <UserAvatar
                  className="community-dm-inbox-avatar"
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
                <span className="community-dm-inbox-row-body">
                  <span className="community-dm-inbox-row-top">
                    <span className="community-dm-inbox-row-name">{peerLabel}</span>
                    <span className="community-dm-inbox-row-meta-group">
                      {timeLabel ? <span className="community-dm-inbox-row-time">{timeLabel}</span> : null}
                      {hasUnread ? (
                        <span
                          className="community-dm-inbox-row-unread"
                          aria-label={
                            unreadCount > 0
                              ? `${unreadCount} unread direct messages`
                              : "Unread direct messages"
                          }
                        >
                          {unreadCount > 0 ? (unreadCount > 99 ? "99+" : unreadCount) : ""}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="community-dm-inbox-row-meta">Started in {communityName}</span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
