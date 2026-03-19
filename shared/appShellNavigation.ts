export type SettingsPage = "profile" | "account" | "agent" | "appearance";

export type SettingsGroup = "profile" | "account" | "agent" | "appearance";

export type AppPage = "workspace" | "community" | "discover";

export type AppView = "home" | "settings";

export const COMMUNITY_TABS = [
  "chat",
  "ai_feed",
  "resources",
  "members",
  "settings",
  "polynet",
  "ai_agent",
  "funnel",
  "analytics",
] as const;

export type CommunityTab = (typeof COMMUNITY_TABS)[number];

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
    case "members":
      return "members";
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

export function settingsGroupForPage(page: SettingsPage): SettingsGroup {
  if (page === "profile") return "profile";
  if (page === "appearance") return "appearance";
  if (page === "account") return "account";
  return "agent";
}

export function settingsGroupLabel(group: SettingsGroup): string {
  switch (group) {
    case "profile":
      return "Profile";
    case "account":
      return "Account";
    case "agent":
      return "Agent";
    case "appearance":
      return "Appearance";
  }
}
