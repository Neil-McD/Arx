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
}): WebAppMainSurfaceHostProps {
  return {
    activePage: params.activePage,
    showPublicCommunityFunnel: params.isPublicCommunityFunnel,
    showCommunitySurface:
      params.publicRoute.kind === "app" && params.activePage === "community",
    showDiscoverPanel:
      params.publicRoute.kind === "app" && params.activePage === "discover",
    workspaceSurfaceHostProps: params.workspaceSurfaceHostProps,
    publicCommunityFunnelProps: params.publicCommunityFunnelProps,
    communityHostProps: params.communityHostProps,
    discoverPanelProps: params.discoverPanelProps,
  };
}
