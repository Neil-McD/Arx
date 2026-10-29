import {
  lazy,
  Suspense,
  type Ref,
} from "react";

import type { AuthSession } from "../auth";
import { AgentCommunityProvider } from "../../../../shared/CommunityAgentIcon";
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
  WebCommunityAgentDockHandle,
  WebCommunityAgentDockProps,
} from "./WebCommunityAgentDock";
import { WebShellChromeHost } from "./WebShellChromeHost";
import type { WebShellChromeHostProps } from "./WebShellChromeHost";

const WebAppMainSurfaceHost = lazy(() =>
  import("./WebAppMainSurfaceHost").then((module) => ({
    default: module.WebAppMainSurfaceHost,
  })),
);

const WebCommunityAgentDock = lazy(() =>
  import("./WebCommunityAgentDock").then((module) => ({
    default: module.WebCommunityAgentDock,
  })),
);

export function WebAppCompositionRoot(props: {
  activeCommunityId: string | null;
  globalOverlayHostProps: WebGlobalOverlayHostProps;
  communityAgentDockRef: Ref<WebCommunityAgentDockHandle>;
  communityAgentDockProps: WebCommunityAgentDockProps;
  directMessagesHostProps: WebDirectMessagesHostProps<AuthSession>;
  mainSurfaceHostProps: WebAppMainSurfaceHostProps;
  shellChromeHostProps: Omit<
    WebShellChromeHostProps,
    "mainSurface" | "globalOverlays"
  >;
}) {
  const agentSessionKey = communityAgentSessionKey(props.communityAgentDockProps.session?.user.id, props.communityAgentDockProps.community?.id);
  const showAgentWorkspace = showCommunityAgentWorkspace(props.communityAgentDockProps);
  const globalOverlays = (
    <>
      <WebGlobalOverlayHost {...props.globalOverlayHostProps} />
      {!props.communityAgentDockProps.pageMode && <Suspense fallback={null}>
        <WebCommunityAgentDock
          key={agentSessionKey}
          ref={props.communityAgentDockRef}
          {...props.communityAgentDockProps}
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
    {props.communityAgentDockProps.pageMode && <main className="workspace community-mode community-agent-workspace" style={{ display: showAgentWorkspace ? undefined : "none" }}>
      <Suspense fallback={<div role="status">Loading agent…</div>}>
        <WebCommunityAgentDock key={agentSessionKey} ref={props.communityAgentDockRef} {...props.communityAgentDockProps} />
      </Suspense>
    </main>}
    </>
  );

  return (
    <AgentCommunityProvider communityId={props.activeCommunityId}>
      <WebShellChromeHost
        {...props.shellChromeHostProps}
        mainSurface={mainSurface}
        globalOverlays={globalOverlays}
      />
    </AgentCommunityProvider>
  );
}
