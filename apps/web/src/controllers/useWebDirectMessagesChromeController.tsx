import { MessageCircle } from "lucide-react";
import { useCallback, useRef } from "react";

import { useDirectMessageWebNotifications } from "./useDirectMessageWebNotifications";
import { useWebDirectMessageDeepLinkLifecycle } from "./useWebDirectMessageDeepLinkLifecycle";

export function useWebDirectMessagesChromeController(params: {
  isAuthenticated: boolean;
  isOpen: boolean;
  unreadCount: number;
  toggle: () => void;
  openConversation: (conversationId: string) => void;
}) {
  const isOpenRef = useRef(params.isOpen);
  isOpenRef.current = params.isOpen;
  const toggleRef = useRef(params.toggle);
  toggleRef.current = params.toggle;
  const notifications = useDirectMessageWebNotifications({
    isEnabled: params.isAuthenticated,
    unreadCount: params.unreadCount,
    onOpenConversation: params.openConversation,
  });
  useWebDirectMessageDeepLinkLifecycle({
    isAuthenticated: params.isAuthenticated,
    openConversation: params.openConversation,
    openInbox: useCallback(() => {
      if (!isOpenRef.current) toggleRef.current();
    }, []),
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
        <span className="direct-messages-unread-badge">
          {params.unreadCount > 99 ? "99+" : params.unreadCount}
        </span>
      ) : null}
    </button>
  ) : null;

  return { notifications, button };
}
