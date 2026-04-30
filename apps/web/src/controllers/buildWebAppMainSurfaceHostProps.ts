import type { PublicRoute } from "../../../../shared/webAppRouteState";
import type { WebAppMainSurfaceHostProps } from "../components/WebAppMainSurfaceHost";

export function buildWebAppMainSurfaceHostProps(params: {
  activePage: WebAppMainSurfaceHostProps["activePage"];
  isPublicCommunityFunnel: boolean;
  publicRoute: PublicRoute;
  landingPageProps: WebAppMainSurfaceHostProps["landingPageProps"];
  onboardingPageProps: WebAppMainSurfaceHostProps["onboardingPageProps"];
  showOnboardingModal: WebAppMainSurfaceHostProps["showOnboardingModal"];
  workspaceSurfaceHostProps: WebAppMainSurfaceHostProps["workspaceSurfaceHostProps"];
  publicCommunityFunnelProps: WebAppMainSurfaceHostProps["publicCommunityFunnelProps"];
  communityHostProps: WebAppMainSurfaceHostProps["communityHostProps"];
  discoverPanelProps: WebAppMainSurfaceHostProps["discoverPanelProps"];
  productDocsPanelProps: WebAppMainSurfaceHostProps["productDocsPanelProps"];
}): WebAppMainSurfaceHostProps {
  return {
    activePage: params.activePage,
    showPublicCommunityFunnel: params.isPublicCommunityFunnel,
    showCommunitySurface:
      params.publicRoute.kind === "app" && params.activePage === "community",
    showDiscoverPanel:
      params.publicRoute.kind === "app" && params.activePage === "discover",
    showProductDocsPanel:
      params.publicRoute.kind === "app" && params.activePage === "docs",
    landingPageProps: params.landingPageProps,
    onboardingPageProps: params.onboardingPageProps,
    showOnboardingModal: params.showOnboardingModal,
    workspaceSurfaceHostProps: params.workspaceSurfaceHostProps,
    publicCommunityFunnelProps: params.publicCommunityFunnelProps,
    communityHostProps: params.communityHostProps,
    discoverPanelProps: params.discoverPanelProps,
    productDocsPanelProps: params.productDocsPanelProps,
  };
}
