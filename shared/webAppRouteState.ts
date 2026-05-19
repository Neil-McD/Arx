import { isUuid } from "./appIdentity";
import {
  parseCommunityTab,
  parseDiscoverTab,
  type AppPage,
  type AppView,
  type CommunityTab,
  type DiscoverTab,
  type SettingsPage,
} from "./appShellNavigation";
import type { CommunityFunnelConfig } from "./communityTypes";

export type PublicRoute =
  | { kind: "app" }
  | { kind: "community_funnel"; slug: string }
  | { kind: "community_funnel_preview"; slug: string }
  | { kind: "checkout_success"; sessionId: string }
  | { kind: "claim"; token: string };

export type AppShellVariant = "standard" | "mobile";

export type AppRouteState = {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  communitySlug: string | null;
  communityTab: CommunityTab;
  communityResourceModuleId?: string | null;
  discoverTab?: DiscoverTab | null;
  discoverAppId?: string | null;
  discoverSkillId?: string | null;
  docsSlug?: string | null;
  threadId: string | null;
};

export type AppRoutePathState = {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  communitySlug: string | null;
  communityTab: CommunityTab;
  communityResourceModuleId?: string | null;
  discoverTab?: DiscoverTab | null;
  discoverAppId?: string | null;
  discoverSkillId?: string | null;
  docsSlug?: string | null;
  threadId: string | null;
};

export const DEFAULT_POST_SIGN_IN_PATH = "/workspace";
export const MOBILE_SHELL_PATH_PREFIX = "/m";
export const STANDALONE_APP_LAUNCH_SEARCH_PARAM = "launch";
export const STANDALONE_APP_LAUNCH_SEARCH_VALUE = "app";

function joinPathWithQueryAndHash(pathname: string, search: string, hash: string): string {
  return `${pathname || "/"}${search || ""}${hash || ""}` || "/";
}

function isPublicRoutePath(pathname: string): boolean {
  const segments = splitPathSegments(pathname);
  if (pathname === "/checkout/success" || pathname === "/claim") return true;
  if (segments[0] !== "c") return false;
  return segments.length === 2 || (segments.length === 3 && segments[2] === "preview");
}

export function readShellVariantFromPathname(pathname: string): AppShellVariant {
  const segments = splitPathSegments(pathname);
  return segments[0] === "m" ? "mobile" : "standard";
}

export function stripShellVariantFromPathname(pathname: string): string {
  const parsed = new URL(String(pathname || "/"), "http://local.arx");
  const segments = splitPathSegments(parsed.pathname);
  if (segments[0] !== "m") {
    return joinPathWithQueryAndHash(parsed.pathname || "/", parsed.search, parsed.hash);
  }
  const normalizedPathname = segments.length <= 1 ? "/" : `/${segments.slice(1).map(encodeURIComponent).join("/")}`;
  return joinPathWithQueryAndHash(normalizedPathname, parsed.search, parsed.hash);
}

export function isRootAppRoutePath(pathname: string): boolean {
  const parsed = new URL(String(pathname || "/"), "http://local.arx");
  const stripped = stripShellVariantFromPathname(parsed.pathname || "/");
  const strippedParsed = new URL(stripped, "http://local.arx");
  return (strippedParsed.pathname || "/") === "/";
}

export function applyShellVariantToAppPath(path: string, shellVariant: AppShellVariant): string {
  const raw = String(path ?? "").trim();
  if (!raw.startsWith("/")) return raw;
  const parsed = new URL(raw, "http://local.arx");
  const stripped = stripShellVariantFromPathname(joinPathWithQueryAndHash(parsed.pathname, parsed.search, parsed.hash));
  const strippedParsed = new URL(stripped, "http://local.arx");
  const appPathState = parseAppRouteFromPathname(strippedParsed.pathname || "/");
  if (!appPathState) {
    return raw;
  }
  const normalizedBasePath = strippedParsed.pathname || "/";
  const nextPathname =
    shellVariant === "mobile"
      ? normalizedBasePath === "/"
        ? MOBILE_SHELL_PATH_PREFIX
        : `${MOBILE_SHELL_PATH_PREFIX}${normalizedBasePath}`
      : normalizedBasePath;
  return joinPathWithQueryAndHash(nextPathname, strippedParsed.search, strippedParsed.hash);
}

