import { useEffect } from "react";
import { recordCloudBusinessPageVisit } from "../../../../shared/cloudBusinessAnalyticsGateway";
import { ConversionLanding } from "./polynetLanding/ConversionLanding";
import "./polynetLanding/ConversionLanding.css";

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

  return <ConversionLanding onJoin={props.onTryFree} />;
}
