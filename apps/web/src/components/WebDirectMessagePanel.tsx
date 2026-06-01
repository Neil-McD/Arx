import { ArrowLeft, MessageCircle } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import type {
  DirectMessage,
  DirectMessageConversation,
  DirectMessageParticipant,
  DirectMessageTypingPresenceBundle,
} from "../../../../shared/communityTypes";
import { UserAvatar } from "../../../../shared/UserAvatar";

type WebDirectMessagePanelProps = {
  conversation: DirectMessageConversation;
  messages: DirectMessage[];
  input: string;
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  typingPresence: DirectMessageTypingPresenceBundle;
  sessionUserId: string | null;
  getInitials: (value: string) => string;
  getAvatarColor: (seed: string) => string;
  renderTextWithLinks: (text: string) => ReactNode;
  onInputChange: (value: string) => void;
  onSend: () => void | Promise<void>;
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
  const shouldFollowMessagesRef = useRef(true);
  const previousConversationIdRef = useRef<string | null>(null);
  const previousLastMessageIdRef = useRef<string | null>(null);
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
    <aside className="community-dm-panel" role="dialog" aria-label={`${peerLabel} direct message`}>
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

      <div
        className={`community-dm-panel-typing${typingLabel ? "" : " is-empty"}`}
        aria-live="polite"
      >
        {typingLabel}
      </div>

      {props.error ? <div className="community-dm-panel-error">{props.error}</div> : null}

      <form className="community-dm-panel-composer" onSubmit={onSubmit}>
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
