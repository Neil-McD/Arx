export type SettingsPage =
  | "profile"
  | "account"
  | "memberships"
  | "billing"
  | "apps"
  | "appearance";

export type SettingsGroup = SettingsPage;

export type AppPage =
  | "landing"
  | "onboarding"
  | "settings"
  | "operator"
  | "community"
  | "discover"
  | "docs";

export type AppView = "home" | "community_home";

export type DesktopShellContextualBackPage = "settings" | "operator";

export function isDesktopShellContextualBackPage(
  page: AppPage,
): page is DesktopShellContextualBackPage {
  return page === "settings" || page === "operator";
}

export const OPERATOR_TABS = [
  "platform",
  "business",
  "email",
  "communities",
] as const;

export type OperatorTab = (typeof OPERATOR_TABS)[number];

export function parseOperatorTab(
  value: string | null | undefined,
): OperatorTab {
  const normalized = String(value ?? "").trim();
  return OPERATOR_TABS.includes(normalized as OperatorTab)
    ? (normalized as OperatorTab)
    : "platform";
}

export const COMMUNITY_TABS = [
  "chat",
  "agent",
  "resources",
  "events",
  "members",
  "about",
  "settings",
  "workflows",
  "people",
  "analytics",
] as const;

export type CommunityTab = (typeof COMMUNITY_TABS)[number];

// Tabs drawn by the community chat surface: Members is the chat's member list
// shown as a page, so it loads the same channel, directory and presence.
export function isCommunityChatBackedTab(tab: CommunityTab): boolean {
  return tab === "chat" || tab === "members";
}

export const COMMUNITY_SETTINGS_PANES = [
  "community",
  "sales_page",
  "offers",
  "appearance",
  "agent",
  "creators",
  "access",
  "danger",
] as const;

export type CommunitySettingsPane = (typeof COMMUNITY_SETTINGS_PANES)[number];

const COMMUNITY_ROUTE_MANAGED_TAB_SET: ReadonlySet<CommunityTab> = new Set([
  "settings",
  "workflows",
  "people",
  "analytics",
]);

export function isCommunityRouteManagedTab(tab: CommunityTab): boolean {
  return COMMUNITY_ROUTE_MANAGED_TAB_SET.has(tab);
}

export type CommunityTabAccess = {
  canViewSettings: boolean;
  canManageMembers: boolean;
  canViewAnalytics: boolean;
};

export function isCommunityTabAllowedForAccess(
  tab: CommunityTab,
  access: CommunityTabAccess,
): boolean {
  switch (tab) {
    case "settings":
      return access.canViewSettings;
    case "workflows":
    case "people":
      return access.canManageMembers;
    case "analytics":
      return access.canViewAnalytics;
    case "chat":
    case "agent":
    case "resources":
    case "events":
    case "members":
    case "about":
      return true;
  }
}

export function normalizeCommunityTabForAccess(
  tab: CommunityTab,
  access: CommunityTabAccess,
): CommunityTab {
  return isCommunityTabAllowedForAccess(tab, access) ? tab : "chat";
}

export function parseCommunityTab(
  value: string | null | undefined,
): CommunityTab {
  switch ((value ?? "").trim()) {
    // Retired AI Feed routes intentionally fall back to the canonical
    // community chat surface instead of preserving a hidden product state.
    case "ai-feed":
    case "ai_feed":
    case "feed":
      return "chat";
    case "library":
      return "resources";
    case "resources":
      return "resources";
    case "events":
      return "events";
    case "calendar":
      return "events";
    case "settings":
      return "settings";
    case "workflows":
    case "workflow":
    case "success":
      return "workflows";
    case "agent":
      return "agent";
    case "members":
      return "members";
    // The owner's members database (the directory every member sees is "members").
    case "people":
    case "clients":
      return "people";
    case "about":
      return "about";
    case "ai_agent":
      return "settings";
    case "funnel":
      return "settings";
    case "analytics":
      return "analytics";
    default:
      return "chat";
  }
}

export function parseCommunitySettingsPane(
  value: string | null | undefined,
): CommunitySettingsPane {
  switch ((value ?? "").trim()) {
    case "agent":
    case "ai_agent":
      return "agent";
    case "danger":
      return "danger";
    case "sales_page":
    case "sales-page":
    case "sales":
      return "sales_page";
    // "look" is the pane's earlier name; old links still open it.
    case "appearance":
    case "look":
      return "appearance";
    case "access":
      return "access";
    case "creators":
    case "co-creators":
      return "creators";
    case "offers":
    case "plans":
    case "tiers":
      return "offers";
    case "community":
    default:
      return "community";
  }
}

export type CommunitySettingsPaneAccess = {
  canViewSettings: boolean;
  canManageSettings: boolean;
  canManageMembers: boolean;
  isOwner: boolean;
};

export function isCommunitySettingsPaneAllowedForAccess(
  pane: CommunitySettingsPane,
  access: CommunitySettingsPaneAccess,
): boolean {
  switch (pane) {
    case "community":
      return access.canViewSettings;
    case "agent":
      return access.canManageMembers;
    // The public About page: its layout draft is managers' to edit.
    case "sales_page":
      return access.canManageMembers;
    // Fonts, sizing and colours: the theme draft, which managers may edit.
    case "appearance":
      return access.canManageMembers;
    // Connected services (such as a paid MCP server) and access given by hand.
    case "access":
      return access.canManageMembers;
    // Who builds the community with its owner; only the owner changes it.
    case "creators":
      return access.canManageMembers;
    // The packages the community sells; the owner changes them, managers see them.
    case "offers":
      return access.canManageMembers;
    case "danger":
      return access.isOwner;
  }
}

export function listCommunitySettingsPanesForAccess(
  access: CommunitySettingsPaneAccess,
): CommunitySettingsPane[] {
  return COMMUNITY_SETTINGS_PANES.filter((pane) =>
    isCommunitySettingsPaneAllowedForAccess(pane, access),
  );
}

export function normalizeCommunitySettingsPaneForAccess(
  pane: CommunitySettingsPane,
  access: CommunitySettingsPaneAccess,
): CommunitySettingsPane {
  if (isCommunitySettingsPaneAllowedForAccess(pane, access)) return pane;
  return listCommunitySettingsPanesForAccess(access)[0] ?? "community";
}

export function settingsGroupForPage(page: SettingsPage): SettingsGroup {
  return page;
}

export function settingsGroupLabel(group: SettingsGroup): string {
  switch (group) {
    case "profile":
      return "Profile";
    case "account":
      return "Account";
    case "memberships":
      return "Memberships";
    case "billing":
      return "Billing";
    case "apps":
      return "Connected apps";
    case "appearance":
      return "Display";
  }
}
