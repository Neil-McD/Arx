import { ArrowLeft, Bell, Building2, Globe, Lock, Plug, Sparkles, Sun, Tag, TriangleAlert, User, CreditCard } from "lucide-react";
import type { ReactNode } from "react";
import {
  COMMUNITY_SETTINGS_PANE_LABELS,
  listCommunitySettingsPanesForAccess,
  settingsGroupLabel,
  type CommunitySettingsPane,
  type SettingsPage,
} from "../../../../shared/appShellNavigation";
import { WebAccountMenu } from "./WebAccountMenu";
import type { WebCommunityShellProps, WebSettingsSidebarProps } from "./webShellChromeShared";

// One Settings page (design v1): its sidebar. Every setting belongs to you, to
// you in this community, or to the community (its hosts), and the groups say
// so. The same sidebar shows on your own settings and on the community's, so
// the two read as one page. It takes the place of the left column.
const PERSONAL: Array<{ page: SettingsPage; icon: ReactNode }> = [
  { page: "profile", icon: <User size={16} strokeWidth={1.7} /> },
  { page: "account", icon: <Lock size={16} strokeWidth={1.7} /> },
  { page: "billing", icon: <CreditCard size={16} strokeWidth={1.7} /> },
  { page: "appearance", icon: <Sun size={16} strokeWidth={1.7} /> },
];

const PANE_ICONS: Record<CommunitySettingsPane, ReactNode> = {
  community: <Building2 size={16} strokeWidth={1.7} />,
  public: <Globe size={16} strokeWidth={1.7} />,
  plans: <Tag size={16} strokeWidth={1.7} />,
  app: <Plug size={16} strokeWidth={1.7} />,
  agent: <Sparkles size={16} strokeWidth={1.7} />,
  danger: <TriangleAlert size={16} strokeWidth={1.7} />,
};

export function WebSettingsNavV1(props: {
  communityShell: WebCommunityShellProps;
  settingsSidebar: WebSettingsSidebarProps;
  // What is open: one of your own pages, or a section of the community's.
  current: { kind: "personal"; page: SettingsPage } | { kind: "community"; pane: CommunitySettingsPane };
  onBack: () => void;
}) {
  const { communityShell } = props;
  const community = communityShell.activeCommunity;
  const openPane = communityShell.onOpenCommunitySettingsPane;
  const canManage = communityShell.canManageMembersActiveCommunity;
  const panes = community && openPane && communityShell.canViewActiveCommunitySettings
    ? listCommunitySettingsPanesForAccess({
      canViewSettings: true,
      canManageSettings: canManage,
      canManageMembers: canManage,
      isOwner: Boolean(communityShell.isActiveCommunityOwner),
    })
    : [];
  const item = (key: string, label: string, icon: ReactNode, active: boolean, onClick: () => void) => (
    <button key={key} className={active ? "nav-item active" : "nav-item"} type="button" onClick={onClick} title={label} aria-current={active ? "page" : undefined}>
      <span className="nav-icon" aria-hidden="true">{icon}</span>
      <span className="nav-item-label">{label}</span>
    </button>
  );
  return (
    <aside className="community-nav global-nav-v1 settings-nav-v1" aria-label="Settings">
      <div className="community-nav-v1-primary">
        <button className="nav-item settings-nav-back" type="button" onClick={props.onBack} title="Back">
          <span className="nav-icon" aria-hidden="true"><ArrowLeft size={17} strokeWidth={1.7} /></span>
          <span className="nav-item-label">{community ? `Back to ${community.name}` : "Back"}</span>
        </button>
      </div>
      <div className="community-nav-section-label">You</div>
      {PERSONAL.map((entry) => item(
        entry.page, settingsGroupLabel(entry.page), entry.icon,
        props.current.kind === "personal" && props.current.page === entry.page,
        () => props.settingsSidebar.onSelectPage(entry.page),
      ))}
      {community && openPane && panes.length ? (
        canManage ? (
          <>
            <div className="community-nav-section-label">{community.name}</div>
            {panes.map((pane) => item(
              pane, COMMUNITY_SETTINGS_PANE_LABELS[pane], PANE_ICONS[pane],
              props.current.kind === "community" && props.current.pane === pane,
              () => openPane(pane),
            ))}
          </>
        ) : (
          <>
            <div className="community-nav-section-label">You in {community.name}</div>
            {item("membership", "Membership", <Bell size={16} strokeWidth={1.7} />, props.current.kind === "community", () => openPane("community"))}
          </>
        )
      ) : null}
      {communityShell.account ? (
        <div className="community-nav-account"><WebAccountMenu {...communityShell.account} /></div>
      ) : null}
    </aside>
  );
}
