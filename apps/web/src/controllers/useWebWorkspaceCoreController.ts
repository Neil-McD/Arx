import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { ModelToggle } from "../../../../shared/modelCatalog";
import type { RuntimeEngine } from "../../../../shared/runtimeEngine";
import { useWebThreadMutationController } from "../../../../shared/useWebThreadMutationController";
import {
  emitWorkspaceEvent,
  formatWorkspaceInstrumentationError,
} from "../lib/workspaceInstrumentation";

type ThreadLike = {
  id: string;
  title: string | null;
  model_id: string | null;
  runtime_engine: RuntimeEngine | null;
  project_id: string | null;
  community_id: string | null;
  context_version: number;
  agent_attention: boolean;
  last_seq: number;
  created_at: number;
  updated_at: number;
};

type UseWebWorkspaceCoreControllerParams<SessionT, ThreadT extends ThreadLike> = {
  projectId: string | null;
  ensureSession: (session: SessionT) => Promise<SessionT | null>;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
  setWorkspaceWantsNewChatMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  threads: ThreadT[];
  setThreads: Dispatch<SetStateAction<ThreadT[]>>;
  deriveThreadTitleFromUserText: (userText: string) => string | null;
  isMissingThreadTitleValue: (value: string | null | undefined) => boolean;
  toEpochSeconds: (value: string) => number;
  activeCommunityId: string | null;
  activeModelId: string | null;
  activeRuntimeEngine: RuntimeEngine;
  modelToggles: ModelToggle[];
  defaultActiveModelId: string;
};

export function useWebWorkspaceCoreController<SessionT, ThreadT extends ThreadLike>(
  params: UseWebWorkspaceCoreControllerParams<SessionT, ThreadT>,
) {
  const rawThreadMutation = useWebThreadMutationController<SessionT>({
    deriveThreadTitleFromUserText: params.deriveThreadTitleFromUserText,
    isMissingThreadTitleValue: params.isMissingThreadTitleValue,
    toEpochSeconds: params.toEpochSeconds,
    activeCommunityId: params.activeCommunityId,
    activeProjectId: params.projectId,
    activeModelId: params.activeModelId,
    activeRuntimeEngine: params.activeRuntimeEngine,
    modelToggles: params.modelToggles,
    threads: params.threads,
    defaultActiveModelId: params.defaultActiveModelId,
    ensureSession: params.ensureSession,
    setThreads: params.setThreads as Dispatch<SetStateAction<any[]>>,
    setWorkspaceWantsNewChatMode: params.setWorkspaceWantsNewChatMode,
    setActiveThreadId: params.setActiveThreadId,
  });

  const createThread = useCallback<typeof rawThreadMutation.createThread>(
    async (session) => {
      emitWorkspaceEvent({
        scope: "thread",
        name: "thread_create",
        status: "start",
        projectId: params.projectId,
        detail: {
          communityId: params.activeCommunityId,
          activeModelId: params.activeModelId,
          runtimeEngine: params.activeRuntimeEngine,
        },
      });
      try {
        const thread = await rawThreadMutation.createThread(session);
        if (!thread) {
          emitWorkspaceEvent({
            scope: "thread",
            name: "thread_create",
            status: "failure",
            projectId: params.projectId,
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
            runtimeEngine: thread.runtime_engine ?? null,
          },
        });
        return thread;
      } catch (error) {
        emitWorkspaceEvent({
          scope: "thread",
          name: "thread_create",
          status: "failure",
          projectId: params.projectId,
          error: formatWorkspaceInstrumentationError(error),
        });
        throw error;
      }
    },
    [
      params.activeCommunityId,
      params.activeModelId,
      params.activeRuntimeEngine,
      params.projectId,
      rawThreadMutation,
    ],
  );

  const updateThreadRuntimeEngine = useCallback<typeof rawThreadMutation.updateThreadRuntimeEngine>(
    async (threadId, runtimeEngine, session) => {
      emitWorkspaceEvent({
        scope: "thread",
        name: "thread_update_runtime_engine",
        status: "start",
        projectId: params.projectId,
        threadId,
        detail: {
          runtimeEngine,
        },
      });
      try {
        await rawThreadMutation.updateThreadRuntimeEngine(threadId, runtimeEngine, session);
        emitWorkspaceEvent({
          scope: "thread",
          name: "thread_update_runtime_engine",
          status: "success",
          projectId: params.projectId,
          threadId,
          detail: {
            runtimeEngine,
          },
        });
      } catch (error) {
        emitWorkspaceEvent({
          scope: "thread",
          name: "thread_update_runtime_engine",
          status: "failure",
          projectId: params.projectId,
          threadId,
          detail: {
            runtimeEngine,
          },
          error: formatWorkspaceInstrumentationError(error),
        });
        throw error;
      }
    },
    [params.projectId, rawThreadMutation],
  );

  const updateThreadModel = useCallback<typeof rawThreadMutation.updateThreadModel>(
    async (threadId, modelId, session) => {
      emitWorkspaceEvent({
        scope: "thread",
        name: "thread_update_model",
        status: "start",
        projectId: params.projectId,
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
          projectId: params.projectId,
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
          projectId: params.projectId,
          threadId,
          detail: {
            modelId,
          },
          error: formatWorkspaceInstrumentationError(error),
        });
        throw error;
      }
    },
    [params.projectId, rawThreadMutation],
  );

  const maybeSetThreadTitleFromText = useCallback<typeof rawThreadMutation.maybeSetThreadTitleFromText>(
    async (threadId, userText, session) => {
      emitWorkspaceEvent({
        scope: "thread",
        name: "thread_set_title",
        status: "start",
        projectId: params.projectId,
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
          projectId: params.projectId,
          threadId,
        });
      } catch (error) {
        emitWorkspaceEvent({
          scope: "thread",
          name: "thread_set_title",
          status: "failure",
          projectId: params.projectId,
          threadId,
          error: formatWorkspaceInstrumentationError(error),
        });
        throw error;
      }
    },
    [params.projectId, rawThreadMutation],
  );

  const setThreadCommunityLens = useCallback<typeof rawThreadMutation.setThreadCommunityLens>(
    async (threadId, communityId, session) => {
      emitWorkspaceEvent({
        scope: "thread",
        name: "thread_set_lens",
        status: "start",
        projectId: params.projectId,
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
            projectId: params.projectId,
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
          projectId: params.projectId,
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
          projectId: params.projectId,
          threadId,
          detail: {
            communityId,
          },
          error: formatWorkspaceInstrumentationError(error),
        });
        throw error;
      }
    },
    [params.projectId, rawThreadMutation],
  );

  return {
    threadMutation: {
      ...rawThreadMutation,
      createThread,
      updateThreadRuntimeEngine,
      updateThreadModel,
      maybeSetThreadTitleFromText,
      setThreadCommunityLens,
    },
  };
}
