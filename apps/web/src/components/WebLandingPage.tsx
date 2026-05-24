import { useEffect } from "react";
import { recordCloudBusinessPageVisit } from "../../../../shared/cloudBusinessAnalyticsGateway";
import {
  Argument,
  Communities,
  FinalCTA,
  Hero,
  Manifesto,
  Marquee,
  NetworkSection,
  Pillars,
  SiteFooter,
  TopNav,
} from "./polynetLanding/LandingSections";
import "./WebLandingPage.css";

type WebLandingPageProps = {
  onTryFree: () => void;
};

export function WebLandingPage(props: WebLandingPageProps) {
  useEffect(() => {
    void recordCloudBusinessPageVisit({
      pathKind: "home",
    }).catch((error) => {
      console.warn("Failed to record business page visit:", error);
    });
  }, []);

  return (
    <div className="polynet-network-landing">
      <TopNav onJoin={props.onTryFree} />
      <main>
        <Hero onJoin={props.onTryFree} />
        <Marquee />
        <Argument />
        <NetworkSection />
        <Pillars />
        <Communities />
        <Manifesto />
        <FinalCTA onJoin={props.onTryFree} />
      </main>
      <SiteFooter />
    </div>
  );
}
