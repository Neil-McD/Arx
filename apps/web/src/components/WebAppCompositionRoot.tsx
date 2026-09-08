import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type Ref,
} from "react";
import { Minus, Plus, Sparkles } from "lucide-react";

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
  const [sideAgent, setSideAgent] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const toolsRail = useRef<HTMLElement>(null);
  const railEnabled = !props.shellChromeHostProps.showMobileAppShell &&
    props.shellChromeHostProps.communityShell.showDesktopCommunityNav;
  const canOpenAgent = railEnabled && props.memberAgentDockProps.isVisible &&
    !props.memberAgentDockProps.isSuppressed && Boolean(props.memberAgentDockProps.surfaceContext);
  const showSideAgent = canOpenAgent && sideAgent && !showAgentWorkspace && !props.directMessagesHostProps.isOpen;
  const showSideMessages = railEnabled && props.directMessagesHostProps.isOpen;
  useEffect(() => { setSideAgent(false); setPickerOpen(false); }, [agentSessionKey, railEnabled]);
  useEffect(() => {
    if (showAgentWorkspace || props.directMessagesHostProps.isOpen) {
      setSideAgent(false);
      setPickerOpen(false);
    }
  }, [showAgentWorkspace, props.directMessagesHostProps.isOpen]);
  useEffect(() => {
    if (!pickerOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest(".workspace-panel-picker")) setPickerOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [pickerOpen]);
  const closeSideAgent = () => { setSideAgent(false); addButton.current?.focus(); };
  const minimizePanel = () => {
    if (showSideMessages) {
      props.directMessagesHostProps.onClose();
      toolsRail.current?.querySelector<HTMLButtonElement>(".direct-messages-topbar-button")?.focus();
    } else {
      closeSideAgent();
    }
  };
  const rightRail = railEnabled ? <aside ref={toolsRail} className="workspace-right-rail" aria-label="Workspace tools">
    {props.shellChromeHostProps.desktopHeader.directMessagesButton}
    <div className="workspace-panel-picker">
      <button ref={addButton} type="button" className="icon-button" aria-label="Open side panel"
        title="Open side panel" aria-expanded={pickerOpen} aria-controls="workspace-panel-options"
        onClick={() => setPickerOpen(!pickerOpen)}><Plus /></button>
      {pickerOpen && <div id="workspace-panel-options" className="workspace-panel-options"
        onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setPickerOpen(false); addButton.current?.focus(); } }}>
        <button type="button" autoFocus disabled={!canOpenAgent || showAgentWorkspace}
          onClick={() => { props.directMessagesHostProps.onClose(); setSideAgent(true); setPickerOpen(false); }}>
          <Sparkles size={18} /> Agent
        </button>
      </div>}
    </div>
  </aside> : null;
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
      {!props.memberAgentDockProps.pageMode && <WebDirectMessagesHost {...props.directMessagesHostProps} />}
    </>
  );
  const mainSurface = (
    <div className={railEnabled ? `community-workspace-panes${showSideAgent || showSideMessages ? " has-secondary-pane" : ""}` : undefined} style={railEnabled ? undefined : { display: "contents" }}>
    <div className="community-workspace-primary" style={{ display: showAgentWorkspace ? "none" : railEnabled ? undefined : "contents" }}>
    <Suspense
      fallback={<WebAppMainSurfaceFallback {...props.mainSurfaceHostProps} />}
    >
      <WebAppMainSurfaceHost {...props.mainSurfaceHostProps} />
    </Suspense>
    </div>
    {props.memberAgentDockProps.pageMode && <main className={`workspace community-mode community-agent-workspace${showSideAgent ? " community-workspace-secondary" : ""}`} style={{ display: showAgentWorkspace || showSideAgent ? undefined : "none" }}
      onKeyDown={event => { if (event.key === "Escape" && showSideAgent && !document.querySelector("dialog[open]")) { event.stopPropagation(); closeSideAgent(); } }}>
      <Suspense fallback={<div role="status">Loading agent…</div>}>
        <WebMemberAgentDock key={agentSessionKey} ref={props.memberAgentDockRef} {...props.memberAgentDockProps} pageActive={showAgentWorkspace || showSideAgent} />
      </Suspense>
    </main>}
    {props.memberAgentDockProps.pageMode && <WebDirectMessagesHost {...props.directMessagesHostProps} embedded={railEnabled} />}
    {(showSideAgent || showSideMessages) && <button className="icon-button workspace-secondary-minimize" type="button"
      aria-label="Minimize side panel" title="Minimize side panel" onClick={minimizePanel}><Minus size={18} aria-hidden="true" /></button>}
    </div>
  );

  return (
    <WebShellChromeHost
      {...props.shellChromeHostProps}
      desktopHeader={railEnabled ? { ...props.shellChromeHostProps.desktopHeader, directMessagesButton: null } : props.shellChromeHostProps.desktopHeader}
      rightRail={rightRail}
      mainSurface={mainSurface}
      globalOverlays={globalOverlays}
    />
  );
}
