import { buildCloudCommunityContextEnvelope } from "./communityContextEnvelope";
import { resolveCloudModelSelection } from "./inferenceLaneResolver";

type ModelToggle = {
  id: string;
  enabled: boolean;
};

export type ThreadRecord = {
  id: string;
  model_id: string | null;
  project_id?: string | null;
  community_id?: string | null;
  last_seq: number;
  updated_at: number;
};

export type ThreadMessage = {
  id: string;
  thread_id: string;
  seq: number;
  role: "user" | "assistant" | "system";
  content_json: unknown;
  created_at: string;
  engine_id: string | null;
  model_id: string | null;
  run_id: string | null;
};

type GuestStoredMessageV1 = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  run_id?: string | null;
};

type GuestThreadStorageV1 = {
  v: 1;
  model_id: string;
  messages: GuestStoredMessageV1[];
};

type EnsureSessionFn<SessionT> = (session: SessionT) => Promise<SessionT | null>;

export type UseWebSendFlowControllerArgs<
  SessionT,
  AttachmentT,
  ThreadRecordT extends ThreadRecord,
  ThreadMessageT extends ThreadMessage,
> = {
  getSession: () => SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
  requireSignIn: (intentInput?: unknown) => void;
  ensureWorkspaceThreadLensBeforeSend: (threadId: string, session: SessionT) => Promise<void>;
  onWorkspaceRunStarted?: (params: {
    threadId: string;
    projectId: string | null;
    communityId: string | null;
    modelId: string;
    requestedFundingSource: "demo_public" | "user_key" | "user_chatgpt";
    inferenceSource: "free" | "user_key" | "chatgpt";
    startedInDraft: boolean;
    hasAttachments: boolean;
  }) => void;
  onWorkspaceRunSucceeded?: (params: {
    threadId: string;
    projectId: string | null;
    communityId: string | null;
    modelId: string;
    requestedFundingSource: "demo_public" | "user_key" | "user_chatgpt";
    inferenceSource: "free" | "user_key" | "chatgpt";
    startedInDraft: boolean;
    hasAttachments: boolean;
  }) => void;

  createThread: (session: SessionT) => Promise<ThreadRecordT | null>;
  onThreadCreated?: (thread: ThreadRecordT) => void;
  updateThreadModel: (threadId: string, modelId: string, session: SessionT) => Promise<void>;
  maybeSetThreadTitleFromText: (threadId: string, userText: string, session: SessionT) => Promise<void>;
  createPersonalMemoryItemDirect: (params: { content: string; pinned: boolean }) => Promise<unknown>;
  showMemoryToastMessage: (message: string) => void;
  loadThreadMessages: (threadId: string, session: SessionT) => Promise<void>;

  runPublicTurn: (params: {
    modelId: string;
    threadId: string;
    runIdHint: string;
    messages: ThreadMessageT[];
    systemPrompt?: string | null;
  }) => Promise<{ cancelled: boolean; error: string | null; content: string; runId: string | null }>;
  runAgentTurn: (
    session: SessionT,
    threadId: string,
    params: {
      preferredModelId: string;
      mode?: "respond" | "regenerate";
      runIdHint: string;
      userMessageKey?: string;
      systemPrompt?: string | null;
      inferenceSource?: "free" | "user_key" | "chatgpt";
      requestedFundingSource: "demo_public" | "user_key" | "user_chatgpt";
      requestedAgenticTools?: boolean;
      replyToId?: string;
      messages?: ThreadMessageT[];
      suppressStreamingUi?: boolean;
    },
  ) => Promise<{ cancelled: boolean; error: string | null }>;
  createThreadMessage: (
    session: SessionT,
    params: { id?: string; threadId: string; role: "user" | "assistant" | "system"; content_json: unknown },
  ) => Promise<string>;
  deleteThreadMessagesByIds: (session: SessionT, messageIds: string[]) => Promise<void>;

  extractRememberIntent: (input: string) => string | null;
  extractTextFromContentJson: (value: unknown) => string;
  storeGuestThreadStorage: (next: GuestThreadStorageV1) => void;

  workspaceWantsNewChat: boolean;
  isSendingMessage: boolean;
  isThreadRunActive: (threadId: string | null) => boolean;
  activeThreadId: string | null;
  threadMessages: ThreadMessageT[];
  threads: ThreadRecordT[];
  activeModelId: string | null;
  modelToggles: ModelToggle[];
  userMemoryRememberEnabled: boolean;
  builderTier: string | null;
  hasPaidAccess: boolean;
  hasUserKeyConnection: boolean;
  hasUserChatgptConnection: boolean;
  loadBuilderBillingStatus?: (session: SessionT) => Promise<{ builder_tier?: string | null } | null>;
  guestThreadId: string;
  guestModelId: string;
  guestModelAllowlist: ReadonlySet<string>;
  defaultActiveModelId: string;
  defaultGuestModelId: string;

  clearWorkspaceComposer: () => void;
  pinWorkspaceToBottom: () => void;

  setThreadError: (value: string | null | ((prev: string | null) => string | null)) => void;
  setThreadErrorForThread: (
    threadId: string | null,
    value: string | null | ((prev: string | null) => string | null),
  ) => void;
  setIsSendingMessage: (value: boolean | ((prev: boolean) => boolean)) => void;
  setThreadRunSending: (threadId: string, sending: boolean) => void;
  setWorkspaceWantsNewChatMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  setActiveThreadId: (value: string | null | ((prev: string | null) => string | null)) => void;
  setThreadMessages: (
    value: ThreadMessageT[] | ((prev: ThreadMessageT[]) => ThreadMessageT[]),
  ) => void;
  setThreads: (value: ThreadRecordT[] | ((prev: ThreadRecordT[]) => ThreadRecordT[])) => void;
  setActiveModelId: (value: string | null | ((prev: string | null) => string | null)) => void;
  setBuilderUpgradeContext: (next: string) => void;
  setBuilderBillingError: (value: string | null | ((prev: string | null) => string | null)) => void;
  setIsBuilderUpgradeOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
};

