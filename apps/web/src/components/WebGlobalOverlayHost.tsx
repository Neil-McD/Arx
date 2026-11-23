import type { ComponentProps } from "react";
import { WebCommunityModalHost } from "./WebCommunityModalHost";
import { WebBuilderOfferModal } from "./WebBuilderOfferModal";
import { WebCommunityLaunchStep } from "./WebCommunityLaunchStep";

export type WebGlobalOverlayHostProps = {
  communityModalHostProps: ComponentProps<typeof WebCommunityModalHost>["modalHostProps"];
  builderOfferProps: ComponentProps<typeof WebBuilderOfferModal>;
  communityLaunchProps: ComponentProps<typeof WebCommunityLaunchStep> | null;
  appToast: string | null;
};

export function WebGlobalOverlayHost(props: WebGlobalOverlayHostProps) {
  return (
    <>
      <WebCommunityModalHost modalHostProps={props.communityModalHostProps} />

      <WebBuilderOfferModal {...props.builderOfferProps} />


      {props.communityLaunchProps ? (
        <WebCommunityLaunchStep key={props.communityLaunchProps.community.id} {...props.communityLaunchProps} />
      ) : null}

      {props.appToast ? (
        <div className="app-toast" role="status" aria-live="polite">
          <div className="app-toast-inner">{props.appToast}</div>
        </div>
      ) : null}
    </>
  );
}
