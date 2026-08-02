import type { ComponentProps } from "react";
import { FreeAccountIncludedModal } from "../../../../shared/FreeAccountIncludedModal";
import { WebCommunityModalHost } from "./WebCommunityModalHost";
import { WebProviderConnectionModalHost } from "./WebProviderConnectionModalHost";
import { WebFounderFundingPrompt } from "./WebFounderFundingPrompt";
import { WebFounderInferencePrompt } from "./WebFounderInferencePrompt";

export type WebGlobalOverlayHostProps = {
  providerConnectionModalHostProps: ComponentProps<
    typeof WebProviderConnectionModalHost
  >["modalHostProps"];
  freeAccountIncludedModalProps: ComponentProps<typeof FreeAccountIncludedModal>;
  communityModalHostProps: ComponentProps<typeof WebCommunityModalHost>["modalHostProps"];
  founderFundingPromptProps: ComponentProps<typeof WebFounderFundingPrompt>;
  founderInferencePromptProps: ComponentProps<typeof WebFounderInferencePrompt>;
  appToast: string | null;
};

export function WebGlobalOverlayHost(props: WebGlobalOverlayHostProps) {
  return (
    <>
      <WebProviderConnectionModalHost
        modalHostProps={props.providerConnectionModalHostProps}
      />

      <FreeAccountIncludedModal {...props.freeAccountIncludedModalProps} />

      <WebCommunityModalHost modalHostProps={props.communityModalHostProps} />

      <WebFounderFundingPrompt {...props.founderFundingPromptProps} />

      <WebFounderInferencePrompt {...props.founderInferencePromptProps} />

      {props.appToast ? (
        <div className="app-toast" role="status" aria-live="polite">
          <div className="app-toast-inner">{props.appToast}</div>
        </div>
      ) : null}
    </>
  );
}
