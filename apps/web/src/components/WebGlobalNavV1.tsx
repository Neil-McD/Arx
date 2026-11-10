import { ArrowLeft, Compass, Inbox, Plus } from "lucide-react";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { SettingsNavList } from "../../../../shared/SettingsNavList";
import { WebAccountMenu } from "./WebAccountMenu";
import { WebCommunitySwitcher } from "./WebCommunitySwitcher";
import type { CommunityLike, WebCommunityShellProps, WebSettingsSidebarProps } from "./webShellChromeShared";

// Design system v1: the left column on the pages outside a community (Discover
// and your own settings), so they share the frame every community page has.
// It takes the place of the rail of community icons there.
export function WebGlobalNavV1(props: {
  mode: "discover" | "settings";
  communityShell: WebCommunityShellProps;
  settingsSidebar: WebSettingsSidebarProps;
  onBackFromSettings: () => void;
}) {
  const { communityShell } = props;
  const openCommunity = (community: CommunityLike) => {
    communityShell.onSelectActiveCommunity(community);
    const slug = String(community.slug ?? "").trim();
    if (slug) communityShell.onOpenCommunityChat(slug);
  };
  const inbox = communityShell.canOpenDirectMessages ? (
    <button
      className={communityShell.isDirectMessagesOpen ? "nav-item community-nav-inbox active" : "nav-item community-nav-inbox"}
      type="button"
      onClick={communityShell.onToggleDirectMessages}
      aria-expanded={communityShell.isDirectMessagesOpen}
      title="Inbox"
    >
      <span className="nav-icon" aria-hidden="true"><Inbox size={17} strokeWidth={1.7} /></span>
      <span className="nav-item-label">Inbox</span>
      {communityShell.directMessagesUnreadCount > 0 ? (
        <span className="nav-item-count" aria-label={`${communityShell.directMessagesUnreadCount} unread`}>
          {communityShell.directMessagesUnreadCount > 99 ? "99+" : communityShell.directMessagesUnreadCount}
        </span>
      ) : null}
    </button>
  ) : null;

  return (
    <aside className="community-nav global-nav-v1" aria-label={props.mode === "discover" ? "Discover" : "Settings"}>
      <div className="community-nav-identity is-condensed">
        <WebCommunitySwitcher
          activeCommunityName={props.mode === "discover" ? "Discover" : "Settings"}
          communities={communityShell.railCommunities}
          selectedCommunitySlug={null}
          attentionById={communityShell.communityRailAttentionById}
          onSelectCommunity={openCommunity}
          onOpenDiscover={communityShell.onOpenDiscover}
          onCreateCommunity={communityShell.onOpenCommunityCreateCta}
        />
      </div>
      {props.mode === "settings" ? (
        <>
          <div className="community-nav-v1-primary">
            <button className="nav-item" type="button" onClick={props.onBackFromSettings} title="Back">
              <span className="nav-icon" aria-hidden="true"><ArrowLeft size={17} strokeWidth={1.7} /></span>
              <span className="nav-item-label">Back</span>
            </button>
            {inbox}
          </div>
          <div className="community-nav-section-label">Settings</div>
          <SettingsNavList
            settingsGroup={props.settingsSidebar.settingsGroup}
            onSelectPage={props.settingsSidebar.onSelectPage}
          />
        </>
      ) : (
        <>
          <div className="community-nav-v1-primary">
            <button className="nav-item active" type="button" onClick={communityShell.onOpenDiscover} title="Discover" aria-current="page">
              <span className="nav-icon" aria-hidden="true"><Compass size={17} strokeWidth={1.7} /></span>
              <span className="nav-item-label">Discover</span>
            </button>
            {inbox}
          </div>
          <div className="community-nav-section-label">Your communities</div>
          {communityShell.railCommunities.map((community) => (
            <button key={community.id} className="nav-item global-nav-community" type="button" onClick={() => openCommunity(community)} title={community.name}>
              <CommunityAvatar
                communityId={community.id}
                visualIdentity={community.visual_identity}
                className="community-switcher-avatar"
                imageUrl={community.avatar_url}
                focusX={community.avatar_focus_x}
                focusY={community.avatar_focus_y}
                zoom={community.avatar_zoom}
                name={community.name}
              />
              <span className="nav-item-label">{community.name}</span>
              {communityShell.communityRailAttentionById[community.id] ? <span className="nav-item-dot" aria-hidden="true" /> : null}
            </button>
          ))}
          <button className="nav-item community-channel-add" type="button" onClick={communityShell.onOpenCommunityCreateCta} title="Start a community">
            <span className="nav-icon" aria-hidden="true"><Plus size={17} strokeWidth={1.8} /></span>
            <span className="nav-item-label">Start a community</span>
          </button>
        </>
      )}
      {communityShell.account ? (
        <div className="community-nav-account"><WebAccountMenu {...communityShell.account} /></div>
      ) : null}
    </aside>
  );
}
