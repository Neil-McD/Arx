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
  "pods",
  "settings",
  "analytics",
] as const;

export type CommunityTab = (typeof COMMUNITY_TABS)[number];

// One Settings page (docs/specs/settings-v1.md): the community's sections, in
// the order its sidebar lists them.
export const COMMUNITY_SETTINGS_PANES = [
  "community",
  "public",
  "plans",
  "app",
  "agent",
  "danger",
] as const;

export const COMMUNITY_SETTINGS_PANE_LABELS: Record<(typeof COMMUNITY_SETTINGS_PANES)[number], string> = {
  community: "General",
  public: "Public page",
  plans: "Plans and pricing",
  app: "Your app",
  agent: "Guide",
  danger: "Danger",
};

export type CommunitySettingsPane = (typeof COMMUNITY_SETTINGS_PANES)[number];

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
    case "analytics":
      return access.canViewAnalytics;
    case "chat":
    case "agent":
    case "resources":
    case "events":
    case "pods":
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
    case "pods":
      return "pods";
    case "settings":
      return "settings";
    case "agent":
      return "agent";
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
    case "public":
      return "public";
    case "plans":
      return "plans";
    case "app":
      return "app";
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
    case "public":
    case "plans":
    case "app":
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
