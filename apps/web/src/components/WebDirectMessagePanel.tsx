import { MessageCircle } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import type { DirectMessage, DirectMessageConversation, DirectMessageParticipant } from "../../../../shared/communityTypes";
import { UserAvatar } from "../../../../shared/UserAvatar";

type WebDirectMessagePanelProps = {
  conversation: DirectMessageConversation;
  messages: DirectMessage[];
  input: string;
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  sessionUserId: string | null;
  getInitials: (value: string) => string;
  getAvatarColor: (seed: string) => string;
  renderTextWithLinks: (text: string) => ReactNode;
  onInputChange: (value: string) => void;
  onSend: () => void | Promise<void>;
};

function getMessageText(message: DirectMessage): string {
  const content = message.content_json;
  if (typeof content === "string") return content.trim();
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return String((content as Record<string, unknown>).text ?? "").trim();
  }
  return "";
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

export function WebDirectMessagePanel(props: WebDirectMessagePanelProps) {
  const peer = resolveDirectMessagePeer(props.conversation, props.sessionUserId);
  const peerLabel = String(peer?.display_name ?? peer?.user_id ?? "Direct message").trim() || "Direct message";
  const peerAvatarSeed = peer?.user_id ?? peerLabel;
  const communityName = props.conversation.created_from_community?.name ?? "shared community";

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void props.onSend();
  };

  return (
    <aside className="community-dm-panel" role="dialog" aria-label={`${peerLabel} direct message`}>
      <div className="community-dm-panel-header">
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

      <div className="community-dm-panel-messages" aria-live="polite">
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
            return (
              <div
                key={message.id}
                className={`community-dm-panel-message${isOwn ? " is-own" : ""}`}
              >
                <div className="community-dm-panel-message-bubble">
                  {props.renderTextWithLinks(text)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {props.error ? <div className="community-dm-panel-error">{props.error}</div> : null}

      <form className="community-dm-panel-composer" onSubmit={onSubmit}>
        <textarea
          className="community-dm-panel-input"
          value={props.input}
          onChange={(event) => props.onInputChange(event.target.value)}
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
          disabled={props.isSending || props.input.trim().length === 0}
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
