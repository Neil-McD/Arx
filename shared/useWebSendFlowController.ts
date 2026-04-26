import { useCallback, useRef } from "react";
import { formatSendFlowErrorMessage } from "./appErrorMappings";
import { buildCloudCommunityContextEnvelope } from "./communityContextEnvelope";
import { resolveUsableSession } from "./ensureUsableSession";
import {
  finishProductLatencyTrace,
  markProductLatencyTrace,
  startProductLatencyTrace,
} from "./productLatencyTrace";
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
    const setGuestIssueForThread = (
      threadId: string | null,
      value: Parameters<typeof current.setGuestInferenceIssueForThread>[1],
    ) => current.setGuestInferenceIssueForThread(threadId, value);
    const text = String(opts?.text ?? "").trim();
    const attachmentsToSend = Array.isArray(opts?.attachments) ? [...opts.attachments] : [];
    const hasAttachments = attachmentsToSend.length > 0;
    const clearComposer = opts?.clearComposer ?? current.clearWorkspaceComposer;
    const pinToBottom = opts?.pinToBottom ?? current.pinWorkspaceToBottom;
    if (!text && !hasAttachments) return;
    const trace = startProductLatencyTrace("workspace.send", {
      hasAttachments,
      textLength: text.length,
      activeThreadId: current.activeThreadId,
      workspaceWantsNewChat: current.workspaceWantsNewChat === true,
    });
    let traceStatus: "ok" | "cancelled" | "error" = "ok";
    const finishTrace = (status: "ok" | "cancelled" | "error" = traceStatus, details?: Record<string, unknown>) => {
      finishProductLatencyTrace(trace, status, details);
    };

    const session = current.getSession();
    markProductLatencyTrace(trace, "session_snapshot", { hasSession: Boolean(session) });
    if (!session) {
      if (hasAttachments) {
        current.setThreadError(null);
        current.requireSignIn();
        finishTrace("cancelled", { reason: "signin_required_for_attachments" });
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
      setGuestIssueForThread(current.guestThreadId, null);
      current.setIsSendingMessage(true);
      current.setThreadRunSending(current.guestThreadId, true);
      pinToBottom();
      try {
        current.setWorkspaceWantsNewChatMode(false);
        if (current.activeThreadId !== current.guestThreadId) current.setActiveThreadId(current.guestThreadId);
        current.setThreadMessages(baseMessages);
        markProductLatencyTrace(trace, "guest_user_message_visible", { messageCount: baseMessages.length });
        clearComposer();
        persistGuestFromMessages(baseMessages);

        markProductLatencyTrace(trace, "guest_runtime_start", { modelId: current.guestModelId });
        const turnResult = await current.runPublicTurn({
          modelId: current.guestModelId,
          threadId: current.guestThreadId,
          runIdHint: `public_web:${userMsg.id}`,
          messages: baseMessages,
          systemPrompt: buildCloudCommunityContextEnvelope({}).scopedSystemPrompt,
        });
        markProductLatencyTrace(trace, "guest_runtime_end", {
          cancelled: turnResult.cancelled,
          hasError: Boolean(turnResult.error),
          hasContent: Boolean((turnResult.content ?? "").trim()),
        });
        setGuestIssueForThread(current.guestThreadId, turnResult.guestIssue ?? null);
        if (turnResult.error) throw new Error(turnResult.error);
        if (turnResult.cancelled) {
          traceStatus = "cancelled";
          return;
        }
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
        traceStatus = "error";
        setErrorForThread(
          current.guestThreadId,
          formatSendFlowErrorMessage(error, "Failed to send message."),
        );
      } finally {
        current.setThreadRunSending(current.guestThreadId, false);
        current.setIsSendingMessage(false);
        finishTrace();
      }
      return;
    }

    markProductLatencyTrace(trace, "resolve_session_start");
    let usableSession: SessionT | null;
    try {
      usableSession = await resolveUsableSession(session, current.ensureSession);
      markProductLatencyTrace(trace, "resolve_session_end", { hasUsableSession: Boolean(usableSession) });
    } catch (error) {
      finishTrace("error", {
        reason: "resolve_session_failed",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    if (!usableSession) {
      current.requireSignIn();
      finishTrace("cancelled", { reason: "signin_required_after_session_resolve" });
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
      finishTrace("cancelled", { reason: "thread_busy", threadId: current.activeThreadId });
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
        markProductLatencyTrace(trace, "create_thread_start");
        const created = await current.createThread(usableSession);
        createdThreadRecord = created;
        threadId = created?.id ?? null;
        createdThreadId = threadId;
        if (!threadId) {
          markProductLatencyTrace(trace, "create_thread_retry_start");
          const retryCreated = await current.createThread(usableSession);
          if (!createdThreadRecord) createdThreadRecord = retryCreated;
          threadId = retryCreated?.id ?? null;
          if (!createdThreadId) createdThreadId = threadId;
        }
        markProductLatencyTrace(trace, "create_thread_end", { threadId, retried: !created?.id });
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

      markProductLatencyTrace(trace, "ensure_lens_start", { threadId });
      await current.ensureWorkspaceThreadLensBeforeSend(threadId, usableSession);
      markProductLatencyTrace(trace, "ensure_lens_end", { threadId });
      markProductLatencyTrace(trace, "title_sync_start", { threadId });
      await current.maybeSetThreadTitleFromText(threadId, text, usableSession);
      markProductLatencyTrace(trace, "title_sync_end", { threadId });

      markProductLatencyTrace(trace, "memory_intent_extract_start");
      const remembered = current.userMemoryRememberEnabled ? current.extractRememberIntent(text) : null;
      markProductLatencyTrace(trace, "memory_intent_extract_end", { hasRemembered: Boolean(remembered) });
      if (remembered && hasPersonalMemoryAccess) {
        try {
          markProductLatencyTrace(trace, "memory_write_start");
          await current.createPersonalMemoryItemDirect({ content: remembered, pinned: false });
          markProductLatencyTrace(trace, "memory_write_end");
          current.showMemoryToastMessage("Memory updated");
        } catch (error) {
          markProductLatencyTrace(trace, "memory_write_error");
          console.warn("Failed to save memory intent:", error);
        }
      }

      const messageId = crypto.randomUUID();
      const usePublicModel = preferredModelSelection.lane === "public";
      if (usePublicModel && attachmentsToSend.length > 0) {
        throw new Error("Attachments are not available with free-tier models. Choose a paid model to send files.");
      }

      markProductLatencyTrace(trace, "persist_user_message_start", { threadId, messageId });
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
      markProductLatencyTrace(trace, "persist_user_message_end", { threadId, messageId });

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
      markProductLatencyTrace(trace, "user_message_visible", {
        threadId,
        messageCount: optimisticThreadMessages.length,
      });

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
      markProductLatencyTrace(trace, "runtime_turn_start", {
        threadId,
        modelId: preferredModelId,
        inferenceSource,
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
      markProductLatencyTrace(trace, "runtime_turn_end", {
        cancelled: turnResult.cancelled,
        hasError: Boolean(turnResult.error),
      });
      if (turnResult.cancelled) traceStatus = "cancelled";
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
      markProductLatencyTrace(trace, "post_run_messages_reload_start", { threadId });
      await current.loadThreadMessages(threadId, usableSession);
      markProductLatencyTrace(trace, "post_run_messages_reload_end", { threadId });
    } catch (error) {
      traceStatus = "error";
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
      finishTrace(traceStatus, { threadId: runThreadId });
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
