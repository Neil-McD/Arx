import type { ComponentProps, ReactNode } from "react";
import { WebCommunityModalHost } from "./WebCommunityModalHost";
import { WebBuilderOfferModal } from "./WebBuilderOfferModal";
import { WebBuilderPurchaseModal } from "./WebBuilderPurchaseModal";

export type WebGlobalOverlayHostProps = {
  communityModalHostProps: ComponentProps<typeof WebCommunityModalHost>["modalHostProps"];
  builderOfferProps: ComponentProps<typeof WebBuilderOfferModal>;
  builderPurchaseProps: ComponentProps<typeof WebBuilderPurchaseModal>;
  blockingOverlay?: ReactNode;
  appToast: string | null;
};

export function WebGlobalOverlayHost(props: WebGlobalOverlayHostProps) {
  return (
    <>
      <WebCommunityModalHost modalHostProps={props.communityModalHostProps} />

      <WebBuilderOfferModal {...props.builderOfferProps} />

      <WebBuilderPurchaseModal {...props.builderPurchaseProps} />

      {props.blockingOverlay ?? null}

      {props.appToast ? (
        <div className="app-toast" role="status" aria-live="polite">
          <div className="app-toast-inner">{props.appToast}</div>
        </div>
      ) : null}
    </>
  );
}
