import { useCallback, useRef } from "react";
import type { AppPage, AppView } from "../../../../shared/appShellNavigation";
import { buildWorkspaceDraftPath, buildWorkspaceThreadPath } from "../../../../shared/webAppRouteState";

type NavigateFn = (path: string, opts?: { replace?: boolean }) => void;

type UseWebWorkspaceRouteControllerArgs = {
  activePage: AppPage;
  activeView: AppView;
  activeThreadId: string | null;
  navigateTo: NavigateFn;
  setActivePage: (value: AppPage | ((prev: AppPage) => AppPage)) => void;
  setActiveView: (value: AppView | ((prev: AppView) => AppView)) => void;
  setActiveThreadId: (value: string | null | ((prev: string | null) => string | null)) => void;
  setWorkspaceWantsNewChatMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  setActiveCloudProjectId?: (value: string | null | ((prev: string | null) => string | null)) => void;
  setCloudProjectMenuProjectId?: (value: string | null | ((prev: string | null) => string | null)) => void;
};

export function useWebWorkspaceRouteController(args: UseWebWorkspaceRouteControllerArgs) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const syncWorkspaceSelection = useCallback(
    (opts: {
      threadId: string | null;
      wantsNewChat: boolean;
    }) => {
      const current = argsRef.current;
      current.setWorkspaceWantsNewChatMode(opts.wantsNewChat);
      current.setActiveThreadId(opts.threadId);
    },
    [],
  );

  const applyWorkspaceRouteState = useCallback(
    (opts: {
      page: AppPage;
      view: AppView;
      threadId: string | null;
    }) => {
      const isWorkspaceHome = opts.page === "workspace" && opts.view === "home";
      syncWorkspaceSelection({
        threadId: isWorkspaceHome ? opts.threadId : null,
        wantsNewChat: isWorkspaceHome && opts.threadId === null,
      });
    },
    [syncWorkspaceSelection],
  );

  const applyGuestWorkspaceState = useCallback(
    (opts: {
      guestThreadId: string;
      hasMessages: boolean;
    }) => {
      syncWorkspaceSelection({
        threadId: opts.hasMessages ? opts.guestThreadId : null,
        wantsNewChat: !opts.hasMessages,
      });
    },
    [syncWorkspaceSelection],
  );

  const openWorkspaceDraft = useCallback(
    (opts?: {
      replace?: boolean;
      projectId?: string | null;
      clearProjectMenu?: boolean;
      focusComposer?: () => void;
    }) => {
      const current = argsRef.current;
      if (opts?.projectId !== undefined) {
        current.setActiveCloudProjectId?.(opts.projectId);
      }
      if (opts?.clearProjectMenu) {
        current.setCloudProjectMenuProjectId?.(null);
      }
      current.setActivePage("workspace");
      current.setActiveView("home");
      current.setWorkspaceWantsNewChatMode(true);
      current.setActiveThreadId(null);
      current.navigateTo(buildWorkspaceDraftPath(), { replace: opts?.replace ?? true });
      opts?.focusComposer?.();
    },
    [],
  );

  const openWorkspaceThread = useCallback(
    (opts: {
      threadId: string;
      replace?: boolean;
      projectId?: string | null;
      beforeSelect?: () => void;
    }) => {
      const current = argsRef.current;
      opts.beforeSelect?.();
      if (opts.projectId !== undefined) {
        current.setActiveCloudProjectId?.(opts.projectId);
      }
      current.setActivePage("workspace");
      current.setActiveView("home");
      current.setWorkspaceWantsNewChatMode(false);
      current.setActiveThreadId(opts.threadId);
      current.navigateTo(buildWorkspaceThreadPath(opts.threadId), { replace: opts.replace ?? true });
    },
    [],
  );

  const handleNewWorkspaceThread = useCallback(
    (opts: {
      allowMultipleThreads: boolean;
      onBlocked: () => void;
      focusComposer?: () => void;
    }) => {
      const current = argsRef.current;
      if (!opts.allowMultipleThreads) {
        opts.onBlocked();
        return;
      }
      if (!current.activeThreadId && current.activePage === "workspace" && current.activeView === "home") {
        current.setWorkspaceWantsNewChatMode(true);
        current.navigateTo(buildWorkspaceDraftPath(), { replace: true });
        opts.focusComposer?.();
        return;
      }
      openWorkspaceDraft({ replace: true, focusComposer: opts.focusComposer });
    },
    [openWorkspaceDraft],
  );

  return {
    syncWorkspaceSelection,
    applyWorkspaceRouteState,
    applyGuestWorkspaceState,
    openWorkspaceDraft,
    openWorkspaceThread,
    handleNewWorkspaceThread,
  };
}
