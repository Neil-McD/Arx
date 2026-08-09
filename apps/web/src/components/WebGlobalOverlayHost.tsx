import type { ComponentProps } from "react";
import { WebCommunityModalHost } from "./WebCommunityModalHost";
import { WebBuilderOfferModal } from "./WebBuilderOfferModal";
import { WebBuilderPurchaseModal } from "./WebBuilderPurchaseModal";
import { WebBuilderKnowledgeSetup } from "./WebBuilderKnowledgeSetup";

export type WebGlobalOverlayHostProps = {
  communityModalHostProps: ComponentProps<typeof WebCommunityModalHost>["modalHostProps"];
  builderOfferProps: ComponentProps<typeof WebBuilderOfferModal>;
  builderPurchaseProps: ComponentProps<typeof WebBuilderPurchaseModal>;
  builderKnowledgeSetupProps: ComponentProps<typeof WebBuilderKnowledgeSetup> | null;
  appToast: string | null;
};

export function WebGlobalOverlayHost(props: WebGlobalOverlayHostProps) {
  return (
    <>
      <WebCommunityModalHost modalHostProps={props.communityModalHostProps} />

      <WebBuilderOfferModal {...props.builderOfferProps} />

      <WebBuilderPurchaseModal {...props.builderPurchaseProps} />

      {props.builderKnowledgeSetupProps ? (
        <WebBuilderKnowledgeSetup {...props.builderKnowledgeSetupProps} />
      ) : null}

      {props.appToast ? (
        <div className="app-toast" role="status" aria-live="polite">
          <div className="app-toast-inner">{props.appToast}</div>
        </div>
      ) : null}
    </>
  );
}
