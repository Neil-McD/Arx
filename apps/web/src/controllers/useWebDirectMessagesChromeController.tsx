import { MessageCircle } from "lucide-react";

import { useDirectMessageWebNotifications } from "./useDirectMessageWebNotifications";
import { useWebDirectMessageDeepLinkLifecycle } from "./useWebDirectMessageDeepLinkLifecycle";

export function useWebDirectMessagesChromeController(params: {
  isAuthenticated: boolean;
  isOpen: boolean;
  unreadCount: number;
  toggle: () => void;
  openConversation: (conversationId: string) => void;
}) {
  const notifications = useDirectMessageWebNotifications({
    isEnabled: params.isAuthenticated,
    unreadCount: params.unreadCount,
    onOpenConversation: params.openConversation,
  });
  useWebDirectMessageDeepLinkLifecycle({
    isAuthenticated: params.isAuthenticated,
    openConversation: params.openConversation,
  });

  const unreadLabel =
    params.unreadCount > 0
      ? `${params.unreadCount} unread`
      : null;
  const button = params.isAuthenticated ? (
    <button
      className={`icon-button direct-messages-topbar-button${
        params.isOpen ? " active" : ""
      }`}
      onClick={params.toggle}
      aria-expanded={params.isOpen}
      aria-label={
        params.isOpen
          ? "Close direct messages"
          : unreadLabel
            ? `Open direct messages, ${unreadLabel}`
            : "Open direct messages"
      }
      title={
        params.isOpen
          ? "Close direct messages"
          : unreadLabel
            ? `Direct messages (${unreadLabel})`
            : "Direct messages"
      }
      type="button"
    >
      <MessageCircle aria-hidden="true" />
      {params.unreadCount > 0 ? (
        <span className="unread-badge">
          {params.unreadCount > 99 ? "99+" : params.unreadCount}
        </span>
      ) : null}
    </button>
  ) : null;

  return { notifications, button };
}
