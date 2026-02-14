import type { SupabaseSession } from "../../../shared/supabaseAuthCore";
import type {
  ThreadService,
  ThreadServiceCreateInput,
  ThreadServiceMessageInput,
  ThreadServiceSendTurnInput,
  ThreadServiceSetEngineInput,
  ThreadServiceSetLensInput,
  ThreadServiceThread,
} from "../../../shared/threadService";

type CloudChatThreadServiceDeps = {
  getSession: () => SupabaseSession | null;
  listCloudThreads: (session: SupabaseSession) => Promise<ThreadServiceThread[]>;
  getCloudThread: (threadId: string, session: SupabaseSession) => Promise<ThreadServiceThread | null>;
  createCloudThread?: (
    input: ThreadServiceCreateInput,
    session: SupabaseSession,
  ) => Promise<ThreadServiceThread | null>;
  deleteCloudThread?: (threadId: string, session: SupabaseSession) => Promise<void>;
  setCloudLens?: (
    input: ThreadServiceSetLensInput,
    session: SupabaseSession,
  ) => Promise<ThreadServiceThread | null>;
  addCloudMessage?: (input: ThreadServiceMessageInput, session: SupabaseSession) => Promise<void>;
  sendCloudTurn?: (input: ThreadServiceSendTurnInput, session: SupabaseSession) => Promise<void>;
  setCloudThreadTitle?: (
    threadId: string,
    title: string,
    session: SupabaseSession,
  ) => Promise<void>;
  setCloudThreadEngine?: (
    input: ThreadServiceSetEngineInput,
    session: SupabaseSession,
  ) => Promise<ThreadServiceThread | null>;
};

function unsupported(method: string): never {
  throw new Error(`CloudChatThreadService.${method} is not wired.`);
}

export function createCloudChatThreadService(deps: CloudChatThreadServiceDeps): ThreadService {
  const requireSession = (operation: string): SupabaseSession => {
    const session = deps.getSession();
    if (!session) {
      throw new Error(`Sign in to ${operation}.`);
    }
    return session;
  };

  return {
    threadLane: "chat",
    storageMode: "cloud",

    async listThreads(): Promise<ThreadServiceThread[]> {
      const session = deps.getSession();
      if (!session) return [];
      return deps.listCloudThreads(session);
    },

    async getThread(threadId: string): Promise<ThreadServiceThread | null> {
      const session = deps.getSession();
      if (!session) return null;
      return deps.getCloudThread(threadId, session);
    },

    async createThread(input: ThreadServiceCreateInput): Promise<ThreadServiceThread | null> {
      if (!deps.createCloudThread) unsupported("createThread");
      const session = requireSession("create cloud chat threads");
      return deps.createCloudThread(input, session);
    },

    async deleteThread(threadId: string): Promise<void> {
      if (!deps.deleteCloudThread) unsupported("deleteThread");
      const session = requireSession("delete cloud chat threads");
      await deps.deleteCloudThread(threadId, session);
    },

    async setThreadLens(input: ThreadServiceSetLensInput): Promise<ThreadServiceThread | null> {
      if (!deps.setCloudLens) unsupported("setThreadLens");
      const session = requireSession("switch community context for cloud chat threads");
      return deps.setCloudLens(input, session);
    },

    async addMessage(input: ThreadServiceMessageInput): Promise<void> {
      if (!deps.addCloudMessage) unsupported("addMessage");
      const session = requireSession("send cloud chat messages");
      await deps.addCloudMessage(input, session);
    },

    async sendTurn(input: ThreadServiceSendTurnInput): Promise<void> {
      if (!deps.sendCloudTurn) unsupported("sendTurn");
      const session = requireSession("send cloud chat messages");
      await deps.sendCloudTurn(input, session);
    },

    async setThreadTitle(threadId: string, title: string): Promise<void> {
      if (!deps.setCloudThreadTitle) unsupported("setThreadTitle");
      const session = requireSession("update cloud chat threads");
      await deps.setCloudThreadTitle(threadId, title, session);
    },

    async setThreadEngine(input: ThreadServiceSetEngineInput): Promise<ThreadServiceThread | null> {
      if (!deps.setCloudThreadEngine) unsupported("setThreadEngine");
      const session = requireSession("update cloud chat model settings");
      return deps.setCloudThreadEngine(input, session);
    },
  };
}
