import { Suspense, lazy, type ComponentProps } from "react";
import type { AppPage } from "../../../../shared/appShellNavigation";
import { WebCommunityHost } from "./WebCommunityHost";
import { WebDiscoverPanel } from "./WebDiscoverPanel";
import { WebWorkspaceSurfaceHost } from "./WebWorkspaceSurfaceHost";

const WebPublicCommunityFunnel = lazy(() =>
  import("./WebPublicCommunityFunnel").then((module) => ({
    default: module.WebPublicCommunityFunnel,
  })),
);

export type WebAppMainSurfaceHostProps = {
  activePage: AppPage;
  showPublicCommunityFunnel: boolean;
  showCommunitySurface: boolean;
  showDiscoverPanel: boolean;
  workspaceSurfaceHostProps: ComponentProps<typeof WebWorkspaceSurfaceHost>;
  publicCommunityFunnelProps: ComponentProps<typeof WebPublicCommunityFunnel>;
  communityHostProps: ComponentProps<typeof WebCommunityHost>;
  discoverPanelProps: ComponentProps<typeof WebDiscoverPanel>;
};

export function WebAppMainSurfaceHost(props: WebAppMainSurfaceHostProps) {
  return (
    <main
      className={`workspace${
        props.showPublicCommunityFunnel || props.activePage !== "workspace"
          ? " community-mode"
          : ""
      }`}
    >
      {props.showPublicCommunityFunnel ? (
        <div className="community-body">
          <div className="community-panel public-route-panel public-community-funnel-panel">
            <div className="workspace-body public-route-body public-community-funnel-body">
              <Suspense fallback={null}>
                <WebPublicCommunityFunnel {...props.publicCommunityFunnelProps} />
              </Suspense>
            </div>
          </div>
        </div>
      ) : props.activePage === "workspace" ? (
        <WebWorkspaceSurfaceHost {...props.workspaceSurfaceHostProps} />
      ) : props.showCommunitySurface ? (
        <WebCommunityHost {...props.communityHostProps} />
      ) : (
        <div className="community-body">
          {props.showDiscoverPanel ? (
            <WebDiscoverPanel {...props.discoverPanelProps} />
          ) : null}
        </div>
      )}
    </main>
  );
}
