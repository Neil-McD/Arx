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
  const startedAt = Date.now();
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
  const results = await Promise.allSettled([
    deps.loadWorkspaceProjects(session),
    deps.loadThreads(session),
  ]);
  const failureCount = results.filter((result) => result.status === "rejected").length;
  void deps.loadModelRegistry(session).catch((error) => {
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "workspace_model_registry_hydrate",
      status: "failure",
      error: formatWorkspaceInstrumentationError(error),
    });
  });
  emitWorkspaceEvent({
    scope: "lifecycle",
    name: "workspace_hydrate",
    status: failureCount > 0 ? "failure" : "success",
    detail: {
      threadsHydratedAfter: deps.threadsHydratedRef.current,
      failureCount,
      durationMs: Date.now() - startedAt,
    },
    error:
      failureCount > 0
        ? formatWorkspaceInstrumentationError(
            results
              .filter((result): result is PromiseRejectedResult => result.status === "rejected")
              .map((result) => result.reason)[0],
          )
        : undefined,
  });
}

export async function resumeWorkspaceSurfaceState<SessionT>(
  deps: WorkspaceSurfaceHydrationDeps<SessionT>,
  session: SessionT,
): Promise<void> {
  const startedAt = Date.now();
  emitWorkspaceEvent({
    scope: "lifecycle",
    name: "workspace_resume",
    status: "start",
    detail: {
      threadsHydratedBefore: deps.threadsHydratedRef.current,
      sessionPresent: Boolean(session),
    },
  });
  const results = await Promise.allSettled([
    deps.loadWorkspaceProjects(session),
    deps.threadsHydratedRef.current ? Promise.resolve() : deps.loadThreads(session),
  ]);
  const failureCount = results.filter((result) => result.status === "rejected").length;
  void deps.loadModelRegistry(session).catch((error) => {
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "workspace_model_registry_resume",
      status: "failure",
      error: formatWorkspaceInstrumentationError(error),
    });
  });
  emitWorkspaceEvent({
    scope: "lifecycle",
    name: "workspace_resume",
    status: failureCount > 0 ? "failure" : "success",
    detail: {
      threadsHydratedAfter: deps.threadsHydratedRef.current,
      failureCount,
      durationMs: Date.now() - startedAt,
    },
    error:
      failureCount > 0
        ? formatWorkspaceInstrumentationError(
            results
              .filter((result): result is PromiseRejectedResult => result.status === "rejected")
              .map((result) => result.reason)[0],
          )
        : undefined,
  });
}
