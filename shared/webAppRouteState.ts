import { isUuid } from "./appIdentity";
import { parseCommunityTab, type AppPage, type AppView, type CommunityTab, type SettingsPage } from "./appShellNavigation";

export type PublicRoute =
  | { kind: "app" }
  | { kind: "community_landing"; slug: string }
  | { kind: "checkout_success"; sessionId: string }
  | { kind: "claim"; token: string };

export type AppRouteState = {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  communityId: string | null;
  communityTab: CommunityTab;
  threadId: string | null;
  threadIsExplicit: boolean;
};

export type AppRouteHashState = {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  communityId: string | null;
  communityTab: CommunityTab;
  threadToken?: string | null;
};

export const DEFAULT_POST_SIGN_IN_PATH = "/#page=workspace&view=home";

export function readPublicRouteFromLocation(): PublicRoute {
  const path = window.location.pathname || "/";
  if (path.startsWith("/c/")) {
    const slug = decodeURIComponent(path.slice(3).split("/")[0] ?? "").trim();
    if (slug) return { kind: "community_landing", slug };
  }
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
  return { kind: "app" };
}

export function readAppRouteFromLocation(): AppRouteState {
  const rawHash = window.location.hash ? window.location.hash.slice(1) : "";
  const normalized = rawHash.replace(/^\/+/, "").replace(/^\?/, "");
  const params = new URLSearchParams(normalized);

  const rawPage = (params.get("page") ?? "").trim();
  const page: AppPage = rawPage === "community" ? "community" : rawPage === "discover" ? "discover" : "workspace";

  const rawView = (params.get("view") ?? "").trim();
  const view: AppView = rawView === "settings" ? "settings" : "home";

  const rawSettings = (params.get("settings") ?? "").trim();
  const settingsPage: SettingsPage =
    rawSettings === "account"
      ? "account"
      : rawSettings === "execution"
        ? "execution"
        : rawSettings === "memory"
          ? "memory"
          : rawSettings === "appearance"
            ? "appearance"
            : "models";

  const rawCommunity = (params.get("community") ?? "").trim();
  const communityId = rawCommunity && isUuid(rawCommunity) ? rawCommunity : null;

  const rawCommunityTab = (params.get("ctab") ?? "").trim();
  const communityTab: CommunityTab = parseCommunityTab(rawCommunityTab);

  const rawThread = (params.get("thread") ?? "").trim();
  const threadIsExplicit = params.has("thread");
  const threadId = rawThread === "new" || !rawThread ? null : isUuid(rawThread) ? rawThread : null;

  return { page, view, settingsPage, communityId, communityTab, threadId, threadIsExplicit };
}

export function buildAppRouteHash(state: AppRouteHashState): string {
  const params = new URLSearchParams();
  params.set("page", state.page);
  params.set("view", state.view);
  if (state.view === "settings") {
    params.set("settings", state.settingsPage);
  }
  if (state.communityId) {
    params.set("community", state.communityId);
    params.set("ctab", state.communityTab);
  }
  if (typeof state.threadToken === "string" && state.threadToken.trim()) {
    params.set("thread", state.threadToken);
  }
  return `#${params.toString()}`;
}
