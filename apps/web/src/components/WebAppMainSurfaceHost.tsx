import { lazy, Suspense, type ComponentProps } from "react";
import type { AppPage } from "../../../../shared/appShellNavigation";
import type { WebCommunityHost as WebCommunityHostType } from "./WebCommunityHost";
import { WebDiscoverPanel } from "./WebDiscoverPanel";
import { WebCommunityDiscoverPage, type WebCommunityDiscoverPageProps } from "./WebCommunityDiscoverPage";
import { CommunityPageFrame } from "./CommunityPageHeader";
import type { WebProductDocsPanel as WebProductDocsPanelType } from "./WebProductDocsPanel";
import type { WebSettingsSurfaceHost as WebSettingsSurfaceHostType } from "./WebSettingsSurfaceHost";
import type { WebLandingPage as WebLandingPageType } from "./WebLandingPage";
import type { PublicFindPage as PublicFindPageType } from "./polynetLanding/PublicFindPage";
import { WebOnboardingPage } from "./WebOnboardingPage";
import { WebPlatformBridgePage } from "./WebPlatformBridgePage";
import { WebAppMainSurfaceFallback } from "./WebAppMainSurfaceFallback";
import { SurfaceErrorBoundary } from "./SurfaceErrorBoundary";
import { resilientImport } from "../lib/resilientLazy";

const WebCommunityHost = lazy(() =>
  resilientImport(() => import("./WebCommunityHost")).then((module) => ({ default: module.WebCommunityHost })),
);
const WebProductDocsPanel = lazy(() =>
  resilientImport(() => import("./WebProductDocsPanel")).then((module) => ({ default: module.WebProductDocsPanel })),
);
const WebCommunityLandingPage = lazy(() =>
  resilientImport(() => import("./WebCommunityLandingPage")).then((module) => ({ default: module.WebCommunityLandingPage })),
);
const WebSettingsSurfaceHost = lazy(() =>
  resilientImport(() => import("./WebSettingsSurfaceHost")).then((module) => ({ default: module.WebSettingsSurfaceHost })),
);
const WebLandingPage = lazy(() =>
  resilientImport(() => import("./WebLandingPage")).then((module) => ({ default: module.WebLandingPage })),
);
const PublicFindPage = lazy(() =>
  resilientImport(() => import("./polynetLanding/PublicFindPage")).then((module) => ({ default: module.PublicFindPage })),
);

export type WebAppMainSurfaceHostProps = {
  activePage: AppPage;
  showPublicCommunityFunnel: boolean;
  showCommunitySurface: boolean;
  showDiscoverPanel: boolean;
  showProductDocsPanel: boolean;
  holdLandingForAuth: boolean;
  landingPageProps: ComponentProps<typeof WebLandingPageType>;
  showPublicFind: boolean;
  publicFindProps: ComponentProps<typeof PublicFindPageType>;
  onboardingPageProps: ComponentProps<typeof WebOnboardingPage>;
  platformBridgePageProps: ComponentProps<typeof WebPlatformBridgePage>;
  showOnboardingModal: boolean;
  settingsSurfaceHostProps: ComponentProps<typeof WebSettingsSurfaceHostType>;
  // /c/<slug>: the community whose landing page this is, and the viewer's
  // session (null signed out) for where they stand and to join.
  publicCommunitySlug: string | null;
  publicCommunitySession: unknown | null;
  publicCommunitySessionCheckPending?: boolean;
  communityHostProps: ComponentProps<typeof WebCommunityHostType>;
  discoverPanelProps: ComponentProps<typeof WebDiscoverPanel>;
  discoverPageProps: WebCommunityDiscoverPageProps;
  productDocsPanelProps: ComponentProps<typeof WebProductDocsPanelType>;
};

export function WebAppMainSurfaceHost(props: WebAppMainSurfaceHostProps) {
  const surfaceFallback = props.showCommunitySurface
    ? <WebAppMainSurfaceFallback {...props} />
    : null;
  const activeCommunityKey = props.communityHostProps.secondaryPanelsProps.knowledge.communityId ?? "";
  const surfaceResetKey = `${props.activePage}:${activeCommunityKey}:${props.communityHostProps.communityTab}:${props.publicCommunitySlug ?? ""}`;
  return (
    <main
      className={`workspace${
        props.showPublicCommunityFunnel ||
        props.activePage !== "settings"
          ? " community-mode"
          : ""
      }`}
    >
      <SurfaceErrorBoundary resetKey={surfaceResetKey}>
        <Suspense fallback={surfaceFallback}>
        {props.holdLandingForAuth ? (
          <div className="landing-auth-hold" aria-hidden="true" />
        ) : props.showPublicCommunityFunnel ? (
          <div className="community-body">
            {props.publicCommunitySlug ? (
              <WebCommunityLandingPage
                communitySlug={props.publicCommunitySlug}
                session={props.publicCommunitySession}
                sessionCheckPending={props.publicCommunitySessionCheckPending}
              />
            ) : null}
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
              <CommunityPageFrame><WebCommunityDiscoverPage {...props.discoverPageProps} /></CommunityPageFrame>
            ) : props.showProductDocsPanel ? (
              <WebProductDocsPanel {...props.productDocsPanelProps} />
            ) : null}
          </div>
        )}
        {props.showOnboardingModal ? (
          <WebOnboardingPage {...props.onboardingPageProps} />
        ) : null}
        </Suspense>
      </SurfaceErrorBoundary>
    </main>
  );
}
