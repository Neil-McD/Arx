import { lazy, Suspense, type ComponentProps } from "react";
import { WebCommunityModalHost } from "./WebCommunityModalHost";
import type { WebBuilderOfferModal as WebBuilderOfferModalType } from "./WebBuilderOfferModal";
import type { WebCommunityLaunchStep as WebCommunityLaunchStepType } from "./WebCommunityLaunchStep";

const WebBuilderOfferModal = lazy(() =>
  import("./WebBuilderOfferModal").then((module) => ({
    default: module.WebBuilderOfferModal,
  })),
);
const WebCommunityLaunchStep = lazy(() =>
  import("./WebCommunityLaunchStep").then((module) => ({
    default: module.WebCommunityLaunchStep,
  })),
);

export type WebGlobalOverlayHostProps = {
  communityModalHostProps: ComponentProps<typeof WebCommunityModalHost>["modalHostProps"];
  builderOfferProps: ComponentProps<typeof WebBuilderOfferModalType>;
  communityLaunchProps: ComponentProps<typeof WebCommunityLaunchStepType> | null;
  appToast: string | null;
};

export function WebGlobalOverlayHost(props: WebGlobalOverlayHostProps) {
  return (
    <>
      <WebCommunityModalHost modalHostProps={props.communityModalHostProps} />

      {props.builderOfferProps.community ? (
        <Suspense fallback={null}>
          <WebBuilderOfferModal {...props.builderOfferProps} />
        </Suspense>
      ) : null}


      {props.communityLaunchProps ? (
        <Suspense fallback={null}>
          <WebCommunityLaunchStep key={props.communityLaunchProps.community.id} {...props.communityLaunchProps} />
        </Suspense>
      ) : null}

      {props.appToast ? (
        <div className="app-toast" role="status" aria-live="polite">
          <div className="app-toast-inner">{props.appToast}</div>
        </div>
      ) : null}
    </>
  );
}
