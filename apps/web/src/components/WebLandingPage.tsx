import { useEffect } from "react";
import { recordCloudBusinessPageVisit } from "../../../../shared/cloudBusinessAnalyticsGateway";
import { ConversionLanding } from "./polynetLanding/ConversionLanding";
import "./polynetLanding/ConversionLanding.css";
import type { BuilderPurchaseActivationStatus } from "../controllers/useWebBuilderPurchaseActivationController";

type WebLandingPageProps = {
  onStartBuilderPurchase: () => void;
  builderPurchaseStatus: BuilderPurchaseActivationStatus;
  builderPurchaseError: string | null;
};

function activationMessage(
  status: BuilderPurchaseActivationStatus,
  error: string | null,
): string | null {
  if (status === "starting_checkout") return "Opening secure checkout…";
  if (status === "confirming_payment") return "Confirming your payment…";
  if (status === "authentication_required") return "Payment confirmed. Opening sign in…";
  if (status === "claiming") return "Activating your Builder subscription…";
  if (status === "ready_to_create") return "Builder is active. Create your community.";
  if (status === "canceled") return "Checkout canceled. You can restart whenever you’re ready.";
  if (status === "error") return error ?? "Builder activation needs attention.";
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
