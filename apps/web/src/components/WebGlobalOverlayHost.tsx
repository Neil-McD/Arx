import type { ComponentProps } from "react";
import { WebCommunityModalHost } from "./WebCommunityModalHost";
import { WebProviderConnectionModalHost } from "./WebProviderConnectionModalHost";
import { WebFounderInferencePrompt } from "./WebFounderInferencePrompt";
import { WebBuilderOfferModal } from "./WebBuilderOfferModal";

export type WebGlobalOverlayHostProps = {
  providerConnectionModalHostProps: ComponentProps<
    typeof WebProviderConnectionModalHost
  >["modalHostProps"];
  communityModalHostProps: ComponentProps<typeof WebCommunityModalHost>["modalHostProps"];
  founderInferencePromptProps: ComponentProps<typeof WebFounderInferencePrompt>;
  builderOfferProps: ComponentProps<typeof WebBuilderOfferModal>;
  appToast: string | null;
};

export function WebGlobalOverlayHost(props: WebGlobalOverlayHostProps) {
  return (
    <>
      <WebProviderConnectionModalHost
        modalHostProps={props.providerConnectionModalHostProps}
      />

      <WebCommunityModalHost modalHostProps={props.communityModalHostProps} />

      <WebFounderInferencePrompt {...props.founderInferencePromptProps} />

      <WebBuilderOfferModal {...props.builderOfferProps} />

      {props.appToast ? (
        <div className="app-toast" role="status" aria-live="polite">
          <div className="app-toast-inner">{props.appToast}</div>
        </div>
      ) : null}
    </>
  );
}
