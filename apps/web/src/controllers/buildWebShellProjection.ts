import type { AppPage, AppView } from "../../../../shared/appShellNavigation";
import type { AppShellVariant, PublicRoute } from "../../../../shared/webAppRouteState";

type MobileSettingsView = "index" | "detail";
type MobileShellMode = "agent" | "discover" | "community";

export type WebShellProjection = {
  isWorkspaceSettings: boolean;
  showMobileAppShell: boolean;
  showMobileSettingsShell: boolean;
  showMobileShell: boolean;
  showMobileSettingsIndex: boolean;
  showMobilePublicFunnel: boolean;
  sessionsDrawerEnabled: boolean;
  isSessionsDrawerOpen: boolean;
  showDesktopCommunityRail: boolean;
  showDesktopCommunityNav: boolean;
  hasLeftPanel: boolean;
  mobileShellMode: MobileShellMode;
  showHeaderIslands: boolean;
};

export function buildWebShellProjection(params: {
  publicRouteKind: PublicRoute["kind"];
  shellVariant: AppShellVariant;
  activePage: AppPage;
  activeView: AppView;
  mobileSettingsView: MobileSettingsView;
  userWantsSessions: boolean;
  isPublicCommunityFunnel: boolean;
}): WebShellProjection {
  const isAppRoute = params.publicRouteKind === "app";
  const isWorkspaceSettings =
    isAppRoute && params.activePage === "workspace" && params.activeView === "settings";
  const isLandingPage = isAppRoute && params.activePage === "landing";
  const isOnboardingPage = isAppRoute && params.activePage === "onboarding";
  const isPublicAppPage = isLandingPage || isOnboardingPage;
  /* The visitor lens on mobile: /c/:slug gets the SAME mobile community
     shell a member gets — one column, the middle panel is the page. */
  const isVisitorCommunityRoute =
    params.publicRouteKind === "community_funnel" ||
    params.publicRouteKind === "community_funnel_preview";
  const isMobileVisitorCommunity =
    params.shellVariant === "mobile" && isVisitorCommunityRoute;
  const showMobileAppShell =
    (params.shellVariant === "mobile" &&
      isAppRoute &&
      !isPublicAppPage &&
      !params.isPublicCommunityFunnel &&
      (params.activePage === "workspace" ||
        params.activePage === "community" ||
        params.activePage === "discover" ||
        params.activePage === "docs")) ||
    isMobileVisitorCommunity;
  const showMobileSettingsShell = showMobileAppShell && isWorkspaceSettings && !isMobileVisitorCommunity;
  const showMobileShell = showMobileAppShell && !showMobileSettingsShell;
  const showMobileSettingsIndex =
    showMobileSettingsShell && params.mobileSettingsView === "index";
  const showMobilePublicFunnel =
    params.shellVariant === "mobile" &&
    !isAppRoute &&
    params.isPublicCommunityFunnel &&
    !isMobileVisitorCommunity;
  const sessionsDrawerEnabled =
    isAppRoute &&
    params.activePage === "workspace" &&
    !isWorkspaceSettings;
  const isSessionsDrawerOpen = sessionsDrawerEnabled && params.userWantsSessions;
  /* The visitor lens: /c/:slug and its /preview render the SAME community
     layout a member sees — shell nav column included. One render path. */
  const showDesktopPublicFunnelNav =
    isVisitorCommunityRoute && params.shellVariant !== "mobile";
  const showDesktopCommunityNav =
    (isAppRoute &&
      params.activePage === "community" &&
      !showMobileAppShell &&
      !showMobilePublicFunnel) ||
    showDesktopPublicFunnelNav;
  const showDesktopCommunityRail =
    (isAppRoute && !showMobileAppShell && !showMobilePublicFunnel) ||
    showDesktopPublicFunnelNav;
  const shouldShowDesktopCommunityRail =
    showDesktopCommunityRail && !isPublicAppPage;
  const hasLeftPanel =
    (isWorkspaceSettings && !showMobileSettingsShell) || showDesktopCommunityNav;
  const mobileShellMode: MobileShellMode = isMobileVisitorCommunity
    ? "community"
    : params.activePage === "workspace"
      ? "agent"
      : params.activePage === "discover"
        ? "discover"
        : params.activePage === "docs"
          ? "discover"
          : "community";
  const showHeaderIslands =
    isAppRoute &&
    params.activePage === "workspace" &&
    params.activeView === "home";

  return {
    isWorkspaceSettings,
    showMobileAppShell,
    showMobileSettingsShell,
    showMobileShell,
    showMobileSettingsIndex,
    showMobilePublicFunnel,
    sessionsDrawerEnabled,
    isSessionsDrawerOpen,
    showDesktopCommunityRail: shouldShowDesktopCommunityRail,
    showDesktopCommunityNav,
    hasLeftPanel,
    mobileShellMode,
    showHeaderIslands,
  };
}
