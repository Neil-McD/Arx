export type SettingsPage =
  | "profile"
  | "account"
  | "billing"
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

export type AppView = "home";

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
  "resources",
  "events",
  "settings",
  "analytics",
] as const;

export type CommunityTab = (typeof COMMUNITY_TABS)[number];

export const COMMUNITY_SETTINGS_PANES = [
  "community",
  "workflows",
  "agent",
  "funnel",
  "danger",
] as const;

export type CommunitySettingsPane = (typeof COMMUNITY_SETTINGS_PANES)[number];

const COMMUNITY_ROUTE_MANAGED_TAB_SET: ReadonlySet<CommunityTab> = new Set([
  "settings",
  "analytics",
]);

export function isCommunityRouteManagedTab(tab: CommunityTab): boolean {
  return COMMUNITY_ROUTE_MANAGED_TAB_SET.has(tab);
}

export type CommunityTabAccess = {
  canViewSettings: boolean;
  canViewAnalytics: boolean;
};

export function isCommunityTabAllowedForAccess(
  tab: CommunityTab,
  access: CommunityTabAccess,
): boolean {
  switch (tab) {
    case "settings":
      return access.canViewSettings;
    case "analytics":
      return access.canViewAnalytics;
    case "chat":
    case "resources":
    case "events":
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
    // Retired top-level configuration routes normalize to Settings. The
    // pathname parser preserves the specific Agent/Funnel pane.
    case "agent":
    case "ai_agent":
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
    case "funnel":
      return "funnel";
    case "danger":
      return "danger";
    case "workflows":
      return "workflows";
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
    case "workflows":
      return access.canManageSettings;
    case "agent":
    case "funnel":
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
    case "billing":
      return "Billing";
    case "appearance":
      return "Appearance";
  }
}
