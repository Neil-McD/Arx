import type { PublicRoute } from "../../../../shared/webAppRouteState";
import type { WebAppMainSurfaceHostProps } from "../components/WebAppMainSurfaceHost";

export function buildWebAppMainSurfaceHostProps(params: {
  activePage: WebAppMainSurfaceHostProps["activePage"];
  isPublicCommunityFunnel: boolean;
  publicRoute: PublicRoute;
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
    workspaceSurfaceHostProps: params.workspaceSurfaceHostProps,
    publicCommunityFunnelProps: params.publicCommunityFunnelProps,
    communityHostProps: params.communityHostProps,
    discoverPanelProps: params.discoverPanelProps,
    productDocsPanelProps: params.productDocsPanelProps,
  };
}
