import { Fragment, useState, type ReactNode } from "react";
import { Check, Link2, Search, X } from "lucide-react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { communityLayoutTabLabel, visibleCommunityLayoutTabs } from "../../../../shared/communityLayout";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { communityJoinUrl, useWebCommunityFrame } from "../controllers/useWebCommunityFrame";
import type { WebCommunityShellProps } from "./webShellChromeShared";
import { WebCommunityNotificationsMenu } from "./WebCommunityNotificationsMenu";
import { WebCommunityPodsButton } from "./WebCommunityPods";

// The community's navigation as a tab bar across the top, for layouts with
// navigation.position "top". Same tabs, channels, indicators and owner tools
// as the side column (shared/CommunityNav.tsx); only the arrangement differs.
// Shared channels show as category chips under the tabs on the chat tab;
// invite-only ones are pods (WebCommunityPods), never chips. With the theme's
// pods_place "tab", pods get their own tab after Community (WebCommunityPodsHome).
// The first row is the header: the community, a search across its posts, and
// the member's tools (invite, messages, notifications).

// Members' own Settings (their access, mute, leave) reads as Membership.
const OWNER_TABS: { tab: CommunityTab; label: (shell: WebCommunityShellProps) => string; allowed: (shell: WebCommunityShellProps) => boolean }[] = [
  { tab: "workflows", label: () => "Workflows", allowed: (shell) => shell.canManageMembersActiveCommunity },
  { tab: "people", label: () => "Members", allowed: (shell) => shell.canManageMembersActiveCommunity },
  { tab: "analytics", label: () => "Analytics", allowed: (shell) => shell.canViewActiveCommunityAnalytics },
  { tab: "settings", label: (shell) => (shell.canManageMembersActiveCommunity ? "Settings" : "Membership"), allowed: (shell) => shell.canViewActiveCommunitySettings },
];

