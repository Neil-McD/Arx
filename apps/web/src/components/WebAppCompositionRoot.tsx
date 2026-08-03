import {
  lazy,
  Suspense,
  type ComponentProps,
  type Ref,
} from "react";

import type { AuthSession } from "../auth";
import type { WebAppMainSurfaceHostProps } from "./WebAppMainSurfaceHost";
import { WebAppMainSurfaceFallback } from "./WebAppMainSurfaceFallback";
import type {
  WebDirectMessagesHostProps,
} from "./WebDirectMessagesHost";
import { WebDirectMessagesHost } from "./WebDirectMessagesHost";
import { WebGlobalOverlayHost } from "./WebGlobalOverlayHost";
import type { WebGlobalOverlayHostProps } from "./WebGlobalOverlayHost";
import type {
  WebMemberAgentDockHandle,
  WebMemberAgentDockProps,
} from "./WebMemberAgentDock";
import { WebCommunityOnboardingController } from "./WebCommunityOnboardingController";
import { WebShellChromeHost } from "./WebShellChromeHost";
import type { WebShellChromeHostProps } from "./WebShellChromeHost";

const WebAppMainSurfaceHost = lazy(() =>
  import("./WebAppMainSurfaceHost").then((module) => ({
    default: module.WebAppMainSurfaceHost,
  })),
);

const WebMemberAgentDock = lazy(() =>
  import("./WebMemberAgentDock").then((module) => ({
    default: module.WebMemberAgentDock,
  })),
);

type WebCommunityOnboardingControllerProps = ComponentProps<
  typeof WebCommunityOnboardingController
>;

export function WebAppCompositionRoot(props: {
  globalOverlayHostProps: WebGlobalOverlayHostProps;
  memberAgentDockRef: Ref<WebMemberAgentDockHandle>;
  memberAgentDockProps: WebMemberAgentDockProps;
  directMessagesHostProps: WebDirectMessagesHostProps<AuthSession>;
  mainSurfaceHostProps: WebAppMainSurfaceHostProps;
  shellChromeHostProps: Omit<
    WebShellChromeHostProps,
    "mainSurface" | "globalOverlays"
  >;
  onboardingProps: Omit<
    WebCommunityOnboardingControllerProps,
    "children"
  >;
}) {
  const globalOverlays = (
    <>
      <WebGlobalOverlayHost {...props.globalOverlayHostProps} />
      <Suspense fallback={null}>
        <WebMemberAgentDock
          ref={props.memberAgentDockRef}
          {...props.memberAgentDockProps}
        />
      </Suspense>
      <WebDirectMessagesHost {...props.directMessagesHostProps} />
    </>
  );
  const mainSurface = (
    <Suspense
      fallback={<WebAppMainSurfaceFallback {...props.mainSurfaceHostProps} />}
    >
      <WebAppMainSurfaceHost {...props.mainSurfaceHostProps} />
    </Suspense>
  );

  return (
    <WebCommunityOnboardingController {...props.onboardingProps}>
      <WebShellChromeHost
        {...props.shellChromeHostProps}
        mainSurface={mainSurface}
        globalOverlays={globalOverlays}
      />
    </WebCommunityOnboardingController>
  );
}