export function applyShellVariantToPublicPath(path: string, shellVariant: AppShellVariant): string {
  const raw = String(path ?? "").trim();
  if (!raw.startsWith("/")) return raw;
  const parsed = new URL(raw, "http://local.arx");
  const stripped = stripShellVariantFromPathname(joinPathWithQueryAndHash(parsed.pathname, parsed.search, parsed.hash));
  const strippedParsed = new URL(stripped, "http://local.arx");
  const normalizedBasePath = strippedParsed.pathname || "/";
  if (!isPublicRoutePath(normalizedBasePath)) {
    return raw;
  }
  const nextPathname =
    shellVariant === "mobile"
      ? normalizedBasePath === "/"
        ? MOBILE_SHELL_PATH_PREFIX
        : `${MOBILE_SHELL_PATH_PREFIX}${normalizedBasePath}`
      : normalizedBasePath;
  return joinPathWithQueryAndHash(nextPathname, strippedParsed.search, strippedParsed.hash);
}

export function applyShellVariantToKnownPath(path: string, shellVariant: AppShellVariant): string {
  const raw = String(path ?? "").trim();
  if (!raw.startsWith("/")) return raw;
  const appPath = applyShellVariantToAppPath(raw, shellVariant);
  if (appPath !== raw) return appPath;
  return applyShellVariantToPublicPath(raw, shellVariant);
}

export function buildWorkspaceDraftPath(): string {
  return "/workspace";
}

export function buildWorkspaceCommunityDraftPath(communitySlug: string | null | undefined): string | null {
  const slug = String(communitySlug ?? "").trim();
  if (!slug) return null;
  return `/workspace/community/${encodeURIComponent(slug)}`;
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
  communityResourceModuleId?: string | null,
): string | null {
  const slug = String(communitySlug ?? "").trim();
  if (!slug) return null;
  const tabSegment =
    communityTab === "ai_agent"
      ? "agent"
      : communityTab === "ai_feed"
        ? "ai-feed"
        : communityTab;
  const moduleId = String(communityResourceModuleId ?? "").trim();
  if (communityTab === "resources" && moduleId) {
    return `/c/${encodeURIComponent(slug)}/${tabSegment}/${encodeURIComponent(moduleId)}`;
  }
  return `/c/${encodeURIComponent(slug)}/${tabSegment}`;
}

export function buildCommunityFunnelPreviewPath(communitySlug: string | null | undefined): string | null {
  const slug = String(communitySlug ?? "").trim();
  if (!slug) return null;
  return `/c/${encodeURIComponent(slug)}/preview`;
}

export function buildCommunityFunnelPath(communitySlug: string | null | undefined): string | null {
  const slug = String(communitySlug ?? "").trim();
  if (!slug) return null;
  return `/c/${encodeURIComponent(slug)}`;
}

export type CommunityFunnelPreviewRouteCommunity = {
  slug?: string | null;
  name: string;
  one_liner: string | null;
  about: string | null;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  visibility: string;
  admin_count?: number | null;
  online_count?: number | null;
  online_faces?: Array<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
  }> | null;
};

export type CommunityFunnelPreviewRouteState = {
  slug: string;
  community: CommunityFunnelPreviewRouteCommunity;
  visibilityLabel: string;
  memberCount: number | null;
  funnelAction: "join" | "request_access" | "checkout";
  one_liner: string | null;
  funnel: CommunityFunnelConfig;
  savedAt: number;
};

type HistoryStateWithPreview = {
  communityFunnelPreview?: CommunityFunnelPreviewRouteState;
};

