import { House, Inbox, MessageCircle, Sparkles } from "lucide-react";
import { isDesignV1Active } from "../../../../shared/designSystem";
import type { WebCommunityShellProps } from "./webShellChromeShared";

type WebMobileBottomRailProps = {
  communityShell: WebCommunityShellProps;
};

export function WebMobileBottomRail({
  communityShell,
}: WebMobileBottomRailProps) {
  if (!communityShell.showMobileShell) return null;
  if (isDesignV1Active()) return <PhoneTabs communityShell={communityShell} />;

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
            <Sparkles aria-hidden="true" />
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

// Design v1 on a phone (Neil, Nov 14 mock): three tabs with the desktop's own
// marks. Home is the guide's page, the middle tab is the community (its logo),
// Inbox is the one inbox. Inside a channel, thread or conversation the tabs
// step aside for the composer (design-v1.css).
function PhoneTabs({ communityShell }: WebMobileBottomRailProps) {
  const activeRoot = communityShell.mobileRootPage;
  // In a channel (and its threads) or a pod's room, the composer has the
  // bottom of the screen; the arrow at the top goes back. A conversation in
  // Inbox does the same in CSS (design-v1.css).
  const destination = communityShell.destination;
  const inConversation = activeRoot === "community" && (
    destination.kind === "community_chat" ||
    (destination.kind === "community_pods" && Boolean(destination.podSlug))
  );
  if (inConversation) return null;
  const community = communityShell.activeCommunity;
  const communityName = String(community?.name ?? "").trim() || "Community";
  const logo = String(community?.avatar_url ?? "").trim();
  const unread = communityShell.directMessagesUnreadCount;
  const unreadDisplay = unread > 99 ? "99+" : String(unread);
  const hasCommunityAttention = Boolean(
    community?.id && communityShell.communityRailAttentionById[community.id],
  );
  const tab = (
    root: "agent" | "community" | "messages",
    label: string,
    icon: JSX.Element,
    options: { ariaLabel?: string; badge?: JSX.Element | null; disabled?: boolean } = {},
  ) => (
    <button
      type="button"
      className={`mobile-phone-tab${activeRoot === root ? " active" : ""}`}
      aria-label={options.ariaLabel ?? label}
      aria-current={activeRoot === root ? "page" : undefined}
      disabled={options.disabled}
      onClick={() => communityShell.onSelectMobileRootPage(root)}
    >
      <span className="mobile-phone-tab-icon">
        {icon}
        {options.badge ?? null}
      </span>
      <span className="mobile-phone-tab-label">{label}</span>
    </button>
  );
  return (
    <nav className="mobile-bottom-rail is-phone-tabs" aria-label="Primary navigation">
      <div className="mobile-phone-tabs">
        {tab("agent", "Home", <House size={22} strokeWidth={1.7} aria-hidden="true" />)}
        {tab(
          "community",
          communityName,
          logo ? <img className="mobile-phone-tab-logo" src={logo} alt="" /> : (
            <span className="mobile-phone-tab-logo is-letter" aria-hidden="true">{communityName.slice(0, 1).toUpperCase()}</span>
          ),
          {
            ariaLabel: hasCommunityAttention ? `${communityName}, updates available` : communityName,
            badge: hasCommunityAttention ? <span className="mobile-phone-tab-dot" aria-hidden="true" /> : null,
          },
        )}
        {tab("messages", "Inbox", <Inbox size={22} strokeWidth={1.7} aria-hidden="true" />, {
          ariaLabel: unread > 0 ? `Inbox, ${unreadDisplay} unread` : "Inbox",
          badge: unread > 0 ? <span className="mobile-phone-tab-count">{unreadDisplay}</span> : null,
          disabled: !communityShell.canOpenDirectMessages,
        })}
      </div>
    </nav>
  );
}
