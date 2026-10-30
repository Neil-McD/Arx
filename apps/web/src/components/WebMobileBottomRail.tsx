import { House, MessageCircle } from "lucide-react";
import { CommunityAgentIcon } from "../../../../shared/CommunityAgentIcon";
import type { WebCommunityShellProps } from "./webShellChromeShared";

type WebMobileBottomRailProps = {
  communityShell: WebCommunityShellProps;
};

export function WebMobileBottomRail({
  communityShell,
}: WebMobileBottomRailProps) {
  if (!communityShell.showMobileShell) return null;

  const activeRoot = communityShell.mobileRootPage;
  const hasCommunityRail = communityShell.showMobileGlobalShell;
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
    <nav
      className={`mobile-bottom-rail${hasCommunityRail ? " has-community-rail" : ""}`}
      aria-label="Primary navigation"
    >
      <div className="mobile-bottom-rail-inner">
        <button
          type="button"
          className={`mobile-bottom-rail-action mobile-bottom-rail-community${activeRoot === "community" ? " active" : ""}`}
          aria-label={
            hasCommunityAttention ? "Community, updates available" : "Community"
          }
          aria-current={activeRoot === "community" ? "page" : undefined}
          onClick={() => communityShell.onSelectMobileRootPage("community")}
        >
          <span className="mobile-bottom-rail-icon-wrap">
            <House className="mobile-bottom-rail-community-base" aria-hidden="true" />
            <House className="mobile-bottom-rail-community-cutout" aria-hidden="true" />
            {hasCommunityAttention ? (
              <span
                className="mobile-bottom-rail-dot"
                aria-label="Community updates"
              />
            ) : null}
          </span>
        </button>

        <button
          type="button"
          className={`mobile-bottom-rail-action mobile-bottom-rail-ai${activeRoot === "agent" ? " active" : ""}`}
          aria-label="Open Polynet AI"
          aria-current={activeRoot === "agent" ? "page" : undefined}
          onClick={() => communityShell.onSelectMobileRootPage("agent")}
        >
          <span className="mobile-bottom-rail-ai-icon">
            <CommunityAgentIcon />
          </span>
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
        </button>
      </div>
    </nav>
  );
}
