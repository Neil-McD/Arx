import {
  lazy,
  Suspense,
  type Ref,
} from "react";

import type { AuthSession } from "../auth";
import { communityAgentSessionKey, showCommunityAgentWorkspace } from "../../../../shared/communityAgentPageState";
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
}) {
  const agentSessionKey = communityAgentSessionKey(props.memberAgentDockProps.session?.user.id, props.memberAgentDockProps.community?.id);
  const showAgentWorkspace = showCommunityAgentWorkspace(props.memberAgentDockProps);
  const globalOverlays = (
    <>
      <WebGlobalOverlayHost {...props.globalOverlayHostProps} />
      {!props.memberAgentDockProps.pageMode && <Suspense fallback={null}>
        <WebMemberAgentDock
          key={agentSessionKey}
          ref={props.memberAgentDockRef}
          {...props.memberAgentDockProps}
        />
      </Suspense>}
      <WebDirectMessagesHost {...props.directMessagesHostProps} />
    </>
  );
  const mainSurface = (
    <>
    <div style={{ display: showAgentWorkspace ? "none" : "contents" }}>
    <Suspense
      fallback={<WebAppMainSurfaceFallback {...props.mainSurfaceHostProps} />}
    >
      <WebAppMainSurfaceHost {...props.mainSurfaceHostProps} />
    </Suspense>
    </div>
    {props.memberAgentDockProps.pageMode && <main className="workspace community-mode community-agent-workspace" style={{ display: showAgentWorkspace ? undefined : "none" }}>
      <Suspense fallback={<div role="status">Loading agent…</div>}>
        <WebMemberAgentDock key={agentSessionKey} ref={props.memberAgentDockRef} {...props.memberAgentDockProps} />
      </Suspense>
    </main>}
    </>
  );

  return (
    <WebShellChromeHost
      {...props.shellChromeHostProps}
      mainSurface={mainSurface}
      globalOverlays={globalOverlays}
    />
  );
}
