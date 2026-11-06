import type { PublicRoute } from "../../../../shared/webAppRouteState";
import type { WebAppMainSurfaceHostProps } from "../components/WebAppMainSurfaceHost";

export function buildWebAppMainSurfaceHostProps(params: {
  activePage: WebAppMainSurfaceHostProps["activePage"];
  isPublicCommunityFunnel: boolean;
  publicRoute: PublicRoute;
  landingPageProps: WebAppMainSurfaceHostProps["landingPageProps"];
  isSignedOut: boolean;
  onboardingPageProps: WebAppMainSurfaceHostProps["onboardingPageProps"];
  platformBridgePageProps: WebAppMainSurfaceHostProps["platformBridgePageProps"];
  showOnboardingModal: WebAppMainSurfaceHostProps["showOnboardingModal"];
  holdLandingForAuth: WebAppMainSurfaceHostProps["holdLandingForAuth"];
  settingsSurfaceHostProps: WebAppMainSurfaceHostProps["settingsSurfaceHostProps"];

  communityHostProps: WebAppMainSurfaceHostProps["communityHostProps"];
  discoverPanelProps: WebAppMainSurfaceHostProps["discoverPanelProps"];
  productDocsPanelProps: WebAppMainSurfaceHostProps["productDocsPanelProps"];
  operatorDashboardProps: WebAppMainSurfaceHostProps["operatorDashboardProps"];
}): WebAppMainSurfaceHostProps {
  return {
    activePage: params.activePage,
    showPublicCommunityFunnel: params.isPublicCommunityFunnel,
    showCommunitySurface:
      params.publicRoute.kind === "app" && params.activePage === "community",
    showDiscoverPanel:
      params.publicRoute.kind === "app" && params.activePage === "discover" && !params.isSignedOut,
    showPublicFind:
      params.publicRoute.kind === "app" && params.activePage === "discover" && params.isSignedOut,
    publicFindProps: { onJoin: params.landingPageProps.onStartBuilderPurchase },
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
    publicCommunitySlug: params.publicRoute.kind === "community_funnel" ? params.publicRoute.slug : null,
    communityHostProps: params.communityHostProps,
    discoverPanelProps: params.discoverPanelProps,
    productDocsPanelProps: params.productDocsPanelProps,
    operatorDashboardProps: params.operatorDashboardProps,
  };
}
