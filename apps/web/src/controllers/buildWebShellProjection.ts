import {
  isWebCommunityAppDestination,
  type AppShellVariant,
  type PublicRoute,
  type WebDestination,
} from "../../../../shared/webAppRouteState";

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
  destination: WebDestination;
  mobileRootPage: "agent" | "community" | "messages";
  mobileSettingsView: MobileSettingsView;
  isPublicCommunityFunnel: boolean;
}): WebShellProjection {
  const isAppRoute = params.publicRouteKind === "app";
  const isGlobalSettings =
    isAppRoute && params.destination.kind === "global_settings";
  const isCommunitySettings =
    isAppRoute && params.destination.kind === "community_settings";
  const isLandingPage =
    isAppRoute && params.destination.kind === "platform_entry";
  const isOnboardingPage =
    isAppRoute && params.destination.kind === "onboarding";
  const isOperatorPage = isAppRoute && params.destination.kind === "operator";
  const isPublicAppPage = isLandingPage || isOnboardingPage;
  const isCommunityAppDestination = isWebCommunityAppDestination(
    params.destination,
  );
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
      (isGlobalSettings ||
        isCommunityAppDestination ||
        params.destination.kind === "discover" ||
        params.destination.kind === "operator" ||
        params.destination.kind === "docs")) ||
    isMobileVisitorCommunity;
  const showMobileSettingsShell =
    showMobileAppShell && isGlobalSettings && !isMobileVisitorCommunity;
  const showMobileShell = showMobileAppShell;
  const showMobileGlobalShell =
    showMobileAppShell &&
    !isMobileVisitorCommunity &&
    (params.mobileRootPage !== "community" ||
      !isCommunityAppDestination ||
      params.destination.kind === "community_home" ||
      isCommunitySettings);
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
      isCommunityAppDestination &&
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
    : isGlobalSettings || isCommunitySettings
      ? "settings"
      : params.destination.kind === "discover" ||
        params.destination.kind === "operator" ||
        params.destination.kind === "docs"
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