export function WebCommunityTopNav({
  communityShell,
  trailing,
}: {
  communityShell: WebCommunityShellProps;
  // Extra header tools, placed after notifications (e.g. the Display menu).
  trailing?: ReactNode;
}) {
  const { layout, postSearch, onPostSearch, pods } = useWebCommunityFrame();
  const [copied, setCopied] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const community = communityShell.activeCommunity;
  const activeTab = communityShell.communityTab;
  // The agent floats at the bottom right in this layout, so it has no tab.
  // Owners and admins get the members database (owner tab "Members") instead of
  // the directory, so the bar never shows two "Members"; the database links to it.
  const tabs = visibleCommunityLayoutTabs(layout).filter(
    (entry) => entry.tab !== "agent" && (entry.tab !== "members"
      || (communityShell.canViewMembersActiveCommunity && !communityShell.canManageMembersActiveCommunity)),
  );
  const ownerTabs = communityShell.isLoadingCommunityAccess ? [] : OWNER_TABS.filter((entry) => entry.allowed(communityShell));
  const joinUrl = communityJoinUrl(community?.slug);
  const canInvite = Boolean(communityShell.canViewMembersActiveCommunity && joinUrl);
  const channels = [...communityShell.communityChannels].sort((a, b) => a.position - b.position);
  const topics = channels.filter((channel) => channel.access_mode !== "restricted");
  const inPod = Boolean(pods?.selectedSlug && pods.pods.some((pod) => pod.slug === pods.selectedSlug));
  // "tab" placement: Pods is its own tab after Community, lit on the Pods page
  // and inside a pod, and the header has no pods button.
  const podsTab = Boolean(pods && pods.place === "tab" && (pods.pods.length > 0 || pods.createPod));
  const inPodsTab = Boolean(podsTab && (pods?.home || inPod));
  const showChips = activeTab === "chat" && topics.length > 1 && !inPod && !pods?.home;
  const mentionChannels = channels.filter((channel) => communityShell.communityChannelIndicators[channel.slug]?.mentions);
  const search = (query: string) => {
    onPostSearch(query);
    if (query.trim() && activeTab !== "chat") communityShell.onSelectCommunityTab("chat");
  };

  const copyInvite = async () => {
    if (!joinUrl) return;
    await communityShell.onCopyCommunityJoinLink(joinUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const selectTab = (tab: CommunityTab) => {
    if (pods?.home) pods.setHome(false);
    // Community leaves the pod for the community's main chat.
    if (tab === "chat" && inPodsTab && inPod) pods?.onLeave();
    communityShell.onSelectCommunityTab(tab);
  };

  const renderTab = (tab: CommunityTab, label: string) => {
    const isActive = activeTab === tab && !(tab === "chat" && inPodsTab);
    return (
      <button
        key={tab}
        type="button"
        role="tab"
        aria-selected={isActive}
        className={`community-top-nav-tab${isActive ? " is-active" : ""}`}
        onClick={() => selectTab(tab)}
      >
        <span>{label}</span>
        {!isActive && communityShell.communityTabIndicators[tab] ? <span className="nav-item-dot" aria-hidden="true" /> : null}
      </button>
    );
  };

  return (
    <header className="community-top-nav">
      <div className={`community-top-nav-identity${searchOpen ? " is-search-open" : ""}`}>
        {community ? (
          <UserAvatar
            className="community-top-nav-avatar"
            readyClassName="has-image"
            imageClassName="community-top-nav-avatar-image"
            fallbackClassName="community-top-nav-avatar-fallback"
            name={community.name}
            imageUrl={community.avatar_url}
            focusX={community.avatar_focus_x ?? 0.5}
            focusY={community.avatar_focus_y ?? 0.5}
            zoom={community.avatar_zoom ?? 1}
            fallback={<span>{communityShell.communityInitials(community.name)}</span>}
            alt=""
            aria-hidden={true}
          />
        ) : null}
        <span className="community-top-nav-name">{community?.name ?? "Community"}</span>
        <label className="community-top-nav-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search posts"
            aria-label={`Search posts in ${community?.name ?? "this community"}`}
            value={postSearch}
            maxLength={120}
            onChange={(event) => search(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                search("");
                setSearchOpen(false);
              }
            }}
            autoFocus={searchOpen}
          />
          {postSearch || searchOpen ? (
            <button
              type="button"
              className="community-top-nav-search-clear"
              aria-label="Clear search"
              onClick={() => {
                search("");
                setSearchOpen(false);
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <button
          type="button"
          className="community-top-nav-icon community-top-nav-search-toggle"
          aria-label="Search posts"
          onClick={() => setSearchOpen(true)}
        >
          <Search size={20} aria-hidden="true" />
        </button>
        <div className="community-top-nav-actions">
          {canInvite ? (
            <button type="button" className="community-top-nav-invite" onClick={() => void copyInvite()}>
              {copied ? <Check size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
              <span>{copied ? "Copied" : "Invite"}</span>
            </button>
          ) : null}
          {pods && pods.place !== "tab" ? <WebCommunityPodsButton pods={pods} /> : null}
          {communityShell.directMessagesButton ?? null}
          <WebCommunityNotificationsMenu
            communityId={community?.id ?? null}
            events={communityShell.communityActivityEvents ?? []}
            mentionChannels={mentionChannels}
            onSelectTab={communityShell.onSelectCommunityTab}
            onSelectChannel={(slug) => {
              const channel = channels.find((candidate) => candidate.slug === slug);
              if (!channel) return;
              pods?.setHome(false);
              communityShell.onSelectCommunityTab("chat");
              communityShell.onSelectCommunityChannel(channel);
            }}
          />
          {trailing}
        </div>
      </div>
      <nav className="community-top-nav-tabs" role="tablist" aria-label={`${community?.name ?? "Community"} sections`}>
        {tabs.map((entry) => (
          <Fragment key={entry.tab}>
            {renderTab(entry.tab, communityLayoutTabLabel(layout, entry.tab))}
            {entry.tab === "chat" && podsTab && pods ? (
              <button
                type="button"
                role="tab"
                aria-selected={inPodsTab}
                className={`community-top-nav-tab${inPodsTab ? " is-active" : ""}`}
                onClick={() => pods.setHome(true)}
              >
                <span>Pods</span>
                {!inPodsTab && pods.pods.some((pod) => pods.unread[pod.slug]) ? <span className="nav-item-dot" aria-hidden="true" /> : null}
              </button>
            ) : null}
          </Fragment>
        ))}
        {ownerTabs.length > 0 ? <span className="community-top-nav-divider" aria-hidden="true" /> : null}
        {ownerTabs.map((entry) => renderTab(entry.tab, entry.label(communityShell)))}
      </nav>
      {showChips ? (
        <div className="community-top-nav-chips" role="group" aria-label="Categories">
          {topics.map((channel) => {
            const selected = communityShell.selectedCommunityChannelSlug === channel.slug
              || (!communityShell.selectedCommunityChannelSlug && channel.is_general);
            const unread = communityShell.communityChannelIndicators[channel.slug]?.chat;
            return (
              <button
                key={channel.id}
                type="button"
                aria-pressed={selected}
                className={`community-category-chip${selected ? " is-selected" : ""}${unread && !selected ? " has-unread" : ""}`}
                onClick={() => communityShell.onSelectCommunityChannel(channel)}
              >
                {channel.name}
              </button>
            );
          })}
        </div>
      ) : null}
    </header>
  );
}
