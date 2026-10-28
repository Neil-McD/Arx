import { useCallback, useRef } from "react";
import {
  classifyCloudFunctionErrorCategory,
  formatCloudFunctionErrorMessage,
  readCloudFunctionError,
} from "./cloudFunctionErrors";
import {
  cancelCloudRuntimeTurn,
  invokeCloudRuntimeTurn,
  requireCloudRuntimeBaseUrl,
  type CloudRuntimeTransport,
} from "./cloudRuntimeTransport";
import { sanitizeUserFacingAssistantText } from "./communityUserFacingOutputSanitizer";
import {
  addCloudThreadMessage,
  deleteCloudThreadMessage,
  ensureCloudThreadRecord,
} from "./cloudThreadsGateway";
import {
  getConvexCloudRuntimeRunByRunId,
} from "./cloudThreadsRead";
import {
  getNextSmoothStreamingText,
  shouldDisableStreamingSmoothing,
} from "./smoothStreamingText";
import {
  type CreateAssistantMessageParams,
  type CreateThreadMessageParams,
  type PublicTurnThreadMessage,
  type RunAgentTurnParams,
  type ThreadStreamingState,
  type UseWebTurnRunnerControllerArgs,
  buildAssistantTextMessagePayload,
  buildPublicTurnMessages,
  isAbortError,
  mapInferenceIssueReason,
} from "./webTurnRunnerCore";
import { isRecoverableRuntimeKernelStopReason } from "./runtimeKernelTypes";

export function useWebTurnRunnerController<
  SessionT,
  ThreadMessageT extends PublicTurnThreadMessage,
  MemoryUsedItemT,
  HistoryUsedItemT,
  CommunityEvidenceUsedT,
