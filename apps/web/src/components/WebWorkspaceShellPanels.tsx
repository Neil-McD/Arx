import type { ReactNode } from "react";
import { WebMobileDrawer } from "./WebMobileDrawer";
import { WebThreadSidebarPanel } from "./WebThreadSidebarPanel";
import type { WorkspaceSidebarState } from "./WebWorkspaceSidebarStateHost";
import type { ProjectLike } from "./threadSidebarContracts";

type MobileOverlay = "agent" | "community" | "community_selector" | null;

type ThreadLike = {
  id: string;
  agent_attention?: boolean;
};

export type WebWorkspaceShellPanelsProps<TThread extends ThreadLike, TProject extends ProjectLike> = {
  sessionsDrawerEnabled: boolean;
  isSessionsDrawerOpen: boolean;
  showMobileAppShell: boolean;
  showMobileShell: boolean;
  mobileOverlay: MobileOverlay;
  setMobileOverlay: (value: MobileOverlay) => void;
  sidebar: WorkspaceSidebarState<TThread, TProject>;
  threadError: string | null;
  displayedThreadError: ReactNode;
  showGuestSignInAction: boolean;
  session: unknown | null;
  hasAuthenticatedPresentation: boolean;
  isAuthRecoveringSignedIn: boolean;
  authError: string | null;
  requireSignIn: () => void;
  openMobileAgentSettings: () => void;
  activeThreadId: string | null;
  guestThreadId: string;
  guestThreadHasMessages: boolean;
  guestThreadPreview: string;
  renderProjectToolbarAction: () => ReactNode;
  getThreadDisplayTitle: (thread: TThread) => string;
  selectThread: (thread: TThread) => void;
  startDraftInProject: (projectId: string) => void;
  editProject: (project: TProject) => void | Promise<void>;
  deleteProject: (project: TProject) => void | Promise<void>;
  applyGuestWorkspaceState: (params: { guestThreadId: string; hasMessages: boolean }) => void;
  resetGuestThread: () => void;
};

