import {
  parseCommunitySettingsPane,
  parseCommunityTab,
  parseOperatorTab,
  type AppPage,
  type AppView,
  type CommunitySettingsPane,
  type CommunityTab,
  type OperatorTab,
  type SettingsPage,
} from "./appShellNavigation";

export type PublicRoute =
  | { kind: "app" }
  | { kind: "community_funnel"; slug: string }
  | { kind: "community_funnel_preview"; slug: string }
  | { kind: "checkout_success"; sessionId: string }
  | { kind: "claim"; token: string };

export type AppShellVariant = "standard" | "mobile";

export type CommunityExperienceMode = "standard" | "onboarding_preview";

export type AppRouteState = {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  communitySlug: string | null;
  communityTab: CommunityTab;
  communityExperienceMode?: CommunityExperienceMode;
  communityResourceModuleId?: string | null;
  communitySettingsPane?: CommunitySettingsPane | null;
  docsSlug?: string | null;
  operatorTab?: OperatorTab | null;
};

export type AppRoutePathState = {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  communitySlug: string | null;
  communityTab: CommunityTab;
  communityExperienceMode?: CommunityExperienceMode;
  communityResourceModuleId?: string | null;
  communitySettingsPane?: CommunitySettingsPane | null;
  docsSlug?: string | null;
  operatorTab?: OperatorTab | null;
};

export const DEFAULT_POST_SIGN_IN_PATH = "/";
export const MOBILE_SHELL_PATH_PREFIX = "/m";
export const STANDALONE_APP_LAUNCH_SEARCH_PARAM = "launch";
export const STANDALONE_APP_LAUNCH_SEARCH_VALUE = "app";

export type LegacyWorkspaceRouteContext = {
  kind: "root" | "thread" | "community";
  communitySlug: string | null;
};

const RESERVED_WORKSPACE_ROUTE_SEGMENTS = new Set([
  "apps",
  "community",
  "files",
  "project",
  "projects",
  "settings",
  "skills",
  "setup",
  "thread",
]);

export function isReservedWorkspaceRouteSegment(value: string | null | undefined): boolean {
  const segment = String(value ?? "").trim().toLowerCase();
  return Boolean(segment && RESERVED_WORKSPACE_ROUTE_SEGMENTS.has(segment));
}

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

export function buildSettingsPath(settingsPage: SettingsPage): string {
  return `/settings/${encodeURIComponent(settingsPage)}`;
}

export function buildCommunityTabPath(
  communitySlug: string | null | undefined,
  communityTab: CommunityTab,
  communityResourceModuleId?: string | null,
  communitySettingsPane?: CommunitySettingsPane | null,
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
  const settingsPane = parseCommunitySettingsPane(communitySettingsPane);
  if (communityTab === "settings") {
    return `/c/${encodeURIComponent(slug)}/${tabSegment}/${encodeURIComponent(settingsPane)}`;
  }
  return `/c/${encodeURIComponent(slug)}/${tabSegment}`;
}

export function buildCommunityFunnelPreviewPath(communitySlug: string | null | undefined): string | null {
  const slug = String(communitySlug ?? "").trim();
  if (!slug) return null;
  return `/c/${encodeURIComponent(slug)}/preview`;
}

export function buildCommunityOnboardingPreviewPath(
  communitySlug: string | null | undefined,
): string | null {
  const slug = String(communitySlug ?? "").trim();
  if (!slug) return null;
  return `/c/${encodeURIComponent(slug)}/onboarding/preview`;
}

export function buildCommunityFunnelPath(communitySlug: string | null | undefined): string | null {
  const slug = String(communitySlug ?? "").trim();
  if (!slug) return null;
  return `/c/${encodeURIComponent(slug)}`;
}

function splitPathSegments(pathname: string): string[] {
  return String(pathname ?? "")
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment).trim();
      } catch {
        return segment.trim();
      }
    })
    .filter(Boolean);
}

export function readLegacyWorkspaceRouteContext(
  pathname: string | null | undefined,
): LegacyWorkspaceRouteContext | null {
  const parsed = new URL(String(pathname || "/"), "http://local.arx");
  const stripped = stripShellVariantFromPathname(parsed.pathname || "/");
  const segments = splitPathSegments(new URL(stripped, "http://local.arx").pathname);
  if (segments[0] !== "workspace") return null;
  if (segments[1] === "thread") {
    return { kind: "thread", communitySlug: null };
  }
  const communitySlug =
    segments[1] === "community"
      ? String(segments[2] ?? "").trim() || null
      : !isReservedWorkspaceRouteSegment(segments[1])
        ? String(segments[1] ?? "").trim() || null
        : null;
  return {
    kind: communitySlug ? "community" : "root",
    communitySlug,
  };
}

