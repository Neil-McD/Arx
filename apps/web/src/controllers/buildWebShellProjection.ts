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
  const isOperatorPage = isAppRoute && params.destination.kind === "operator";
  const isPublicAppPage = isLandingPage;
  const isCommunityAppDestination = isWebCommunityAppDestination(
    params.destination,
  );
  const showMobileAppShell =
    params.shellVariant === "mobile" &&
    isAppRoute &&
    !isPublicAppPage &&
    !params.isPublicCommunityFunnel &&
    (isGlobalSettings ||
      isCommunityAppDestination ||
      params.destination.kind === "onboarding" ||
      params.destination.kind === "discover" ||
      params.destination.kind === "operator" ||
      params.destination.kind === "docs");
  const showMobileSettingsShell = showMobileAppShell && isGlobalSettings;
  const showMobileShell = showMobileAppShell;
  const showMobileGlobalShell =
    showMobileAppShell &&
    (params.mobileRootPage !== "community" ||
      !isCommunityAppDestination ||
      params.destination.kind === "community_home" ||
      isCommunitySettings);
  const showMobileSettingsIndex =
    showMobileSettingsShell && params.mobileSettingsView === "index";
  const showMobilePublicFunnel =
    params.shellVariant === "mobile" &&
    params.publicRouteKind === "community_funnel" &&
    params.isPublicCommunityFunnel;
  /* Public acquisition and draft preview routes own the presentation canvas.
     Product navigation is reserved for authenticated app destinations. */
  const showDesktopCommunityNav =
    isAppRoute &&
    isCommunityAppDestination &&
    !showMobileAppShell &&
    !showMobilePublicFunnel;
  const showDesktopCommunityRail =
    isAppRoute &&
    !isOperatorPage &&
    !showMobileAppShell &&
    !showMobilePublicFunnel;
  const shouldShowDesktopCommunityRail =
    showDesktopCommunityRail && !isPublicAppPage;
  const hasLeftPanel =
    (isGlobalSettings && !showMobileSettingsShell) || showDesktopCommunityNav;
  const mobileShellMode: MobileShellMode =
    isGlobalSettings || isCommunitySettings
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
