import { isUuid } from "./appIdentity";
import { parseCommunityTab, type AppPage, type AppView, type CommunityTab, type SettingsPage } from "./appShellNavigation";

export type PublicRoute =
  | { kind: "app" }
  | { kind: "community_funnel"; slug: string }
  | { kind: "checkout_success"; sessionId: string }
  | { kind: "claim"; token: string };

export type AppRouteState = {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  communityId: string | null;
  communitySlug: string | null;
  communityTab: CommunityTab;
  threadId: string | null;
};

export type AppRoutePathState = {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  communitySlug: string | null;
  communityTab: CommunityTab;
  threadId: string | null;
};

export const DEFAULT_POST_SIGN_IN_PATH = "/workspace";

export function buildWorkspaceDraftPath(): string {
  return "/workspace";
}

export function buildWorkspaceThreadPath(threadId: string | null | undefined): string {
  const normalized = String(threadId ?? "").trim();
  if (!isUuid(normalized)) return buildWorkspaceDraftPath();
  return `/workspace/thread/${encodeURIComponent(normalized)}`;
}

export function buildSettingsPath(settingsPage: SettingsPage): string {
  return `/settings/${encodeURIComponent(settingsPage)}`;
}

export function buildCommunityTabPath(
  communitySlug: string | null | undefined,
  communityTab: CommunityTab,
): string | null {
  const slug = String(communitySlug ?? "").trim();
  if (!slug) return null;
  const tabSegment =
    communityTab === "ai_agent"
      ? "agent"
      : communityTab === "ai_feed"
        ? "ai-feed"
        : communityTab;
  return `/c/${encodeURIComponent(slug)}/${tabSegment}`;
}

function splitPathSegments(pathname: string): string[] {
  return String(pathname ?? "")
    .split("/")
    .map((segment) => decodeURIComponent(segment).trim())
    .filter(Boolean);
}

function parseSettingsPage(value: string | null | undefined): SettingsPage {
  switch ((value ?? "").trim()) {
    case "profile":
      return "profile";
    case "account":
      return "account";
    case "appearance":
      return "appearance";
    default:
      return "agent";
  }
}

function parseCommunityTabSegment(value: string | null | undefined): CommunityTab {
  switch ((value ?? "").trim()) {
    case "agent":
      return "ai_agent";
    case "ai-feed":
      return "ai_feed";
    default:
      return parseCommunityTab(value);
  }
}

function parseAppRouteFromPathname(pathname: string): AppRoutePathState | null {
  const segments = splitPathSegments(pathname);
  if (segments.length === 0) {
    return {
      page: "workspace",
      view: "home",
      settingsPage: "agent",
      communitySlug: null,
      communityTab: "chat",
      threadId: null,
    };
  }

  if (segments[0] === "discover" && segments.length === 1) {
    return {
      page: "discover",
      view: "home",
      settingsPage: "agent",
      communitySlug: null,
      communityTab: "chat",
      threadId: null,
    };
  }

  if (segments[0] === "workspace") {
    if (segments.length === 1) {
      return {
        page: "workspace",
        view: "home",
        settingsPage: "agent",
        communitySlug: null,
        communityTab: "chat",
        threadId: null,
      };
    }
    if (segments[1] === "thread" && segments.length >= 3) {
      const rawThreadId = String(segments[2] ?? "").trim();
      return {
        page: "workspace",
        view: "home",
        settingsPage: "agent",
        communitySlug: null,
        communityTab: "chat",
        threadId: isUuid(rawThreadId) ? rawThreadId : null,
      };
    }
  }

  if (segments[0] === "settings") {
    return {
      page: "workspace",
      view: "settings",
      settingsPage: parseSettingsPage(segments[1] ?? null),
      communitySlug: null,
      communityTab: "chat",
      threadId: null,
    };
  }

  if (segments[0] === "c" && segments.length >= 3) {
    const slug = String(segments[1] ?? "").trim() || null;
    if (!slug) return null;
    return {
      page: "community",
      view: "home",
      settingsPage: "agent",
      communitySlug: slug,
      communityTab: parseCommunityTabSegment(segments[2] ?? null),
      threadId: null,
    };
  }

  return null;
}

export function readPublicRouteFromLocation(): PublicRoute {
  const path = window.location.pathname || "/";
  if (path === "/checkout/success") {
    const params = new URLSearchParams(window.location.search);
    const sessionId = (params.get("session_id") ?? "").trim();
    return { kind: "checkout_success", sessionId };
  }
  if (path === "/claim") {
    const params = new URLSearchParams(window.location.search);
    const token = (params.get("token") ?? "").trim();
    return { kind: "claim", token };
  }

  const segments = splitPathSegments(path);
  if (segments[0] === "c" && segments.length === 2) {
    const slug = String(segments[1] ?? "").trim();
    if (slug) return { kind: "community_funnel", slug };
  }

  return { kind: "app" };
}

export function readAppRouteFromLocation(): AppRouteState {
  const fromPath = parseAppRouteFromPathname(window.location.pathname || "/");
  if (fromPath) {
    return {
      page: fromPath.page,
      view: fromPath.view,
      settingsPage: fromPath.settingsPage,
      communityId: null,
      communitySlug: fromPath.communitySlug,
      communityTab: fromPath.communityTab,
      threadId: fromPath.threadId,
    };
  }

  return {
    page: "workspace",
    view: "home",
    settingsPage: "agent",
    communityId: null,
    communitySlug: null,
    communityTab: "chat",
    threadId: null,
  };
}

export function buildAppRoutePath(state: AppRoutePathState): string | null {
  if (state.view === "settings") {
    return buildSettingsPath(state.settingsPage);
  }

  if (state.page === "discover") {
    return "/discover";
  }

  if (state.page === "community") {
    return buildCommunityTabPath(state.communitySlug, state.communityTab);
  }

  return state.threadId ? buildWorkspaceThreadPath(state.threadId) : buildWorkspaceDraftPath();
}