export function isLegacyWorkspaceRoutePath(
  pathname: string | null | undefined,
): boolean {
  return readLegacyWorkspaceRouteContext(pathname) !== null;
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
    case "billing":
      return "billing";
    case "partner":
    case "partners":
      return "partners";
    case "integrations":
    case "skills":
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
    };
  }

  if (segments[0] === "onboarding" && segments.length === 1) {
    return {
      page: "onboarding",
      view: "home",
      settingsPage: "agent",
      communitySlug: null,
      communityTab: "chat",
    };
  }

  if (segments[0] === "discover") {
    return {
      page: "discover",
      view: "home",
      settingsPage: "agent",
      communitySlug: null,
      communityTab: "chat",
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
    };
  }

  if (segments[0] === "operator" && segments.length <= 2) {
    return {
      page: "operator",
      view: "home",
      settingsPage: "agent",
      communitySlug: null,
      communityTab: "chat",
      operatorTab: parseOperatorTab(segments[1] ?? null),
    };
  }

  if (segments[0] === "workspace") {
    if (segments[1] === "community" && segments.length === 5 && segments[3] === "setup") {
      const slug = String(segments[2] ?? "").trim();
      if (!slug) return null;
      return {
        page: "community",
        view: "home",
        settingsPage: "agent",
        communitySlug: slug,
        communityTab: "settings",
        communitySettingsPane: "community",
      };
    }
    if (
      segments.length === 4 &&
      segments[2] === "setup" &&
      !isReservedWorkspaceRouteSegment(segments[1])
    ) {
      const slug = String(segments[1] ?? "").trim();
      if (!slug) return null;
      return {
        page: "community",
        view: "home",
        settingsPage: "agent",
        communitySlug: slug,
        communityTab: "settings",
        communitySettingsPane: "community",
      };
    }
    return {
      page: "landing",
      view: "home",
      settingsPage: "agent",
      communitySlug: null,
      communityTab: "chat",
    };
  }

  if (segments[0] === "settings") {
    return {
      page: "settings",
      view: "home",
      settingsPage: parseSettingsPage(segments[1] ?? null),
      communitySlug: null,
      communityTab: "chat",
    };
  }

  if (
    segments[0] === "c" &&
    segments.length === 4 &&
    segments[2] === "onboarding" &&
    segments[3] === "preview"
  ) {
    const slug = String(segments[1] ?? "").trim() || null;
    if (!slug) return null;
    return {
      page: "community",
      view: "home",
      settingsPage: "agent",
      communitySlug: slug,
      communityTab: "chat",
      communityExperienceMode: "onboarding_preview",
    };
  }

  if (segments[0] === "c" && segments.length >= 3) {
    const slug = String(segments[1] ?? "").trim() || null;
    if (!slug) return null;
    const communityTab = parseCommunityTabSegment(segments[2] ?? null);
    const communityResourceModuleId =
      communityTab === "resources" ? String(segments[3] ?? "").trim() || null : null;
    const communitySettingsPane =
      communityTab === "settings" ? parseCommunitySettingsPane(segments[3] ?? null) : null;
    return {
      page: "community",
      view: "home",
      settingsPage: "agent",
      communitySlug: slug,
      communityTab,
      communityExperienceMode: "standard",
      communityResourceModuleId,
      communitySettingsPane,
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
      ...(fromPath.communityExperienceMode === "onboarding_preview"
        ? { communityExperienceMode: "onboarding_preview" as const }
        : {}),
      communityResourceModuleId: fromPath.communityResourceModuleId ?? null,
      communitySettingsPane: fromPath.communitySettingsPane ?? null,
      docsSlug: fromPath.docsSlug ?? null,
      ...(fromPath.operatorTab ? { operatorTab: fromPath.operatorTab } : {}),
    };
  }

  return {
    page: "landing",
    view: "home",
    settingsPage: "agent",
    communitySlug: null,
    communityTab: "chat",
    docsSlug: null,
  };
}

export function buildAppRoutePath(state: AppRoutePathState): string | null {
  if (state.page === "settings") {
    return buildSettingsPath(state.settingsPage);
  }

  if (state.page === "discover") {
    return "/discover";
  }

  if (state.page === "community") {
    if (state.communityExperienceMode === "onboarding_preview") {
      return buildCommunityOnboardingPreviewPath(state.communitySlug);
    }
    return buildCommunityTabPath(
      state.communitySlug,
      state.communityTab,
      state.communityResourceModuleId,
      state.communitySettingsPane,
    );
  }

  if (state.page === "docs") {
    return buildDocsPath(state.docsSlug);
  }

  if (state.page === "operator") {
    return `/operator/${state.operatorTab ?? "platform"}`;
  }

  if (state.page === "landing") {
    return "/";
  }

  if (state.page === "onboarding") {
    return "/onboarding";
  }

  const exhaustivePage: never = state.page;
  return exhaustivePage;
}
