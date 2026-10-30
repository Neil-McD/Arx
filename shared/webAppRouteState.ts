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
  | { kind: "checkout_success"; sessionId: string }
  | { kind: "claim"; token: string };

export type AppShellVariant = "standard" | "mobile";

export type AppRouteState = {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  settingsIndex?: boolean;
  communitySlug: string | null;
  communityTab: CommunityTab;
  communityChannelSlug?: string | null;
  communityResourceModuleId?: string | null;
  communitySettingsPane?: CommunitySettingsPane | null;
  docsSlug?: string | null;
  operatorTab?: OperatorTab | null;
};

export type AppRoutePathState = {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  settingsIndex?: boolean;
  communitySlug: string | null;
  communityTab: CommunityTab;
  communityChannelSlug?: string | null;
  communityResourceModuleId?: string | null;
  communitySettingsPane?: CommunitySettingsPane | null;
  docsSlug?: string | null;
  operatorTab?: OperatorTab | null;
};

/**
 * The canonical semantic destination derived from a route.
 *
 * AppRoutePathState remains the compatibility adapter for the existing shell
 * state while consumers migrate. New shell decisions should use this union so
 * impossible combinations such as contradictory community destinations
 * are not re-interpreted independently in each component.
 */
export type WebDestination =
  | { kind: "platform_entry" }
  | { kind: "onboarding" }
  | { kind: "discover" }
  | { kind: "docs"; slug: string | null }
  | { kind: "operator"; tab: OperatorTab }
  | { kind: "global_settings"; page: SettingsPage; index: boolean }
  | { kind: "community_funnel"; slug: string }
  | { kind: "community_home"; slug: string }
  | { kind: "community_chat"; slug: string; channelSlug: string | null }
  | { kind: "community_resources"; slug: string; moduleId: string | null }
  | { kind: "community_events"; slug: string }
  | { kind: "community_members"; slug: string }
  | { kind: "community_about"; slug: string }
  | { kind: "community_agent"; slug: string }
  | { kind: "community_settings"; slug: string; pane: CommunitySettingsPane }
  | { kind: "community_workflows"; slug: string }
  | { kind: "community_people"; slug: string }
  | { kind: "community_analytics"; slug: string }
  | { kind: "checkout_success"; sessionId: string }
  | { kind: "claim"; token: string };

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

export function resolveInitialAppShellVariant(params: {
  pathname: string | null | undefined;
  search?: string | null;
  oauthShellVariant?: AppShellVariant | null;
  standalone?: boolean;
}): AppShellVariant {
  if (params.oauthShellVariant) return params.oauthShellVariant;
  const isStandaloneLaunch =
    params.standalone === true
    && new URLSearchParams(String(params.search ?? "")).get(
      STANDALONE_APP_LAUNCH_SEARCH_PARAM,
    ) === STANDALONE_APP_LAUNCH_SEARCH_VALUE;
  return isStandaloneLaunch
    ? "mobile"
    : readShellVariantFromPathname(String(params.pathname || "/"));
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

// A phone that opens a plain community or settings link gets the phone
// layout (/m/...) instead of the desktop one squeezed to 390px. Embedded
// previews (Customize, Sales page) pick their own layout and are left alone.
export function resolvePhoneShellRedirect(params: {
  path: string;
  narrowViewport: boolean;
  embedded: boolean;
}): string | null {
  if (!params.narrowViewport || params.embedded) return null;
  const raw = String(params.path ?? "").trim();
  if (!raw.startsWith("/")) return null;
  const parsed = new URL(raw, "http://local.arx");
  if (readShellVariantFromPathname(parsed.pathname) === "mobile") return null;
  if (parsed.searchParams.get("embed") === "1") return null;
  const segments = splitPathSegments(parsed.pathname);
  if (segments[0] !== "c" && segments[0] !== "settings") return null;
  const next = applyShellVariantToKnownPath(raw, "mobile");
  return next !== raw ? next : null;
}

export function buildSettingsPath(settingsPage: SettingsPage): string {
  return `/settings/${encodeURIComponent(settingsPage)}`;
}

export function buildSettingsIndexPath(): string {
  return "/settings";
}

export function buildCommunityTabPath(
  communitySlug: string | null | undefined,
  communityTab: CommunityTab,
  communityResourceModuleId?: string | null,
  communitySettingsPane?: CommunitySettingsPane | null,
  communityChannelSlug?: string | null,
): string | null {
  const slug = String(communitySlug ?? "").trim();
  if (!slug) return null;
  const tabSegment = communityTab;
  const moduleId = String(communityResourceModuleId ?? "").trim();
  const channelSlug = String(communityChannelSlug ?? "").trim().toLowerCase();
  if (communityTab === "chat" && channelSlug && channelSlug !== "general") {
    return `/c/${encodeURIComponent(slug)}/${tabSegment}/${encodeURIComponent(channelSlug)}`;
  }
  if (communityTab === "resources" && moduleId) {
    return `/c/${encodeURIComponent(slug)}/${tabSegment}/${encodeURIComponent(moduleId)}`;
  }
  const settingsPane = parseCommunitySettingsPane(communitySettingsPane);
  if (communityTab === "settings") {
    return `/c/${encodeURIComponent(slug)}/${tabSegment}/${encodeURIComponent(settingsPane)}`;
  }
  return `/c/${encodeURIComponent(slug)}/${tabSegment}`;
}

export function buildCommunityHomePath(
  communitySlug: string | null | undefined,
): string | null {
  const slug = String(communitySlug ?? "").trim();
  if (!slug) return null;
  return `/c/${encodeURIComponent(slug)}/home`;
}


// The public page in a preview frame. The app rewrites it to /c/<slug>, but the
// page reads its preview parameters before that.
export function buildCommunityFunnelPreviewPath(communitySlug: string | null | undefined): string | null {
  const slug = String(communitySlug ?? "").trim();
  return slug ? `/c/${encodeURIComponent(slug)}/preview` : null;
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
      return "billing";
    case "memberships":
    case "communities":
      return "memberships";
    case "apps":
    case "agent":
    case "integrations":
    case "skills":
      return "apps";
    case "display":
    case "appearance":
      return "appearance";
    default:
      return "profile";
  }
}

