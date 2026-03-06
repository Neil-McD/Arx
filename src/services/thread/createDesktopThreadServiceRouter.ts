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

type DesktopCloudSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: {
    id: string;
    email?: string;
  };
};

type CreateDesktopThreadServiceRouterDeps = {
  threads: ThreadServiceThread[];
  getSession: () => DesktopCloudSession | null;
  listCloudThreads: (session: DesktopCloudSession) => Promise<ThreadServiceThread[]>;
  getCloudThread: (threadId: string, session: DesktopCloudSession) => Promise<ThreadServiceThread | null>;
  createCloudThread: (
    input: ThreadServiceCreateInput,
    session: DesktopCloudSession,
  ) => Promise<ThreadServiceThread | null>;
  deleteCloudThread: (threadId: string, session: DesktopCloudSession) => Promise<void>;
  setCloudLens: (
    input: ThreadServiceSetLensInput,
    session: DesktopCloudSession,
  ) => Promise<ThreadServiceThread | null>;
  addCloudMessage: (input: ThreadServiceMessageInput, session: DesktopCloudSession) => Promise<void>;
  sendCloudTurn: (input: ThreadServiceSendTurnInput, session: DesktopCloudSession) => Promise<void>;
  setCloudThreadTitle: (threadId: string, title: string, session: DesktopCloudSession) => Promise<void>;
  setCloudThreadEngine: (
    input: ThreadServiceSetEngineInput,
    session: DesktopCloudSession,
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
