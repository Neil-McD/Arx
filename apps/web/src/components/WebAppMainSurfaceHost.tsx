import type { ComponentProps } from "react";
import type { AppPage } from "../../../../shared/appShellNavigation";
import { WebCommunityHost } from "./WebCommunityHost";
import { WebDiscoverPanel } from "./WebDiscoverPanel";
import { WebProductDocsPanel } from "./WebProductDocsPanel";
import { WebPublicCommunityFunnel } from "./WebPublicCommunityFunnel";
import { WebWorkspaceSurfaceHost } from "./WebWorkspaceSurfaceHost";
import { WebLandingPage } from "./WebLandingPage";
import { WebOnboardingPage } from "./WebOnboardingPage";

export type WebAppMainSurfaceHostProps = {
  activePage: AppPage;
  showPublicCommunityFunnel: boolean;
  showCommunitySurface: boolean;
  showDiscoverPanel: boolean;
  showProductDocsPanel: boolean;
  holdLandingForAuth: boolean;
  landingPageProps: ComponentProps<typeof WebLandingPage>;
  onboardingPageProps: ComponentProps<typeof WebOnboardingPage>;
  showOnboardingModal: boolean;
  workspaceSurfaceHostProps: ComponentProps<typeof WebWorkspaceSurfaceHost>;
  publicCommunityFunnelProps: ComponentProps<typeof WebPublicCommunityFunnel>;
  communityHostProps: ComponentProps<typeof WebCommunityHost>;
  discoverPanelProps: ComponentProps<typeof WebDiscoverPanel>;
  productDocsPanelProps: ComponentProps<typeof WebProductDocsPanel>;
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
      {props.holdLandingForAuth ? (
        <div className="landing-auth-hold" aria-hidden="true" />
      ) : props.activePage === "landing" ? (
        <WebLandingPage {...props.landingPageProps} />
      ) : props.showPublicCommunityFunnel ? (
        <div className="community-body">
          <WebPublicCommunityFunnel {...props.publicCommunityFunnelProps} />
        </div>
      ) : props.activePage === "workspace" || props.activePage === "onboarding" ? (
        <WebWorkspaceSurfaceHost {...props.workspaceSurfaceHostProps} />
      ) : props.showCommunitySurface ? (
        <WebCommunityHost {...props.communityHostProps} />
      ) : (
        <div className="community-body">
          {props.showDiscoverPanel ? (
            <WebDiscoverPanel {...props.discoverPanelProps} />
          ) : props.showProductDocsPanel ? (
            <WebProductDocsPanel {...props.productDocsPanelProps} />
          ) : null}
        </div>
      )}
      {props.showOnboardingModal ? (
        <WebOnboardingPage {...props.onboardingPageProps} />
      ) : null}
    </main>
  );
}