function parseCommunityTabSegment(value: string | null | undefined): CommunityTab {
  switch ((value ?? "").trim()) {
    case "ai-feed":
      return "chat";
    default:
      return parseCommunityTab(value);
  }
}

export function parseAppRouteFromPathname(pathname: string): AppRoutePathState | null {
  const segments = splitPathSegments(pathname);
  if (segments.length === 0) {
    return {
      page: "landing",
      view: "home",
      settingsPage: "profile",
      communitySlug: null,
      communityTab: "chat",
    };
  }

  if (segments[0] === "onboarding" && segments.length === 1) {
    return {
      page: "onboarding",
      view: "home",
      settingsPage: "profile",
      communitySlug: null,
      communityTab: "chat",
    };
  }

  if (segments[0] === "discover") {
    return {
      page: "discover",
      view: "home",
      settingsPage: "profile",
      communitySlug: null,
      communityTab: "chat",
    };
  }

  if (segments[0] === "docs") {
    return {
      page: "docs",
      view: "home",
      settingsPage: "profile",
      communitySlug: null,
      communityTab: "chat",
      docsSlug: normalizeDocsSlug(segments.slice(1).join("/")),
    };
  }

  if (segments[0] === "operator" && segments.length <= 2) {
    return {
      page: "operator",
      view: "home",
      settingsPage: "profile",
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
        settingsPage: "profile",
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
        settingsPage: "profile",
        communitySlug: slug,
        communityTab: "settings",
        communitySettingsPane: "community",
      };
    }
    return {
      page: "landing",
      view: "home",
      settingsPage: "profile",
      communitySlug: null,
      communityTab: "chat",
    };
  }

  if (segments[0] === "settings") {
    return {
      page: "settings",
      view: "home",
      settingsPage: parseSettingsPage(segments[1] ?? null),
      ...(segments.length === 1 ? { settingsIndex: true } : {}),
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
      settingsPage: "profile",
      communitySlug: slug,
      communityTab: "chat",
      communityChannelSlug: null,
    };
  }

  if (segments[0] === "c" && segments.length === 3 && segments[2] === "home") {
    const slug = String(segments[1] ?? "").trim() || null;
    if (!slug) return null;
    return {
      page: "community",
      view: "community_home",
      settingsPage: "profile",
      communitySlug: slug,
      communityTab: "chat",
      communityChannelSlug: null,
      communityResourceModuleId: null,
      communitySettingsPane: null,
    };
  }

  if (segments[0] === "c" && segments.length >= 3) {
    const slug = String(segments[1] ?? "").trim() || null;
    if (!slug) return null;
    const tabSegment = String(segments[2] ?? "").trim();
    const legacyAgentSettingsPane =
      tabSegment === "ai_agent"
        ? "agent"
        : null;
    const isLegacyFunnelSettingsRoute =
      tabSegment === "settings" && String(segments[3] ?? "").trim() === "funnel";
    const communityTab =
      tabSegment === "funnel" || isLegacyFunnelSettingsRoute
        ? "settings"
        : legacyAgentSettingsPane
          ? "settings"
          : parseCommunityTabSegment(tabSegment);
    const communityResourceModuleId =
      communityTab === "resources" ? String(segments[3] ?? "").trim() || null : null;
    const communityChannelSlug =
      communityTab === "chat" ? String(segments[3] ?? "").trim().toLowerCase() || null : null;
    const communitySettingsPane =
      communityTab === "settings"
        ? parseCommunitySettingsPane(legacyAgentSettingsPane ?? segments[3] ?? null)
        : null;
    return {
      page: "community",
      view: "home",
      settingsPage: "profile",
      communitySlug: slug,
      communityTab,
      communityChannelSlug,
      communityResourceModuleId,
      communitySettingsPane,
    };
  }

  return null;
}

