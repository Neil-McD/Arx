import { useCallback, useRef } from "react";
import { buildCloudCommunityContextEnvelope } from "./communityContextEnvelope";
import {
  getCommunityHarnessUnavailableErrorMessage,
  isCommunityHarnessUnavailablePreflight,
} from "./cloudCommunityContextPreflight";
import {
  type ThreadRecord,
  type ThreadMessage,
  type UseWebSendFlowControllerArgs,
  getLastThreadMessageId,
  persistGuestThreadStorageFromMessages,
  resolveCommunityPreflightForThread,
  resolvePreferredModelSelectionFromArgs,
  resolveScopedSystemPromptForThread,
  runPublicTurnAndPersistAssistant,
  showBuilderLimitUpgradeIfNeeded,
  syncThreadModelSelectionInState,
  toErrorMessage,
} from "./webSendFlowCore";

export function useWebSendFlowController<
  SessionT,
  AttachmentT,
  ThreadRecordT extends ThreadRecord,
  ThreadMessageT extends ThreadMessage,
>(args: UseWebSendFlowControllerArgs<SessionT, AttachmentT, ThreadRecordT, ThreadMessageT>) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const maybeShowBuilderLimitUpgrade = useCallback((message: string): void => {
    showBuilderLimitUpgradeIfNeeded(argsRef.current, message);
  }, []);

  const resolvePreferredModelSelection = useCallback(() => resolvePreferredModelSelectionFromArgs(argsRef.current), []);

  const persistGuestFromMessages = useCallback((messages: ThreadMessageT[]): void => {
    persistGuestThreadStorageFromMessages(argsRef.current, messages);
  }, []);

  const syncThreadModelSelection = useCallback(
    (threadId: string, modelId: string, session: SessionT | null): void => {
      syncThreadModelSelectionInState(argsRef.current, threadId, modelId, session);
    },
    [],
  );

  const resolveScopedSystemPrompt = useCallback(
    async (threadId: string, session: SessionT): Promise<string | null> =>
      resolveScopedSystemPromptForThread(argsRef.current, threadId, session),
    [],
  );

  const resolveCommunityPreflight = useCallback(
    async (params: {
      threadId: string;
      session: SessionT;
      messages: ThreadMessageT[];
      fallbackQuery?: string | null;
    }) => resolveCommunityPreflightForThread(argsRef.current, params),
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
      current.builderTier === "builder" || current.builderTier === "pro";

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
        await runPublicTurnAndPersistAssistant(current, {
          session,
          threadId,
          modelId: preferredModelId,
          runIdHint: `public_web:${messageId}`,
          messages: optimisticThreadMessages,
          systemPrompt,
          communityPreflight,
        });
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
        await runPublicTurnAndPersistAssistant(current, {
          session,
          threadId,
          modelId: preferredModelId,
          runIdHint: `public_web_retry:${lastUserMessageId}:${Date.now()}`,
          messages: currentThreadMessages,
          systemPrompt,
          communityPreflight,
        });
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

        await runPublicTurnAndPersistAssistant(current, {
          session,
          threadId,
          modelId: preferredModelId,
          runIdHint: `public_web_regen:${lastUserMessageId}:${Date.now()}`,
          messages: messagesForTurn,
          systemPrompt,
          communityPreflight,
        });
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
