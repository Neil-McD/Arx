import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  emitWorkspaceEvent,
  formatWorkspaceInstrumentationError,
} from "../lib/workspaceInstrumentation";

type WorkspaceSurfaceResetDeps<ProjectT, ThreadT, ThreadMessageT, ThreadStreamingStateT, RuntimeEventT> = {
  resetWorkspaceComposer: () => void;
  threadsHydratedRef: MutableRefObject<boolean>;
  setProjects: Dispatch<SetStateAction<ProjectT[]>>;
  setActiveProjectId: Dispatch<SetStateAction<string | null>>;
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
};

type WorkspaceSurfaceHydrationDeps<SessionT> = {
  threadsHydratedRef: MutableRefObject<boolean>;
  loadWorkspaceProjects: (session: SessionT) => Promise<void>;
  loadThreads: (session: SessionT) => Promise<void>;
  loadModelRegistry: (session: SessionT) => Promise<void>;
};

export function resetWorkspaceSurfaceState<
  ProjectT,
  ThreadT,
  ThreadMessageT,
  ThreadStreamingStateT,
  RuntimeEventT,
>(deps: WorkspaceSurfaceResetDeps<ProjectT, ThreadT, ThreadMessageT, ThreadStreamingStateT, RuntimeEventT>): void {
  emitWorkspaceEvent({
    scope: "lifecycle",
    name: "workspace_reset",
    status: "start",
    detail: {
      threadsHydratedBefore: deps.threadsHydratedRef.current,
    },
  });
  deps.resetWorkspaceComposer();
  deps.threadsHydratedRef.current = false;
  deps.setProjects([]);
  deps.setActiveProjectId(null);
  deps.setThreads([]);
  deps.setThreadError(null);
  deps.setThreadErrorById({});
  deps.setWorkspaceWantsNewChatMode(false);
  deps.setActiveThreadId(null);
  deps.setThreadMessages([]);
  deps.setIsSendingMessage(false);
  deps.setThreadSendingStateById({});
  deps.setThreadStreamingStateById({});
  deps.setRuntimeEventsByRunId({});
  deps.setLoadingThreadMessagesThreadId(null);
  emitWorkspaceEvent({
    scope: "lifecycle",
    name: "workspace_reset",
    status: "success",
    detail: {
      threadsHydratedAfter: deps.threadsHydratedRef.current,
    },
  });
}

export async function hydrateWorkspaceSurfaceState<SessionT>(
  deps: WorkspaceSurfaceHydrationDeps<SessionT>,
  session: SessionT,
): Promise<void> {
  emitWorkspaceEvent({
    scope: "lifecycle",
    name: "workspace_hydrate",
    status: "start",
    detail: {
      threadsHydratedBefore: deps.threadsHydratedRef.current,
      sessionPresent: Boolean(session),
    },
  });
  deps.threadsHydratedRef.current = false;
  try {
    await Promise.all([
      deps.loadWorkspaceProjects(session),
      deps.loadThreads(session),
      deps.loadModelRegistry(session),
    ]);
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "workspace_hydrate",
      status: "success",
      detail: {
        threadsHydratedAfter: deps.threadsHydratedRef.current,
      },
    });
  } catch (error) {
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "workspace_hydrate",
      status: "failure",
      detail: {
        threadsHydratedAfter: deps.threadsHydratedRef.current,
      },
      error: formatWorkspaceInstrumentationError(error),
    });
    throw error;
  }
}

export async function resumeWorkspaceSurfaceState<SessionT>(
  deps: WorkspaceSurfaceHydrationDeps<SessionT>,
  session: SessionT,
): Promise<void> {
  emitWorkspaceEvent({
    scope: "lifecycle",
    name: "workspace_resume",
    status: "start",
    detail: {
      threadsHydratedBefore: deps.threadsHydratedRef.current,
      sessionPresent: Boolean(session),
    },
  });
  try {
    await Promise.all([
      deps.loadWorkspaceProjects(session),
      deps.loadModelRegistry(session),
      deps.threadsHydratedRef.current ? Promise.resolve() : deps.loadThreads(session),
    ]);
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "workspace_resume",
      status: "success",
      detail: {
        threadsHydratedAfter: deps.threadsHydratedRef.current,
      },
    });
  } catch (error) {
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "workspace_resume",
      status: "failure",
      detail: {
        threadsHydratedAfter: deps.threadsHydratedRef.current,
      },
      error: formatWorkspaceInstrumentationError(error),
    });
    throw error;
  }
}