export function WebWorkspaceShellPanels<TThread extends ThreadLike, TProject extends ProjectLike>(
  props: WebWorkspaceShellPanelsProps<TThread, TProject>,
) {
  const renderCloudSidebar = (closeOverlay?: () => void, showWorkspaceToolbar = false) => (
    <WebThreadSidebarPanel<TThread, TProject>
      showThreadLaneSwitch={false}
      showWorkspaceToolbar={showWorkspaceToolbar}
      projectToolbarAction={props.renderProjectToolbarAction()}
      state={{
        threadLaneFilter: "chat",
        threadSearchQuery: props.sidebar.threadSearchQuery,
        normalizedThreadSearch: props.sidebar.normalizedThreadSearch,
        threadSearchResults: props.sidebar.threadSearchResults,
        projectThreadGroups: props.sidebar.projectThreadGroups,
        projectExpandedById: props.sidebar.projectExpandedById,
        generalThreads: [],
        agentThreadsCount: 0,
        chatThreadsCount: props.sidebar.visibleThreadsCount,
        showChatSignInPrompt: false,
      }}
      actions={{
        onThreadLaneFilterChange: () => {},
        onThreadSearchQueryChange: props.sidebar.setThreadSearchQuery,
        onToggleProjectExpanded: props.sidebar.toggleProjectExpanded,
        onStartDraftInProject: (project) => {
          closeOverlay?.();
          props.startDraftInProject(project.id);
        },
        onEditProject: async (project) => {
          closeOverlay?.();
          await props.editProject(project);
        },
        onDeleteProject: async (project) => {
          closeOverlay?.();
          await props.deleteProject(project);
        },
        renderSessionItem: (thread) => (
          <div
            key={thread.id}
            className={`session-item${thread.id === props.activeThreadId ? " active" : ""}`}
            onClick={() => {
              closeOverlay?.();
              props.selectThread(thread);
            }}
          >
            <div className="session-content">
              <div className="session-title">{props.getThreadDisplayTitle(thread)}</div>
            </div>
            {thread.agent_attention ? (
              <div className="session-meta session-meta-attention" aria-hidden="true">
                <span className="session-attention-dot" />
              </div>
            ) : null}
          </div>
        ),
      }}
    />
  );

  const renderDesktopGuestSidebar = () => (
    <div className="session-list">
      <div
        className={`session-item${(props.activeThreadId === props.guestThreadId || (!props.activeThreadId && !props.guestThreadHasMessages)) ? " active" : ""}`}
        onClick={() => {
          props.applyGuestWorkspaceState({
            guestThreadId: props.guestThreadId,
            hasMessages: props.guestThreadHasMessages,
          });
        }}
      >
        <div className="session-content">
          <div className="session-title">Preview thread</div>
          <div className="session-preview">{props.guestThreadPreview}</div>
        </div>
      </div>
      <div className="guest-thread-signin">
        <p className="guest-thread-signin-title">Create your free account</p>
        <p className="guest-thread-signin-copy">
          Save this chat, unlock more models, use your ChatGPT Plus / Pro access on Polynet, and discover communities, agents, and apps across the network.
        </p>
        {props.authError ? <div className="auth-error">{props.authError}</div> : null}
        <button
          type="button"
          className="auth-gate-google-button guest-thread-google-button"
          onClick={() => props.requireSignIn()}
        >
          Continue to sign in
        </button>
        <button
          type="button"
          className="guest-thread-reset-button"
          disabled={!props.guestThreadHasMessages}
          onClick={() => {
            if (!props.guestThreadHasMessages) return;
            const confirmed = window.confirm("Clear this preview chat from this browser?");
            if (!confirmed) return;
            props.resetGuestThread();
          }}
        >
          Start fresh
        </button>
      </div>
    </div>
  );

  const renderRecoveringSidebar = () => (
    <div className="session-list">
      <div className="guest-thread-signin">
        <p className="guest-thread-signin-title">Restoring your account</p>
        <p className="guest-thread-signin-copy">
          Reloading your threads, projects, and connected account state.
        </p>
      </div>
    </div>
  );

  const renderMobileGuestSidebar = () => (
    <>
      <div className="session-search-row">
        <div className="session-search" role="search" aria-label="Preview threads">
          <svg className="session-search-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input value="" readOnly aria-label="Search threads" placeholder="Search threads…" />
        </div>
      </div>
      <button
        type="button"
        className="auth-gate-google-button mobile-agent-drawer-google"
        onClick={() => {
          props.setMobileOverlay(null);
          props.requireSignIn();
        }}
      >
          Continue to sign in
      </button>
      <div className="mobile-agent-drawer-caption">
        Unlock more models, use your ChatGPT Plus / Pro access on Polynet, and discover communities, agents, and apps across the network.
      </div>
      <div className="session-list">
        <div
          className={`session-item${(props.activeThreadId === props.guestThreadId || (!props.activeThreadId && !props.guestThreadHasMessages)) ? " active" : ""}`}
          onClick={() => {
            props.setMobileOverlay(null);
            props.applyGuestWorkspaceState({
              guestThreadId: props.guestThreadId,
              hasMessages: props.guestThreadHasMessages,
            });
          }}
        >
          <div className="session-content">
            <div className="session-title">Preview thread</div>
            <div className="session-preview">{props.guestThreadPreview}</div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {!props.showMobileAppShell && props.sessionsDrawerEnabled && (
        <aside
          className={`sessions web-sessions-drawer${props.isSessionsDrawerOpen ? " open" : ""}`}
          aria-hidden={!props.isSessionsDrawerOpen}
        >
          {props.threadError && (
            <div className="auth-error">
              {props.displayedThreadError}
                  {!props.hasAuthenticatedPresentation && props.showGuestSignInAction ? (
                    <button type="button" className="auth-error-link" onClick={() => props.requireSignIn()}>
                      Sign in
                    </button>
                  ) : null}
                </div>
              )}
          {props.session
            ? renderCloudSidebar(undefined, true)
            : props.hasAuthenticatedPresentation
              ? renderRecoveringSidebar()
              : renderDesktopGuestSidebar()}
        </aside>
      )}

      {props.showMobileShell && (
        <WebMobileDrawer
          isOpen={props.mobileOverlay === "agent"}
          ariaLabel="Agent navigation"
          className="mobile-agent-drawer"
          hideHeader={true}
          footer={
            <div className="mobile-agent-drawer-footer">
              <button
                type="button"
                className="mobile-agent-drawer-settings-link"
                onClick={props.openMobileAgentSettings}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Settings
              </button>
            </div>
          }
          onClose={() => props.setMobileOverlay(null)}
        >
          <div className="mobile-agent-drawer-content">
            <div className="mobile-agent-drawer-main">
              {props.threadError && (
                <div className="auth-error">
                  {props.displayedThreadError}
                  {!props.hasAuthenticatedPresentation && props.showGuestSignInAction ? (
                    <button type="button" className="auth-error-link" onClick={() => props.requireSignIn()}>
                      Sign in
                    </button>
                  ) : null}
                </div>
              )}
              {props.session ? (
                <div className="thread-sidebar-panel">{renderCloudSidebar(() => props.setMobileOverlay(null), true)}</div>
              ) : props.hasAuthenticatedPresentation ? (
                renderRecoveringSidebar()
              ) : (
                renderMobileGuestSidebar()
              )}
            </div>
          </div>
        </WebMobileDrawer>
      )}
    </>
  );
}