>(
  args: UseWebTurnRunnerControllerArgs<SessionT, MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;
  const threadStreamingContentRefById = useRef<Record<string, string | null>>({});
  const threadStreamingDisplayContentRefById = useRef<Record<string, string | null>>({});
  const threadStreamingAbortRefById = useRef<Record<string, AbortController | null>>({});
  const threadStreamingRafRefById = useRef<Record<string, number | null>>({});
  const threadStreamingDrainingRefById = useRef<Record<string, boolean>>({});
  const threadStreamingDrainResolversRefById = useRef<Record<string, Array<() => void>>>({});
  const threadStreamingUserCancelledRefById = useRef<Record<string, boolean>>({});

  const setThreadStreamingState = useCallback(
    (
      threadId: string,
      updater: (
        current: ThreadStreamingState<MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT> | null,
      ) => ThreadStreamingState<MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT> | null,
    ): void => {
      const current = argsRef.current;
      current.setThreadStreamingStateById((prev) => {
        const nextValue = updater(prev[threadId] ?? null);
        if (!nextValue) {
          if (!(threadId in prev)) return prev;
          const next = { ...prev };
          delete next[threadId];
          return next;
        }
        return {
          ...prev,
          [threadId]: nextValue,
        };
      });
    },
    [],
  );

  const resolveThreadStreamingDrain = useCallback((threadId: string): void => {
    const resolvers = threadStreamingDrainResolversRefById.current[threadId] ?? [];
    delete threadStreamingDrainResolversRefById.current[threadId];
    for (const resolve of resolvers) resolve();
  }, []);

  const setThreadStreamingDisplayContent = useCallback(
    (threadId: string, content: string): void => {
      threadStreamingDisplayContentRefById.current[threadId] = content;
      setThreadStreamingState(threadId, (entry) =>
        entry
          ? {
              ...entry,
              content,
              streamTransport: "sse",
            }
          : null,
      );
    },
    [setThreadStreamingState],
  );

  const scheduleThreadStreamingFlush = useCallback(
    (threadId: string, getSanitizedTargetContent: () => string): void => {
      if (threadStreamingRafRefById.current[threadId]) return;
      const tick = () => {
        threadStreamingRafRefById.current[threadId] = null;
        const targetContent = getSanitizedTargetContent();
        const currentContent = threadStreamingDisplayContentRefById.current[threadId] ?? "";
        const nextContent = getNextSmoothStreamingText(currentContent, targetContent, {
          draining: threadStreamingDrainingRefById.current[threadId] === true,
          reducedMotion: shouldDisableStreamingSmoothing(),
        });

        if (nextContent !== currentContent) {
          setThreadStreamingDisplayContent(threadId, nextContent);
        }

        if (nextContent !== targetContent) {
          threadStreamingRafRefById.current[threadId] = window.requestAnimationFrame(tick);
          return;
        }

        threadStreamingDrainingRefById.current[threadId] = false;
        resolveThreadStreamingDrain(threadId);
      };

      threadStreamingRafRefById.current[threadId] = window.requestAnimationFrame(tick);
    },
    [resolveThreadStreamingDrain, setThreadStreamingDisplayContent],
  );

  const drainThreadStreamingDisplay = useCallback(
    async (
      threadId: string,
      getSanitizedTargetContent: () => string,
      maxDelayMs = 1200,
    ): Promise<void> => {
      const targetContent = getSanitizedTargetContent();
      if (
        shouldDisableStreamingSmoothing() ||
        (threadStreamingDisplayContentRefById.current[threadId] ?? "") === targetContent
      ) {
        setThreadStreamingDisplayContent(threadId, targetContent);
        return;
      }

      threadStreamingDrainingRefById.current[threadId] = true;
      await new Promise<void>((resolve) => {
        const timeoutId = window.setTimeout(() => {
          threadStreamingDrainingRefById.current[threadId] = false;
          setThreadStreamingDisplayContent(threadId, getSanitizedTargetContent());
          resolveThreadStreamingDrain(threadId);
        }, maxDelayMs);
        const finish = () => {
          window.clearTimeout(timeoutId);
          resolve();
        };
        threadStreamingDrainResolversRefById.current[threadId] = [
          ...(threadStreamingDrainResolversRefById.current[threadId] ?? []),
          finish,
        ];
        scheduleThreadStreamingFlush(threadId, getSanitizedTargetContent);
      });
    },
    [resolveThreadStreamingDrain, scheduleThreadStreamingFlush, setThreadStreamingDisplayContent],
  );

  const resetThreadStreamingState = useCallback((
    threadId: string,
    options?: {
      preserveStreamingState?: boolean;
    },
  ): void => {
    const current = argsRef.current;
    const rafId = threadStreamingRafRefById.current[threadId] ?? null;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
    }
    resolveThreadStreamingDrain(threadId);
    delete threadStreamingRafRefById.current[threadId];
    delete threadStreamingAbortRefById.current[threadId];
    delete threadStreamingContentRefById.current[threadId];
    delete threadStreamingDisplayContentRefById.current[threadId];
    delete threadStreamingDrainingRefById.current[threadId];
    delete threadStreamingUserCancelledRefById.current[threadId];
    if (options?.preserveStreamingState !== true) {
      setThreadStreamingState(threadId, () => null);
    }
    current.setThreadSendingStateById((prev) => {
      if (!(threadId in prev)) return prev;
      const next = { ...prev };
      delete next[threadId];
      return next;
    });
  }, [resolveThreadStreamingDrain, setThreadStreamingState]);

  const recoverRuntimeTurnFromPersistedState = useCallback(
    async (params: {
      session: SessionT;
      threadId: string;
      runId: string | null;
      currentContent: string;
      exposeStreamingUi: boolean;
    }): Promise<{
      recovered: boolean;
      cancelled: boolean;
      error: string | null;
      preserveStreamingState: boolean;
    }> => {
      const normalizedRunId = String(params.runId ?? "").trim();
      if (!normalizedRunId) {
        return {
          recovered: false,
          cancelled: false,
          error: null,
          preserveStreamingState: false,
        };
      }

      const delaysMs = [0, 200, 500];
      let latestRun:
        | Awaited<ReturnType<typeof getConvexCloudRuntimeRunByRunId>>
        | null = null;
      for (const delayMs of delaysMs) {
        if (delayMs > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        }
        try {
          latestRun = await getConvexCloudRuntimeRunByRunId({
            session: params.session as any,
            runId: normalizedRunId,
          });
        } catch {
          latestRun = null;
        }
        const status = String(latestRun?.status ?? "").trim().toLowerCase();
        if (status && status !== "running") break;
      }

      const status = String(latestRun?.status ?? "").trim().toLowerCase();
      if (status === "ok") {
        const current = argsRef.current;
        await current.loadThreadMessages(params.threadId, params.session);
        await current.loadThreads(params.session);
        return {
          recovered: true,
          cancelled: false,
          error: null,
          preserveStreamingState: false,
        };
      }
      if (status === "cancelled") {
        const current = argsRef.current;
        await current.loadThreadMessages(params.threadId, params.session);
        await current.loadThreads(params.session);
        return {
          recovered: true,
          cancelled: true,
          error: null,
          preserveStreamingState: false,
        };
      }
      if (status === "error") {
        const current = argsRef.current;
        await current.loadThreadMessages(params.threadId, params.session);
        await current.loadThreads(params.session);
        return {
          recovered: true,
          cancelled: false,
          error:
            String(latestRun?.error_message ?? "").trim() ||
            (String(latestRun?.error_code ?? "").trim()
              ? `Run failed: ${String(latestRun?.error_code ?? "").trim()}.`
              : "Run failed before producing a response."),
          preserveStreamingState: false,
        };
      }
      if (status === "running" && params.exposeStreamingUi) {
        setThreadStreamingState(params.threadId, (entry) => ({
          runId: normalizedRunId,
          meta: entry?.meta ?? null,
          content: entry?.content ?? params.currentContent,
          streamTransport: "recovery",
          runtimeEvents: entry?.runtimeEvents ?? [],
          lastRuntimeEventSeq:
            typeof entry?.lastRuntimeEventSeq === "number" &&
            Number.isFinite(entry.lastRuntimeEventSeq)
              ? Math.max(0, Math.floor(entry.lastRuntimeEventSeq))
              : 0,
        }));
        return {
          recovered: true,
          cancelled: false,
          error: null,
          preserveStreamingState: true,
        };
      }
      return {
        recovered: false,
        cancelled: false,
        error: null,
        preserveStreamingState: false,
      };
    },
    [setThreadStreamingState],
  );

  const ensureCloudThreadRecordForRuntime = useCallback(
    async (session: SessionT, threadId: string): Promise<void> => {
      const current = argsRef.current;
      const thread = current.getThreadById?.(threadId);
      await ensureCloudThreadRecord({
        session: session as any,
        thread: {
          threadId,
          title: thread?.title ?? null,
          modelId: thread?.model_id ?? null,
          communityId: thread?.community_id ?? null,
          contextVersion:
            typeof thread?.context_version === "number" && Number.isFinite(thread.context_version)
              ? Math.max(0, Math.floor(thread.context_version))
              : null,
        },
      });
    },
    [],
  );

  const cancelRuntimeRun = useCallback(
    async (session: SessionT, threadId: string, runId: string): Promise<void> => {
      const current = argsRef.current;
      const baseUrl = requireCloudRuntimeBaseUrl(current.getCloudRuntimeBaseUrl);
      const response = await cancelCloudRuntimeTurn({
        transport: { baseUrl, fetchAuth: current.fetchAuth },
        session,
        threadId,
        runId,
      });
      if (!response.ok) throw new Error(`runtime_cancel_failed:${response.status}`);
    },
    [],
  );

  const stopStreamingTurn = useCallback((threadId?: string): void => {
    const resolvedThreadId = (threadId ?? argsRef.current.activeThreadId ?? "").trim();
    if (!resolvedThreadId) return;
    const current = argsRef.current;
    const session = current.session;
    const streamingState = current.threadStreamingStateById[resolvedThreadId] ?? null;
    const activeRunId = String(streamingState?.runId ?? "").trim() || null;
    const threadAbort = threadStreamingAbortRefById.current[resolvedThreadId] ?? null;
    threadStreamingUserCancelledRefById.current[resolvedThreadId] = true;
    if (threadAbort) {
      if (session && activeRunId) {
        void cancelRuntimeRun(session, resolvedThreadId, activeRunId)
          .catch(() => null)
          .finally(() => threadAbort.abort());
        return;
      }
      threadAbort.abort();
      return;
    }
    if (session && activeRunId) {
      void cancelRuntimeRun(session, resolvedThreadId, activeRunId)
        .catch(() => null)
        .finally(() => {
          resetThreadStreamingState(resolvedThreadId);
          current.setThreadErrorForThread(resolvedThreadId, null);
          void current.loadThreadMessages(resolvedThreadId, session).catch(() => null);
          void current.loadThreads(session).catch(() => null);
        });
      return;
    }
    resetThreadStreamingState(resolvedThreadId);
    current.setThreadErrorForThread(resolvedThreadId, null);
  }, [cancelRuntimeRun, resetThreadStreamingState]);

  const stopAllStreamingTurns = useCallback((): void => {
    const current = argsRef.current;
    const session = current.session;
    for (const threadId of Object.keys(threadStreamingAbortRefById.current)) {
      const abort = threadStreamingAbortRefById.current[threadId] ?? null;
      threadStreamingUserCancelledRefById.current[threadId] = true;
      if (session) {
        const streamingState = current.threadStreamingStateById[threadId] ?? null;
        const activeRunId = String(streamingState?.runId ?? "").trim() || null;
        if (!activeRunId) {
          abort?.abort();
          continue;
        }
        void cancelRuntimeRun(session, threadId, activeRunId)
          .catch(() => null)
          .finally(() => abort?.abort());
        continue;
      }
      abort?.abort();
    }
  }, [cancelRuntimeRun]);

  const runAgentTurn = useCallback(
    async (session: SessionT, threadId: string, params: RunAgentTurnParams): Promise<{ cancelled: boolean; error: string | null }> => {
      const current = argsRef.current;
      const exposeStreamingUi = params.suppressStreamingUi !== true;
      let baseUrl: string;
      try {
        baseUrl = requireCloudRuntimeBaseUrl(current.getCloudRuntimeBaseUrl);
      } catch {
        return { cancelled: false, error: "Missing cloud runtime base URL." };
      }
      const transport: CloudRuntimeTransport<SessionT> = {
        baseUrl,
        fetchAuth: current.fetchAuth,
      };
      try {
        await ensureCloudThreadRecordForRuntime(session, threadId);
      } catch (error) {
        console.warn("Non-fatal: ensure cloud thread record failed:", error);
      }

      threadStreamingAbortRefById.current[threadId]?.abort();
      const abort = new AbortController();
      threadStreamingAbortRefById.current[threadId] = abort;
      threadStreamingUserCancelledRefById.current[threadId] = false;
      threadStreamingContentRefById.current[threadId] = "";
      threadStreamingDisplayContentRefById.current[threadId] = "";
      threadStreamingDrainingRefById.current[threadId] = false;
      if (exposeStreamingUi) {
        setThreadStreamingState(threadId, () => ({
          runId: params.runIdHint,
          meta: {
            engine_id: "agent_web",
            model_id: params.preferredModelId,
            inference_source: params.inferenceSource ?? null,
            memory_used: [],
            history_used: [],
            community_evidence_used: null,
          },
          content: "",
          streamTransport: "sse",
          runtimeEvents: [],
          lastRuntimeEventSeq: 0,
        }));
      }
      let runIdFromServer: string | null = null;
      let runtimeRequestId: string | null = null;
      let runtimeStage: string | null = null;
      let responseStarted = false;
      let firstEventSeen = false;
      let streamStartNotified = false;
      let lastEventName: string | null = null;
      let finalContent = "";
      let preserveStreamingStateForRecovery = false;
      let streamInferenceIssueHandled = false;

      const getSanitizedStreamingContent = () => {
        const raw = threadStreamingContentRefById.current[threadId] ?? "";
        return sanitizeUserFacingAssistantText({
          text: raw,
          blockedIds: [threadId, params.replyToId ?? null, runIdFromServer],
        });
      };

      const scheduleStreamingFlush = () => {
        scheduleThreadStreamingFlush(threadId, getSanitizedStreamingContent);
      };

      try {
        const streamRuntimeTurn = true;
        const laneMessages = Array.isArray(params.messages)
          ? buildPublicTurnMessages({
              messages: params.messages,
              systemPrompt: params.systemPrompt,
              extractTextFromContentJson: current.extractTextFromContentJson,
            })
          : [];
        const createRuntimeTurnRequest = (): Promise<Response> => {
          return invokeCloudRuntimeTurn({
            transport,
            session,
            payload: {
              thread_id: threadId,
              stream: streamRuntimeTurn,
              surface: "web",
              invocation_surface: params.invocationSurface,
              ...(params.surfaceContext
                ? { surface_context: params.surfaceContext }
                : null),
              model_id: params.preferredModelId,
              requested_funding_source: params.requestedFundingSource,
              idempotency_key: params.runIdHint,
              user_message_key: params.userMessageKey ?? undefined,
              requested_agentic_tools: true,
              ...(laneMessages.length > 0 ? { messages: laneMessages } : null),
            },
            signal: abort.signal,
          });
        };

        let runtimeTurn = await createRuntimeTurnRequest();
        responseStarted = true;
        runtimeRequestId = (runtimeTurn.headers.get("x-arx-request-id") ?? "").trim() || null;
        runtimeStage = (runtimeTurn.headers.get("x-arx-runtime-stage") ?? "").trim() || null;
        if (!runtimeTurn.ok) {
          let failure = await readCloudFunctionError(runtimeTurn);
          runtimeRequestId = failure.requestId ?? runtimeRequestId;
          runtimeStage = failure.stage ?? runtimeStage;
          const failureMessage = String(failure.message ?? "").toLowerCase();
          const canRetryThreadMirror =
            failure.status === 404 &&
            (failureMessage.includes("thread_not_found") || String(failure.code ?? "").toLowerCase() === "thread_not_found");
          if (canRetryThreadMirror) {
            try {
              await ensureCloudThreadRecordForRuntime(session, threadId);
              runtimeTurn = await createRuntimeTurnRequest();
              responseStarted = true;
              runtimeRequestId = (runtimeTurn.headers.get("x-arx-request-id") ?? "").trim() || runtimeRequestId;
              runtimeStage = (runtimeTurn.headers.get("x-arx-runtime-stage") ?? "").trim() || runtimeStage;
              if (!runtimeTurn.ok) {
                failure = await readCloudFunctionError(runtimeTurn);
                runtimeRequestId = failure.requestId ?? runtimeRequestId;
                runtimeStage = failure.stage ?? runtimeStage;
              }
            } catch (mirrorError) {
              console.warn("Non-fatal: retry ensure cloud thread record failed:", mirrorError);
            }
          }
          if (!runtimeTurn.ok) {
            if (failure.category === "rate_limited") {
              return {
                cancelled: false,
                error: formatCloudFunctionErrorMessage({
                  ...failure,
                  message: "Too many requests. Try again soon.",
                }),
              };
            }
            if (
              failure.category === "quota" ||
              failure.category === "provider_connection_required" ||
              failure.category === "misconfigured" ||
              failure.category === "disabled" ||
              failure.category === "unavailable"
            ) {
              current.setInferenceIssueModal({
                reason: mapInferenceIssueReason(failure.category),
                threadId,
                mode: params.mode === "regenerate" ? "regenerate" : "respond",
                message: failure.message.trim() || null,
                code: failure.code ?? null,
              });
              return { cancelled: false, error: null };
            }
            if (failure.category === "auth") {
              return { cancelled: false, error: formatCloudFunctionErrorMessage(failure) };
            }
            throw new Error(formatCloudFunctionErrorMessage(failure));
          }
        }
        const reader = runtimeTurn.body?.getReader();
        if (!reader) throw new Error("Missing streaming response.");

          const decoder = new TextDecoder();
          let buffer = "";
          let eventName = "message";
          let dataBuffer = "";
          let seenDone = false;
          let persistedAssistantMessageId: string | null = null;
          let finalContent = "";

          const flushEvent = () => {
            const raw = dataBuffer.trim();
            dataBuffer = "";
            if (!raw) return;
            let parsed: any = null;
            try {
              parsed = JSON.parse(raw);
            } catch {
            parsed = { raw };
          }
          if (typeof parsed?.request_id === "string" && parsed.request_id.trim()) {
            runtimeRequestId = parsed.request_id.trim();
          }
          if (typeof parsed?.stage === "string" && parsed.stage.trim()) {
            runtimeStage = parsed.stage.trim();
          }
          firstEventSeen = true;
          lastEventName = eventName;
          if (eventName === "start") {
            if (typeof parsed?.run_id === "string") {
              runIdFromServer = parsed.run_id;
              if (exposeStreamingUi) {
                setThreadStreamingState(threadId, (entry) =>
                  entry
                    ? {
                        ...entry,
                        runId: parsed.run_id,
                        streamTransport: "sse",
                      }
                    : null,
                );
              }
            }
            if (!streamStartNotified) {
              streamStartNotified = true;
              try {
                params.onStreamStart?.({ runId: runIdFromServer });
              } catch {
                // UI lifecycle callbacks must not interrupt the runtime stream.
              }
            }
          } else if (eventName === "delta") {
            if (params.suppressStreamingUi) {
              eventName = "message";
              return;
            }
            const full = typeof parsed?.full_content === "string" ? parsed.full_content : null;
            const delta = typeof parsed?.delta === "string" ? parsed.delta : "";
            if (full !== null) {
              finalContent = full;
              threadStreamingContentRefById.current[threadId] = full;
            } else if (delta) {
              finalContent += delta;
              threadStreamingContentRefById.current[threadId] = finalContent;
            }
            scheduleStreamingFlush();
          } else if (eventName === "done") {
            if (!params.suppressStreamingUi && typeof parsed?.full_content === "string") {
              finalContent = parsed.full_content;
              threadStreamingContentRefById.current[threadId] = parsed.full_content;
              scheduleStreamingFlush();
            }
            if (typeof parsed?.run_id === "string") runIdFromServer = parsed.run_id;
            if (typeof parsed?.assistant_message_id === "string" && parsed.assistant_message_id.trim()) {
              persistedAssistantMessageId = parsed.assistant_message_id.trim();
            }
            seenDone = true;
          } else if (eventName === "runtime_event") {
            const runtimeEventId = typeof parsed?.id === "string" ? parsed.id.trim() : "";
            const runtimeEventRunId = typeof parsed?.run_id === "string" ? parsed.run_id.trim() : "";
            const runtimeEventType =
              typeof parsed?.event_type === "string" ? parsed.event_type.trim() : "";
            const runtimeEventCreatedAt =
              typeof parsed?.created_at === "string" ? parsed.created_at.trim() : "";
            const runtimeEventSeqRaw = Number(parsed?.seq);
            if (runtimeEventId && runtimeEventRunId && runtimeEventType && runtimeEventCreatedAt) {
              const runtimeEvent = {
                id: runtimeEventId,
                run_id: runtimeEventRunId,
                seq: Number.isFinite(runtimeEventSeqRaw)
                  ? Math.max(0, Math.floor(runtimeEventSeqRaw))
                  : 0,
                event_type: runtimeEventType,
                payload: parsed?.payload ?? null,
                created_at: runtimeEventCreatedAt,
              };
              current.setRuntimeEventsByRunId((prev) => {
                const existing = prev[runtimeEventRunId] ?? [];
                if (existing.some((row) => row.id === runtimeEvent.id)) return prev;
                return {
                  ...prev,
                  [runtimeEventRunId]: [...existing, runtimeEvent].sort(
                    (a, b) => a.seq - b.seq,
                  ),
                };
              });
              if (exposeStreamingUi) {
                setThreadStreamingState(threadId, (entry) => {
                  if (!entry) return entry;
                  if (Array.isArray(entry.runtimeEvents) && entry.runtimeEvents.some((row) => row.id === runtimeEvent.id)) {
                    return entry;
                  }
                  const nextRuntimeEvents = [...(entry.runtimeEvents ?? []), runtimeEvent].sort(
                    (a, b) => a.seq - b.seq,
                  );
                  return {
                    ...entry,
                    runId: entry.runId ?? runtimeEventRunId,
                    streamTransport: "sse",
                    runtimeEvents: nextRuntimeEvents,
                    lastRuntimeEventSeq: Math.max(
                      Math.max(0, Math.floor(entry.lastRuntimeEventSeq ?? 0)),
                      runtimeEvent.seq,
                    ),
                  };
                });
              }
            }
          } else if (eventName === "error") {
            const msg =
              (typeof parsed?.error === "string" && parsed.error.trim()) ||
              (typeof parsed?.message === "string" && parsed.message.trim()) ||
              (typeof parsed?.raw === "string" && parsed.raw.trim()) ||
              "Failed to run model.";
            const code =
              (typeof parsed?.code === "string" && parsed.code.trim()) ||
              null;
            if (isRecoverableRuntimeKernelStopReason(code)) {
              seenDone = true;
              return;
            }
            const status = Number(parsed?.status);
            const category = classifyCloudFunctionErrorCategory({
              status: Number.isFinite(status) ? Math.max(0, Math.floor(status)) : 500,
              code,
              message: msg,
            });
            if (
              category === "quota" ||
              category === "provider_connection_required" ||
              category === "misconfigured" ||
              category === "disabled" ||
              category === "unavailable"
            ) {
              current.setInferenceIssueModal({
                reason: mapInferenceIssueReason(category),
                threadId,
                mode: params.mode === "regenerate" ? "regenerate" : "respond",
                message: msg.trim() || null,
                code: code ?? null,
              });
              streamInferenceIssueHandled = true;
              seenDone = true;
              return;
            }
            const details: string[] = [];
            if (runtimeStage) details.push(`stage=${runtimeStage}`);
            if (runtimeRequestId) details.push(`request_id=${runtimeRequestId}`);
            throw new Error(details.length > 0 ? `${msg} (${details.join(", ")})` : msg);
          }
            eventName = "message";
          };

          while (!seenDone) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            while (true) {
              const idx = buffer.indexOf("\n");
              if (idx < 0) break;
              let line = buffer.slice(0, idx);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              buffer = buffer.slice(idx + 1);
              if (line.startsWith("event:")) {
                eventName = line.slice(6).trim();
                continue;
              }
              if (line.startsWith("data:")) {
                dataBuffer += line.slice(5).trim();
                continue;
              }
              if (line === "") {
                flushEvent();
                continue;
              }
            }
          }
          flushEvent();

          if (streamInferenceIssueHandled) {
            await current.loadThreadMessages(threadId, session);
            await current.loadThreads(session);
            return { cancelled: false, error: null };
          }

          const safeAssistantText = sanitizeUserFacingAssistantText({
            text: finalContent,
            blockedIds: [threadId, params.replyToId ?? null, runIdFromServer],
          }).trim();
          if (!safeAssistantText) {
            const recovered = await recoverRuntimeTurnFromPersistedState({
              session,
              threadId,
              runId: runIdFromServer,
              currentContent: finalContent,
              exposeStreamingUi,
            });
            if (recovered.recovered) {
              preserveStreamingStateForRecovery =
                recovered.preserveStreamingState;
              return {
                cancelled: recovered.cancelled,
                error: recovered.error,
              };
            }
            throw new Error("Failed to run model.");
          }
          if (!persistedAssistantMessageId) {
            const recovered = await recoverRuntimeTurnFromPersistedState({
              session,
              threadId,
              runId: runIdFromServer,
              currentContent: finalContent,
              exposeStreamingUi,
            });
            if (recovered.recovered) {
              preserveStreamingStateForRecovery =
                recovered.preserveStreamingState;
              return {
                cancelled: recovered.cancelled,
                error: recovered.error,
              };
            }
            throw new Error("Runtime turn did not persist assistant message.");
          }
          if (exposeStreamingUi) {
            await drainThreadStreamingDisplay(threadId, getSanitizedStreamingContent);
          }
          await current.loadThreadMessages(threadId, session);
          await current.loadThreads(session);
          return { cancelled: false, error: null };
      } catch (error) {
        const cancelled =
          Boolean(threadStreamingUserCancelledRefById.current[threadId]) ||
          abort.signal.aborted ||
          isAbortError(error);
        if (cancelled) {
          window.setTimeout(() => {
            void current.loadThreadMessages(threadId, session).catch(() => null);
            void current.loadThreads(session).catch(() => null);
          }, 350);
          return { cancelled: true, error: null };
        }
        const rawMessage =
          typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to run model.";
        const details: string[] = [];
        if (runtimeStage) details.push(`stage=${runtimeStage}`);
        if (runtimeRequestId) details.push(`request_id=${runtimeRequestId}`);
        if (lastEventName) details.push(`event=${lastEventName}`);
        const inferredMessage = (() => {
          if (rawMessage && rawMessage !== "Failed to fetch") return rawMessage;
          if (!responseStarted) return "Runtime transport failed before response.";
          if (!firstEventSeen) return "Runtime response stream failed before first event.";
          return "Runtime stream terminated unexpectedly.";
        })();
        if (runIdFromServer) {
          const recovered = await recoverRuntimeTurnFromPersistedState({
            session,
            threadId,
            runId: runIdFromServer,
            currentContent: finalContent,
            exposeStreamingUi,
          });
          if (recovered.recovered) {
            preserveStreamingStateForRecovery =
              recovered.preserveStreamingState;
            return {
              cancelled: recovered.cancelled,
              error: recovered.error,
            };
          }
        }
        return {
          cancelled: false,
          error: details.length > 0 ? `${inferredMessage} (${details.join(", ")})` : inferredMessage,
        };
      } finally {
        resetThreadStreamingState(threadId, {
          preserveStreamingState: preserveStreamingStateForRecovery,
        });
      }
    },
    [
      drainThreadStreamingDisplay,
      ensureCloudThreadRecordForRuntime,
      recoverRuntimeTurnFromPersistedState,
      resetThreadStreamingState,
      scheduleThreadStreamingFlush,
      setThreadStreamingState,
    ],
  );

  const createThreadMessage = useCallback(
    async (session: SessionT, params: CreateThreadMessageParams): Promise<string> => {
      const messageId = (params.id ?? crypto.randomUUID()).trim() || crypto.randomUUID();
      await addCloudThreadMessage({
        session: session as any,
        message: {
          messageId,
          threadId: params.threadId,
          role: params.role,
          contentJson: params.content_json,
          engineId: params.engine_id ?? null,
          modelId: params.model_id ?? null,
          runId: params.run_id ?? null,
        },
      });
      return messageId;
    },
    [],
  );

  const createAssistantTextMessage = useCallback(
    async (session: SessionT, params: CreateAssistantMessageParams): Promise<string> => {
      const payload = buildAssistantTextMessagePayload(params);
      return await createThreadMessage(session, {
        threadId: params.threadId,
        role: "assistant",
        content_json: payload.content_json,
        engine_id: payload.engine_id,
        model_id: payload.model_id,
        run_id: payload.run_id,
      });
    },
    [createThreadMessage],
  );

  const deleteThreadMessagesByIds = useCallback(async (session: SessionT, messageIds: string[]): Promise<void> => {
    const current = argsRef.current;
    const threadId = String(current.activeThreadId ?? "").trim();
    if (!threadId) return;
    for (const messageId of messageIds) {
      const trimmed = messageId.trim();
      if (!trimmed) continue;
      await deleteCloudThreadMessage({
        session: session as any,
        threadId,
        messageId: trimmed,
      });
    }
  }, []);

  return {
    stopStreamingTurn,
    stopAllStreamingTurns,
    runAgentTurn,
    createThreadMessage,
    createAssistantTextMessage,
    deleteThreadMessagesByIds,
  };
}
