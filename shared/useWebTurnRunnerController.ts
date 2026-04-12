import { useCallback, useRef } from "react";
import {
  formatCloudFunctionErrorMessage,
  readCloudFunctionError,
} from "./cloudFunctionErrors";
import {
  invokeCloudPublicTurn,
  invokeCloudRuntimeTurn,
  requireCloudRuntimeBaseUrl,
  type CloudRuntimeTransport,
} from "./cloudRuntimeTransport";
import { sanitizeUserFacingAssistantText } from "./communityUserFacingOutputSanitizer";
import {
  addCloudThreadMessage,
  cancelCloudRuntimeRunByThreadKey,
  deleteCloudThreadMessage,
  ensureCloudThreadRecord,
} from "./cloudThreadsGateway";
import { listConvexCloudRuntimeRunEvents } from "./daytonaCloudThreadsRead";
import {
  type CreateAssistantMessageParams,
  type CreateThreadMessageParams,
  type PublicTurnThreadMessage,
  type RunAgentTurnParams,
  type RunPublicTurnParams,
  type ThreadStreamingState,
  type UseWebTurnRunnerControllerArgs,
  buildAssistantTextMessagePayload,
  buildPublicTurnMessages,
  isAbortError,
  mapInferenceIssueReason,
  normalizeGuestInferenceError,
} from "./webTurnRunnerCore";

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
  const threadStreamingAbortRefById = useRef<Record<string, AbortController | null>>({});
  const threadStreamingRafRefById = useRef<Record<string, number | null>>({});
  const threadStreamingUserCancelledRefById = useRef<Record<string, boolean>>({});

  const waitForPersistedRuntimeRun = useCallback(
    async (session: SessionT, runId: string): Promise<boolean> => {
      const normalizedRunId = String(runId ?? "").trim();
      if (!normalizedRunId) return false;
      const delaysMs = [0, 200, 500, 1000];
      for (const delayMs of delaysMs) {
        if (delayMs > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        }
        try {
          const rows = await listConvexCloudRuntimeRunEvents({
            session: session as any,
            runId: normalizedRunId,
            limit: 1,
          });
          if (Array.isArray(rows) && rows.length > 0) return true;
        } catch {
          // ignore and keep retrying; a failed read should not mask the original transport error
        }
      }
      return false;
    },
    [],
  );

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

  const resetThreadStreamingState = useCallback((threadId: string): void => {
    const current = argsRef.current;
    const rafId = threadStreamingRafRefById.current[threadId] ?? null;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
    }
    delete threadStreamingRafRefById.current[threadId];
    delete threadStreamingAbortRefById.current[threadId];
    delete threadStreamingContentRefById.current[threadId];
    delete threadStreamingUserCancelledRefById.current[threadId];
    setThreadStreamingState(threadId, () => null);
    current.setThreadSendingStateById((prev) => {
      if (!(threadId in prev)) return prev;
      const next = { ...prev };
      delete next[threadId];
      return next;
    });
  }, [setThreadStreamingState]);

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
          projectId: thread?.project_id ?? null,
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
      if (session) {
        void cancelCloudRuntimeRunByThreadKey({
          session: session as any,
          threadId: resolvedThreadId,
          runId: activeRunId,
        }).catch(() => null);
      }
      threadAbort.abort();
      return;
    }
    if (session && activeRunId) {
      void cancelCloudRuntimeRunByThreadKey({
        session: session as any,
        threadId: resolvedThreadId,
        runId: activeRunId,
      })
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
  }, [resetThreadStreamingState]);

  const stopAllStreamingTurns = useCallback((): void => {
    const current = argsRef.current;
    const session = current.session;
    for (const threadId of Object.keys(threadStreamingAbortRefById.current)) {
      const abort = threadStreamingAbortRefById.current[threadId] ?? null;
      threadStreamingUserCancelledRefById.current[threadId] = true;
      if (session) {
        const streamingState = current.threadStreamingStateById[threadId] ?? null;
        const activeRunId = String(streamingState?.runId ?? "").trim() || null;
        void cancelCloudRuntimeRunByThreadKey({
          session: session as any,
          threadId,
          runId: activeRunId,
        }).catch(() => null);
      }
      abort?.abort();
    }
  }, []);

  const runPublicTurn = useCallback(
    async (
      params: RunPublicTurnParams<ThreadMessageT>,
    ): Promise<{ cancelled: boolean; error: string | null; content: string; runId: string | null }> => {
      const current = argsRef.current;
      let baseUrl: string;
      try {
        baseUrl = requireCloudRuntimeBaseUrl(current.getCloudRuntimeBaseUrl);
      } catch {
        return { cancelled: false, error: "Missing cloud runtime base URL.", content: "", runId: null };
      }
      const transport: CloudRuntimeTransport<SessionT> = {
        baseUrl,
        fetchPublic: current.fetchCloudPublic,
        fetchAuth: current.fetchAuth,
      };

      threadStreamingAbortRefById.current[params.threadId]?.abort();
      const abort = new AbortController();
      threadStreamingAbortRefById.current[params.threadId] = abort;
      threadStreamingUserCancelledRefById.current[params.threadId] = false;
      threadStreamingContentRefById.current[params.threadId] = "";
      setThreadStreamingState(params.threadId, () => ({
        runId: params.runIdHint,
        meta: {
          engine_id: "public_web",
          model_id: params.modelId,
          inference_source: "free",
          memory_used: [],
          history_used: [],
          community_evidence_used: null,
        },
        content: "",
        streamTransport: "sse",
        runtimeEvents: [],
        lastRuntimeEventSeq: 0,
      }));

      const scheduleStreamingFlush = () => {
        if (threadStreamingRafRefById.current[params.threadId]) return;
        threadStreamingRafRefById.current[params.threadId] = window.requestAnimationFrame(() => {
          threadStreamingRafRefById.current[params.threadId] = null;
          const raw = threadStreamingContentRefById.current[params.threadId] ?? "";
          const nextContent = sanitizeUserFacingAssistantText({
            text: raw,
            blockedIds: [params.threadId, runIdFromServer],
          });
          setThreadStreamingState(params.threadId, (entry) =>
            entry
              ? {
                  ...entry,
                  content: nextContent,
                  streamTransport: "sse",
                }
              : null,
          );
        });
      };

      let finalContent = "";
      let runIdFromServer: string | null = null;
      let runtimeRequestId: string | null = null;
      let runtimeStage: string | null = null;
      let responseStarted = false;
      let firstEventSeen = false;
      let lastEventName: string | null = null;
      try {
        const turn = await invokeCloudPublicTurn({
          transport,
          payload: {
            model_id: params.modelId,
            stream: true,
            messages: buildPublicTurnMessages({
              messages: params.messages,
              systemPrompt: params.systemPrompt,
              extractTextFromContentJson: current.extractTextFromContentJson,
            }),
          },
          signal: abort.signal,
        });
        if (!turn.ok) {
          const failure = await readCloudFunctionError(turn);
          if (failure.category === "rate_limited") {
            return {
              cancelled: false,
              error: formatCloudFunctionErrorMessage({
                ...failure,
                message:
                  "Guest chat is hitting the free model limit right now. Sign in to save chats, unlock more models, and use your ChatGPT Plus / Pro or your own provider.",
              }),
              content: "",
              runId: null,
            };
          }
          if (failure.category === "misconfigured" || failure.category === "unavailable") {
            const errorMessage = failure.message.trim()
              ? normalizeGuestInferenceError(failure.message)
              : "Guest chat is temporarily unavailable.";
            return {
              cancelled: false,
              error: formatCloudFunctionErrorMessage({ ...failure, message: errorMessage }),
              content: "",
              runId: null,
            };
          }
          if (failure.category === "auth") {
            return {
              cancelled: false,
              error: formatCloudFunctionErrorMessage(failure),
              content: "",
              runId: null,
            };
          }
          throw new Error(
            normalizeGuestInferenceError(
              formatCloudFunctionErrorMessage(failure),
            ),
          );
        }
        const reader = turn.body?.getReader();
        if (!reader) throw new Error("Missing streaming response.");

        const decoder = new TextDecoder();
        let buffer = "";
        let eventName = "message";
        let dataBuffer = "";
        let seenDone = false;

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
          if (eventName === "start") {
            if (typeof parsed?.run_id === "string") {
              runIdFromServer = parsed.run_id;
              setThreadStreamingState(params.threadId, (entry) =>
                entry
                  ? {
                      ...entry,
                      runId: parsed.run_id,
                      streamTransport: "sse",
                    }
                  : null,
              );
            }
            if (typeof parsed?.engine_id === "string") {
              setThreadStreamingState(params.threadId, (entry) =>
                entry
                  ? {
                      ...entry,
                      meta: {
                        engine_id: parsed.engine_id,
                        model_id: typeof parsed?.model_id === "string" ? parsed.model_id : params.modelId,
                        inference_source: "free",
                        memory_used: [],
                        history_used: [],
                        community_evidence_used: null,
                      },
                      streamTransport: "sse",
                    }
                  : null,
              );
            }
          } else if (eventName === "delta") {
            const full = typeof parsed?.full_content === "string" ? parsed.full_content : null;
            const delta = typeof parsed?.delta === "string" ? parsed.delta : "";
            if (full !== null) {
              finalContent = full;
              threadStreamingContentRefById.current[params.threadId] = full;
            } else if (delta) {
              finalContent += delta;
              threadStreamingContentRefById.current[params.threadId] = finalContent;
            }
            scheduleStreamingFlush();
          } else if (eventName === "done") {
            if (typeof parsed?.full_content === "string") {
              finalContent = parsed.full_content;
              threadStreamingContentRefById.current[params.threadId] = parsed.full_content;
              scheduleStreamingFlush();
            }
            seenDone = true;
          } else if (eventName === "error") {
            const msg =
              (typeof parsed?.error === "string" && parsed.error.trim()) ||
              (typeof parsed?.message === "string" && parsed.message.trim()) ||
              (typeof parsed?.raw === "string" && parsed.raw.trim()) ||
              "Failed to run model.";
            throw new Error(msg);
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
        const sanitizedFinalContent = sanitizeUserFacingAssistantText({
          text: finalContent,
          blockedIds: [params.threadId, runIdFromServer],
        });
        return { cancelled: false, error: null, content: sanitizedFinalContent, runId: runIdFromServer };
      } catch (error) {
        const cancelled =
          threadStreamingUserCancelledRefById.current[params.threadId] === true || abort.signal.aborted || isAbortError(error);
        if (cancelled) return { cancelled: true, error: null, content: "", runId: null };
        const rawMessage =
          typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to run model.";
        return { cancelled: false, error: normalizeGuestInferenceError(rawMessage), content: "", runId: null };
      } finally {
        resetThreadStreamingState(params.threadId);
      }
    },
    [resetThreadStreamingState, setThreadStreamingState],
  );

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
        fetchPublic: current.fetchCloudPublic,
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
      let lastEventName: string | null = null;

      const scheduleStreamingFlush = () => {
        if (threadStreamingRafRefById.current[threadId]) return;
        threadStreamingRafRefById.current[threadId] = window.requestAnimationFrame(() => {
          threadStreamingRafRefById.current[threadId] = null;
          const raw = threadStreamingContentRefById.current[threadId] ?? "";
          const nextContent = sanitizeUserFacingAssistantText({
            text: raw,
            blockedIds: [threadId, params.replyToId ?? null, runIdFromServer],
          });
          setThreadStreamingState(threadId, (entry) =>
            entry
              ? {
                  ...entry,
                  content: nextContent,
                  streamTransport: "sse",
                }
              : null,
          );
        });
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
              model_id: params.preferredModelId,
              requested_funding_source: params.requestedFundingSource,
              idempotency_key: params.runIdHint,
              user_message_key: params.userMessageKey ?? undefined,
              requested_agentic_tools: params.requestedAgenticTools === true,
              ...(params.internalFollowup
                ? {
                    internal_followup: {
                      kind: params.internalFollowup.kind,
                      content: params.internalFollowup.content,
                      suppress_assistant_message: params.internalFollowup.suppressAssistantMessage === true,
                    },
                  }
                : null),
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
            failure.category === "workspace_credits" ||
            failure.category === "plan" ||
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

          if (params.internalFollowup?.suppressAssistantMessage !== true) {
            const safeAssistantText = sanitizeUserFacingAssistantText({
              text: finalContent,
              blockedIds: [threadId, params.replyToId ?? null, runIdFromServer],
            }).trim();
            if (!safeAssistantText) {
              throw new Error("Failed to run model.");
            }
          }
          if (params.internalFollowup?.suppressAssistantMessage !== true && !persistedAssistantMessageId) {
            throw new Error("Runtime turn did not persist assistant message.");
          }
          if (params.internalFollowup?.suppressAssistantMessage !== true) {
            await current.loadThreadMessages(threadId, session);
            await current.loadThreads(session);
          }
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
        return {
          cancelled: false,
          error: details.length > 0 ? `${inferredMessage} (${details.join(", ")})` : inferredMessage,
        };
      } finally {
        resetThreadStreamingState(threadId);
      }
    },
    [ensureCloudThreadRecordForRuntime, resetThreadStreamingState, setThreadStreamingState],
  );

  const createThreadMessage = useCallback(
    async (session: SessionT, params: CreateThreadMessageParams): Promise<string> => {
      const messageId = (params.id ?? crypto.randomUUID()).trim() || crypto.randomUUID();
      await addCloudThreadMessage({
        session: session as any,
        message: {
          messageId,
          threadId: params.threadId,
          seq: 0,
          role: params.role,
          contentJson: params.content_json,
          engineId: params.engine_id ?? null,
          modelId: params.model_id ?? null,
          runId: params.run_id ?? null,
        },
      });
      return messageId;
    },
    [waitForPersistedRuntimeRun],
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
    runPublicTurn,
    runAgentTurn,
    createThreadMessage,
    createAssistantTextMessage,
    deleteThreadMessagesByIds,
  };
}
