import type {
  ThreadService,
  ThreadServiceCreateInput,
  ThreadServiceMessageInput,
  ThreadServiceSendTurnInput,
  ThreadServiceSetEngineInput,
  ThreadServiceSetLensInput,
  ThreadServiceThread,
} from "../../../shared/threadService";

type LocalAgentThreadServiceDeps = {
  listLocalThreads: () => Promise<ThreadServiceThread[]>;
  getLocalThread: (threadId: string) => Promise<ThreadServiceThread | null>;
  createLocalThread?: (input: ThreadServiceCreateInput) => Promise<ThreadServiceThread | null>;
  deleteLocalThread?: (threadId: string) => Promise<void>;
  setLocalLens?: (input: ThreadServiceSetLensInput) => Promise<ThreadServiceThread | null>;
  addLocalMessage?: (input: ThreadServiceMessageInput) => Promise<void>;
  sendLocalTurn?: (input: ThreadServiceSendTurnInput) => Promise<void>;
  setLocalThreadTitle?: (threadId: string, title: string) => Promise<void>;
  setLocalThreadEngine?: (input: ThreadServiceSetEngineInput) => Promise<ThreadServiceThread | null>;
};

function unsupported(method: string): never {
  throw new Error(`LocalAgentThreadService.${method} is not wired.`);
}

export function createLocalAgentThreadService(deps: LocalAgentThreadServiceDeps): ThreadService {
  return {
    threadLane: "agent",
    storageMode: "local",

    async listThreads(): Promise<ThreadServiceThread[]> {
      return deps.listLocalThreads();
    },

    async getThread(threadId: string): Promise<ThreadServiceThread | null> {
      return deps.getLocalThread(threadId);
    },

    async createThread(input: ThreadServiceCreateInput): Promise<ThreadServiceThread | null> {
      if (!deps.createLocalThread) unsupported("createThread");
      return deps.createLocalThread(input);
    },

    async deleteThread(threadId: string): Promise<void> {
      if (!deps.deleteLocalThread) unsupported("deleteThread");
      await deps.deleteLocalThread(threadId);
    },

    async setThreadLens(input: ThreadServiceSetLensInput): Promise<ThreadServiceThread | null> {
      if (!deps.setLocalLens) unsupported("setThreadLens");
      return deps.setLocalLens(input);
    },

    async addMessage(input: ThreadServiceMessageInput): Promise<void> {
      if (!deps.addLocalMessage) unsupported("addMessage");
      await deps.addLocalMessage(input);
    },

    async sendTurn(input: ThreadServiceSendTurnInput): Promise<void> {
      if (!deps.sendLocalTurn) unsupported("sendTurn");
      await deps.sendLocalTurn(input);
    },

    async setThreadTitle(threadId: string, title: string): Promise<void> {
      if (!deps.setLocalThreadTitle) unsupported("setThreadTitle");
      await deps.setLocalThreadTitle(threadId, title);
    },

    async setThreadEngine(input: ThreadServiceSetEngineInput): Promise<ThreadServiceThread | null> {
      if (!deps.setLocalThreadEngine) unsupported("setThreadEngine");
      return deps.setLocalThreadEngine(input);
    },
  };
}
