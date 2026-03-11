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
  deleteCloudThreadMessage,
  ensureCloudThreadRecord,
} from "./cloudThreadsGateway";
import {
  type CreateAssistantMessageParams,
  type CreateThreadMessageParams,
  type PlatformQuotaModalState,
  type PublicTurnThreadMessage,
  type RunAgentTurnParams,
  type RunPublicTurnParams,
  type UseWebTurnRunnerControllerArgs,
  buildAssistantTextMessagePayload,
  buildPublicTurnMessages,
  isAbortError,
  mapPlatformFailureReason,
  normalizeGuestInferenceError,
  resetStreamingState,
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

  const stopStreamingTurn = useCallback((): void => {
    const current = argsRef.current;
    if (!current.streamingAbortRef.current) return;
    current.streamingUserCancelledRef.current = true;
    current.streamingAbortRef.current.abort();
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
        fetchAuth: current.fetchCloudAuth,
      };

      current.streamingAbortRef.current?.abort();
      const abort = new AbortController();
      current.streamingAbortRef.current = abort;
      current.streamingUserCancelledRef.current = false;
      current.streamingContentRef.current = "";
      current.setStreamingContent("");
      current.setStreamingThreadId(params.threadId);
      current.setStreamingRunId(params.runIdHint);
      current.setStreamingMeta({
        engine_id: "public_web",
        model_id: params.modelId,
        inference_source: "platform",
        memory_used: [],
        history_used: [],
        community_evidence_used: null,
      });

      const scheduleStreamingFlush = () => {
        if (current.streamingRafRef.current) return;
        current.streamingRafRef.current = window.requestAnimationFrame(() => {
          current.streamingRafRef.current = null;
          const raw = current.streamingContentRef.current ?? "";
          current.setStreamingContent(
            sanitizeUserFacingAssistantText({
              text: raw,
              blockedIds: [params.threadId, runIdFromServer],
            }),
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
                  "Guest chat is hitting the free model limit right now. Sign in for ChatGPT Plus/Pro rate limits or connect your own key.",
              }),
              content: "",
              runId: null,
            };
          }
          if (failure.category === "misconfigured") {
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
              current.setStreamingRunId(parsed.run_id);
            }
            if (typeof parsed?.engine_id === "string") {
              current.setStreamingMeta({
                engine_id: parsed.engine_id,
                model_id: typeof parsed?.model_id === "string" ? parsed.model_id : params.modelId,
                inference_source: "platform",
                memory_used: [],
                history_used: [],
                community_evidence_used: null,
              });
            }
          } else if (eventName === "delta") {
            const full = typeof parsed?.full_content === "string" ? parsed.full_content : null;
            const delta = typeof parsed?.delta === "string" ? parsed.delta : "";
            if (full !== null) {
              finalContent = full;
              current.streamingContentRef.current = full;
            } else if (delta) {
              finalContent += delta;
              current.streamingContentRef.current = finalContent;
            }
            scheduleStreamingFlush();
          } else if (eventName === "done") {
            if (typeof parsed?.full_content === "string") {
              finalContent = parsed.full_content;
              current.streamingContentRef.current = parsed.full_content;
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
        const cancelled = current.streamingUserCancelledRef.current || abort.signal.aborted || isAbortError(error);
        if (cancelled) return { cancelled: true, error: null, content: "", runId: null };
        const rawMessage =
          typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to run model.";
        return { cancelled: false, error: normalizeGuestInferenceError(rawMessage), content: "", runId: null };
      } finally {
        resetStreamingState(current);
      }
    },
    [],
  );

  const runAgentTurn = useCallback(
    async (session: SessionT, threadId: string, params: RunAgentTurnParams): Promise<{ cancelled: boolean; error: string | null }> => {
      const current = argsRef.current;
      let baseUrl: string;
      try {
        baseUrl = requireCloudRuntimeBaseUrl(current.getCloudRuntimeBaseUrl);
      } catch {
        return { cancelled: false, error: "Missing cloud runtime base URL." };
      }
      const transport: CloudRuntimeTransport<SessionT> = {
        baseUrl,
        fetchPublic: current.fetchCloudPublic,
        fetchAuth: current.fetchCloudAuth,
      };
      try {
        await ensureCloudThreadRecordForRuntime(session, threadId);
      } catch (error) {
        console.warn("Non-fatal: ensure cloud thread record failed:", error);
      }

      current.streamingAbortRef.current?.abort();
      const abort = new AbortController();
      current.streamingAbortRef.current = abort;
      current.streamingUserCancelledRef.current = false;
      current.streamingContentRef.current = "";
      current.setStreamingContent("");
      current.setStreamingThreadId(threadId);
      current.setStreamingRunId(params.runIdHint);
      current.setStreamingMeta({
        engine_id: "agent_web",
        model_id: params.preferredModelId,
        inference_source: params.inferenceSource ?? null,
        memory_used: [],
        history_used: [],
        community_evidence_used: null,
      });
      let runIdFromServer: string | null = null;
      let runtimeRequestId: string | null = null;
      let runtimeStage: string | null = null;
      let responseStarted = false;
      let firstEventSeen = false;
      let lastEventName: string | null = null;

      const scheduleStreamingFlush = () => {
        if (current.streamingRafRef.current) return;
        current.streamingRafRef.current = window.requestAnimationFrame(() => {
          current.streamingRafRef.current = null;
          const raw = current.streamingContentRef.current ?? "";
          current.setStreamingContent(
            sanitizeUserFacingAssistantText({
              text: raw,
              blockedIds: [threadId, params.replyToId ?? null, runIdFromServer],
            }),
          );
        });
      };

      try {
        const requestedExecutionTarget = params.requestedExecutionTarget ?? "chat";
        const laneMessages = Array.isArray(params.messages)
          ? buildPublicTurnMessages({
              messages: params.messages,
              systemPrompt: requestedExecutionTarget === "daytona_workspace" ? null : params.systemPrompt,
              extractTextFromContentJson: current.extractTextFromContentJson,
            })
          : [];
        const createRuntimeTurnRequest = (): Promise<Response> => {
          return invokeCloudRuntimeTurn({
            transport,
            session,
            payload: {
              thread_id: threadId,
              stream: true,
              surface: "web",
              requested_execution_target: requestedExecutionTarget,
              model_id: params.preferredModelId,
              requested_funding_source: params.requestedFundingSource ?? "platform",
              idempotency_key: params.runIdHint,
              user_message_key: params.userMessageKey ?? undefined,
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
            failure.category === "misconfigured" ||
            failure.category === "disabled" ||
            failure.category === "plan"
          ) {
            current.setPlatformQuotaModal({
              reason: mapPlatformFailureReason(failure.category),
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
          let runtimeLane: string | null = null;
          let persistedAssistantMessageId: string | null = null;
          let finalContent = "";
          let cloudLifecycleStarted = false;
          let cloudLifecycleDone = false;

          const maybeEmitCloudLifecycle = (phase: "start" | "done", laneValue: string | null | undefined): void => {
            const lane = String(laneValue ?? "").trim().toLowerCase();
            if (lane !== "daytona" && lane !== "daytona_cloud") return;
            if (phase === "start") {
              if (cloudLifecycleStarted) return;
              cloudLifecycleStarted = true;
            } else if (cloudLifecycleDone) {
              return;
            } else {
              cloudLifecycleDone = true;
            }
            current.onCloudRunLifecycleEvent?.({
              threadId,
              runId: runIdFromServer,
              phase,
            });
          };

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
                current.setStreamingRunId(parsed.run_id);
              }
              if (typeof parsed?.lane === "string") runtimeLane = parsed.lane;
              maybeEmitCloudLifecycle("start", runtimeLane);
            } else if (eventName === "delta") {
              const full = typeof parsed?.full_content === "string" ? parsed.full_content : null;
              const delta = typeof parsed?.delta === "string" ? parsed.delta : "";
              if (full !== null) {
                finalContent = full;
                current.streamingContentRef.current = full;
              } else if (delta) {
                finalContent += delta;
                current.streamingContentRef.current = finalContent;
              }
              scheduleStreamingFlush();
            } else if (eventName === "done") {
              if (typeof parsed?.full_content === "string") {
                finalContent = parsed.full_content;
                current.streamingContentRef.current = parsed.full_content;
                scheduleStreamingFlush();
              }
              if (typeof parsed?.run_id === "string") runIdFromServer = parsed.run_id;
              if (typeof parsed?.lane === "string") runtimeLane = parsed.lane;
              if (typeof parsed?.assistant_message_id === "string" && parsed.assistant_message_id.trim()) {
                persistedAssistantMessageId = parsed.assistant_message_id.trim();
              }
              maybeEmitCloudLifecycle("done", runtimeLane);
              seenDone = true;
            } else if (eventName === "error") {
              maybeEmitCloudLifecycle("done", runtimeLane);
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
          maybeEmitCloudLifecycle("done", runtimeLane);

          const safeAssistantText = sanitizeUserFacingAssistantText({
            text: finalContent,
            blockedIds: [threadId, params.replyToId ?? null, runIdFromServer],
          }).trim();
          if (!safeAssistantText) {
            throw new Error("Failed to run model.");
          }
          if (!persistedAssistantMessageId) {
            throw new Error("Runtime turn did not persist assistant message.");
          }
          await current.loadThreadMessages(threadId, session);
          await current.loadThreads(session);
        return { cancelled: false, error: null };
      } catch (error) {
        const cancelled = current.streamingUserCancelledRef.current || abort.signal.aborted || isAbortError(error);
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
        resetStreamingState(current);
      }
    },
    [ensureCloudThreadRecordForRuntime],
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
    runPublicTurn,
    runAgentTurn,
    createThreadMessage,
    createAssistantTextMessage,
    deleteThreadMessagesByIds,
  };
}