export function deriveWebDestinationFromAppRoute(
  route: AppRoutePathState,
): WebDestination {
  switch (route.page) {
    case "landing":
      return { kind: "platform_entry" };
    case "onboarding":
      return { kind: "onboarding" };
    case "discover":
      return { kind: "discover" };
    case "docs":
      return { kind: "docs", slug: route.docsSlug ?? null };
    case "operator":
      return { kind: "operator", tab: route.operatorTab ?? "platform" };
    case "settings":
      return {
        kind: "global_settings",
        page: route.settingsPage,
        index: route.settingsIndex === true,
      };
    case "community": {
      const slug = String(route.communitySlug ?? "").trim();
      if (!slug) return { kind: "platform_entry" };
      if (route.view === "community_home") {
        return { kind: "community_home", slug };
      }
      switch (route.communityTab) {
        case "chat":
          return {
            kind: "community_chat",
            slug,
            channelSlug: route.communityChannelSlug ?? null,
          };
        case "resources":
          return {
            kind: "community_resources",
            slug,
            moduleId: route.communityResourceModuleId ?? null,
          };
        case "events":
          return { kind: "community_events", slug };
        case "members":
          return { kind: "community_members", slug };
        case "about":
          return { kind: "community_about", slug };
        case "agent":
          return { kind: "community_agent", slug };
        case "settings":
          return {
            kind: "community_settings",
            slug,
            pane: parseCommunitySettingsPane(route.communitySettingsPane),
          };
        case "workflows":
          return { kind: "community_workflows", slug };
        case "people":
          return { kind: "community_people", slug };
        case "analytics":
          return { kind: "community_analytics", slug };
      }
    }
  }
}

function derivePublicWebDestination(
  route: Exclude<PublicRoute, { kind: "app" }>,
): WebDestination {
  switch (route.kind) {
    case "community_funnel":
      return { kind: "community_funnel", slug: route.slug };
    case "checkout_success":
      return { kind: "checkout_success", sessionId: route.sessionId };
    case "claim":
      return { kind: "claim", token: route.token };
  }
}

export function deriveWebDestination(params: {
  publicRoute: PublicRoute;
  appRoute: AppRoutePathState;
}): WebDestination {
  return params.publicRoute.kind === "app"
    ? deriveWebDestinationFromAppRoute(params.appRoute)
    : derivePublicWebDestination(params.publicRoute);
}

export function deriveWebDestinationFromPath(
  pathWithSearch: string,
): WebDestination | null {
  const publicRoute = parsePublicRouteFromPath(pathWithSearch);
  if (publicRoute.kind !== "app") return derivePublicWebDestination(publicRoute);
  const parsed = new URL(String(pathWithSearch || "/"), "http://local.arx");
  const stripped = stripShellVariantFromPathname(parsed.pathname || "/");
  const pathname = new URL(stripped, "http://local.arx").pathname || "/";
  const route = parseAppRouteFromPathname(pathname);
  return route ? deriveWebDestinationFromAppRoute(route) : null;
}

