import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { resolveCloudModelSelection } from "./inferenceLaneResolver";
import { buildCloudCommunityContextEnvelope } from "./communityContextEnvelope";
import { resolveLatestUserQueryFromThreadMessages } from "./communityLaneMessageBuilder";
import {
  getCommunityHarnessUnavailableErrorMessage,
  isCommunityHarnessUnavailablePreflight,
} from "./cloudCommunityContextPreflight";

type ModelToggle = {
  id: string;
  enabled: boolean;
};

type ThreadRecord = {
  id: string;
  model_id: string | null;
  community_id?: string | null;
  last_seq: number;
  updated_at: number;
};

type ThreadMessage = {
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

type UseWebSendFlowControllerArgs<
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
      inferenceSource?: "platform" | "user";
      replyToId?: string;
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
  guestThreadId: string;
  guestModelId: string;
  guestModelAllowlist: Set<string>;
  defaultActiveModelId: string;
  defaultGuestModelId: string;

  workspaceAttachmentsRef: MutableRefObject<AttachmentT[]>;
  autoScrollEnabledRef: MutableRefObject<boolean>;

  setThreadError: Dispatch<SetStateAction<string | null>>;
  setIsSendingMessage: Dispatch<SetStateAction<boolean>>;
  setIsWorkspaceAtBottom: Dispatch<SetStateAction<boolean>>;
  setWorkspaceWantsNewChatMode: Dispatch<SetStateAction<boolean>>;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
  setThreadMessages: Dispatch<SetStateAction<ThreadMessageT[]>>;
  setMessageInput: Dispatch<SetStateAction<string>>;
  setWorkspaceAttachments: Dispatch<SetStateAction<AttachmentT[]>>;
  setThreads: Dispatch<SetStateAction<ThreadRecordT[]>>;
  setActiveModelId: Dispatch<SetStateAction<string | null>>;
  setBuilderUpgradeContext: (next: string) => void;
  setBuilderBillingError: Dispatch<SetStateAction<string | null>>;
  setIsBuilderUpgradeOpen: Dispatch<SetStateAction<boolean>>;
};

function toErrorMessage(error: unknown, fallback: string): string {
  return typeof error === "string" ? error : error instanceof Error ? error.message : fallback;
}

function getLastThreadMessageId(messages: ThreadMessage[], role: "user" | "assistant" | "system"): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === role) return msg.id;
  }
  return null;
}

export function useWebSendFlowController<
  SessionT,
  AttachmentT,
  ThreadRecordT extends ThreadRecord,
  ThreadMessageT extends ThreadMessage,
