import type { ComponentProps } from "react";
import type { AppPage } from "../../../../shared/appShellNavigation";
import { WebCommunityHost } from "./WebCommunityHost";
import { WebDiscoverPanel } from "./WebDiscoverPanel";
import { WebProductDocsPanel } from "./WebProductDocsPanel";
import { WebCommunityHandoff } from "./WebCommunityHandoff";
import { WebSettingsSurfaceHost } from "./WebSettingsSurfaceHost";
import { WebLandingPage } from "./WebLandingPage";
import { PublicFindPage } from "./polynetLanding/PublicFindPage";
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
  showPublicFind: boolean;
  publicFindProps: ComponentProps<typeof PublicFindPage>;
  onboardingPageProps: ComponentProps<typeof WebOnboardingPage>;
  platformBridgePageProps: ComponentProps<typeof WebPlatformBridgePage>;
  showOnboardingModal: boolean;
  settingsSurfaceHostProps: ComponentProps<typeof WebSettingsSurfaceHost>;
  // /c/<slug>: the community whose site to hand over to.
  publicCommunitySlug: string | null;
  // Whether the viewer belongs to that community ("loading" until known).
  publicCommunityMembership: "loading" | "member" | "visitor";
  publicCommunitySignedIn: boolean;
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
          {props.publicCommunitySlug ? <WebCommunityHandoff communitySlug={props.publicCommunitySlug} membership={props.publicCommunityMembership} signedIn={props.publicCommunitySignedIn} /> : null}
        </div>
      ) : props.showPublicFind ? (
        <PublicFindPage {...props.publicFindProps} />
      ) : props.activePage === "landing" ? (
        <WebLandingPage {...props.landingPageProps} />
      ) : props.activePage === "onboarding" ? (
        <>
          <div className="community-body">
            <WebDiscoverPanel {...props.discoverPanelProps} />
          </div>
          <WebPlatformBridgePage {...props.platformBridgePageProps} />
        </>
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