export function isWebCommunityDetailDestination(
  destination: WebDestination,
): boolean {
  switch (destination.kind) {
    case "community_chat":
    case "community_resources":
    case "community_events":
    case "community_members":
    case "community_about":
    case "community_agent":
    case "community_settings":
    case "community_workflows":
    case "community_people":
    case "community_analytics":
      return true;
    default:
      return false;
  }
}

export function isWebCommunityAppDestination(
  destination: WebDestination,
): boolean {
  return (
    destination.kind === "community_home" ||
    isWebCommunityDetailDestination(destination)
  );
}

export function webDestinationHasCommunityNavSelection(
  destination: WebDestination,
): boolean {
  switch (destination.kind) {
    case "community_funnel":
    case "community_chat":
    case "community_resources":
    case "community_events":
    case "community_members":
    case "community_about":
    case "community_agent":
    case "community_settings":
    case "community_workflows":
    case "community_people":
    case "community_analytics":
      return true;
    default:
      return false;
  }
}

export function parsePublicRouteFromPath(pathWithSearch: string): PublicRoute {
  const parsed = new URL(String(pathWithSearch || "/"), "http://local.arx");
  const stripped = stripShellVariantFromPathname(
    joinPathWithQueryAndHash(parsed.pathname || "/", parsed.search, parsed.hash),
  );
  const normalized = new URL(stripped, "http://local.arx");
  const path = normalized.pathname || "/";
  if (path === "/checkout/success") {
    return {
      kind: "checkout_success",
      sessionId: normalized.searchParams.get("session_id")?.trim() ?? "",
    };
  }
  if (path === "/claim") {
    return {
      kind: "claim",
      token: normalized.searchParams.get("token")?.trim() ?? "",
    };
  }
  const segments = splitPathSegments(path);
  if (segments[0] === "c" && segments.length === 3 && segments[2] === "preview") {
    const slug = String(segments[1] ?? "").trim();
    if (slug) {
      // Retired draft preview URLs resolve to the canonical public entry.
      return { kind: "community_funnel", slug };
    }
  }
  if (segments[0] === "c" && segments.length === 2) {
    const slug = String(segments[1] ?? "").trim();
    if (slug) return { kind: "community_funnel", slug };
  }

  return { kind: "app" };
}

export function readPublicRouteFromLocation(): PublicRoute {
  return parsePublicRouteFromPath(
    joinPathWithQueryAndHash(
      window.location.pathname || "/",
      window.location.search,
      window.location.hash,
    ),
  );
}

export function readAppRouteFromLocation(): AppRouteState {
  const fromPath = parseAppRouteFromPathname(stripShellVariantFromPathname(window.location.pathname || "/"));
  if (fromPath) {
    return {
      page: fromPath.page,
      view: fromPath.view,
      settingsPage: fromPath.settingsPage,
      ...(fromPath.settingsIndex ? { settingsIndex: true } : {}),
      communitySlug: fromPath.communitySlug,
      communityTab: fromPath.communityTab,
      communityChannelSlug: fromPath.communityChannelSlug ?? null,
      communityResourceModuleId: fromPath.communityResourceModuleId ?? null,
      communitySettingsPane: fromPath.communitySettingsPane ?? null,
      docsSlug: fromPath.docsSlug ?? null,
      ...(fromPath.operatorTab ? { operatorTab: fromPath.operatorTab } : {}),
    };
  }

  return {
    page: "landing",
    view: "home",
    settingsPage: "profile",
    communitySlug: null,
    communityTab: "chat",
    docsSlug: null,
  };
}

export function buildAppRoutePath(state: AppRoutePathState): string | null {
  if (state.page === "settings") {
    return state.settingsIndex
      ? buildSettingsIndexPath()
      : buildSettingsPath(state.settingsPage);
  }

  if (state.page === "discover") {
    return "/discover";
  }

  if (state.page === "community") {
    if (state.view === "community_home") {
      return buildCommunityHomePath(state.communitySlug);
    }
    return buildCommunityTabPath(
      state.communitySlug,
      state.communityTab,
      state.communityResourceModuleId,
      state.communitySettingsPane,
      state.communityChannelSlug,
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