function normalizePreviewOneLiner(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function normalizePreviewAbout(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function normalizePreviewFunnelAction(raw: unknown): CommunityFunnelPreviewRouteState["funnelAction"] {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "checkout") return "checkout";
  if (value === "join_approval" || value === "request_access") return "request_access";
  return "join";
}

export function buildCommunityFunnelPreviewHistoryState(
  draft: CommunityFunnelPreviewRouteState,
): HistoryStateWithPreview {
  return {
    communityFunnelPreview: {
      slug: String(draft.slug ?? "").trim(),
      community: {
        ...draft.community,
        slug: String(draft.community.slug ?? draft.slug ?? "").trim() || null,
        name: String(draft.community.name ?? "Community").trim() || "Community",
        one_liner: normalizePreviewOneLiner(draft.community.one_liner),
        about: normalizePreviewAbout(draft.community.about),
        visibility: String(draft.community.visibility ?? "unlisted").trim() || "unlisted",
      },
      visibilityLabel: String(draft.visibilityLabel ?? "").trim() || "Unlisted",
      memberCount: typeof draft.memberCount === "number" ? draft.memberCount : null,
      funnelAction: normalizePreviewFunnelAction(draft.funnelAction),
      one_liner: normalizePreviewOneLiner(draft.one_liner),
      funnel: draft.funnel,
      savedAt: Number.isFinite(Number(draft.savedAt)) ? Number(draft.savedAt) : Date.now(),
    },
  };
}

export function readCommunityFunnelPreviewHistoryState(
  communitySlug: string | null | undefined,
): CommunityFunnelPreviewRouteState | null {
  if (typeof window === "undefined") return null;
  const slug = String(communitySlug ?? "").trim();
  if (!slug) return null;
  const state = (window.history.state ?? null) as HistoryStateWithPreview | null;
  const draft = state?.communityFunnelPreview ?? null;
  if (!draft || String(draft.slug ?? "").trim() !== slug) return null;
  return {
    slug,
    community: {
      ...draft.community,
      slug: String(draft.community.slug ?? slug).trim() || slug,
      name: String(draft.community.name ?? "Community").trim() || "Community",
      one_liner: normalizePreviewOneLiner(draft.community.one_liner),
      about: normalizePreviewAbout(draft.community.about),
      visibility: String(draft.community.visibility ?? "unlisted").trim() || "unlisted",
    },
    visibilityLabel: String(draft.visibilityLabel ?? "").trim() || "Unlisted",
    memberCount: typeof draft.memberCount === "number" ? draft.memberCount : null,
    funnelAction: normalizePreviewFunnelAction(draft.funnelAction),
    one_liner: normalizePreviewOneLiner(draft.one_liner),
    funnel: draft.funnel,
    savedAt: Number.isFinite(Number(draft.savedAt)) ? Number(draft.savedAt) : Date.now(),
  };
}

function splitPathSegments(pathname: string): string[] {
  return String(pathname ?? "")
    .split("/")
    .map((segment) => decodeURIComponent(segment).trim())
    .filter(Boolean);
}

function normalizeDocsSlug(value: string | null | undefined): string | null {
  const slug = String(value ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
  return slug || null;
}

function buildDocsPath(docsSlug: string | null | undefined): string {
  const slug = normalizeDocsSlug(docsSlug);
  if (!slug) return "/docs";
  return `/docs/${slug.split("/").map(encodeURIComponent).join("/")}`;
}

function parseSettingsPage(value: string | null | undefined): SettingsPage {
  switch ((value ?? "").trim()) {
    case "profile":
      return "profile";
    case "account":
      return "account";
    case "partner":
    case "partners":
      return "partners";
    case "integrations":
      return "integrations";
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
      page: "landing",
      view: "home",
      settingsPage: "agent",
      communitySlug: null,
      communityTab: "chat",
      threadId: null,
    };
  }

  if (segments[0] === "onboarding" && segments.length === 1) {
    return {
      page: "onboarding",
      view: "home",
      settingsPage: "agent",
      communitySlug: null,
      communityTab: "chat",
      threadId: null,
    };
  }

  if (segments[0] === "discover" && segments.length <= 3) {
    const discoverTab = parseDiscoverTab(segments[1] ?? null);
    return {
      page: "discover",
      view: "home",
      settingsPage: "agent",
      communitySlug: null,
      communityTab: "chat",
      discoverTab,
      discoverAppId: discoverTab === "apps" ? String(segments[2] ?? "").trim() || null : null,
      discoverSkillId: discoverTab === "skills" ? String(segments[2] ?? "").trim() || null : null,
      threadId: null,
    };
  }

  if (segments[0] === "docs") {
    return {
      page: "docs",
      view: "home",
      settingsPage: "agent",
      communitySlug: null,
      communityTab: "chat",
      docsSlug: normalizeDocsSlug(segments.slice(1).join("/")),
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
    if (segments[1] === "community" && segments.length === 3) {
      const slug = String(segments[2] ?? "").trim();
      if (!slug) return null;
      return {
        page: "workspace",
        view: "home",
        settingsPage: "agent",
        communitySlug: slug,
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
    const communityTab = parseCommunityTabSegment(segments[2] ?? null);
    const communityResourceModuleId =
      communityTab === "resources" ? String(segments[3] ?? "").trim() || null : null;
    return {
      page: "community",
      view: "home",
      settingsPage: "agent",
      communitySlug: slug,
      communityTab,
      communityResourceModuleId,
      threadId: null,
    };
  }

  return null;
}

export function readPublicRouteFromLocation(): PublicRoute {
  const path = stripShellVariantFromPathname(window.location.pathname || "/");
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
  if (segments[0] === "c" && segments.length === 3 && segments[2] === "preview") {
    const slug = String(segments[1] ?? "").trim();
    if (slug) return { kind: "community_funnel_preview", slug };
  }
  if (segments[0] === "c" && segments.length === 2) {
    const slug = String(segments[1] ?? "").trim();
    if (slug) return { kind: "community_funnel", slug };
  }

  return { kind: "app" };
}

export function readAppRouteFromLocation(): AppRouteState {
  const fromPath = parseAppRouteFromPathname(stripShellVariantFromPathname(window.location.pathname || "/"));
  if (fromPath) {
    return {
      page: fromPath.page,
      view: fromPath.view,
      settingsPage: fromPath.settingsPage,
      communitySlug: fromPath.communitySlug,
      communityTab: fromPath.communityTab,
      communityResourceModuleId: fromPath.communityResourceModuleId ?? null,
      discoverTab: fromPath.discoverTab ?? "communities",
      discoverAppId: fromPath.discoverAppId ?? null,
      discoverSkillId: fromPath.discoverSkillId ?? null,
      docsSlug: fromPath.docsSlug ?? null,
      threadId: fromPath.threadId,
    };
  }

  return {
    page: "landing",
    view: "home",
    settingsPage: "agent",
    communitySlug: null,
    communityTab: "chat",
    discoverTab: "communities",
    discoverAppId: null,
    discoverSkillId: null,
    docsSlug: null,
    threadId: null,
  };
}

export function buildAppRoutePath(state: AppRoutePathState): string | null {
  if (state.view === "settings") {
    return buildSettingsPath(state.settingsPage);
  }

  if (state.page === "discover") {
    const tab = parseDiscoverTab(state.discoverTab);
    if (tab === "apps") {
      const appId = String(state.discoverAppId ?? "").trim();
      return appId ? `/discover/apps/${encodeURIComponent(appId)}` : "/discover/apps";
    }
    if (tab === "skills") {
      const skillId = String(state.discoverSkillId ?? "").trim();
      return skillId ? `/discover/skills/${encodeURIComponent(skillId)}` : "/discover/skills";
    }
    return "/discover";
  }

  if (state.page === "community") {
    return buildCommunityTabPath(state.communitySlug, state.communityTab, state.communityResourceModuleId);
  }

  if (state.page === "docs") {
    return buildDocsPath(state.docsSlug);
  }

  if (state.page === "landing") {
    return "/";
  }

  if (state.page === "onboarding") {
    return "/onboarding";
  }

  if (state.threadId) {
    return buildWorkspaceThreadPath(state.threadId);
  }

  return buildWorkspaceCommunityDraftPath(state.communitySlug) ?? buildWorkspaceDraftPath();
}
