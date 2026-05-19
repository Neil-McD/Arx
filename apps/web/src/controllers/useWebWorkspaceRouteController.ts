import { useCallback, useRef } from "react";
import type { AppPage, AppView } from "../../../../shared/appShellNavigation";
import {
  buildWorkspaceCommunityDraftPath,
  buildWorkspaceDraftPath,
  buildWorkspaceThreadPath,
} from "../../../../shared/webAppRouteState";

type NavigateFn = (path: string, opts?: { replace?: boolean }) => void;

type UseWebWorkspaceRouteControllerArgs = {
  activePage: AppPage;
  activeView: AppView;
  activeThreadId: string | null;
  activeCommunitySlug: string | null;
  navigateTo: NavigateFn;
  setActivePage: (value: AppPage | ((prev: AppPage) => AppPage)) => void;
  setActiveView: (value: AppView | ((prev: AppView) => AppView)) => void;
  setActiveThreadId: (value: string | null | ((prev: string | null) => string | null)) => void;
  setWorkspaceWantsNewChatMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  setActiveProjectId?: (value: string | null | ((prev: string | null) => string | null)) => void;
  syncCommunitySelection?: (opts: { communityId?: string | null; communitySlug?: string | null }) => void;
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
      communitySlug?: string | null;
      focusComposer?: () => void;
    }) => {
      const current = argsRef.current;
      if (opts?.projectId !== undefined) {
        current.setActiveProjectId?.(opts.projectId);
      }
      current.setActivePage("workspace");
      current.setActiveView("home");
      current.setWorkspaceWantsNewChatMode(true);
      current.setActiveThreadId(null);
      const requestedSlug =
        opts?.communitySlug !== undefined
          ? String(opts.communitySlug ?? "").trim() || null
          : String(current.activeCommunitySlug ?? "").trim() || null;
      current.navigateTo(buildWorkspaceCommunityDraftPath(requestedSlug) ?? buildWorkspaceDraftPath(), {
        replace: opts?.replace ?? true,
      });
      opts?.focusComposer?.();
    },
    [],
  );

  const openWorkspaceThread = useCallback(
    (opts: {
      threadId: string;
      replace?: boolean;
      projectId?: string | null;
    }) => {
      const current = argsRef.current;
      if (opts.projectId !== undefined) {
        current.setActiveProjectId?.(opts.projectId);
      }
      current.setActivePage("workspace");
      current.setActiveView("home");
      current.setWorkspaceWantsNewChatMode(false);
      current.setActiveThreadId(opts.threadId);
      current.navigateTo(buildWorkspaceThreadPath(opts.threadId), { replace: opts.replace ?? true });
    },
    [],
  );

  const enterWorkspaceThread = useCallback(
    (opts: {
      threadId: string;
      replace?: boolean;
      projectId?: string | null;
      communityId?: string | null;
      communitySlug?: string | null;
    }) => {
      const current = argsRef.current;
      if (opts.communityId !== undefined || opts.communitySlug !== undefined) {
        current.syncCommunitySelection?.({
          communityId: opts.communityId ?? null,
          communitySlug: opts.communitySlug,
        });
      }
      openWorkspaceThread({
        threadId: opts.threadId,
        replace: opts.replace,
        projectId: opts.projectId,
      });
    },
    [openWorkspaceThread],
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
        current.navigateTo(
          buildWorkspaceCommunityDraftPath(current.activeCommunitySlug) ?? buildWorkspaceDraftPath(),
          { replace: true },
        );
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
    enterWorkspaceThread,
    handleNewWorkspaceThread,
  };
}
