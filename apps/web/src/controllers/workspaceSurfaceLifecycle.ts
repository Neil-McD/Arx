import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { emitWorkspaceEvent } from "../lib/workspaceInstrumentation";

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
