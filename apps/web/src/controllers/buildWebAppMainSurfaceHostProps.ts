import type { PublicRoute } from "../../../../shared/webAppRouteState";
import type { WebAppMainSurfaceHostProps } from "../components/WebAppMainSurfaceHost";

export function buildWebAppMainSurfaceHostProps(params: {
  activePage: WebAppMainSurfaceHostProps["activePage"];
  isPublicCommunityFunnel: boolean;
  showInactiveCommunitySurface: boolean;
  publicRoute: PublicRoute;
  landingPageProps: WebAppMainSurfaceHostProps["landingPageProps"];
  onboardingPageProps: WebAppMainSurfaceHostProps["onboardingPageProps"];
  platformBridgePageProps: WebAppMainSurfaceHostProps["platformBridgePageProps"];
  showOnboardingModal: WebAppMainSurfaceHostProps["showOnboardingModal"];
  holdLandingForAuth: WebAppMainSurfaceHostProps["holdLandingForAuth"];
  settingsSurfaceHostProps: WebAppMainSurfaceHostProps["settingsSurfaceHostProps"];
  publicCommunityFunnelProps: WebAppMainSurfaceHostProps["publicCommunityFunnelProps"];
  communityHostProps: WebAppMainSurfaceHostProps["communityHostProps"];
  communityLifecycleTerminalProps: WebAppMainSurfaceHostProps["communityLifecycleTerminalProps"];
  discoverPanelProps: WebAppMainSurfaceHostProps["discoverPanelProps"];
  productDocsPanelProps: WebAppMainSurfaceHostProps["productDocsPanelProps"];
  operatorDashboardProps: WebAppMainSurfaceHostProps["operatorDashboardProps"];
}): WebAppMainSurfaceHostProps {
  return {
    activePage: params.activePage,
    showPublicCommunityFunnel: params.isPublicCommunityFunnel,
    showCommunitySurface:
      params.publicRoute.kind === "app" &&
      params.activePage === "community" &&
      !params.showInactiveCommunitySurface,
    showInactiveCommunitySurface: params.showInactiveCommunitySurface,
    showDiscoverPanel:
      params.publicRoute.kind === "app" && params.activePage === "discover",
    showProductDocsPanel:
      params.publicRoute.kind === "app" && params.activePage === "docs",
    showOperatorDashboard:
      params.publicRoute.kind === "app" &&
      params.activePage === "operator" &&
      Boolean(params.operatorDashboardProps),
    holdLandingForAuth: params.holdLandingForAuth,
    landingPageProps: params.landingPageProps,
    onboardingPageProps: params.onboardingPageProps,
    platformBridgePageProps: params.platformBridgePageProps,
    showOnboardingModal: params.showOnboardingModal,
    settingsSurfaceHostProps: params.settingsSurfaceHostProps,
    publicCommunityFunnelProps: params.publicCommunityFunnelProps,
    communityHostProps: params.communityHostProps,
    communityLifecycleTerminalProps: params.communityLifecycleTerminalProps,
    discoverPanelProps: params.discoverPanelProps,
    productDocsPanelProps: params.productDocsPanelProps,
    operatorDashboardProps: params.operatorDashboardProps,
  };
}