>(args: UseWebSendFlowControllerArgs<SessionT, AttachmentT, ThreadRecordT, ThreadMessageT>) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const maybeShowBuilderLimitUpgrade = useCallback((message: string): void => {
    const current = argsRef.current;
    if (!message.toLowerCase().includes("cloud history limit reached")) return;
    current.setBuilderUpgradeContext("builder");
    current.setBuilderBillingError(message);
    current.setIsBuilderUpgradeOpen(true);
  }, []);

  const resolvePreferredModelSelection = useCallback(() => {
    const current = argsRef.current;
    const enabled = current.modelToggles.filter((toggle) => toggle.enabled);
    const preferredModelIdRaw =
      (current.activeModelId ?? "").trim() ||
      enabled.find((toggle) => toggle.id === current.defaultActiveModelId)?.id ||
      enabled[0]?.id ||
      current.defaultActiveModelId;
    return resolveCloudModelSelection({
      requestedModelId: preferredModelIdRaw,
      enabledModelIds: enabled.map((toggle) => toggle.id),
      defaultAuthedModelId: current.defaultActiveModelId,
      defaultGuestModelId: current.defaultGuestModelId,
      hasPaidAccess: current.hasPaidAccess,
      freeModelAllowlist: current.guestModelAllowlist,
    });
  }, []);

  const persistGuestFromMessages = useCallback((messages: ThreadMessageT[]): void => {
    const current = argsRef.current;
    const stored: GuestThreadStorageV1 = {
      v: 1,
      model_id: current.guestModelId,
      messages: [],
    };
    for (const msg of messages) {
      if (msg.role !== "user" && msg.role !== "assistant") continue;
      const content = current.extractTextFromContentJson(msg.content_json).trim();
      if (!content) continue;
      stored.messages.push({
        id: msg.id,
        role: msg.role,
        content,
        created_at: msg.created_at,
        run_id: msg.run_id,
      });
    }
    current.storeGuestThreadStorage(stored);
  }, []);

  const syncThreadModelSelection = useCallback(
    (threadId: string, modelId: string, session: SessionT | null): void => {
      const current = argsRef.current;
      current.setThreads((prev) =>
        prev.map((thread) => (thread.id === threadId ? ({ ...thread, model_id: modelId } as ThreadRecordT) : thread)),
      );
      if (!session) return;
      void current.updateThreadModel(threadId, modelId, session).catch((error) => {
        console.warn("Failed to persist thread model selection:", error);
      });
    },
    [],
  );

  const resolveScopedSystemPrompt = useCallback(
    async (threadId: string, session: SessionT): Promise<string | null> => {
      const current = argsRef.current;
      const thread = current.threads.find((candidate) => candidate.id === threadId) ?? null;
      const communityId = String(thread?.community_id ?? "").trim();
      const communityName =
        communityId && current.getCommunityNameById ? current.getCommunityNameById(communityId) : null;
      let customCommunitySystemPrompt: string | null = null;
      const loader = current.loadEffectiveCommunitySystemPrompt;
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
        personalSystemPrompt: current.getPersonalSystemPrompt(),
      });
      return envelope.scopedSystemPrompt;
    },
    [],
  );

  const resolveCommunityPreflight = useCallback(
    async (params: {
      threadId: string;
      session: SessionT;
      messages: ThreadMessageT[];
      fallbackQuery?: string | null;
    }): Promise<CommunityContextPreflightResult | null> => {
      const current = argsRef.current;
      const loader = current.loadCommunityContextPreflight;
      if (!loader) return null;
      const thread = current.threads.find((candidate) => candidate.id === params.threadId) ?? null;
      const communityId = String(thread?.community_id ?? "").trim();
      if (!communityId) return null;
      const query = resolveLatestUserQueryFromThreadMessages({
        messages: params.messages,
        fallbackQuery: params.fallbackQuery,
        getRole: (message) => message.role,
        getText: (message) => current.extractTextFromContentJson(message.content_json),
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
    },
    [],
  );

  const sendUserMessage = useCallback(async (opts?: { text?: string }) => {
    const current = argsRef.current;
    const text = (opts?.text ?? current.messageInput).trim();
    const hasAttachments = current.workspaceAttachments.length > 0;
    if (!text && !hasAttachments) return;

    const session = current.getSession();
    if (!session) {
      if (hasAttachments) {
        current.setThreadError(null);
        current.openAuthGate();
        return;
      }
      const now = new Date().toISOString();
      const existing = current.threadMessages.filter((m) => m.thread_id === current.guestThreadId);
      const userMsg: ThreadMessageT = {
        id: crypto.randomUUID(),
        thread_id: current.guestThreadId,
        seq: existing.length + 1,
        role: "user",
        content_json: { text },
        created_at: now,
        engine_id: null,
        model_id: null,
        run_id: null,
      } as ThreadMessageT;
      const baseMessages = [...existing, userMsg];

      current.setThreadError(null);
      current.setIsSendingMessage(true);
      current.autoScrollEnabledRef.current = true;
      current.setIsWorkspaceAtBottom(true);
      try {
        current.setWorkspaceWantsNewChatMode(false);
        if (current.activeThreadId !== current.guestThreadId) current.setActiveThreadId(current.guestThreadId);
        current.setThreadMessages(baseMessages);
        current.setMessageInput("");
        current.setWorkspaceAttachments([]);
        persistGuestFromMessages(baseMessages);

        const turnResult = await current.runPublicTurn({
          modelId: current.guestModelId,
          threadId: current.guestThreadId,
          runIdHint: `public_web:${userMsg.id}`,
          messages: baseMessages,
          systemPrompt: buildCloudCommunityContextEnvelope({
            personalSystemPrompt: current.getPersonalSystemPrompt(),
          }).scopedSystemPrompt,
        });
        if (turnResult.error) throw new Error(turnResult.error);
        if (turnResult.cancelled) return;
        const assistantContent = (turnResult.content ?? "").trim();
        if (!assistantContent) return;
        const assistantMsg: ThreadMessageT = {
          id: crypto.randomUUID(),
          thread_id: current.guestThreadId,
          seq: baseMessages.length + 1,
          role: "assistant",
          content_json: { text: assistantContent },
          created_at: new Date().toISOString(),
          engine_id: "public_openrouter",
          model_id: current.guestModelId,
          run_id: turnResult.runId ?? null,
        } as ThreadMessageT;
        const nextMessages = [...baseMessages, assistantMsg];
        current.setThreadMessages(nextMessages);
        persistGuestFromMessages(nextMessages);
      } catch (error) {
        current.setThreadError(toErrorMessage(error, "Failed to send message."));
      } finally {
        current.setIsSendingMessage(false);
      }
      return;
    }

    const startedInDraft = !current.activeThreadId;
    let createdThreadId: string | null = null;
    let postedUserMessage = false;
    const hasPersonalMemoryAccess =
      current.builderTier === "builder" || current.builderTier === "pro" || current.builderTier === "architect";

    current.setThreadError(null);
    current.setIsSendingMessage(true);
    current.autoScrollEnabledRef.current = true;
    current.setIsWorkspaceAtBottom(true);
    try {
      let threadId = current.activeThreadId;
      if (!threadId) {
        const created = await current.createThread(session);
        threadId = created?.id ?? null;
        createdThreadId = threadId;
      }
      if (!threadId) throw new Error("No thread available.");

      const currentThreadModel = current.threads.find((thread) => thread.id === threadId)?.model_id;
      const preferredModelSelection = resolvePreferredModelSelection();
      const preferredModelId = preferredModelSelection.modelId;
      if (preferredModelSelection.usedFallback) {
        current.setActiveModelId(preferredModelId);
      }
      if (!currentThreadModel || currentThreadModel !== preferredModelId) {
        syncThreadModelSelection(threadId, preferredModelId, session);
      }

      await current.ensureWorkspaceThreadLensBeforeSend(threadId, session);
      await current.maybeSetThreadTitleFromText(threadId, text, session);

      const remembered = current.userMemoryRememberEnabled ? current.extractRememberIntent(text) : null;
      if (remembered && hasPersonalMemoryAccess) {
        try {
          await current.createPersonalMemoryItemDirect({ content: remembered, pinned: false });
          current.showMemoryToastMessage("Memory updated");
        } catch (error) {
          console.warn("Failed to save memory intent:", error);
        }
      }

      const messageId = crypto.randomUUID();
      const attachmentsToSend = [...current.workspaceAttachmentsRef.current];
      const usePublicModel = preferredModelSelection.lane === "public";
      if (usePublicModel && attachmentsToSend.length > 0) {
        throw new Error("Attachments are not available with free-tier models. Choose a paid model to send files.");
      }

      await current.createThreadMessage(session, {
        id: messageId,
        threadId,
        role: "user",
        content_json: {
          text,
          ...(attachmentsToSend.length > 0 ? { attachments: attachmentsToSend } : {}),
        },
      });
      postedUserMessage = true;

      if (startedInDraft) {
        const nowSec = Math.floor(Date.now() / 1000);
        current.setThreads((prev) =>
          prev.map((thread) =>
            thread.id === threadId
              ? { ...thread, last_seq: Math.max(thread.last_seq, 1), updated_at: nowSec }
              : thread,
          ),
        );
      }

      current.setMessageInput("");
      current.setWorkspaceAttachments([]);
      const priorThreadMessages = current.threadMessages.filter((m) => m.thread_id === threadId);
      const syntheticUserMessage: ThreadMessageT = {
        id: messageId,
        thread_id: threadId,
        seq: priorThreadMessages.length + 1,
        role: "user",
        content_json: {
          text,
          ...(attachmentsToSend.length > 0 ? { attachments: attachmentsToSend } : {}),
        },
        created_at: new Date().toISOString(),
        engine_id: null,
        model_id: null,
        run_id: null,
      } as ThreadMessageT;
      const optimisticThreadMessages = [...priorThreadMessages, syntheticUserMessage];
      current.setThreadMessages(optimisticThreadMessages);

      if (usePublicModel) {
        const systemPrompt = await resolveScopedSystemPrompt(threadId, session);
        const communityPreflight = await resolveCommunityPreflight({
          threadId,
          session,
          messages: optimisticThreadMessages,
          fallbackQuery: text,
        });
        if (isCommunityHarnessUnavailablePreflight(communityPreflight)) {
          throw new Error(getCommunityHarnessUnavailableErrorMessage());
        }
        const turnResult = await current.runPublicTurn({
          modelId: preferredModelId,
          threadId,
          runIdHint: `public_web:${messageId}`,
          messages: optimisticThreadMessages,
          systemPrompt,
          communityEvidenceUserMessage: communityPreflight?.communityEvidenceUserMessage ?? null,
        });
        if (turnResult.error) throw new Error(turnResult.error);
        if (!turnResult.cancelled) {
          const assistantContent = (turnResult.content ?? "").trim();
          if (assistantContent) {
            await current.createAssistantTextMessage(session, {
              threadId,
              text: assistantContent,
              engineId: "public_web",
              modelId: preferredModelId,
              runId: turnResult.runId ?? null,
              inferenceSource: "free",
              communityEvidenceUsedV1: communityPreflight?.communityEvidenceUsedV1 ?? null,
              communityContextDiagnostics: communityPreflight?.communityContextDiagnostics ?? null,
            });
          }
        }
      } else {
        const turnResult = await current.runAgentTurn(session, threadId, {
          preferredModelId,
          mode: "respond",
          runIdHint: `agent_web:${messageId}`,
          replyToId: messageId,
        });
        if (turnResult.error) throw new Error(turnResult.error);
      }

      await current.loadThreadMessages(threadId, session);
    } catch (error) {
      const message = toErrorMessage(error, "Failed to send message.");
      current.setThreadError(message);
      if (startedInDraft && createdThreadId && !postedUserMessage) {
        current.setThreads((prev) => prev.filter((thread) => thread.id !== createdThreadId));
        current.setWorkspaceWantsNewChatMode(true);
        current.setActiveThreadId(null);
      }
      maybeShowBuilderLimitUpgrade(message);
    } finally {
      current.setIsSendingMessage(false);
    }
  }, [
    maybeShowBuilderLimitUpgrade,
    persistGuestFromMessages,
    resolveScopedSystemPrompt,
    resolveCommunityPreflight,
    resolvePreferredModelSelection,
    syncThreadModelSelection,
  ]);

  const retryLastTurn = useCallback(async () => {
    const current = argsRef.current;
    if (current.isSendingMessage) return;
    if (current.getSession() == null) {
      current.openAuthGate();
      return;
    }
    const session = current.getSession();
    if (!session) return;

    const threadId = current.activeThreadId;
    if (!threadId) return;
    const lastMessage = current.threadMessages[current.threadMessages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") return;
    const lastUserMessageId = getLastThreadMessageId(current.threadMessages, "user");
    if (!lastUserMessageId) return;

    current.setThreadError(null);
    current.setIsSendingMessage(true);
    current.autoScrollEnabledRef.current = true;
    current.setIsWorkspaceAtBottom(true);
    try {
      const currentThreadModel = current.threads.find((thread) => thread.id === threadId)?.model_id;
      const preferredModelSelection = resolvePreferredModelSelection();
      const preferredModelId = preferredModelSelection.modelId;
      const usePublicModel = preferredModelSelection.lane === "public";
      if (!currentThreadModel || currentThreadModel !== preferredModelId) {
        syncThreadModelSelection(threadId, preferredModelId, session);
      }

      if (usePublicModel) {
        const systemPrompt = await resolveScopedSystemPrompt(threadId, session);
        const currentThreadMessages = current.threadMessages.filter((message) => message.thread_id === threadId);
        const communityPreflight = await resolveCommunityPreflight({
          threadId,
          session,
          messages: currentThreadMessages,
        });
        if (isCommunityHarnessUnavailablePreflight(communityPreflight)) {
          throw new Error(getCommunityHarnessUnavailableErrorMessage());
        }
        const turnResult = await current.runPublicTurn({
          modelId: preferredModelId,
          threadId,
          runIdHint: `public_web_retry:${lastUserMessageId}:${Date.now()}`,
          messages: currentThreadMessages,
          systemPrompt,
          communityEvidenceUserMessage: communityPreflight?.communityEvidenceUserMessage ?? null,
        });
        if (turnResult.error) throw new Error(turnResult.error);
        if (!turnResult.cancelled) {
          const assistantContent = (turnResult.content ?? "").trim();
          if (assistantContent) {
            await current.createAssistantTextMessage(session, {
              threadId,
              text: assistantContent,
              engineId: "public_web",
              modelId: preferredModelId,
              runId: turnResult.runId ?? null,
              inferenceSource: "free",
              communityEvidenceUsedV1: communityPreflight?.communityEvidenceUsedV1 ?? null,
              communityContextDiagnostics: communityPreflight?.communityContextDiagnostics ?? null,
            });
          }
        }
      } else {
        const turnResult = await current.runAgentTurn(session, threadId, {
          preferredModelId,
          mode: "respond",
          runIdHint: `agent_web:${lastUserMessageId}`,
          replyToId: lastUserMessageId,
        });
        if (turnResult.error) throw new Error(turnResult.error);
      }
      await current.loadThreadMessages(threadId, session);
    } catch (error) {
      const message = toErrorMessage(error, "Failed to run model.");
      current.setThreadError(message);
      maybeShowBuilderLimitUpgrade(message);
    } finally {
      current.setIsSendingMessage(false);
    }
  }, [maybeShowBuilderLimitUpgrade, resolveScopedSystemPrompt, resolveCommunityPreflight, resolvePreferredModelSelection, syncThreadModelSelection]);

  const regenerateLastTurn = useCallback(async () => {
    const current = argsRef.current;
    if (current.isSendingMessage) return;
    if (current.getSession() == null) {
      current.openAuthGate();
      return;
    }
    const session = current.getSession();
    if (!session) return;

    const threadId = current.activeThreadId;
    if (!threadId) return;
    const lastUserMessageId = getLastThreadMessageId(current.threadMessages, "user");
    if (!lastUserMessageId) return;

    current.setThreadError(null);
    current.setIsSendingMessage(true);
    current.autoScrollEnabledRef.current = true;
    current.setIsWorkspaceAtBottom(true);
    try {
      const currentThreadModel = current.threads.find((thread) => thread.id === threadId)?.model_id;
      const preferredModelSelection = resolvePreferredModelSelection();
      const preferredModelId = preferredModelSelection.modelId;
      const usePublicModel = preferredModelSelection.lane === "public";
      if (!currentThreadModel || currentThreadModel !== preferredModelId) {
        syncThreadModelSelection(threadId, preferredModelId, session);
      }

      if (usePublicModel) {
        const systemPrompt = await resolveScopedSystemPrompt(threadId, session);
        const currentThreadMessages = current.threadMessages.filter((message) => message.thread_id === threadId);
        let lastUserIndex = -1;
        for (let i = currentThreadMessages.length - 1; i >= 0; i--) {
          if (currentThreadMessages[i]?.role === "user") {
            lastUserIndex = i;
            break;
          }
        }
        if (lastUserIndex < 0) throw new Error("No user message available to regenerate.");

        const messagesForTurn = currentThreadMessages.slice(0, lastUserIndex + 1);
        const trailingMessageIds = currentThreadMessages
          .slice(lastUserIndex + 1)
          .map((message) => message.id)
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
        await current.deleteThreadMessagesByIds(session, trailingMessageIds);

        const communityPreflight = await resolveCommunityPreflight({
          threadId,
          session,
          messages: messagesForTurn,
        });
        if (isCommunityHarnessUnavailablePreflight(communityPreflight)) {
          throw new Error(getCommunityHarnessUnavailableErrorMessage());
        }

        const turnResult = await current.runPublicTurn({
          modelId: preferredModelId,
          threadId,
          runIdHint: `public_web_regen:${lastUserMessageId}:${Date.now()}`,
          messages: messagesForTurn,
          systemPrompt,
          communityEvidenceUserMessage: communityPreflight?.communityEvidenceUserMessage ?? null,
        });
        if (turnResult.error) throw new Error(turnResult.error);
        if (!turnResult.cancelled) {
          const assistantContent = (turnResult.content ?? "").trim();
          if (assistantContent) {
            await current.createAssistantTextMessage(session, {
              threadId,
              text: assistantContent,
              engineId: "public_web",
              modelId: preferredModelId,
              runId: turnResult.runId ?? null,
              inferenceSource: "free",
              communityEvidenceUsedV1: communityPreflight?.communityEvidenceUsedV1 ?? null,
              communityContextDiagnostics: communityPreflight?.communityContextDiagnostics ?? null,
            });
          }
        }
      } else {
        const turnResult = await current.runAgentTurn(session, threadId, {
          preferredModelId,
          mode: "regenerate",
          runIdHint: `agent_web_regen:${lastUserMessageId}:${Date.now()}`,
          replyToId: lastUserMessageId,
        });
        if (turnResult.error) throw new Error(turnResult.error);
      }
      await current.loadThreadMessages(threadId, session);
    } catch (error) {
      const message = toErrorMessage(error, "Failed to run model.");
      current.setThreadError(message);
      maybeShowBuilderLimitUpgrade(message);
    } finally {
      current.setIsSendingMessage(false);
    }
  }, [maybeShowBuilderLimitUpgrade, resolveScopedSystemPrompt, resolveCommunityPreflight, resolvePreferredModelSelection, syncThreadModelSelection]);

  return {
    sendUserMessage,
    retryLastTurn,
    regenerateLastTurn,
  };
}
