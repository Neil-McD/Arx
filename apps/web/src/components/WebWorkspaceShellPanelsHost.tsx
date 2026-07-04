import type { ReactNode } from "react";
import {
  WebMobileThreadsRootSurface,
  WebWorkspaceShellPanels,
  type WebWorkspaceShellPanelsProps,
} from "./WebWorkspaceShellPanels";
import { WebWorkspaceSidebarStateHost } from "./WebWorkspaceSidebarStateHost";
import type { ProjectLike } from "./threadSidebarContracts";

type ThreadLike = {
  id: string;
};

type WebWorkspaceShellPanelsHostProps<
  TThread extends ThreadLike,
  TProject extends ProjectLike,
> = Pick<
  WebWorkspaceShellPanelsProps<TThread, TProject>,
  | "sessionsDrawerEnabled"
  | "isSessionsDrawerOpen"
  | "showMobileAppShell"
  | "showMobileShell"
  | "mobileOverlay"
  | "setMobileOverlay"
  | "threadError"
  | "displayedThreadError"
  | "showGuestSignInAction"
  | "session"
  | "hasAuthenticatedPresentation"
  | "isAuthRecoveringSignedIn"
  | "authError"
  | "requireSignIn"
  | "openMobileAgentSettings"
  | "activeThreadId"
  | "guestThreadId"
  | "guestThreadHasMessages"
  | "guestThreadPreview"
  | "renderProjectToolbarAction"
  | "getThreadDisplayTitle"
  | "selectThread"
  | "startDraftInProject"
  | "editProject"
  | "deleteProject"
  | "applyGuestWorkspaceState"
  | "resetGuestThread"
> & {
  threads: TThread[];
  projects: TProject[];
  resolveThreadProjectId: (thread: TThread) => string | null;
  getThreadSearchText: (thread: TThread) => string;
};

export function WebWorkspaceShellPanelsHost<
  TThread extends ThreadLike,
  TProject extends ProjectLike,
>(props: WebWorkspaceShellPanelsHostProps<TThread, TProject>) {
  return (
    <WebWorkspaceSidebarStateHost<TThread, TProject>
      threads={props.threads}
      projects={props.projects}
      resolveThreadProjectId={props.resolveThreadProjectId}
      getThreadSearchText={props.getThreadSearchText}
    >
      {(sidebar) => (
        <WebWorkspaceShellPanels<TThread, TProject>
          sessionsDrawerEnabled={props.sessionsDrawerEnabled}
          isSessionsDrawerOpen={props.isSessionsDrawerOpen}
          showMobileAppShell={props.showMobileAppShell}
          showMobileShell={props.showMobileShell}
          mobileOverlay={props.mobileOverlay}
          setMobileOverlay={props.setMobileOverlay}
          sidebar={sidebar}
          threadError={props.threadError}
          displayedThreadError={props.displayedThreadError}
          showGuestSignInAction={props.showGuestSignInAction}
          session={props.session}
          hasAuthenticatedPresentation={props.hasAuthenticatedPresentation}
          isAuthRecoveringSignedIn={props.isAuthRecoveringSignedIn}
          authError={props.authError}
          requireSignIn={props.requireSignIn}
          openMobileAgentSettings={props.openMobileAgentSettings}
          activeThreadId={props.activeThreadId}
          guestThreadId={props.guestThreadId}
          guestThreadHasMessages={props.guestThreadHasMessages}
          guestThreadPreview={props.guestThreadPreview}
          renderProjectToolbarAction={props.renderProjectToolbarAction}
          getThreadDisplayTitle={props.getThreadDisplayTitle}
          selectThread={props.selectThread}
          startDraftInProject={props.startDraftInProject}
          editProject={props.editProject}
          deleteProject={props.deleteProject}
          applyGuestWorkspaceState={props.applyGuestWorkspaceState}
          resetGuestThread={props.resetGuestThread}
        />
      )}
    </WebWorkspaceSidebarStateHost>
  );
}

export function WebMobileThreadsRootSurfaceHost<
  TThread extends ThreadLike,
  TProject extends ProjectLike,
>(
  props: WebWorkspaceShellPanelsHostProps<TThread, TProject> & {
    onExitThreadsRoot: () => void;
  },
) {
  return (
    <WebWorkspaceSidebarStateHost<TThread, TProject>
      threads={props.threads}
      projects={props.projects}
      resolveThreadProjectId={props.resolveThreadProjectId}
      getThreadSearchText={props.getThreadSearchText}
    >
      {(sidebar) => (
        <WebMobileThreadsRootSurface<TThread, TProject>
          sessionsDrawerEnabled={props.sessionsDrawerEnabled}
          isSessionsDrawerOpen={props.isSessionsDrawerOpen}
          showMobileAppShell={props.showMobileAppShell}
          showMobileShell={props.showMobileShell}
          mobileOverlay={props.mobileOverlay}
          setMobileOverlay={props.setMobileOverlay}
          sidebar={sidebar}
          threadError={props.threadError}
          displayedThreadError={props.displayedThreadError}
          showGuestSignInAction={props.showGuestSignInAction}
          session={props.session}
          hasAuthenticatedPresentation={props.hasAuthenticatedPresentation}
          isAuthRecoveringSignedIn={props.isAuthRecoveringSignedIn}
          authError={props.authError}
          requireSignIn={props.requireSignIn}
          openMobileAgentSettings={props.openMobileAgentSettings}
          activeThreadId={props.activeThreadId}
          guestThreadId={props.guestThreadId}
          guestThreadHasMessages={props.guestThreadHasMessages}
          guestThreadPreview={props.guestThreadPreview}
          renderProjectToolbarAction={props.renderProjectToolbarAction}
          getThreadDisplayTitle={props.getThreadDisplayTitle}
          selectThread={props.selectThread}
          startDraftInProject={props.startDraftInProject}
          editProject={props.editProject}
          deleteProject={props.deleteProject}
          applyGuestWorkspaceState={props.applyGuestWorkspaceState}
          resetGuestThread={props.resetGuestThread}
          onExitThreadsRoot={props.onExitThreadsRoot}
        />
      )}
    </WebWorkspaceSidebarStateHost>
  );
}