export function toErrorMessage(error: unknown, fallback: string): string {
  return typeof error === "string" ? error : error instanceof Error ? error.message : fallback;
}

export function getLastThreadMessageId(
  messages: ThreadMessage[],
  role: "user" | "assistant" | "system",
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === role) return msg.id;
  }
  return null;
}

export function showBuilderLimitUpgradeIfNeeded<
  SessionT,
  AttachmentT,
  ThreadRecordT extends ThreadRecord,
  ThreadMessageT extends ThreadMessage,
>(args: UseWebSendFlowControllerArgs<SessionT, AttachmentT, ThreadRecordT, ThreadMessageT>, message: string): void {
  if (!message.toLowerCase().includes("cloud history limit reached")) return;
  args.setBuilderUpgradeContext("builder");
  args.setBuilderBillingError(message);
  args.setIsBuilderUpgradeOpen(true);
}

export function resolvePreferredModelSelectionFromArgs<
  SessionT,
  AttachmentT,
  ThreadRecordT extends ThreadRecord,
  ThreadMessageT extends ThreadMessage,
>(args: UseWebSendFlowControllerArgs<SessionT, AttachmentT, ThreadRecordT, ThreadMessageT>) {
  const enabled = args.modelToggles.filter((toggle) => toggle.enabled);
  const preferredModelIdRaw =
    (args.activeModelId ?? "").trim() ||
    enabled.find((toggle) => toggle.id === args.defaultActiveModelId)?.id ||
    enabled[0]?.id ||
    args.defaultActiveModelId;
  return resolveCloudModelSelection({
    requestedModelId: preferredModelIdRaw,
    enabledModelIds: enabled.map((toggle) => toggle.id),
    defaultAuthedModelId: args.defaultActiveModelId,
    defaultGuestModelId: args.defaultGuestModelId,
    hasPaidAccess: args.hasPaidAccess,
    hasUserKeyConnection: args.hasUserKeyConnection,
    hasChatgptAuth: args.hasUserChatgptConnection,
    freeModelAllowlist: args.guestModelAllowlist,
    surface: "web",
  });
}

export function mapRequestedFundingSourceToInferenceSource(
  fundingSource: "demo_public" | "user_key" | "user_chatgpt",
): "free" | "user_key" | "chatgpt" {
  if (fundingSource === "demo_public") return "free";
  if (fundingSource === "user_key") return "user_key";
  return "chatgpt";
}

export function persistGuestThreadStorageFromMessages<
  SessionT,
  AttachmentT,
  ThreadRecordT extends ThreadRecord,
  ThreadMessageT extends ThreadMessage,
>(
  args: UseWebSendFlowControllerArgs<SessionT, AttachmentT, ThreadRecordT, ThreadMessageT>,
  messages: ThreadMessageT[],
): void {
  const stored: GuestThreadStorageV1 = {
    v: 1,
    model_id: args.guestModelId,
    messages: [],
  };
  for (const msg of messages) {
    if (msg.role !== "user" && msg.role !== "assistant") continue;
    const content = args.extractTextFromContentJson(msg.content_json).trim();
    if (!content) continue;
    stored.messages.push({
      id: msg.id,
      role: msg.role,
      content,
      created_at: msg.created_at,
      run_id: msg.run_id,
    });
  }
  args.storeGuestThreadStorage(stored);
}

export function syncThreadModelSelectionInState<
  SessionT,
  AttachmentT,
  ThreadRecordT extends ThreadRecord,
  ThreadMessageT extends ThreadMessage,
>(
  args: UseWebSendFlowControllerArgs<SessionT, AttachmentT, ThreadRecordT, ThreadMessageT>,
  threadId: string,
  modelId: string,
  session: SessionT | null,
): void {
  args.setThreads((prev) =>
    prev.map((thread) => (thread.id === threadId ? ({ ...thread, model_id: modelId } as ThreadRecordT) : thread)),
  );
  if (!session) return;
  void args.updateThreadModel(threadId, modelId, session).catch((error) => {
    console.warn("Failed to persist thread model selection:", error);
  });
}
