import type { SupabaseSession } from "../../../shared/supabaseAuthCore";
import { normalizeThreadLane } from "../../../shared/threadSidebarSelectors";
import {
  resolveThreadServiceDomain,
  ThreadServiceRouter,
  type ThreadServiceCreateInput,
  type ThreadServiceMessageInput,
  type ThreadServiceSendTurnInput,
  type ThreadServiceSetEngineInput,
  type ThreadServiceSetLensInput,
  type ThreadServiceThread,
} from "../../../shared/threadService";
import { createCloudChatThreadService } from "./cloudChatThreadService";
import { createLocalAgentThreadService } from "./localAgentThreadService";

type CreateDesktopThreadServiceRouterDeps = {
  threads: ThreadServiceThread[];
  getSession: () => SupabaseSession | null;
  listCloudThreads: (session: SupabaseSession) => Promise<ThreadServiceThread[]>;
  getCloudThread: (threadId: string, session: SupabaseSession) => Promise<ThreadServiceThread | null>;
  createCloudThread: (
    input: ThreadServiceCreateInput,
    session: SupabaseSession,
  ) => Promise<ThreadServiceThread | null>;
  deleteCloudThread: (threadId: string, session: SupabaseSession) => Promise<void>;
  setCloudLens: (
    input: ThreadServiceSetLensInput,
    session: SupabaseSession,
  ) => Promise<ThreadServiceThread | null>;
  addCloudMessage: (input: ThreadServiceMessageInput, session: SupabaseSession) => Promise<void>;
  sendCloudTurn: (input: ThreadServiceSendTurnInput, session: SupabaseSession) => Promise<void>;
  setCloudThreadTitle: (threadId: string, title: string, session: SupabaseSession) => Promise<void>;
  setCloudThreadEngine: (
    input: ThreadServiceSetEngineInput,
    session: SupabaseSession,
  ) => Promise<ThreadServiceThread | null>;
  listLocalThreads: () => Promise<ThreadServiceThread[]>;
  getLocalThread: (threadId: string) => Promise<ThreadServiceThread | null>;
  createLocalThread: (input: ThreadServiceCreateInput) => Promise<ThreadServiceThread | null>;
  deleteLocalThread: (threadId: string) => Promise<void>;
  setLocalLens: (input: ThreadServiceSetLensInput) => Promise<ThreadServiceThread | null>;
  addLocalMessage: (input: ThreadServiceMessageInput) => Promise<void>;
  sendLocalTurn: (input: ThreadServiceSendTurnInput) => Promise<void>;
  setLocalThreadTitle: (threadId: string, title: string) => Promise<void>;
  setLocalThreadEngine: (input: ThreadServiceSetEngineInput) => Promise<ThreadServiceThread | null>;
};

export function createDesktopThreadServiceRouter(
  deps: CreateDesktopThreadServiceRouterDeps,
): ThreadServiceRouter {
  return new ThreadServiceRouter({
    findThreadById: (threadId: string): ThreadServiceThread | null => {
      const thread = deps.threads.find((candidate) => candidate.id === threadId) ?? null;
      if (!thread) return null;
      const domain = resolveThreadServiceDomain({
        storageMode: thread.storage_mode,
        threadLane: thread.thread_lane,
        engineId: thread.engine_id,
      });
      return {
        ...thread,
        thread_lane: normalizeThreadLane(thread.thread_lane, thread.engine_id),
        storage_mode: domain.storageMode,
      };
    },
    services: [
      createCloudChatThreadService({
        getSession: deps.getSession,
        listCloudThreads: deps.listCloudThreads,
        getCloudThread: deps.getCloudThread,
        createCloudThread: deps.createCloudThread,
        deleteCloudThread: deps.deleteCloudThread,
        setCloudLens: deps.setCloudLens,
        addCloudMessage: deps.addCloudMessage,
        sendCloudTurn: deps.sendCloudTurn,
        setCloudThreadTitle: deps.setCloudThreadTitle,
        setCloudThreadEngine: deps.setCloudThreadEngine,
      }),
      createLocalAgentThreadService({
        listLocalThreads: deps.listLocalThreads,
        getLocalThread: deps.getLocalThread,
        createLocalThread: deps.createLocalThread,
        deleteLocalThread: deps.deleteLocalThread,
        setLocalLens: deps.setLocalLens,
        addLocalMessage: deps.addLocalMessage,
        sendLocalTurn: deps.sendLocalTurn,
        setLocalThreadTitle: deps.setLocalThreadTitle,
        setLocalThreadEngine: deps.setLocalThreadEngine,
      }),
    ],
  });
}
