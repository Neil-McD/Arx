import { MessageCircle } from "lucide-react";
import { formatRelativeTimeFromIso } from "../../../../shared/contentFormatting";
import type { DirectMessageConversation, DirectMessageParticipant } from "../../../../shared/communityTypes";
import { UserAvatar } from "../../../../shared/UserAvatar";

type WebDirectMessageInboxPanelProps = {
  conversations: DirectMessageConversation[];
  isLoading: boolean;
  error: string | null;
  sessionUserId: string | null;
  getInitials: (value: string) => string;
  getAvatarColor: (seed: string) => string;
  onSelectConversation: (conversation: DirectMessageConversation) => void;
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
  return (
    <aside className="community-dm-panel community-dm-inbox-panel" role="dialog" aria-label="Direct messages">
      <div className="community-dm-inbox-header">
        <div>
          <div className="community-dm-inbox-title">Direct messages</div>
          <div className="community-dm-inbox-subtitle">Private conversations from shared communities</div>
        </div>
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
            return (
              <button
                key={conversation.id}
                type="button"
                className="community-dm-inbox-row"
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
                    {timeLabel ? <span className="community-dm-inbox-row-time">{timeLabel}</span> : null}
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
