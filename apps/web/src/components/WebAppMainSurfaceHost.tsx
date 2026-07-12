import type { ComponentProps } from "react";
import type { AppPage } from "../../../../shared/appShellNavigation";
import { WebCommunityHost } from "./WebCommunityHost";
import { WebDiscoverPanel } from "./WebDiscoverPanel";
import { WebProductDocsPanel } from "./WebProductDocsPanel";
import { WebPublicCommunityFunnel } from "./WebPublicCommunityFunnel";
import { WebSettingsSurfaceHost } from "./WebSettingsSurfaceHost";
import { WebLandingPage } from "./WebLandingPage";
import { WebOnboardingPage } from "./WebOnboardingPage";
import { WebPlatformBridgePage } from "./WebPlatformBridgePage";

export type WebAppMainSurfaceHostProps = {
  activePage: AppPage;
  showPublicCommunityFunnel: boolean;
  showCommunitySurface: boolean;
  showDiscoverPanel: boolean;
  showProductDocsPanel: boolean;
  holdLandingForAuth: boolean;
  landingPageProps: ComponentProps<typeof WebLandingPage>;
  onboardingPageProps: ComponentProps<typeof WebOnboardingPage>;
  platformBridgePageProps: ComponentProps<typeof WebPlatformBridgePage>;
  showOnboardingModal: boolean;
  settingsSurfaceHostProps: ComponentProps<typeof WebSettingsSurfaceHost>;
  publicCommunityFunnelProps: ComponentProps<typeof WebPublicCommunityFunnel>;
  communityHostProps: ComponentProps<typeof WebCommunityHost>;
  discoverPanelProps: ComponentProps<typeof WebDiscoverPanel>;
  productDocsPanelProps: ComponentProps<typeof WebProductDocsPanel>;
};

export function WebAppMainSurfaceHost(props: WebAppMainSurfaceHostProps) {
  return (
    <main
      className={`workspace${
        props.showPublicCommunityFunnel ||
        props.activePage !== "settings"
          ? " community-mode"
          : ""
      }`}
    >
      {props.holdLandingForAuth ? (
        <div className="landing-auth-hold" aria-hidden="true" />
      ) : props.showPublicCommunityFunnel ? (
        <div className="community-body">
          <WebPublicCommunityFunnel {...props.publicCommunityFunnelProps} />
        </div>
      ) : props.activePage === "landing" ? (
        <WebLandingPage {...props.landingPageProps} />
      ) : props.activePage === "onboarding" ? (
        <WebPlatformBridgePage {...props.platformBridgePageProps} />
      ) : props.activePage === "settings" ? (
        <WebSettingsSurfaceHost {...props.settingsSurfaceHostProps} />
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
