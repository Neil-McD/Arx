import { CommunityAgentOnProvider } from "../controllers/communityAgentOn";
import { CommunityAppLinksProvider } from "../controllers/communityAppLinks";
import type { CloudCommunityAppLink } from "../../../../shared/cloudConnectedAppsGateway";
import {
  lazy,
  Suspense,
  type ComponentType,
  type Ref,
} from "react";

import type { AuthSession } from "../auth";
import { communityAgentSessionKey, showCommunityAgentWorkspace } from "../../../../shared/communityAgentPageState";
import type { WebAppMainSurfaceHostProps } from "./WebAppMainSurfaceHost";
import { WebAppMainSurfaceFallback } from "./WebAppMainSurfaceFallback";
import type {
  WebDirectMessagesHostProps,
} from "./WebDirectMessagesHost";
import { WebGlobalOverlayHost } from "./WebGlobalOverlayHost";
import type { WebGlobalOverlayHostProps } from "./WebGlobalOverlayHost";
import type {
  WebCommunityAgentDockHandle,
  WebCommunityAgentDockProps,
} from "./WebCommunityAgentDock";
import { WebShellChromeHost } from "./WebShellChromeHost";
import type { WebShellChromeHostProps } from "./WebShellChromeHost";
import { SurfaceErrorBoundary } from "./SurfaceErrorBoundary";
import { resilientImport } from "../lib/resilientLazy";

const WebAppMainSurfaceHost = lazy(() =>
  resilientImport(() => import("./WebAppMainSurfaceHost")).then((module) => ({
    default: module.WebAppMainSurfaceHost,
  })),
);

const WebCommunityAgentDock = lazy(() =>
  resilientImport(() => import("./WebCommunityAgentDock")).then((module) => ({
    default: module.WebCommunityAgentDock,
  })),
);

const WebDirectMessagesHost = lazy<ComponentType<WebDirectMessagesHostProps<AuthSession>>>(() =>
  resilientImport(() => import("./WebDirectMessagesHost")).then((module) => ({
    default: module.WebDirectMessagesHost as ComponentType<WebDirectMessagesHostProps<AuthSession>>,
  })),
);

export function WebAppCompositionRoot(props: {
  globalOverlayHostProps: WebGlobalOverlayHostProps;
  communityAgentDockRef: Ref<WebCommunityAgentDockHandle>;
  communityAgentDockProps: WebCommunityAgentDockProps;
  directMessagesHostProps: WebDirectMessagesHostProps<AuthSession>;
  mainSurfaceHostProps: WebAppMainSurfaceHostProps;
  shellChromeHostProps: Omit<
    WebShellChromeHostProps,
    "mainSurface" | "globalOverlays"
  >;
  // Whether the active community's agent is on; every page below reads it.
  communityAgentOn: boolean;
  communityAppLinks: CloudCommunityAppLink[];
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
      {props.directMessagesHostProps.session || props.directMessagesHostProps.isOpen ? (
        <SurfaceErrorBoundary resetKey={`dm:${props.directMessagesHostProps.isOpen ? "open" : "closed"}`}>
          <Suspense fallback={null}>
            <WebDirectMessagesHost {...props.directMessagesHostProps} />
          </Suspense>
        </SurfaceErrorBoundary>
      ) : null}
    </>
  );
  const mainSurface = (
    <>
    <div className="web-main-surface-slot" style={{ display: showAgentWorkspace ? "none" : "contents" }}>
    <SurfaceErrorBoundary resetKey={`main:${props.mainSurfaceHostProps.activePage}:${props.mainSurfaceHostProps.communityHostProps.secondaryPanelsProps.knowledge.communityId ?? ""}:${props.mainSurfaceHostProps.communityHostProps.communityTab}`}>
      <Suspense
        fallback={<WebAppMainSurfaceFallback {...props.mainSurfaceHostProps} />}
      >
        <WebAppMainSurfaceHost {...props.mainSurfaceHostProps} />
      </Suspense>
    </SurfaceErrorBoundary>
    </div>
    {props.communityAgentDockProps.pageMode && <main className="workspace community-mode community-agent-workspace" style={{ display: showAgentWorkspace ? undefined : "none" }}>
      <SurfaceErrorBoundary resetKey={`agent:${agentSessionKey}:${showAgentWorkspace ? "shown" : "hidden"}`}>
        <Suspense fallback={<div role="status">Loading agent…</div>}>
          <WebCommunityAgentDock key={agentSessionKey} ref={props.communityAgentDockRef} {...props.communityAgentDockProps} />
        </Suspense>
      </SurfaceErrorBoundary>
    </main>}
    </>
  );

  return (
    <CommunityAgentOnProvider value={props.communityAgentOn}>
      <CommunityAppLinksProvider value={props.communityAppLinks}>
        <WebShellChromeHost
          {...props.shellChromeHostProps}
          mainSurface={mainSurface}
          globalOverlays={globalOverlays}
        />
      </CommunityAppLinksProvider>
    </CommunityAgentOnProvider>
  );
}
