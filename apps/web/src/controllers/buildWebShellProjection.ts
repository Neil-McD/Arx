import type { AppPage, AppView } from "../../../../shared/appShellNavigation";
import type { AppShellVariant, PublicRoute } from "../../../../shared/webAppRouteState";

type MobileSettingsView = "index" | "detail";
type MobileShellMode = "agent" | "discover" | "community" | "settings";

export type WebShellProjection = {
  isGlobalSettings: boolean;
  showMobileAppShell: boolean;
  showMobileSettingsShell: boolean;
  showMobileShell: boolean;
  showMobileGlobalShell: boolean;
  showMobileSettingsIndex: boolean;
  showMobilePublicFunnel: boolean;
  showDesktopCommunityRail: boolean;
  showDesktopCommunityNav: boolean;
  hasLeftPanel: boolean;
  mobileShellMode: MobileShellMode;
};

export function buildWebShellProjection(params: {
  publicRouteKind: PublicRoute["kind"];
  shellVariant: AppShellVariant;
  activePage: AppPage;
  activeView: AppView;
  mobileRootPage: "agent" | "community" | "messages";
  mobileSettingsView: MobileSettingsView;
  isPublicCommunityFunnel: boolean;
}): WebShellProjection {
  const isAppRoute = params.publicRouteKind === "app";
  const isGlobalSettings = isAppRoute && params.activePage === "settings";
  const isLandingPage = isAppRoute && params.activePage === "landing";
  const isOnboardingPage = isAppRoute && params.activePage === "onboarding";
  const isOperatorPage = isAppRoute && params.activePage === "operator";
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
      (params.activePage === "settings" ||
        params.activePage === "community" ||
        params.activePage === "discover" ||
        params.activePage === "operator" ||
        params.activePage === "docs")) ||
    isMobileVisitorCommunity;
  const showMobileSettingsShell =
    showMobileAppShell && isGlobalSettings && !isMobileVisitorCommunity;
  const showMobileShell = showMobileAppShell;
  const showMobileGlobalShell =
    showMobileAppShell &&
    !isMobileVisitorCommunity &&
    (params.mobileRootPage !== "community" ||
      params.activePage !== "community" ||
      params.activeView === "community_home");
  const showMobileSettingsIndex =
    showMobileSettingsShell && params.mobileSettingsView === "index";
  const showMobilePublicFunnel =
    params.shellVariant === "mobile" &&
    !isAppRoute &&
    params.isPublicCommunityFunnel &&
    !isMobileVisitorCommunity;
  /* The visitor lens keeps the community-local navigation, but never exposes
     the authenticated global community rail. One funnel render path, one
     public acquisition context. */
  const showDesktopPublicFunnelNav =
    isVisitorCommunityRoute && params.shellVariant !== "mobile";
  const showDesktopCommunityNav =
    (isAppRoute &&
      params.activePage === "community" &&
      !showMobileAppShell &&
      !showMobilePublicFunnel) ||
    showDesktopPublicFunnelNav;
  const showDesktopCommunityRail =
    isAppRoute &&
    !isOperatorPage &&
    !showMobileAppShell &&
    !showMobilePublicFunnel;
  const shouldShowDesktopCommunityRail =
    showDesktopCommunityRail && !isPublicAppPage;
  const hasLeftPanel =
    (isGlobalSettings && !showMobileSettingsShell) || showDesktopCommunityNav;
  const mobileShellMode: MobileShellMode = isMobileVisitorCommunity
    ? "community"
    : params.activePage === "settings"
      ? "settings"
      : params.activePage === "discover" ||
        params.activePage === "operator" ||
        params.activePage === "docs"
      ? "discover"
      : "community";
  return {
    isGlobalSettings,
    showMobileAppShell,
    showMobileSettingsShell,
    showMobileShell,
    showMobileGlobalShell,
    showMobileSettingsIndex,
    showMobilePublicFunnel,
    showDesktopCommunityRail: shouldShowDesktopCommunityRail,
    showDesktopCommunityNav,
    hasLeftPanel,
    mobileShellMode,
  };
}
