import { House, MessageCircle, Sparkles } from "lucide-react";
import type { WebCommunityShellProps } from "./webShellChromeShared";

type WebMobileBottomRailProps = {
  communityShell: WebCommunityShellProps;
};

export function WebMobileBottomRail({
  communityShell,
}: WebMobileBottomRailProps) {
  if (
    !communityShell.showMobileShell ||
    communityShell.forceMobileCommunityRoot
  )
    return null;

  const activeRoot = communityShell.mobileRootPage;
  const unreadDisplay =
    communityShell.directMessagesUnreadCount > 99
      ? "99+"
      : String(communityShell.directMessagesUnreadCount);
  const hasCommunityAttention = Boolean(
    communityShell.activeCommunity?.id &&
    communityShell.communityRailAttentionById[
      communityShell.activeCommunity.id
    ],
  );

  return (
    <nav className="mobile-bottom-rail" aria-label="Primary navigation">
      <div className="mobile-bottom-rail-inner">
        <button
          type="button"
          className={`mobile-bottom-rail-action mobile-bottom-rail-community${activeRoot === "community" ? " active" : ""}`}
          aria-current={activeRoot === "community" ? "page" : undefined}
          onClick={() => communityShell.onSelectMobileRootPage("community")}
        >
          <span className="mobile-bottom-rail-icon-wrap">
            <House aria-hidden="true" />
            {hasCommunityAttention ? (
              <span
                className="mobile-bottom-rail-dot"
                aria-label="Community updates"
              />
            ) : null}
          </span>
          <span>Community</span>
        </button>

        <button
          type="button"
          className="mobile-bottom-rail-action mobile-bottom-rail-ai"
          aria-label="Open Polynet AI"
          aria-expanded={communityShell.mobileOverlay === "agent"}
          aria-controls="polynet-member-agent-surface"
          onClick={communityShell.onOpenMobileAgent}
        >
          <span className="mobile-bottom-rail-ai-icon">
            <Sparkles aria-hidden="true" />
          </span>
          <span>AI</span>
        </button>

        <button
          type="button"
          className={`mobile-bottom-rail-action mobile-bottom-rail-messages${activeRoot === "messages" ? " active" : ""}`}
          aria-current={activeRoot === "messages" ? "page" : undefined}
          aria-label={
            communityShell.directMessagesUnreadCount > 0
              ? `Messages, ${unreadDisplay} unread`
              : "Messages"
          }
          disabled={!communityShell.canOpenDirectMessages}
          onClick={() => communityShell.onSelectMobileRootPage("messages")}
        >
          <span className="mobile-bottom-rail-icon-wrap">
            <MessageCircle aria-hidden="true" />
            {communityShell.directMessagesUnreadCount > 0 ? (
              <span className="mobile-bottom-rail-unread">{unreadDisplay}</span>
            ) : null}
          </span>
          <span>Messages</span>
        </button>
      </div>
    </nav>
  );
}
