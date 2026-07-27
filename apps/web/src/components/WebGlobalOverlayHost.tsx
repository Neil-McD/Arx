import type { ComponentProps } from "react";
import { FreeAccountIncludedModal } from "../../../../shared/FreeAccountIncludedModal";
import { WebCommunityModalHost } from "./WebCommunityModalHost";
import { WebProviderConnectionModalHost } from "./WebProviderConnectionModalHost";

export type WebGlobalOverlayHostProps = {
  providerConnectionModalHostProps: ComponentProps<
    typeof WebProviderConnectionModalHost
  >["modalHostProps"];
  freeAccountIncludedModalProps: ComponentProps<typeof FreeAccountIncludedModal>;
  communityModalHostProps: ComponentProps<typeof WebCommunityModalHost>["modalHostProps"];
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

      {props.appToast ? (
        <div className="app-toast" role="status" aria-live="polite">
          <div className="app-toast-inner">{props.appToast}</div>
        </div>
      ) : null}
    </>
  );
}
