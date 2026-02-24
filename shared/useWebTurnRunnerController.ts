import { useCallback, useRef } from "react";
import {
  formatSupabaseFunctionErrorMessage,
  readSupabaseFunctionError,
} from "./supabaseFunctionErrors";
import { sanitizeUserFacingAssistantText } from "./communityUserFacingOutputSanitizer.mjs";
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
      const url = current.getSupabaseUrl();
      if (!url) return { cancelled: false, error: "Missing Supabase URL.", content: "", runId: null };

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
      try {
        const turn = await current.fetchWithSupabasePublic(`${url}/functions/v1/public_turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model_id: params.modelId,
            stream: true,
            messages: buildPublicTurnMessages({
              messages: params.messages,
              systemPrompt: params.systemPrompt,
              communityEvidenceUserMessage: params.communityEvidenceUserMessage,
              extractTextFromContentJson: current.extractTextFromContentJson,
            }),
          }),
          signal: abort.signal,
        });
        if (!turn.ok) {
          const failure = await readSupabaseFunctionError(turn);
          if (failure.category === "rate_limited") {
            return {
              cancelled: false,
              error: formatSupabaseFunctionErrorMessage({
                ...failure,
                message: "Too many requests. Try again soon.",
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
              error: formatSupabaseFunctionErrorMessage({ ...failure, message: errorMessage }),
              content: "",
              runId: null,
            };
          }
          if (failure.category === "auth") {
            return {
              cancelled: false,
              error: formatSupabaseFunctionErrorMessage(failure),
              content: "",
              runId: null,
            };
          }
          throw new Error(
            normalizeGuestInferenceError(
              formatSupabaseFunctionErrorMessage(failure),
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
      const url = current.getSupabaseUrl();
      if (!url) return { cancelled: false, error: "Missing Supabase URL." };

      const runtimeTurnFallbackCodes = new Set([
        "runner_unavailable",
        "runtime_turn_failed",
        "run_lookup_failed",
        "run_create_failed",
        "run_update_failed",
        "run_event_append_failed",
      ]);

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

      const runLegacyAgentTurn = async (): Promise<{ cancelled: boolean; error: string | null }> => {
        const turn = await current.fetchWithSupabaseAuth(
          `${url}/functions/v1/agent_turn`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              thread_id: threadId,
              stream: true,
              model_id: params.preferredModelId,
              ...(params.mode ? { mode: params.mode } : null),
              ...(params.inferenceSource ? { inference_source: params.inferenceSource } : null),
              ...(params.replyToId ? { reply_to_id: params.replyToId } : null),
            }),
            signal: abort.signal,
          },
          session,
        );
        if (!turn.ok) {
          const failure = await readSupabaseFunctionError(turn);
          if (failure.category === "rate_limited") {
            return {
              cancelled: false,
              error: formatSupabaseFunctionErrorMessage({
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
            // Function-lane auth errors can be verifier/config drift while the
            // browser session is still valid. Confirm auth truth before showing
            // a sign-in error.
            try {
              const authProbe = await current.fetchWithSupabaseAuth(
                `${url}/auth/v1/user`,
                { method: "GET" },
                session,
              );
              if (authProbe.ok) {
                const base = "Arx AI is temporarily unavailable. Please retry.";
                const withRequestId =
                  failure.requestId && !base.toLowerCase().includes("request_id=")
                    ? `${base} (request_id=${failure.requestId})`
                    : base;
                return { cancelled: false, error: withRequestId };
              }
            } catch {
              // fall through: true auth/session failure should keep sign-in copy.
            }
            return { cancelled: false, error: formatSupabaseFunctionErrorMessage(failure) };
          }
          throw new Error(formatSupabaseFunctionErrorMessage(failure));
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
              const memoryUsed = current.parseMemoryUsedArray(parsed?.memory_used);
              const historyUsed = current.parseHistoryUsedArray(parsed?.history_used);
              const communityEvidence = current.extractCommunityEvidenceUsedV1(parsed);
              current.setStreamingMeta({
                engine_id: parsed.engine_id,
                model_id: typeof parsed?.model_id === "string" ? parsed.model_id : null,
                inference_source: typeof parsed?.inference_source === "string" ? parsed.inference_source : null,
                memory_used: memoryUsed,
                history_used: historyUsed,
                community_evidence_used: communityEvidence,
              });
            }
          } else if (eventName === "delta") {
            const full = typeof parsed?.full_content === "string" ? parsed.full_content : null;
            const delta = typeof parsed?.delta === "string" ? parsed.delta : "";
            if (full !== null) {
              current.streamingContentRef.current = full;
            } else if (delta) {
              const prior = current.streamingContentRef.current ?? "";
              current.streamingContentRef.current = `${prior}${delta}`;
            }
            scheduleStreamingFlush();
          } else if (eventName === "done") {
            const memoryAdded = current.parseMemoryUsedArray(parsed?.memory_added);
            if (memoryAdded.length > 0) current.showMemoryToastMessage("Memory updated");
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

        await current.loadThreadMessages(threadId, session);
        await current.loadThreads(session);
        return { cancelled: false, error: null };
      };

      try {
        const runtimeTurnEnabled = current.runtimeTurnV2Enabled === true && params.mode !== "regenerate";
        if (runtimeTurnEnabled) {
          const runtimeTurn = await current.fetchWithSupabaseAuth(
            `${url}/functions/v1/runtime_turn`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                thread_id: threadId,
                stream: true,
                surface: "web",
                requires_tools: true,
                model_id: params.preferredModelId,
                idempotency_key: params.runIdHint,
              }),
              signal: abort.signal,
            },
            session,
          );
          if (!runtimeTurn.ok) {
            const failure = await readSupabaseFunctionError(runtimeTurn);
            if (failure.category === "rate_limited") {
              return {
                cancelled: false,
                error: formatSupabaseFunctionErrorMessage({
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
              return { cancelled: false, error: formatSupabaseFunctionErrorMessage(failure) };
            }
            const code = String(failure.code ?? "").trim().toLowerCase();
            if (failure.status >= 500 || runtimeTurnFallbackCodes.has(code)) {
              return await runLegacyAgentTurn();
            }
            throw new Error(formatSupabaseFunctionErrorMessage(failure));
          }

          const reader = runtimeTurn.body?.getReader();
          if (!reader) throw new Error("Missing streaming response.");

          const decoder = new TextDecoder();
          let buffer = "";
          let eventName = "message";
          let dataBuffer = "";
          let seenDone = false;
          let runtimeLane: string | null = null;
          let runtimeEngineId: string | null = null;
          let runtimeModelId: string | null = null;
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
            if (eventName === "start") {
              if (typeof parsed?.run_id === "string") {
                runIdFromServer = parsed.run_id;
                current.setStreamingRunId(parsed.run_id);
              }
              if (typeof parsed?.lane === "string") runtimeLane = parsed.lane;
              if (typeof parsed?.model_id === "string") runtimeModelId = parsed.model_id;
              if (typeof parsed?.engine_id === "string") runtimeEngineId = parsed.engine_id;
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
              if (typeof parsed?.model_id === "string") runtimeModelId = parsed.model_id;
              if (typeof parsed?.engine_id === "string") runtimeEngineId = parsed.engine_id;
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

          const safeAssistantText = sanitizeUserFacingAssistantText({
            text: finalContent,
            blockedIds: [threadId, params.replyToId ?? null, runIdFromServer],
          }).trim();
          if (!safeAssistantText) {
            throw new Error("Failed to run model.");
          }
          const normalizedLane = String(runtimeLane ?? "").trim().toLowerCase();
          const inferenceSource = normalizedLane === "public" ? "free" : "platform";
          const assistantPayload = buildAssistantTextMessagePayload({
            threadId,
            text: safeAssistantText,
            engineId: (runtimeEngineId ?? "runtime_turn").trim() || "runtime_turn",
            modelId: (runtimeModelId ?? params.preferredModelId).trim() || params.preferredModelId,
            runId: runIdFromServer,
            inferenceSource,
          });
          const insertAssistant = await current.fetchWithSupabaseAuth(
            `${url}/rest/v1/messages`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: crypto.randomUUID(),
                thread_id: threadId,
                seq: 0,
                role: "assistant",
                content_json: assistantPayload.content_json,
                ...(assistantPayload.engine_id ? { engine_id: assistantPayload.engine_id } : null),
                ...(assistantPayload.model_id ? { model_id: assistantPayload.model_id } : null),
                ...(assistantPayload.run_id ? { run_id: assistantPayload.run_id } : null),
              }),
            },
            session,
          );
          if (!insertAssistant.ok) {
            throw new Error(await current.readSupabaseError(insertAssistant));
          }
          await current.loadThreadMessages(threadId, session);
          await current.loadThreads(session);
          return { cancelled: false, error: null };
        }

        return await runLegacyAgentTurn();
      } catch (error) {
        const cancelled = current.streamingUserCancelledRef.current || abort.signal.aborted || isAbortError(error);
        if (cancelled) {
          window.setTimeout(() => {
            void current.loadThreadMessages(threadId, session).catch(() => null);
            void current.loadThreads(session).catch(() => null);
          }, 350);
          return { cancelled: true, error: null };
        }
        const message =
          typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to run model.";
        return { cancelled: false, error: message };
      } finally {
        resetStreamingState(current);
      }
    },
    [],
  );

  const createThreadMessage = useCallback(
    async (session: SessionT, params: CreateThreadMessageParams): Promise<string> => {
      const current = argsRef.current;
      const url = current.getSupabaseUrl();
      if (!url) throw new Error("Missing Supabase URL.");
      const messageId = (params.id ?? crypto.randomUUID()).trim() || crypto.randomUUID();
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: messageId,
            thread_id: params.threadId,
            seq: 0,
            role: params.role,
            content_json: params.content_json,
            ...(params.engine_id ? { engine_id: params.engine_id } : null),
            ...(params.model_id ? { model_id: params.model_id } : null),
            ...(params.run_id ? { run_id: params.run_id } : null),
          }),
        },
        session,
      );
      if (!response.ok) {
        const message = await current.readSupabaseError(response);
        throw new Error(message || "Failed to save message.");
      }
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
    const url = current.getSupabaseUrl();
    if (!url) throw new Error("Missing Supabase URL.");
    for (const messageId of messageIds) {
      const trimmed = messageId.trim();
      if (!trimmed) continue;
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/messages?id=eq.${encodeURIComponent(trimmed)}`,
        { method: "DELETE" },
        session,
      );
      if (!response.ok) {
        const message = await current.readSupabaseError(response);
        throw new Error(message || "Failed to delete message.");
      }
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
