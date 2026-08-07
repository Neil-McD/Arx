import { useEffect } from "react";
import { recordCloudBusinessPageVisit } from "../../../../shared/cloudBusinessAnalyticsGateway";
import { ConversionLanding } from "./polynetLanding/ConversionLanding";
import "./polynetLanding/ConversionLanding.css";
import type { PublicBuilderCheckoutStatus } from "../controllers/useWebPublicBuilderCheckoutController";

type WebLandingPageProps = {
  onStartBuilderPurchase: () => void;
  builderPurchaseStatus: PublicBuilderCheckoutStatus;
  builderPurchaseError: string | null;
};

function activationMessage(
  status: PublicBuilderCheckoutStatus,
  error: string | null,
): string | null {
  if (status === "starting_checkout") return "Opening secure checkout…";
  if (status === "canceled") return "Checkout canceled. You can restart whenever you’re ready.";
  if (status === "error") return error ?? "Builder checkout needs attention.";
  return null;
}

export function WebLandingPage(props: WebLandingPageProps) {
  useEffect(() => {
    void recordCloudBusinessPageVisit({
      pathKind: "home",
    }).catch((error) => {
      console.warn("Failed to record business page visit:", error);
    });
  }, []);

  const message = activationMessage(
    props.builderPurchaseStatus,
    props.builderPurchaseError,
  );
  return (
    <>
      {message ? (
        <div
          className={`pn-builder-activation${props.builderPurchaseStatus === "error" ? " error" : ""}`}
          role={props.builderPurchaseStatus === "error" ? "alert" : "status"}
        >
          {message}
        </div>
      ) : null}
      <ConversionLanding onJoin={props.onStartBuilderPurchase} />
    </>
  );
}
