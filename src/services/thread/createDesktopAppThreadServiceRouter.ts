import type { RuntimeClient } from "../../runtime/arp/client";
import type {
  ThreadServiceRouter,
  ThreadServiceThread,
  ThreadServiceTurnStreamEvent,
} from "../../../shared/threadService";
import { createDesktopThreadServiceRouter as createCoreThreadServiceRouter } from "./createDesktopThreadServiceRouter";

type DesktopCloudSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: {
    id: string;
    email?: string;
  };
};

type CreateDesktopAppThreadServiceRouterDeps = {
  threads: ThreadServiceThread[];
  runtimeClient: RuntimeClient;
  getCommunityNameById: (communityId: string) => string | null;
  getSession: () => DesktopCloudSession | null;
  listCloudChatThreads: (session: DesktopCloudSession) => Promise<ThreadServiceThread[]>;
  getCloudThreadRecord: (
    threadId: string,
    session: DesktopCloudSession,
  ) => Promise<ThreadServiceThread | null>;
  createCloudChatThread: (thread: ThreadServiceThread) => Promise<ThreadServiceThread | null>;
  deleteCloudChatThread: (threadId: string) => Promise<void>;
  setThreadCommunityLensInCloud: (params: {
    threadId: string;
    communityId: string | null;
    session: DesktopCloudSession;
    expectedContextVersion: number | null;
  }) => Promise<ThreadServiceThread | null>;
  addCloudMessage: (params: {
    thread_id: string;
    role: "user" | "assistant";
    content_json: string;
    session: DesktopCloudSession;
  }) => Promise<void>;
  sendCloudTurn: (params: {
    thread_id: string;
    input: string;
    user_content_json: string;
    session: DesktopCloudSession;
    sendPolicySnapshot?: {
      selectedModelId?: string | null;
      hasChatgptAuth?: boolean;
    };
    onStreamEvent?: (event: ThreadServiceTurnStreamEvent) => void;
  }) => Promise<void>;
  setCloudThreadTitle: (params: {
    thread_id: string;
    title: string;
    session: DesktopCloudSession;
  }) => Promise<void>;
  setCloudThreadEngine: (params: {
    thread_id: string;
    engine_id: string;
    model_id: string | null;
    session: DesktopCloudSession;
  }) => Promise<ThreadServiceThread | null>;
  listLocalThreads: () => Promise<ThreadServiceThread[]>;
  setThreadCommunityLensLocal: (params: {
    threadId: string;
    communityId: string | null;
  }) => Promise<ThreadServiceThread>;
};

export function createDesktopAppThreadServiceRouter(
  deps: CreateDesktopAppThreadServiceRouterDeps,
): ThreadServiceRouter {
  return createCoreThreadServiceRouter({
    threads: deps.threads,
    getSession: deps.getSession,
    listCloudThreads: deps.listCloudChatThreads,
    getCloudThread: deps.getCloudThreadRecord,
    createCloudThread: async (input) =>
      deps.createCloudChatThread({
        id: input.threadId,
        title: input.title,
        engine_id: input.engineId,
        model_id: input.modelId,
        thread_lane: input.threadLane,
        storage_mode: input.storageMode,
        project_id: input.projectId,
        workspace_path: null,
        community_id: input.communityId,
        context_version: 0,
        created_at: input.createdAt,
        updated_at: input.updatedAt,
        last_event_at: null,
        last_seq: 0,
      }),
    deleteCloudThread: async (threadId) => deps.deleteCloudChatThread(threadId),
    setCloudLens: async (input, session) =>
      deps.setThreadCommunityLensInCloud({
        threadId: input.threadId,
        communityId: input.communityId,
        session,
        expectedContextVersion:
          typeof input.expectedContextVersion === "number"
            ? input.expectedContextVersion
            : null,
      }),
    addCloudMessage: async (input, session) =>
      deps.addCloudMessage({
        thread_id: input.threadId,
        role: input.role,
        content_json: input.contentJson,
        session,
      }),
    sendCloudTurn: async (input, session) =>
      deps.sendCloudTurn({
        thread_id: input.threadId,
        input: input.input,
        user_content_json: input.userContentJson,
        session,
        sendPolicySnapshot: input.sendPolicySnapshot,
        onStreamEvent: input.onStreamEvent,
      }),
    setCloudThreadTitle: async (threadId, title, session) =>
      deps.setCloudThreadTitle({
        thread_id: threadId,
        title,
        session,
      }),
    setCloudThreadEngine: async (input, session) =>
      deps.setCloudThreadEngine({
        thread_id: input.threadId,
        engine_id: input.engineId,
        model_id: input.modelId,
        session,
      }),
    listLocalThreads: deps.listLocalThreads,
    getLocalThread: async (threadId) => deps.runtimeClient.getThread(threadId),
    createLocalThread: async (input) => {
      await deps.runtimeClient.upsertThread({
        thread_id: input.threadId,
        title: input.title,
        engine_id: input.engineId,
        model_id: input.modelId,
        thread_lane: input.threadLane,
        project_id: input.projectId,
        community_id: input.communityId,
        created_at: input.createdAt,
        updated_at: input.updatedAt,
      });
      return deps.runtimeClient.getThread(input.threadId);
    },
    deleteLocalThread: async (threadId) => deps.runtimeClient.deleteThread(threadId),
    setLocalLens: async (input) =>
      deps.setThreadCommunityLensLocal({
        threadId: input.threadId,
        communityId: input.communityId,
      }),
    addLocalMessage: async (input) =>
      deps.runtimeClient.addMessage({
        thread_id: input.threadId,
        role: input.role,
        content_json: input.contentJson,
      }),
    sendLocalTurn: async (input) => {
      const thread = deps.threads.find((candidate) => candidate.id === input.threadId) ?? null;
      const communityId = String(thread?.community_id ?? "").trim();
      const fallbackCommunityName = communityId
        ? deps.getCommunityNameById(communityId)
        : null;
      const communityName = (input.communityName ?? fallbackCommunityName ?? "").trim();
      await deps.runtimeClient.sendTurn({
        thread_id: input.threadId,
        cwd: input.cwd ?? "",
        input: input.input,
        user_content_json: input.userContentJson,
        community_name: communityName || null,
        cloud_runtime_base_url: input.cloudRuntimeBaseUrl ?? null,
        cloud_publishable_key: input.cloudPublishableKey ?? null,
        cloud_access_token: input.cloudAccessToken ?? "",
      });
    },
    setLocalThreadTitle: async (threadId, title) =>
      deps.runtimeClient.setThreadTitle(threadId, title),
    setLocalThreadEngine: async (input) =>
      deps.runtimeClient.setThreadEngine({
        thread_id: input.threadId,
        engine_id: input.engineId,
        model_id: input.modelId,
      }),
  });
}
