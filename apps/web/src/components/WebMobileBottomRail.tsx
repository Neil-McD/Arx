import { House, Inbox } from "lucide-react";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type { WebCommunityShellProps } from "./webShellChromeShared";

type WebMobileBottomRailProps = {
  communityShell: WebCommunityShellProps;
};

export function WebMobileBottomRail({
  communityShell,
}: WebMobileBottomRailProps) {
  if (!communityShell.showMobileShell) return null;
  return <PhoneTabs communityShell={communityShell} />;
}

// Design v1 on a phone (Neil, Nov 14 mock): three tabs with the desktop's own
// marks. Home is the guide's page, the middle tab is the community (its logo),
// Inbox is the one inbox. Inside a channel, thread or conversation the tabs
// step aside for the composer (design-v1.css).
function PhoneTabs({ communityShell }: WebMobileBottomRailProps) {
  const activeRoot = communityShell.mobileRootPage;
  // In a channel (and its threads) or a pod's chat room (`community_chat`),
  // the composer has the bottom of the screen; the arrow at the top goes back.
  // Pod preview/join pages (`community_pods`) have no composer and keep the
  // bottom tabs. An open DM conversation or Home guide talk hides the tabs in
  // CSS (design-v1.css).
  const destination = communityShell.destination;
  const inConversation = activeRoot === "community" && destination.kind === "community_chat";
  if (inConversation) return null;
  const community = communityShell.activeCommunity;
  const communityName = String(community?.name ?? "").trim() || "Community";
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
          <CommunityAvatar
            communityId={community?.id}
            visualIdentity={community?.visual_identity}
            name={communityName}
            imageUrl={community?.avatar_url}
            focusX={community?.avatar_focus_x}
            focusY={community?.avatar_focus_y}
            zoom={community?.avatar_zoom}
            className="mobile-phone-tab-logo"
            fallbackClassName="is-letter"
            alt=""
            aria-hidden
          />,
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
