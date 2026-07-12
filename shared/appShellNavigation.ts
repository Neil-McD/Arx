export type SettingsPage =
  | "profile"
  | "account"
  | "billing"
  | "partners"
  | "agent"
  | "integrations"
  | "appearance";

export type SettingsGroup =
  | "profile"
  | "account"
  | "billing"
  | "partners"
  | "agent"
  | "integrations"
  | "appearance";

export type AppPage = "landing" | "onboarding" | "workspace" | "community" | "discover" | "docs";

export type AppView = "home" | "settings";

export const COMMUNITY_TABS = [
  "chat",
  "ai_feed",
  "resources",
  "events",
  "settings",
  "polynet",
  "ai_agent",
  "funnel",
  "analytics",
] as const;

export type CommunityTab = (typeof COMMUNITY_TABS)[number];

export const COMMUNITY_SETTINGS_PANES = [
  "community",
  "integrations",
  "danger",
] as const;

export type CommunitySettingsPane = (typeof COMMUNITY_SETTINGS_PANES)[number];

const COMMUNITY_ROUTE_MANAGED_TAB_SET: ReadonlySet<CommunityTab> = new Set([
  "settings",
  "polynet",
  "ai_agent",
  "funnel",
  "analytics",
]);

export function isCommunityRouteManagedTab(tab: CommunityTab): boolean {
  return COMMUNITY_ROUTE_MANAGED_TAB_SET.has(tab);
}

export type CommunityTabAccess = {
  canViewSettings: boolean;
  canViewPolynet: boolean;
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
    case "polynet":
      return access.canViewPolynet;
    case "ai_agent":
    case "funnel":
      return access.canManageMembers;
    case "analytics":
      return access.canViewAnalytics;
    case "chat":
    case "ai_feed":
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

export function parseCommunityTab(value: string | null | undefined): CommunityTab {
  switch ((value ?? "").trim()) {
    case "ai-feed":
      return "ai_feed";
    case "ai_feed":
      return "ai_feed";
    case "feed":
      return "ai_feed";
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
    case "polynet":
      return "polynet";
    case "ai_agent":
      return "ai_agent";
    case "funnel":
      return "funnel";
    case "analytics":
      return "analytics";
    default:
      return "chat";
  }
}

export function parseCommunitySettingsPane(value: string | null | undefined): CommunitySettingsPane {
  switch ((value ?? "").trim()) {
    case "integrations":
      return "integrations";
    case "danger":
      return "danger";
    case "community":
    default:
      return "community";
  }
}

export function settingsGroupForPage(page: SettingsPage): SettingsGroup {
  if (page === "profile") return "profile";
  if (page === "account") return "account";
  if (page === "billing") return "billing";
  if (page === "partners") return "partners";
  if (page === "integrations") return "integrations";
  if (page === "appearance") return "appearance";
  return "agent";
}

export function settingsGroupLabel(group: SettingsGroup): string {
  switch (group) {
    case "profile":
      return "Profile";
    case "account":
      return "Account";
    case "billing":
      return "Billing";
    case "partners":
      return "Partners";
    case "agent":
      return "Agent";
    case "integrations":
      return "Integrations";
    case "appearance":
      return "Appearance";
  }
}
