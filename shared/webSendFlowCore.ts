import { buildCloudCommunityContextEnvelope } from "./communityContextEnvelope";
import { resolveLatestUserQueryFromThreadMessages } from "./communityLaneMessageBuilder";
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

type CommunityContextPreflightResult = {
  hasEntitlement: boolean;
  communityEvidenceUserMessage: string | null;
  communityEvidenceUsedV1: unknown;
  communityContextDiagnostics: Record<string, unknown> | null;
};

type LoadCommunityContextPreflightParams<SessionT> = {
  threadId: string;
  communityId: string;
  query: string;
  session: SessionT;
};

export type UseWebSendFlowControllerArgs<
  SessionT,
  AttachmentT,
  ThreadRecordT extends ThreadRecord,
  ThreadMessageT extends ThreadMessage,
> = {
  getSession: () => SessionT | null;
  openAuthGate: (intentInput?: unknown) => void;
  ensureWorkspaceThreadLensBeforeSend: (threadId: string, session: SessionT) => Promise<void>;

  createThread: (session: SessionT) => Promise<ThreadRecordT | null>;
  updateThreadModel: (threadId: string, modelId: string, session: SessionT) => Promise<void>;
  maybeSetThreadTitleFromText: (threadId: string, userText: string, session: SessionT) => Promise<void>;
  loadEffectiveCommunitySystemPrompt?: (params: {
    threadId: string;
    communityId: string;
    session: SessionT;
  }) => Promise<string | null>;
  loadCommunityContextPreflight?: (
    params: LoadCommunityContextPreflightParams<SessionT>,
  ) => Promise<CommunityContextPreflightResult | null>;
  getPersonalSystemPrompt: () => string | null | undefined;
  getCommunityNameById?: (communityId: string) => string | null;
  createPersonalMemoryItemDirect: (params: { content: string; pinned: boolean }) => Promise<unknown>;
  showMemoryToastMessage: (message: string) => void;
  loadThreadMessages: (threadId: string, session: SessionT) => Promise<void>;

  runPublicTurn: (params: {
    modelId: string;
    threadId: string;
    runIdHint: string;
    messages: ThreadMessageT[];
    systemPrompt?: string | null;
    communityEvidenceUserMessage?: string | null;
  }) => Promise<{ cancelled: boolean; error: string | null; content: string; runId: string | null }>;
  runAgentTurn: (
    session: SessionT,
    threadId: string,
    params: {
      preferredModelId: string;
      mode?: "respond" | "regenerate";
      runIdHint: string;
      inferenceSource?: "platform" | "user_key";
      requestedFundingSource?: "platform" | "user_key";
      requiresTools?: boolean;
      replyToId?: string;
      messages?: ThreadMessageT[];
    },
  ) => Promise<{ cancelled: boolean; error: string | null }>;
  createThreadMessage: (
    session: SessionT,
    params: { id?: string; threadId: string; role: "user" | "assistant" | "system"; content_json: unknown },
  ) => Promise<string>;
  createAssistantTextMessage: (
    session: SessionT,
    params: {
      threadId: string;
      text: string;
      engineId?: string | null;
      modelId?: string | null;
      runId?: string | null;
      inferenceSource?: string | null;
      communityEvidenceUsedV1?: unknown;
      communityContextDiagnostics?: Record<string, unknown> | null;
    },
  ) => Promise<string>;
  deleteThreadMessagesByIds: (session: SessionT, messageIds: string[]) => Promise<void>;

  extractRememberIntent: (input: string) => string | null;
  extractTextFromContentJson: (value: unknown) => string;
  storeGuestThreadStorage: (next: GuestThreadStorageV1) => void;

  messageInput: string;
  workspaceAttachments: AttachmentT[];
  isSendingMessage: boolean;
  activeThreadId: string | null;
  threadMessages: ThreadMessageT[];
  threads: ThreadRecordT[];
  activeModelId: string | null;
  modelToggles: ModelToggle[];
  userMemoryRememberEnabled: boolean;
  builderTier: string;
  hasPaidAccess: boolean;
  hasUserKeyConnection: boolean;
  hasUserChatgptConnection: boolean;
  guestThreadId: string;
  guestModelId: string;
  guestModelAllowlist: ReadonlySet<string>;
  defaultActiveModelId: string;
  defaultGuestModelId: string;

  workspaceAttachmentsRef: { current: AttachmentT[] };
  autoScrollEnabledRef: { current: boolean };

  setThreadError: (value: string | null | ((prev: string | null) => string | null)) => void;
  setIsSendingMessage: (value: boolean | ((prev: boolean) => boolean)) => void;
  setIsWorkspaceAtBottom: (value: boolean | ((prev: boolean) => boolean)) => void;
  setWorkspaceWantsNewChatMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  setActiveThreadId: (value: string | null | ((prev: string | null) => string | null)) => void;
  setThreadMessages: (
    value: ThreadMessageT[] | ((prev: ThreadMessageT[]) => ThreadMessageT[]),
  ) => void;
  setMessageInput: (value: string | ((prev: string) => string)) => void;
  setWorkspaceAttachments: (
    value: AttachmentT[] | ((prev: AttachmentT[]) => AttachmentT[]),
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

export async function resolveScopedSystemPromptForThread<
  SessionT,
  AttachmentT,
  ThreadRecordT extends ThreadRecord,
  ThreadMessageT extends ThreadMessage,
>(
  args: UseWebSendFlowControllerArgs<SessionT, AttachmentT, ThreadRecordT, ThreadMessageT>,
  threadId: string,
  session: SessionT,
): Promise<string | null> {
  const thread = args.threads.find((candidate) => candidate.id === threadId) ?? null;
  const communityId = String(thread?.community_id ?? "").trim();
  const communityName = communityId && args.getCommunityNameById ? args.getCommunityNameById(communityId) : null;
  let customCommunitySystemPrompt: string | null = null;
  const loader = args.loadEffectiveCommunitySystemPrompt;
  if (communityId && loader) {
    try {
      customCommunitySystemPrompt = await loader({ threadId, communityId, session });
    } catch {
      customCommunitySystemPrompt = null;
    }
  }
  const envelope = buildCloudCommunityContextEnvelope({
    communityId: communityId || null,
    communityName,
    customCommunitySystemPrompt,
    personalSystemPrompt: args.getPersonalSystemPrompt(),
  });
  return envelope.scopedSystemPrompt;
}

export async function resolveCommunityPreflightForThread<
  SessionT,
  AttachmentT,
  ThreadRecordT extends ThreadRecord,
  ThreadMessageT extends ThreadMessage,
>(
  args: UseWebSendFlowControllerArgs<SessionT, AttachmentT, ThreadRecordT, ThreadMessageT>,
  params: {
    threadId: string;
    session: SessionT;
    messages: ThreadMessageT[];
    fallbackQuery?: string | null;
  },
): Promise<CommunityContextPreflightResult | null> {
  const loader = args.loadCommunityContextPreflight;
  if (!loader) return null;
  const thread = args.threads.find((candidate) => candidate.id === params.threadId) ?? null;
  const communityId = String(thread?.community_id ?? "").trim();
  if (!communityId) return null;
  const query = resolveLatestUserQueryFromThreadMessages({
    messages: params.messages,
    fallbackQuery: params.fallbackQuery,
    getRole: (message) => message.role,
    getText: (message) => args.extractTextFromContentJson(message.content_json),
  });
  try {
    return (
      (await loader({
        threadId: params.threadId,
        communityId,
        query,
        session: params.session,
      })) ?? null
    );
  } catch {
    return null;
  }
}

export async function runPublicTurnAndPersistAssistant<
  SessionT,
  AttachmentT,
  ThreadRecordT extends ThreadRecord,
  ThreadMessageT extends ThreadMessage,
>(
  args: UseWebSendFlowControllerArgs<SessionT, AttachmentT, ThreadRecordT, ThreadMessageT>,
  params: {
    session: SessionT;
    threadId: string;
    modelId: string;
    runIdHint: string;
    messages: ThreadMessageT[];
    systemPrompt?: string | null;
    communityPreflight: CommunityContextPreflightResult | null;
  },
): Promise<void> {
  const turnResult = await args.runPublicTurn({
    modelId: params.modelId,
    threadId: params.threadId,
    runIdHint: params.runIdHint,
    messages: params.messages,
    systemPrompt: params.systemPrompt ?? null,
    communityEvidenceUserMessage: params.communityPreflight?.communityEvidenceUserMessage ?? null,
  });
  if (turnResult.error) throw new Error(turnResult.error);
  if (turnResult.cancelled) return;

  const assistantContent = (turnResult.content ?? "").trim();
  if (!assistantContent) return;

  await args.createAssistantTextMessage(params.session, {
    threadId: params.threadId,
    text: assistantContent,
    engineId: "public_web",
    modelId: params.modelId,
    runId: turnResult.runId ?? null,
    inferenceSource: "free",
    communityEvidenceUsedV1: params.communityPreflight?.communityEvidenceUsedV1 ?? null,
    communityContextDiagnostics: params.communityPreflight?.communityContextDiagnostics ?? null,
  });
}
