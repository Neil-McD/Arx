import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { AppPage, AppView } from "../../../../shared/appShellNavigation";
import type { ModelToggle } from "../../../../shared/modelCatalog";
import { useWebThreadMutationController } from "../../../../shared/useWebThreadMutationController";
import {
  emitWorkspaceEvent,
  formatWorkspaceInstrumentationError,
} from "../lib/workspaceInstrumentation";
import { useWebWorkspaceRouteController } from "./useWebWorkspaceRouteController";
import type { WebCloudProjectRecord } from "./useWebProjectUiController";

type ThreadLike = {
  id: string;
  title: string | null;
  model_id: string | null;
  project_id: string | null;
  community_id: string | null;
  context_version: number;
  agent_attention: boolean;
  last_seq: number;
  created_at: number;
  updated_at: number;
};

type WorkspaceProjectController<SessionT, ThreadT extends ThreadLike> = {
  state: {
    projects: WebCloudProjectRecord[];
    activeProjectId: string | null;
  };
  derived: {
    resolvedActiveProjectId: string | null;
    resolvedActiveProjectName: string;
    projectById: Map<string, WebCloudProjectRecord>;
    defaultProjectId: string | null;
    resolveThreadProjectId: (thread: ThreadT) => string | null;
  };
  actions: {
    setProjects: Dispatch<SetStateAction<WebCloudProjectRecord[]>>;
    setActiveProjectId: Dispatch<SetStateAction<string | null>>;
    loadProjects: (session: SessionT) => Promise<void>;
    handleProjectCreated: (project: WebCloudProjectRecord) => void;
    handleProjectUpdated: (project: WebCloudProjectRecord) => void;
    handleProjectDeleted: (project: WebCloudProjectRecord) => void;
  };
};

type UseWebWorkspaceCoreControllerParams<SessionT, ThreadT extends ThreadLike> = {
  project: WorkspaceProjectController<SessionT, ThreadT>;
  ensureSession: (session: SessionT) => Promise<SessionT | null>;
  activePage: AppPage;
  activeView: AppView;
  activeThreadId: string | null;
  activeCommunitySlug: string | null;
  navigateTo: (path: string, opts?: { replace?: boolean }) => void;
  setActivePage: Dispatch<SetStateAction<AppPage>>;
  setActiveView: Dispatch<SetStateAction<AppView>>;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
  setWorkspaceWantsNewChatMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  syncCommunitySelection?: (opts: { communityId?: string | null; communitySlug?: string | null }) => void;
  threads: ThreadT[];
  setThreads: Dispatch<SetStateAction<ThreadT[]>>;
  deriveThreadTitleFromUserText: (userText: string) => string | null;
  isMissingThreadTitleValue: (value: string | null | undefined) => boolean;
  toEpochSeconds: (value: string) => number;
  activeCommunityId: string | null;
  activeModelId: string | null;
  modelToggles: ModelToggle[];
  defaultActiveModelId: string;
};

