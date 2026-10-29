import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { UserAvatar } from "../../../../shared/UserAvatar";
import type { WebCommunityShellProps } from "./webShellChromeShared";

// In the Classroom layout the owner's pages (Settings, Workflows, Funnels) open full
// screen, like Substack's dashboard: this slim bar replaces the community's
// tab bar, with a way back to the community and the page's name.

const PAGE_LABEL: Partial<Record<CommunityTab, string>> = { settings: "Settings", workflows: "Workflows", people: "Members" };

export function isCommunityOwnerPage(tab: CommunityTab | null | undefined): boolean {
  return tab === "settings" || tab === "workflows" || tab === "people";
}

export function WebCommunityOwnerBar(props: {
  communityShell: WebCommunityShellProps;
  homeTab: CommunityTab;
  trailing?: ReactNode;
}) {
  const community = props.communityShell.activeCommunity;
  const tab = props.communityShell.communityTab;
  return (
    <header className="community-owner-bar">
      <button type="button" className="community-owner-bar-back" aria-label="Back to community" onClick={() => props.communityShell.onSelectCommunityTab(props.homeTab)}>
        <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
        <span>Back to community</span>
      </button>
      <span className="community-owner-bar-divider" aria-hidden="true" />
      {community ? (
        <UserAvatar
          className="community-owner-bar-avatar"
          readyClassName="has-image"
          imageClassName="community-owner-bar-avatar-image"
          fallbackClassName="community-owner-bar-avatar-fallback"
          name={community.name}
          imageUrl={community.avatar_url}
          focusX={community.avatar_focus_x ?? 0.5}
          focusY={community.avatar_focus_y ?? 0.5}
          zoom={community.avatar_zoom ?? 1}
          fallback={<span>{props.communityShell.communityInitials(community.name)}</span>}
          alt=""
          aria-hidden={true}
        />
      ) : null}
      <span className="community-owner-bar-title">
        <span className="community-owner-bar-community">{community?.name ?? "Community"}</span>
        <span className="community-owner-bar-page">{tab === "settings" && !props.communityShell.canManageMembersActiveCommunity ? "Membership" : (tab && PAGE_LABEL[tab]) ?? "Settings"}</span>
      </span>
      {props.trailing ? <span className="community-owner-bar-tools">{props.trailing}</span> : null}
    </header>
  );
}
