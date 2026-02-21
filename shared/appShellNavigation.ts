export type SettingsPage = "account" | "models" | "execution" | "memory" | "appearance";

export type SettingsGroup = "account" | "agent" | "appearance";

export type AppPage = "workspace" | "community" | "discover";

export type AppView = "home" | "settings";

export const COMMUNITY_TABS = [
  "chat",
  "library",
  "resources",
  "members",
  "settings",
  "ai_agent",
  "analytics",
] as const;

export type CommunityTab = (typeof COMMUNITY_TABS)[number];

const COMMUNITY_ROUTE_MANAGED_TAB_SET: ReadonlySet<CommunityTab> = new Set([
  "settings",
  "ai_agent",
  "analytics",
]);

export function isCommunityRouteManagedTab(tab: CommunityTab): boolean {
  return COMMUNITY_ROUTE_MANAGED_TAB_SET.has(tab);
}

export function parseCommunityTab(value: string | null | undefined): CommunityTab {
  switch ((value ?? "").trim()) {
    case "library":
      return "library";
    case "resources":
      return "resources";
    case "members":
      return "members";
    case "settings":
      return "settings";
    case "ai_agent":
      return "ai_agent";
    case "analytics":
      return "analytics";
    default:
      return "chat";
  }
}

export function settingsGroupForPage(page: SettingsPage): SettingsGroup {
  if (page === "appearance") return "appearance";
  if (page === "account") return "account";
  return "agent";
}

export function settingsGroupLabel(group: SettingsGroup): string {
  switch (group) {
    case "account":
      return "Account";
    case "agent":
      return "Agent";
    case "appearance":
      return "Appearance";
  }
}