export function useWebWorkspaceCoreController<SessionT, ThreadT extends ThreadLike>(
  params: UseWebWorkspaceCoreControllerParams<SessionT, ThreadT>,
) {
  const rawRoute = useWebWorkspaceRouteController({
    activePage: params.activePage,
    activeView: params.activeView,
    activeThreadId: params.activeThreadId,
    activeCommunitySlug: params.activeCommunitySlug,
    activeProjectId: params.project.state.activeProjectId,
    navigateTo: params.navigateTo,
    setActivePage: params.setActivePage,
    setActiveView: params.setActiveView,
    setActiveThreadId: params.setActiveThreadId,
    setWorkspaceWantsNewChatMode: params.setWorkspaceWantsNewChatMode,
    setActiveProjectId: params.project.actions.setActiveProjectId,
    syncCommunitySelection: params.syncCommunitySelection,
  });

  const rawThreadMutation = useWebThreadMutationController<SessionT>({
    deriveThreadTitleFromUserText: params.deriveThreadTitleFromUserText,
    isMissingThreadTitleValue: params.isMissingThreadTitleValue,
    toEpochSeconds: params.toEpochSeconds,
    activeCommunityId: params.activeCommunityId,
    activeProjectId: params.project.state.activeProjectId,
    activeModelId: params.activeModelId,
    modelToggles: params.modelToggles,
    threads: params.threads,
    defaultActiveModelId: params.defaultActiveModelId,
    ensureSession: params.ensureSession,
    setThreads: params.setThreads as Dispatch<SetStateAction<any[]>>,
    setWorkspaceWantsNewChatMode: params.setWorkspaceWantsNewChatMode,
    setActiveThreadId: params.setActiveThreadId,
  });

  const syncWorkspaceSelection = useCallback<typeof rawRoute.syncWorkspaceSelection>(
    (opts) => {
      emitWorkspaceEvent({
        scope: "route",
        name: "sync_workspace_selection",
        status: "start",
        projectId: params.project.derived.resolvedActiveProjectId,
        threadId: opts.threadId,
        page: params.activePage,
        view: params.activeView,
        detail: {
          wantsNewChat: opts.wantsNewChat,
        },
      });
      rawRoute.syncWorkspaceSelection(opts);
      emitWorkspaceEvent({
        scope: "route",
        name: "sync_workspace_selection",
        status: "success",
        projectId: params.project.derived.resolvedActiveProjectId,
        threadId: opts.threadId,
        page: params.activePage,
        view: params.activeView,
        detail: {
          wantsNewChat: opts.wantsNewChat,
        },
      });
    },
    [params.activePage, params.activeView, params.project.derived.resolvedActiveProjectId, rawRoute],
  );

  const applyWorkspaceRouteState = useCallback<typeof rawRoute.applyWorkspaceRouteState>(
    (opts) => {
      emitWorkspaceEvent({
        scope: "route",
        name: "apply_workspace_route_state",
        status: "start",
        projectId: params.project.derived.resolvedActiveProjectId,
        threadId: opts.threadId,
        page: opts.page,
        view: opts.view,
      });
      rawRoute.applyWorkspaceRouteState(opts);
      emitWorkspaceEvent({
        scope: "route",
        name: "apply_workspace_route_state",
        status: "success",
        projectId: params.project.derived.resolvedActiveProjectId,
        threadId: opts.threadId,
        page: opts.page,
        view: opts.view,
      });
    },
    [params.project.derived.resolvedActiveProjectId, rawRoute],
  );

  const applyGuestWorkspaceState = useCallback<typeof rawRoute.applyGuestWorkspaceState>(
    (opts) => {
      emitWorkspaceEvent({
        scope: "route",
        name: "apply_guest_workspace_state",
        status: "start",
        projectId: params.project.derived.resolvedActiveProjectId,
        threadId: opts.hasMessages ? opts.guestThreadId : null,
        page: params.activePage,
        view: params.activeView,
        detail: {
          hasMessages: opts.hasMessages,
        },
      });
      rawRoute.applyGuestWorkspaceState(opts);
      emitWorkspaceEvent({
        scope: "route",
        name: "apply_guest_workspace_state",
        status: "success",
        projectId: params.project.derived.resolvedActiveProjectId,
        threadId: opts.hasMessages ? opts.guestThreadId : null,
        page: params.activePage,
        view: params.activeView,
        detail: {
          hasMessages: opts.hasMessages,
        },
      });
    },
    [params.activePage, params.activeView, params.project.derived.resolvedActiveProjectId, rawRoute],
  );

  const openWorkspaceDraft = useCallback<typeof rawRoute.openWorkspaceDraft>(
    (opts) => {
      emitWorkspaceEvent({
        scope: "route",
        name: "open_workspace_draft",
        status: "start",
        projectId: opts?.projectId ?? params.project.derived.resolvedActiveProjectId,
        page: params.activePage,
        view: params.activeView,
        detail: {
          replace: opts?.replace ?? true,
          hasFocusComposer: Boolean(opts?.focusComposer),
        },
      });
      rawRoute.openWorkspaceDraft(opts);
      emitWorkspaceEvent({
        scope: "route",
        name: "open_workspace_draft",
        status: "success",
        projectId: opts?.projectId ?? params.project.derived.resolvedActiveProjectId,
        page: "workspace",
        view: "home",
        detail: {
          replace: opts?.replace ?? true,
        },
      });
    },
    [params.activePage, params.activeView, params.project.derived.resolvedActiveProjectId, rawRoute],
  );

  const openWorkspaceThread = useCallback<typeof rawRoute.openWorkspaceThread>(
    (opts) => {
      emitWorkspaceEvent({
        scope: "route",
        name: "open_workspace_thread",
        status: "start",
        projectId: opts.projectId ?? params.project.derived.resolvedActiveProjectId,
        threadId: opts.threadId,
        page: params.activePage,
        view: params.activeView,
        detail: {
          replace: opts.replace ?? true,
        },
      });
      rawRoute.openWorkspaceThread(opts);
      emitWorkspaceEvent({
        scope: "route",
        name: "open_workspace_thread",
        status: "success",
        projectId: opts.projectId ?? params.project.derived.resolvedActiveProjectId,
        threadId: opts.threadId,
        page: "workspace",
        view: "home",
      });
    },
    [params.activePage, params.activeView, params.project.derived.resolvedActiveProjectId, rawRoute],
  );

  const enterWorkspaceThread = useCallback<typeof rawRoute.enterWorkspaceThread>(
    (opts) => {
      emitWorkspaceEvent({
        scope: "route",
        name: "enter_workspace_thread",
        status: "start",
        projectId: opts.projectId ?? params.project.derived.resolvedActiveProjectId,
        threadId: opts.threadId,
        page: params.activePage,
        view: params.activeView,
        detail: {
          communityId: opts.communityId ?? null,
          replace: opts.replace ?? true,
        },
      });
      rawRoute.enterWorkspaceThread(opts);
      emitWorkspaceEvent({
        scope: "route",
        name: "enter_workspace_thread",
        status: "success",
        projectId: opts.projectId ?? params.project.derived.resolvedActiveProjectId,
        threadId: opts.threadId,
        page: "workspace",
        view: "home",
        detail: {
          communityId: opts.communityId ?? null,
        },
      });
    },
    [params.activePage, params.activeView, params.project.derived.resolvedActiveProjectId, rawRoute],
  );

  const handleNewWorkspaceThread = useCallback<typeof rawRoute.handleNewWorkspaceThread>(
    (opts) => {
      emitWorkspaceEvent({
        scope: "route",
        name: "new_workspace_thread",
        status: "start",
        projectId: params.project.derived.resolvedActiveProjectId,
        page: params.activePage,
        view: params.activeView,
        detail: {
          allowMultipleThreads: opts.allowMultipleThreads,
          hasFocusComposer: Boolean(opts.focusComposer),
        },
      });
      rawRoute.handleNewWorkspaceThread(opts);
      emitWorkspaceEvent({
        scope: "route",
        name: "new_workspace_thread",
        status: "success",
        projectId: params.project.derived.resolvedActiveProjectId,
        page: "workspace",
        view: "home",
      });
    },
    [params.activePage, params.activeView, params.project.derived.resolvedActiveProjectId, rawRoute],
  );

  const createThread = useCallback<typeof rawThreadMutation.createThread>(
    async (session) => {
      emitWorkspaceEvent({
        scope: "thread",
        name: "thread_create",
        status: "start",
        projectId: params.project.derived.resolvedActiveProjectId,
        detail: {
          communityId: params.activeCommunityId,
          activeModelId: params.activeModelId,
        },
      });
      try {
        const thread = await rawThreadMutation.createThread(session);
        if (!thread) {
          emitWorkspaceEvent({
            scope: "thread",
            name: "thread_create",
            status: "failure",
            projectId: params.project.derived.resolvedActiveProjectId,
            error: "thread_not_created",
          });
          return thread;
        }
        emitWorkspaceEvent({
          scope: "thread",
          name: "thread_create",
          status: "success",
          projectId: thread.project_id ?? null,
          threadId: thread.id,
          detail: {
            communityId: thread.community_id ?? null,
            modelId: thread.model_id ?? null,
          },
        });
        return thread;
      } catch (error) {
        emitWorkspaceEvent({
          scope: "thread",
          name: "thread_create",
          status: "failure",
          projectId: params.project.derived.resolvedActiveProjectId,
          error: formatWorkspaceInstrumentationError(error),
        });
        throw error;
      }
    },
    [
      params.activeCommunityId,
      params.activeModelId,
      params.project.derived.resolvedActiveProjectId,
      rawThreadMutation,
    ],
  );

  const updateThreadModel = useCallback<typeof rawThreadMutation.updateThreadModel>(
    async (threadId, modelId, session) => {
      emitWorkspaceEvent({
        scope: "thread",
        name: "thread_update_model",
        status: "start",
        projectId: params.project.derived.resolvedActiveProjectId,
        threadId,
        detail: {
          modelId,
        },
      });
      try {
        await rawThreadMutation.updateThreadModel(threadId, modelId, session);
        emitWorkspaceEvent({
          scope: "thread",
          name: "thread_update_model",
          status: "success",
          projectId: params.project.derived.resolvedActiveProjectId,
          threadId,
          detail: {
            modelId,
          },
        });
      } catch (error) {
        emitWorkspaceEvent({
          scope: "thread",
          name: "thread_update_model",
          status: "failure",
          projectId: params.project.derived.resolvedActiveProjectId,
          threadId,
          detail: {
            modelId,
          },
          error: formatWorkspaceInstrumentationError(error),
        });
        throw error;
      }
    },
    [params.project.derived.resolvedActiveProjectId, rawThreadMutation],
  );

  const maybeSetThreadTitleFromText = useCallback<typeof rawThreadMutation.maybeSetThreadTitleFromText>(
    async (threadId, userText, session) => {
      emitWorkspaceEvent({
        scope: "thread",
        name: "thread_set_title",
        status: "start",
        projectId: params.project.derived.resolvedActiveProjectId,
        threadId,
        detail: {
          textLength: userText.length,
        },
      });
      try {
        await rawThreadMutation.maybeSetThreadTitleFromText(threadId, userText, session);
        emitWorkspaceEvent({
          scope: "thread",
          name: "thread_set_title",
          status: "success",
          projectId: params.project.derived.resolvedActiveProjectId,
          threadId,
        });
      } catch (error) {
        emitWorkspaceEvent({
          scope: "thread",
          name: "thread_set_title",
          status: "failure",
          projectId: params.project.derived.resolvedActiveProjectId,
          threadId,
          error: formatWorkspaceInstrumentationError(error),
        });
        throw error;
      }
    },
    [params.project.derived.resolvedActiveProjectId, rawThreadMutation],
  );

  const setThreadCommunityLens = useCallback<typeof rawThreadMutation.setThreadCommunityLens>(
    async (threadId, communityId, session) => {
      emitWorkspaceEvent({
        scope: "thread",
        name: "thread_set_lens",
        status: "start",
        projectId: params.project.derived.resolvedActiveProjectId,
        threadId,
        detail: {
          communityId,
        },
      });
      try {
        const result = await rawThreadMutation.setThreadCommunityLens(threadId, communityId, session);
        if (!result) {
          emitWorkspaceEvent({
            scope: "thread",
            name: "thread_set_lens",
            status: "failure",
            projectId: params.project.derived.resolvedActiveProjectId,
            threadId,
            detail: {
              communityId,
            },
            error: "lens_not_updated",
          });
          return result;
        }
        emitWorkspaceEvent({
          scope: "thread",
          name: "thread_set_lens",
          status: "success",
          projectId: params.project.derived.resolvedActiveProjectId,
          threadId,
          detail: {
            communityId: result.community_id,
            contextVersion: result.context_version,
          },
        });
        return result;
      } catch (error) {
        emitWorkspaceEvent({
          scope: "thread",
          name: "thread_set_lens",
          status: "failure",
          projectId: params.project.derived.resolvedActiveProjectId,
          threadId,
          detail: {
            communityId,
          },
          error: formatWorkspaceInstrumentationError(error),
        });
        throw error;
      }
    },
    [params.project.derived.resolvedActiveProjectId, rawThreadMutation],
  );

  return {
    project: params.project,
    route: {
      ...rawRoute,
      syncWorkspaceSelection,
      applyWorkspaceRouteState,
      applyGuestWorkspaceState,
      openWorkspaceDraft,
      openWorkspaceThread,
      enterWorkspaceThread,
      handleNewWorkspaceThread,
    },
    threadMutation: {
      ...rawThreadMutation,
      createThread,
      updateThreadModel,
      maybeSetThreadTitleFromText,
      setThreadCommunityLens,
    },
  };
}
