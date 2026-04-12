import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ModelToggle } from "../../../../shared/modelCatalog";

import {
  hydrateWorkspaceSurfaceState,
  resetWorkspaceSurfaceState,
  resumeWorkspaceSurfaceState,
} from "./workspaceSurfaceLifecycle";
import type { WorkspacePickerModel } from "./useWebWorkspaceModelStateController";
import type { WebCloudProjectRecord } from "./useWebProjectUiController";

type ThreadLike = {
  id: string;
  project_id: string | null;
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

type WorkspaceModelController = {
  state: {
    guestModelId: string;
    modelPickerOpenRequestKey: number;
  };
  derived: {
    activeModelLabel: string;
    curatedPickerModels: WorkspacePickerModel[];
    selectedModelId: string;
    selectedPickerModelId: string | null;
    modelToggles: ModelToggle[];
    hasUserKeyConnection: boolean;
    hasUserChatgptConnection: boolean;
    canSelectPickerModel: (model: WorkspacePickerModel) => boolean;
  };
  actions: {
    selectPickerModel: (model: WorkspacePickerModel) => void;
    requestModelPickerOpen: () => void;
  };
};

type UseWebWorkspaceSurfaceControllerParams<
  SessionT,
  ThreadT extends ThreadLike,
  ThreadMessageT,
  ThreadStreamingStateT,
  RuntimeEventT,
> = {
  activeThreadId: string | null;
  workspaceWantsNewChat: boolean;
  project: WorkspaceProjectController<SessionT, ThreadT>;
  model: WorkspaceModelController;
  resetWorkspaceComposer: () => void;
  threadsHydratedRef: MutableRefObject<boolean>;
  setThreads: Dispatch<SetStateAction<ThreadT[]>>;
  setThreadError: Dispatch<SetStateAction<string | null>>;
  setThreadErrorById: Dispatch<SetStateAction<Record<string, string | null>>>;
  setWorkspaceWantsNewChatMode: (next: SetStateAction<boolean>) => void;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
  setThreadMessages: Dispatch<SetStateAction<ThreadMessageT[]>>;
  setIsSendingMessage: Dispatch<SetStateAction<boolean>>;
  setThreadSendingStateById: Dispatch<SetStateAction<Record<string, boolean>>>;
  setThreadStreamingStateById: Dispatch<SetStateAction<Record<string, ThreadStreamingStateT>>>;
  setRuntimeEventsByRunId: Dispatch<SetStateAction<Record<string, RuntimeEventT[]>>>;
  setLoadingThreadMessagesThreadId: Dispatch<SetStateAction<string | null>>;
  loadThreads: (session: SessionT) => Promise<void>;
  loadModelRegistry: (session: SessionT) => Promise<void>;
};

export function useWebWorkspaceSurfaceController<
  SessionT,
  ThreadT extends ThreadLike,
  ThreadMessageT,
  ThreadStreamingStateT,
  RuntimeEventT,
>(
  params: UseWebWorkspaceSurfaceControllerParams<
    SessionT,
    ThreadT,
    ThreadMessageT,
    ThreadStreamingStateT,
    RuntimeEventT
  >,
) {
  const resetSurfaceState = useCallback(() => {
    resetWorkspaceSurfaceState({
      resetWorkspaceComposer: params.resetWorkspaceComposer,
      threadsHydratedRef: params.threadsHydratedRef,
      setProjects: params.project.actions.setProjects,
      setActiveProjectId: params.project.actions.setActiveProjectId,
      setThreads: params.setThreads,
      setThreadError: params.setThreadError,
      setThreadErrorById: params.setThreadErrorById,
      setWorkspaceWantsNewChatMode: params.setWorkspaceWantsNewChatMode,
      setActiveThreadId: params.setActiveThreadId,
      setThreadMessages: params.setThreadMessages,
      setIsSendingMessage: params.setIsSendingMessage,
      setThreadSendingStateById: params.setThreadSendingStateById,
      setThreadStreamingStateById: params.setThreadStreamingStateById,
      setRuntimeEventsByRunId: params.setRuntimeEventsByRunId,
      setLoadingThreadMessagesThreadId: params.setLoadingThreadMessagesThreadId,
    });
  }, [params]);

  const hydrateSurfaceState = useCallback(
    async (session: SessionT): Promise<void> =>
      hydrateWorkspaceSurfaceState(
        {
          threadsHydratedRef: params.threadsHydratedRef,
          loadWorkspaceProjects: params.project.actions.loadProjects,
          loadThreads: params.loadThreads,
          loadModelRegistry: params.loadModelRegistry,
        },
        session,
      ),
    [params],
  );

  const resumeSurfaceState = useCallback(
    async (session: SessionT): Promise<void> =>
      resumeWorkspaceSurfaceState(
        {
          threadsHydratedRef: params.threadsHydratedRef,
          loadWorkspaceProjects: params.project.actions.loadProjects,
          loadThreads: params.loadThreads,
          loadModelRegistry: params.loadModelRegistry,
        },
        session,
      ),
    [params],
  );

  return {
    state: {
      identity: {
        activeThreadId: params.activeThreadId,
        activeProjectId: params.project.state.activeProjectId,
        workspaceWantsNewChat: params.workspaceWantsNewChat,
      },
      projects: params.project.state.projects,
      guestModelId: params.model.state.guestModelId,
      modelPickerOpenRequestKey: params.model.state.modelPickerOpenRequestKey,
    },
    derived: {
      resolvedActiveProjectId: params.project.derived.resolvedActiveProjectId,
      resolvedActiveProjectName: params.project.derived.resolvedActiveProjectName,
      projectById: params.project.derived.projectById,
      defaultProjectId: params.project.derived.defaultProjectId,
      resolveThreadProjectId: params.project.derived.resolveThreadProjectId,
      activeModelLabel: params.model.derived.activeModelLabel,
      curatedPickerModels: params.model.derived.curatedPickerModels,
      selectedModelId: params.model.derived.selectedModelId,
      selectedPickerModelId: params.model.derived.selectedPickerModelId,
      modelToggles: params.model.derived.modelToggles,
      hasUserKeyConnection: params.model.derived.hasUserKeyConnection,
      hasUserChatgptConnection: params.model.derived.hasUserChatgptConnection,
      canSelectPickerModel: params.model.derived.canSelectPickerModel,
    },
    actions: {
      setActiveProjectId: params.project.actions.setActiveProjectId,
      loadProjects: params.project.actions.loadProjects,
      handleProjectCreated: params.project.actions.handleProjectCreated,
      handleProjectUpdated: params.project.actions.handleProjectUpdated,
      handleProjectDeleted: params.project.actions.handleProjectDeleted,
      selectPickerModel: params.model.actions.selectPickerModel,
      requestModelPickerOpen: params.model.actions.requestModelPickerOpen,
      resetWorkspaceSurfaceState: resetSurfaceState,
      hydrateWorkspaceSurfaceState: hydrateSurfaceState,
      resumeWorkspaceSurfaceState: resumeSurfaceState,
    },
  };
}
