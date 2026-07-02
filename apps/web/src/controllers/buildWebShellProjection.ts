import type { AppPage, AppView } from "../../../../shared/appShellNavigation";
import type { AppShellVariant, PublicRoute } from "../../../../shared/webAppRouteState";

type MobileSettingsView = "index" | "detail";
type MobileSecondaryMode = "discover" | "community";
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
  mobileSecondaryMode: MobileSecondaryMode;
  showHeaderIslands: boolean;
};

export function buildWebShellProjection(params: {
  publicRouteKind: PublicRoute["kind"];
  shellVariant: AppShellVariant;
  activePage: AppPage;
  activeView: AppView;
  mobileSettingsView: MobileSettingsView;
  userWantsSessions: boolean;
  hasSelectedCommunity: boolean;
  isPublicCommunityFunnel: boolean;
}): WebShellProjection {
  const isAppRoute = params.publicRouteKind === "app";
  const isWorkspaceSettings =
    isAppRoute && params.activePage === "workspace" && params.activeView === "settings";
  const isLandingPage = isAppRoute && params.activePage === "landing";
  const isOnboardingPage = isAppRoute && params.activePage === "onboarding";
  const isPublicAppPage = isLandingPage || isOnboardingPage;
  const showMobileAppShell =
    params.shellVariant === "mobile" &&
    isAppRoute &&
    !isPublicAppPage &&
    !params.isPublicCommunityFunnel &&
    (params.activePage === "workspace" ||
      params.activePage === "community" ||
      params.activePage === "discover" ||
      params.activePage === "docs");
  const showMobileSettingsShell = showMobileAppShell && isWorkspaceSettings;
  const showMobileShell = showMobileAppShell && !isWorkspaceSettings;
  const showMobileSettingsIndex =
    showMobileSettingsShell && params.mobileSettingsView === "index";
  const showMobilePublicFunnel =
    params.shellVariant === "mobile" && !isAppRoute && params.isPublicCommunityFunnel;
  const sessionsDrawerEnabled =
    isAppRoute &&
    params.activePage === "workspace" &&
    !isWorkspaceSettings;
  const isSessionsDrawerOpen = sessionsDrawerEnabled && params.userWantsSessions;
  /* The visitor lens: /c/:slug renders the SAME community layout a member
     sees — shell nav column included. Editor preview keeps its own frame. */
  const showDesktopPublicFunnelNav =
    params.publicRouteKind === "community_funnel" && params.shellVariant !== "mobile";
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
  const mobileShellMode: MobileShellMode =
    params.activePage === "workspace"
      ? "agent"
      : params.activePage === "discover"
        ? "discover"
        : params.activePage === "docs"
          ? "discover"
          : "community";
  const mobileSecondaryMode: MobileSecondaryMode = params.hasSelectedCommunity
    ? "community"
    : "discover";
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
    mobileSecondaryMode,
    showHeaderIslands,
  };
}
