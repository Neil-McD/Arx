import { useCallback, useRef } from "react";
import { formatSendFlowErrorMessage } from "./appErrorMappings";
import { buildCloudCommunityContextEnvelope } from "./communityContextEnvelope";
import { resolveUsableSession } from "./ensureUsableSession";
import {
  type ThreadRecord,
  type ThreadMessage,
  type UseWebSendFlowControllerArgs,
  getLastThreadMessageId,
  mapRequestedFundingSourceToInferenceSource,
  persistGuestThreadStorageFromMessages,
  resolvePreferredModelSelectionFromArgs,
  showBuilderLimitUpgradeIfNeeded,
  syncThreadModelSelectionInState,
} from "./webSendFlowCore";

function resolveAuthenticatedTurnRuntimeFlags(): {
  requestedAgenticTools: boolean;
} {
  return {
    requestedAgenticTools: true,
  };
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

  const isThreadBusy = useCallback((threadId: string | null): boolean => {
    const trimmedThreadId = String(threadId ?? "").trim();
    if (!trimmedThreadId) return false;
    return argsRef.current.isThreadRunActive(trimmedThreadId);
  }, []);

  const sendUserMessage = useCallback(async (opts?: {
    text?: string;
    attachments?: AttachmentT[];
    clearComposer?: () => void;
    pinToBottom?: () => void;
  }) => {
    const current = argsRef.current;
    const setErrorForThread = (
      threadId: string | null,
      value: string | null | ((prev: string | null) => string | null),
    ) => current.setThreadErrorForThread(threadId, value);
    const text = String(opts?.text ?? "").trim();
    const attachmentsToSend = Array.isArray(opts?.attachments) ? [...opts.attachments] : [];
    const hasAttachments = attachmentsToSend.length > 0;
    const clearComposer = opts?.clearComposer ?? current.clearWorkspaceComposer;
    const pinToBottom = opts?.pinToBottom ?? current.pinWorkspaceToBottom;
    if (!text && !hasAttachments) return;

    const session = current.getSession();
    if (!session) {
      if (hasAttachments) {
        current.setThreadError(null);
        current.requireSignIn();
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

      setErrorForThread(current.guestThreadId, null);
      current.setIsSendingMessage(true);
      current.setThreadRunSending(current.guestThreadId, true);
      pinToBottom();
      try {
        current.setWorkspaceWantsNewChatMode(false);
        if (current.activeThreadId !== current.guestThreadId) current.setActiveThreadId(current.guestThreadId);
        current.setThreadMessages(baseMessages);
        clearComposer();
        persistGuestFromMessages(baseMessages);

        const turnResult = await current.runPublicTurn({
          modelId: current.guestModelId,
          threadId: current.guestThreadId,
          runIdHint: `public_web:${userMsg.id}`,
          messages: baseMessages,
          systemPrompt: buildCloudCommunityContextEnvelope({}).scopedSystemPrompt,
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
        setErrorForThread(
          current.guestThreadId,
          formatSendFlowErrorMessage(error, "Failed to send message."),
        );
      } finally {
        current.setThreadRunSending(current.guestThreadId, false);
        current.setIsSendingMessage(false);
      }
      return;
    }

    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) {
      current.requireSignIn();
      return;
    }

    const draftModeRequested = current.workspaceWantsNewChat === true;
    const hasActiveThreadInState =
      !draftModeRequested &&
      Boolean(
        current.activeThreadId && current.threads.some((thread) => thread.id === current.activeThreadId),
      );
    if (hasActiveThreadInState && isThreadBusy(current.activeThreadId)) {
      setErrorForThread(current.activeThreadId, "This thread already has a turn in progress. Wait for it to finish before sending another.");
      return;
    }
    const startedInDraft = !hasActiveThreadInState;
    let createdThreadId: string | null = null;
    let runThreadId: string | null = null;
    let postedUserMessage = false;
    const hasPersonalMemoryAccess =
      current.builderTier === "builder" || current.builderTier === "architect";

    setErrorForThread(current.activeThreadId ?? null, null);
    if (startedInDraft) current.setIsSendingMessage(true);
    pinToBottom();
    try {
      let threadId = hasActiveThreadInState ? current.activeThreadId : null;
      let createdThreadRecord: ThreadRecordT | null = null;
      if (!threadId) {
        const created = await current.createThread(usableSession);
        createdThreadRecord = created;
        threadId = created?.id ?? null;
        createdThreadId = threadId;
        if (!threadId) {
          const retryCreated = await current.createThread(usableSession);
          if (!createdThreadRecord) createdThreadRecord = retryCreated;
          threadId = retryCreated?.id ?? null;
          if (!createdThreadId) createdThreadId = threadId;
        }
      }
      if (!threadId) {
        throw new Error("No thread available. Failed to create a cloud thread; please retry.");
      }
      if (startedInDraft && createdThreadRecord) {
        current.onThreadCreated?.(createdThreadRecord);
      }
      runThreadId = threadId;
      current.setThreadRunSending(threadId, true);

      const currentThreadModel = current.threads.find((thread) => thread.id === threadId)?.model_id;
      const preferredModelSelection = resolvePreferredModelSelection();
      const preferredModelId = preferredModelSelection.modelId;
      if (preferredModelSelection.usedFallback) {
        current.setActiveModelId(preferredModelId);
      }
      if (!currentThreadModel || currentThreadModel !== preferredModelId) {
        syncThreadModelSelection(threadId, preferredModelId, usableSession);
      }

      await current.ensureWorkspaceThreadLensBeforeSend(threadId, usableSession);
      await current.maybeSetThreadTitleFromText(threadId, text, usableSession);

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
      const usePublicModel = preferredModelSelection.lane === "public";
      if (usePublicModel && attachmentsToSend.length > 0) {
        throw new Error("Attachments are not available with free-tier models. Choose a paid model to send files.");
      }

      await current.createThreadMessage(usableSession, {
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

      clearComposer();
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

      const runtimeFlags = resolveAuthenticatedTurnRuntimeFlags();
      const inferenceSource = mapRequestedFundingSourceToInferenceSource(
        preferredModelSelection.fundingSource,
      );
      const threadForAnalytics =
        createdThreadRecord ?? current.threads.find((thread) => thread.id === threadId) ?? null;
      current.onWorkspaceRunStarted?.({
        threadId,
        projectId: (threadForAnalytics?.project_id ?? "").trim() || null,
        communityId: threadForAnalytics?.community_id ?? null,
        modelId: preferredModelId,
        requestedFundingSource: preferredModelSelection.fundingSource,
        inferenceSource,
        startedInDraft,
        hasAttachments,
      });
      const turnResult = await current.runAgentTurn(usableSession, threadId, {
        preferredModelId,
        mode: "respond",
        runIdHint: `agent_web:${messageId}`,
        userMessageKey: messageId,
        systemPrompt: null,
        inferenceSource,
        requestedFundingSource: preferredModelSelection.fundingSource,
        requestedAgenticTools: runtimeFlags.requestedAgenticTools,
        replyToId: messageId,
        messages: optimisticThreadMessages,
      });
      if (turnResult.error) throw new Error(turnResult.error);
      current.onWorkspaceRunSucceeded?.({
        threadId,
        projectId: (threadForAnalytics?.project_id ?? "").trim() || null,
        communityId: threadForAnalytics?.community_id ?? null,
        modelId: preferredModelId,
        requestedFundingSource: preferredModelSelection.fundingSource,
        inferenceSource,
        startedInDraft,
        hasAttachments,
      });
      await current.loadThreadMessages(threadId, usableSession);
    } catch (error) {
      const message = formatSendFlowErrorMessage(error, "Failed to send message.");
      setErrorForThread(runThreadId ?? current.activeThreadId ?? null, message);
      if (startedInDraft && createdThreadId && !postedUserMessage) {
        current.setThreads((prev) => prev.filter((thread) => thread.id !== createdThreadId));
        current.setWorkspaceWantsNewChatMode(true);
        current.setActiveThreadId(null);
      }
      maybeShowBuilderLimitUpgrade(message);
    } finally {
      if (startedInDraft) current.setIsSendingMessage(false);
      if (runThreadId) {
        current.setThreadRunSending(runThreadId, false);
      }
    }
  }, [
    isThreadBusy,
    maybeShowBuilderLimitUpgrade,
    persistGuestFromMessages,
    resolvePreferredModelSelection,
    syncThreadModelSelection,
  ]);

  const retryLastTurn = useCallback(async () => {
    const current = argsRef.current;
    const setErrorForThread = (
      threadId: string | null,
      value: string | null | ((prev: string | null) => string | null),
    ) => current.setThreadErrorForThread(threadId, value);
    if (current.getSession() == null) {
      current.requireSignIn();
      return;
    }
    const session = current.getSession();
    if (!session) return;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) {
      current.requireSignIn();
      return;
    }

    const threadId = current.activeThreadId;
    if (!threadId) return;
    if (isThreadBusy(threadId)) {
      setErrorForThread(threadId, "This thread already has a turn in progress. Wait for it to finish before sending another.");
      return;
    }
    const lastMessage = current.threadMessages[current.threadMessages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") return;
    const lastUserMessageId = getLastThreadMessageId(current.threadMessages, "user");
    if (!lastUserMessageId) return;

    setErrorForThread(threadId, null);
    current.setThreadRunSending(threadId, true);
    current.pinWorkspaceToBottom();
    try {
      const currentThreadModel = current.threads.find((thread) => thread.id === threadId)?.model_id;
      const preferredModelSelection = resolvePreferredModelSelection();
      const preferredModelId = preferredModelSelection.modelId;
      const currentThreadMessages = current.threadMessages.filter((message) => message.thread_id === threadId);
      if (!currentThreadModel || currentThreadModel !== preferredModelId) {
        syncThreadModelSelection(threadId, preferredModelId, usableSession);
      }

      const latestUserText = current.extractTextFromContentJson(
        currentThreadMessages[currentThreadMessages.length - 1]?.content_json,
      );
      const runtimeFlags = resolveAuthenticatedTurnRuntimeFlags();
      const turnResult = await current.runAgentTurn(usableSession, threadId, {
        preferredModelId,
        mode: "respond",
        runIdHint: `agent_web:${lastUserMessageId}`,
        userMessageKey: lastUserMessageId,
        systemPrompt: null,
        inferenceSource: mapRequestedFundingSourceToInferenceSource(
          preferredModelSelection.fundingSource,
        ),
        requestedFundingSource: preferredModelSelection.fundingSource,
        requestedAgenticTools: runtimeFlags.requestedAgenticTools,
        replyToId: lastUserMessageId,
        messages: currentThreadMessages,
      });
      if (turnResult.error) throw new Error(turnResult.error);
      await current.loadThreadMessages(threadId, usableSession);
    } catch (error) {
      const message = formatSendFlowErrorMessage(error, "Failed to run model.");
      setErrorForThread(threadId, message);
      maybeShowBuilderLimitUpgrade(message);
    } finally {
      current.setThreadRunSending(threadId, false);
    }
  }, [
    isThreadBusy,
    maybeShowBuilderLimitUpgrade,
    resolvePreferredModelSelection,
    syncThreadModelSelection,
  ]);

  const regenerateLastTurn = useCallback(async () => {
    const current = argsRef.current;
    const setErrorForThread = (
      threadId: string | null,
      value: string | null | ((prev: string | null) => string | null),
    ) => current.setThreadErrorForThread(threadId, value);
    if (current.getSession() == null) {
      current.requireSignIn();
      return;
    }
    const session = current.getSession();
    if (!session) return;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) {
      current.requireSignIn();
      return;
    }

    const threadId = current.activeThreadId;
    if (!threadId) return;
    if (isThreadBusy(threadId)) {
      setErrorForThread(threadId, "This thread already has a turn in progress. Wait for it to finish before sending another.");
      return;
    }
    const lastUserMessageId = getLastThreadMessageId(current.threadMessages, "user");
    if (!lastUserMessageId) return;

    setErrorForThread(threadId, null);
    current.setThreadRunSending(threadId, true);
    current.pinWorkspaceToBottom();
    try {
      const currentThreadModel = current.threads.find((thread) => thread.id === threadId)?.model_id;
      const preferredModelSelection = resolvePreferredModelSelection();
      const preferredModelId = preferredModelSelection.modelId;
      const usePublicModel = preferredModelSelection.lane === "public";
      const currentThreadMessages = current.threadMessages.filter((message) => message.thread_id === threadId);
      if (!currentThreadModel || currentThreadModel !== preferredModelId) {
        syncThreadModelSelection(threadId, preferredModelId, usableSession);
      }

      let messagesForTurn = currentThreadMessages;

      if (usePublicModel) {
        let lastUserIndex = -1;
        for (let i = currentThreadMessages.length - 1; i >= 0; i--) {
          if (currentThreadMessages[i]?.role === "user") {
            lastUserIndex = i;
            break;
          }
        }
        if (lastUserIndex < 0) throw new Error("No user message available to regenerate.");

        messagesForTurn = currentThreadMessages.slice(0, lastUserIndex + 1);
        const trailingMessageIds = currentThreadMessages
          .slice(lastUserIndex + 1)
          .map((message) => message.id)
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
        await current.deleteThreadMessagesByIds(usableSession, trailingMessageIds);

      }
      const latestUserText = current.extractTextFromContentJson(
        messagesForTurn[messagesForTurn.length - 1]?.content_json,
      );
      const runtimeFlags = resolveAuthenticatedTurnRuntimeFlags();
      const turnResult = await current.runAgentTurn(usableSession, threadId, {
        preferredModelId,
        mode: "regenerate",
        runIdHint: `agent_web_regen:${lastUserMessageId}:${Date.now()}`,
        userMessageKey: lastUserMessageId,
        systemPrompt: null,
        inferenceSource: mapRequestedFundingSourceToInferenceSource(
          preferredModelSelection.fundingSource,
        ),
        requestedFundingSource: preferredModelSelection.fundingSource,
        requestedAgenticTools: runtimeFlags.requestedAgenticTools,
        replyToId: lastUserMessageId,
        messages: messagesForTurn,
      });
      if (turnResult.error) throw new Error(turnResult.error);
      await current.loadThreadMessages(threadId, usableSession);
    } catch (error) {
      const message = formatSendFlowErrorMessage(error, "Failed to run model.");
      setErrorForThread(threadId, message);
      maybeShowBuilderLimitUpgrade(message);
    } finally {
      current.setThreadRunSending(threadId, false);
    }
  }, [
    isThreadBusy,
    maybeShowBuilderLimitUpgrade,
    resolvePreferredModelSelection,
    syncThreadModelSelection,
  ]);

  return {
    sendUserMessage,
    retryLastTurn,
    regenerateLastTurn,
  };
}
