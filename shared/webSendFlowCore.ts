import { buildCloudCommunityContextEnvelope } from "./communityContextEnvelope";
import { resolveCloudModelSelection } from "./inferenceLaneResolver";
import {
  normalizeActiveWorkspaceRuntimeEngine,
  type RuntimeEngine,
} from "./runtimeEngine";
import type { GuestInferenceIssue } from "./webTurnRunnerCore";

type ModelToggle = {
  id: string;
  enabled: boolean;
};

export type ThreadRecord = {
  id: string;
  model_id: string | null;
  runtime_engine?: RuntimeEngine | null;
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
    runtimeEngine: RuntimeEngine;
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
    runtimeEngine: RuntimeEngine;
    requestedFundingSource: "demo_public" | "user_key" | "user_chatgpt";
    inferenceSource: "free" | "user_key" | "chatgpt";
    startedInDraft: boolean;
    hasAttachments: boolean;
  }) => void;

  createThread: (session: SessionT) => Promise<ThreadRecordT | null>;
  onThreadCreated?: (thread: ThreadRecordT) => void;
  updateThreadModel: (threadId: string, modelId: string, session: SessionT) => Promise<void>;
  updateThreadRuntimeEngine: (threadId: string, runtimeEngine: RuntimeEngine, session: SessionT) => Promise<void>;
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
  }) => Promise<{
    cancelled: boolean;
    error: string | null;
    content: string;
    runId: string | null;
    guestIssue: GuestInferenceIssue | null;
  }>;
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
      runtimeEngine?: RuntimeEngine;
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
  prepareAttachmentsForSend?: (
    attachments: AttachmentT[],
    session: SessionT,
    threadId: string,
  ) => Promise<AttachmentT[]>;
  serializeAttachmentsForWrite?: (attachments: AttachmentT[]) => unknown[];

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
  activeRuntimeEngine: RuntimeEngine;
  modelToggles: ModelToggle[];
  userMemoryRememberEnabled: boolean;
  accountTier: string | null;
  hasUserKeyConnection: boolean;
  hasUserChatgptConnection: boolean;
  loadAccountCommerceStatus?: (session: SessionT) => Promise<{ account_tier?: string | null } | null>;
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
  setGuestInferenceIssueForThread: (
    threadId: string | null,
    value:
      | GuestInferenceIssue
      | null
      | ((prev: GuestInferenceIssue | null) => GuestInferenceIssue | null),
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
  setAccountCommerceError: (value: string | null | ((prev: string | null) => string | null)) => void;
  setIsFreeAccountInfoOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
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

export function showAccountLimitInfoIfNeeded<
  SessionT,
  AttachmentT,
  ThreadRecordT extends ThreadRecord,
  ThreadMessageT extends ThreadMessage,
>(args: UseWebSendFlowControllerArgs<SessionT, AttachmentT, ThreadRecordT, ThreadMessageT>, message: string): void {
  if (!message.toLowerCase().includes("cloud history limit reached")) return;
  args.setAccountCommerceError(message);
  args.setIsFreeAccountInfoOpen(true);
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
    hasUserKeyConnection: args.hasUserKeyConnection,
    hasChatgptAuth: args.hasUserChatgptConnection,
    freeModelAllowlist: args.guestModelAllowlist,
    surface: "web",
  });
}

export function resolvePreferredRuntimeEngineFromArgs<
  SessionT,
  AttachmentT,
  ThreadRecordT extends ThreadRecord,
  ThreadMessageT extends ThreadMessage,
>(
  args: UseWebSendFlowControllerArgs<SessionT, AttachmentT, ThreadRecordT, ThreadMessageT>,
  threadId: string,
): RuntimeEngine {
  const threadEngine = args.threads.find((thread) => thread.id === threadId)?.runtime_engine;
  return normalizeActiveWorkspaceRuntimeEngine(threadEngine ?? args.activeRuntimeEngine);
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

export function syncThreadRuntimeEngineSelectionInState<
  SessionT,
  AttachmentT,
  ThreadRecordT extends ThreadRecord,
  ThreadMessageT extends ThreadMessage,
>(
  args: UseWebSendFlowControllerArgs<SessionT, AttachmentT, ThreadRecordT, ThreadMessageT>,
  threadId: string,
  runtimeEngine: RuntimeEngine,
  session: SessionT | null,
): void {
  const normalizedRuntimeEngine = normalizeActiveWorkspaceRuntimeEngine(runtimeEngine);
  args.setThreads((prev) =>
    prev.map((thread) =>
      thread.id === threadId
        ? ({ ...thread, runtime_engine: normalizedRuntimeEngine } as ThreadRecordT)
        : thread,
    ),
  );
  if (!session) return;
  void args.updateThreadRuntimeEngine(threadId, normalizedRuntimeEngine, session).catch((error) => {
    console.warn("Failed to persist thread runtime engine selection:", error);
  });
}
