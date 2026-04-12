import {
  runChatgptCompletion,
  runChatgptStreamingCompletion,
} from "./httpChatgpt";
import { loadPublicModelMap } from "./httpInferenceConfig";
import {
  normalizeMaxTokens,
  normalizeMessages,
  runOpenRouterCompletion,
  runOpenRouterStreamingCompletion,
} from "./httpRuntimeSupport";
import {
  buildRuntimeRunPersistenceHelpers,
  type SseResponseEvent,
  buildRuntimeTurnSuccessResponder,
  type SseResponseFn,
  type SseResponseSource,
  type SseResponseStreamWriter,
} from "./httpRuntimeTurnState";
import { executeChatToolsAgentLoop } from "./httpDaytona";
import {
  USER_CANCELLED_RUNTIME_CODE,
  isRuntimeRunCancelledError,
  runAbortableWithRuntimeCancellation,
  throwIfRuntimeRunCancelled,
} from "./runtimeCancellation";
import { composeCloudScopedRuntimeSystemPrompt } from "../shared/runtimePrompt";
import {
  PublicTurnInput,
  RequireAuthenticatedActor,
  resolveAuthenticatedRuntimeTurn,
  RuntimeTurnInput,
} from "./runtimeTurnResolution";
import {
  ensureRuntimeRunStarted,
  lookupExistingRuntimeReplay,
  persistRuntimeAssistantMessage,
  persistRuntimeUserMessage,
} from "./runtimeTurnPersistence";
import { createRuntimeReasoningSummaryEmitter } from "./runtimeReasoningSummaryEvents";
import { logStructuredError } from "./errorLogging";

export type {
  SseResponseEvent,
  SseResponseFn,
  SseResponseSource,
  SseResponseStreamWriter,
} from "./httpRuntimeTurnState";
export type { RequireAuthenticatedActor } from "./runtimeTurnResolution";

type RuntimeCompletionSuccess = {
  content: string;
  promptTokens: number | null;
  completionTokens: number | null;
};

type RuntimeCompletionFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

function isRuntimeCompletionFailure(
  completion: RuntimeCompletionSuccess | RuntimeCompletionFailure,
): completion is RuntimeCompletionFailure {
  return "ok" in completion && completion.ok === false;
}

export type JsonResponseFn = (
  req: Request,
  status: number,
  payload: unknown,
) => Response;

function mapPersistedRuntimeEventRow(value: unknown): {
  id: string;
  run_id: string;
  seq: number;
  event_type: string;
  payload: unknown;
  created_at: string;
} | null {
  const row =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!row) return null;
  const id = String(row._id ?? "").trim();
  const runId = String(row.runId ?? "").trim();
  const eventType = String(row.eventType ?? "").trim();
  if (!id || !runId || !eventType) return null;
  const seq = Number(row.seq);
  const createdAtMs = Number(row.createdAt);
  return {
    id,
    run_id: runId,
    seq: Number.isFinite(seq) ? Math.max(0, Math.floor(seq)) : 0,
    event_type: eventType,
    payload: row.payload ?? null,
    created_at: new Date(
      Number.isFinite(createdAtMs) ? Math.floor(createdAtMs) : Date.now(),
    ).toISOString(),
  };
}

export async function handlePublicTurnRequest(args: {
  req: Request;
  jsonResponse: JsonResponseFn;
  sseResponse: SseResponseFn;
}): Promise<Response> {
  const { req, jsonResponse, sseResponse } = args;
  let input: PublicTurnInput;
  try {
    input = (await req.json()) as PublicTurnInput;
  } catch {
    return jsonResponse(req, 400, {
      ok: false,
      code: "invalid_request",
      error: "invalid_request",
      message: "Invalid JSON payload.",
    });
  }

  const publicMap = loadPublicModelMap();
  const modelId =
    String(input.model_id ?? "").trim() ||
    Object.keys(publicMap)[0] ||
    "gpt-oss-120b-free";
  const modelRef = publicMap[modelId];
  if (!modelRef) {
    return jsonResponse(req, 403, {
      ok: false,
      code: "model_not_allowed",
      error: "model_not_allowed",
      message: "Requested guest model is not allowed.",
      model_id: modelId,
    });
  }

  const messages = normalizeMessages(input.messages);
  if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
    return jsonResponse(req, 400, {
      ok: false,
      code: "no_user_message",
      error: "no_user_message",
      message: "A trailing user message is required.",
    });
  }

  const maxTokens = normalizeMaxTokens(input.max_tokens, 2048);
  const runId =
    String(
      (input as { idempotency_key?: unknown }).idempotency_key ?? "",
    ).trim() || `convex_runtime:${crypto.randomUUID()}`;
  const stream = input.stream !== false;
  if (stream) {
    return sseResponse(req, async (writer) => {
      writer.send({
        event: "start",
        data: {
          run_id: runId,
          lane: "public",
          engine_id: "public_convex",
          model_id: modelId,
          inference_source: "free",
        },
      });
      const completion = await runOpenRouterStreamingCompletion({
        req,
        modelRef,
        messages,
        maxTokens,
        onDelta: (delta) => {
          writer.send({
            event: "delta",
            data: {
              delta,
            },
          });
        },
      });
      if (isRuntimeCompletionFailure(completion)) {
        writer.send({
          event: "error",
          data: {
            error: completion.message,
          },
        });
        writer.close();
        return;
      }
      writer.send({
        event: "done",
        data: {
          run_id: runId,
          lane: "public",
          engine_id: "public_convex",
          model_id: modelId,
          inference_source: "free",
          full_content: completion.content,
          prompt_tokens: completion.promptTokens,
          completion_tokens: completion.completionTokens,
        },
      });
    });
  }

  const completion = await runOpenRouterCompletion({
    req,
    modelRef,
    messages,
    maxTokens,
  });
  if (isRuntimeCompletionFailure(completion)) {
    return jsonResponse(req, completion.status, {
      ok: false,
      code: completion.code,
      error: completion.code,
      message: completion.message,
    });
  }

  const content = completion.content;
  const promptTokens = completion.promptTokens;
  const completionTokens = completion.completionTokens;
  return jsonResponse(req, 200, {
    ok: true,
    run_id: runId,
    lane: "public",
    engine_id: "public_convex",
    model_id: modelId,
    inference_source: "free",
    content,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
  });
}

export async function handleRuntimeTurnRequest(args: {
  ctx: any;
  req: Request;
  jsonResponse: JsonResponseFn;
  sseResponse: SseResponseFn;
  requireAuthenticatedActor: RequireAuthenticatedActor;
}): Promise<Response> {
  const { ctx, req, jsonResponse, sseResponse, requireAuthenticatedActor } =
    args;
  const requestId = crypto.randomUUID();
  let runtimeTurnStage = "request";
  const withRuntimeHeaders = (response: Response): Response => {
    response.headers.set("x-arx-request-id", requestId);
    response.headers.set("x-arx-runtime-stage", runtimeTurnStage);
    return response;
  };
  const runtimeJsonResponse = (
    status: number,
    payload: Record<string, unknown>,
  ): Response =>
    withRuntimeHeaders(
      jsonResponse(req, status, {
        request_id: requestId,
        stage: runtimeTurnStage,
        ...payload,
      }),
    );
  const mapRuntimeSseEvent = (entry: SseResponseEvent): SseResponseEvent => ({
    event: entry.event,
    data: {
      request_id: requestId,
      stage:
        typeof entry.data?.stage === "string" && entry.data.stage.trim()
          ? entry.data.stage
          : entry.event === "start"
            ? "start"
            : entry.event === "delta"
              ? "streaming"
              : entry.event === "done"
                ? "done"
                : runtimeTurnStage,
      ...entry.data,
    },
  });
  const runtimeSseResponse = (source: SseResponseSource): Response =>
    withRuntimeHeaders(
      sseResponse(
        req,
        Array.isArray(source)
          ? source.map(mapRuntimeSseEvent)
          : (writer: SseResponseStreamWriter) =>
              source({
                send(entry) {
                  writer.send(mapRuntimeSseEvent(entry));
                },
                close() {
                  writer.close();
                },
              }),
      ),
    );
  let startedRunId: string | null = null;
  let runtimeTurnLogContext: Record<string, unknown> = {};
  let finishRunBestEffort:
    | ((params: {
        status: "ok" | "error" | "cancelled";
        reason?: string;
        errorCode?: string;
        errorMessage?: string;
      }) => Promise<void>)
    | null = null;

  let input: RuntimeTurnInput;
  try {
    input = (await req.json()) as RuntimeTurnInput;
  } catch {
    return runtimeJsonResponse(400, {
      ok: false,
      code: "invalid_request",
      error: "invalid_request",
      message: "Invalid JSON payload.",
    });
  }

  runtimeTurnStage = "auth";
  try {
    const resolved = await resolveAuthenticatedRuntimeTurn({
      ctx,
      req,
      input,
      requireAuthenticatedActor,
      setStage: (stage) => {
        runtimeTurnStage = stage;
      },
      fail: runtimeJsonResponse,
      requestId,
    });
    if (!resolved.ok) return resolved.response;
    const {
      actor,
      threadKey,
      ownedThread,
      conversationMessages,
      requestedModelId,
      lane,
      modelRef,
      maxTokens,
      stream,
      inferenceSource,
      openRouterApiKeyOverride,
      runtimeCommunityId,
      runtimeCommunityName,
      runtimeCommunitySlug,
      runtimeCommunityOneLiner,
      runtimeCommunityAbout,
      runtimeCommunitySystemPrompt,
      runtimeProjectId,
      runtimeSandboxMode,
      allowedToolNames,
      resolvedRuntimeCapabilityFamilies,
      resolvedRuntimeHarnessProfile,
      runtimeExecutionMode,
      internalFollowup,
    } = resolved.value;
    const runId =
      String(input.idempotency_key ?? "").trim() ||
      `convex_runtime:${crypto.randomUUID()}`;
    startedRunId = runId;
    runtimeTurnStage = "run_start";
    const explicitUserMessageKey = String(input.user_message_key ?? "").trim();
    const userMessageKeyForRun =
      explicitUserMessageKey || `user:${threadKey}:${runId}`;
    const assistantMessageKeyForRun = `assistant:${threadKey}:${runId}`;
    const latestUserText = String(
      conversationMessages[conversationMessages.length - 1]?.content ?? "",
    ).trim();
    const persistVisibleUserMessage = internalFollowup === null;
    const persistVisibleAssistantMessage =
      internalFollowup?.suppressAssistantMessage !== true;
    const runVisibility = internalFollowup ? "internal_hidden" : "user_visible";
    const runStartedAt = Date.now();
    runtimeTurnLogContext = {
      runId,
      threadId: String(ownedThread._id),
      threadKey,
      userId: actor.dbUserId,
      projectId: runtimeProjectId ?? undefined,
      communityId: runtimeCommunityId ?? undefined,
      requestedModelId,
      lane,
      inferenceSource,
      executionMode: runtimeExecutionMode,
      capabilityFamilies: resolvedRuntimeCapabilityFamilies,
      harnessProfile: resolvedRuntimeHarnessProfile,
      internalFollowupKind: internalFollowup?.kind ?? undefined,
    };
    const runStartArgs: Record<string, unknown> = {
      ownerId: actor.dbUserId,
      threadId: ownedThread._id,
      runId,
      lane,
      visibility: runVisibility,
      internalFollowupKind: internalFollowup?.kind ?? undefined,
      projectId: runtimeProjectId ?? undefined,
      modelId: requestedModelId,
      engineId: "runtime_turn",
      executionMode: runtimeExecutionMode,
      sandboxMode: runtimeSandboxMode,
      contractName:
        runtimeExecutionMode === "agentic"
          ? "capability_composed_tools_v1"
          : "capability_composed_chat_v1",
      contractVersion: "v1",
      harnessProfile: resolvedRuntimeHarnessProfile,
      harnessProfileSource: "runtime_capability_resolution_v1",
      capabilityFamilies: resolvedRuntimeCapabilityFamilies,
      startedAt: runStartedAt,
      nowMs: runStartedAt,
    };
    const runStart = await ensureRuntimeRunStarted({
      ctx,
      ownerId: actor.dbUserId,
      threadId: ownedThread._id,
      runStartArgs,
      fail: runtimeJsonResponse,
    });
    if (!runStart.ok) return runStart.response;

    const {
      appendRunEvent,
      finishRunBestEffort: finishRunBestEffortForRun,
      touchRunHeartbeatBestEffort,
    } = buildRuntimeRunPersistenceHelpers({
      ctx,
      userId: actor.dbUserId,
      threadId: String(ownedThread._id),
      runId,
    });
    finishRunBestEffort = finishRunBestEffortForRun;
    const finishCancelledRun = async (): Promise<void> => {
      await finishRunBestEffortForRun({
        status: "cancelled",
        reason: USER_CANCELLED_RUNTIME_CODE,
        errorCode: USER_CANCELLED_RUNTIME_CODE,
        errorMessage: "Run cancelled by user.",
      });
    };
    const throwIfRunCancelled = async (): Promise<void> => {
      await throwIfRuntimeRunCancelled({
        ctx,
        ownerId: actor.dbUserId,
        runId,
      });
    };
    const successResponse = buildRuntimeTurnSuccessResponder({
      req,
      stream,
      runId,
      requestId,
      lane,
      requestedModelId,
      jsonResponse: (_req, status, payload) =>
        runtimeJsonResponse(status, payload as Record<string, unknown>),
      sseResponse: (_req, events) => runtimeSseResponse(events),
    });

    runtimeTurnStage = "idempotency_lookup";
    if (persistVisibleUserMessage && persistVisibleAssistantMessage) {
      const existingReplay = await lookupExistingRuntimeReplay({
        ctx,
        ownerId: actor.dbUserId,
        threadId: ownedThread._id,
        assistantMessageKeyForRun,
        userMessageKeyForRun,
        inferenceSource,
      });
      if (existingReplay) {
        await finishRunBestEffortForRun({
          status: "ok",
          reason: "idempotent_replay",
        });
        return successResponse(existingReplay);
      }
    }

    let userMessageId: string | null = null;
    let userMessageKey: string | null = null;
    let userMessageSeq: number | null = null;
    if (persistVisibleUserMessage) {
      try {
        ({ userMessageId, userMessageKey, userMessageSeq } =
          await persistRuntimeUserMessage({
            ctx,
            ownerId: actor.dbUserId,
            threadId: ownedThread._id,
            messageKey: userMessageKeyForRun,
            requestedModelId,
            runId,
            latestUserText,
          }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await finishRunBestEffortForRun({
          status: "error",
          reason: "user_message_persist_failed",
          errorCode: "user_message_persist_failed",
          errorMessage: message || "Failed to persist user message.",
        });
        return jsonResponse(req, 500, {
          ok: false,
          code: "user_message_persist_failed",
          error: "user_message_persist_failed",
          message: message || "Failed to persist user message.",
          run_id: runId,
        });
      }
    }

    let content = "";
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    let resolvedInferenceSource = inferenceSource;
    let inferenceLaneFallbacks: Array<{
      from: "chatgpt" | "platform" | "public";
      to: "chatgpt" | "platform" | "public";
      reason: string;
    }> | null = null;
    await appendRunEvent({
      eventType: "tool_policy_resolved",
      eventKey: `${runId}:tool_policy_resolved:1`,
      payload: {
        run_id: runId,
        allowed_tool_names: allowedToolNames,
        capability_families: resolvedRuntimeCapabilityFamilies,
        harness_profile: resolvedRuntimeHarnessProfile,
      },
    });
    if (runtimeExecutionMode === "agentic") {
      if (stream) {
        return runtimeSseResponse(async (writer) => {
          let streamedContent = "";
          let streamedPromptTokens: number | null = null;
          let streamedCompletionTokens: number | null = null;
          let streamedInferenceSource = resolvedInferenceSource;
          let streamedInferenceLaneFallbacks = inferenceLaneFallbacks;
          let assistantMessageId: string | null = null;
          let assistantMessageKey: string | null = null;
          let assistantMessageSeq: number | null = null;

          const emitDelta = (delta: string) => {
            if (!delta) return;
            streamedContent += delta;
            writer.send({
              event: "delta",
              data: {
                delta,
              },
            });
          };

          const streamAppendRunEvent = async (event: {
            eventType: string;
            eventKey?: string;
            payload: Record<string, unknown>;
          }): Promise<void> => {
            const created = await appendRunEvent(event);
            const mapped = mapPersistedRuntimeEventRow(created);
            if (!mapped) return;
            writer.send({
              event: "runtime_event",
              data: mapped,
            });
          };
          const reasoningSummaryEmitter = createRuntimeReasoningSummaryEmitter({
            runId,
            summaryStreamId: `${runId}:assistant_completion:0`,
            appendRunEvent: streamAppendRunEvent,
          });

          writer.send({
            event: "start",
            data: {
              run_id: runId,
              lane,
              engine_id: "runtime_convex",
              model_id: requestedModelId,
              inference_source: streamedInferenceSource,
              inference_lane_fallbacks: streamedInferenceLaneFallbacks ?? null,
            },
          });
          runtimeTurnStage = "agent_loop";
          const loopResult = await executeChatToolsAgentLoop({
            ctx,
            req,
            userId: actor.dbUserId,
            threadId: String(ownedThread._id),
            authSubject: actor.authSubject,
            projectId: runtimeProjectId,
            requestedModelId,
            inferenceSource,
            modelRef,
            messages: conversationMessages,
            maxTokens,
            runId,
            communityId: runtimeCommunityId,
            communityName: runtimeCommunityName,
            communitySlug: runtimeCommunitySlug,
            communityOneLiner: runtimeCommunityOneLiner,
            communityAbout: runtimeCommunityAbout,
            communitySystemPrompt: runtimeCommunitySystemPrompt,
            threadWorkingState: ownedThread.workingState ?? null,
            allowedToolNames,
            apiKeyOverride: openRouterApiKeyOverride,
            appendRunEvent: streamAppendRunEvent,
            touchRunHeartbeat: touchRunHeartbeatBestEffort,
          });
          if (!loopResult.ok) {
            if (loopResult.code === USER_CANCELLED_RUNTIME_CODE) {
              await finishCancelledRun();
              return;
            }
            await finishRunBestEffortForRun({
              status: "error",
              reason: loopResult.code,
              errorCode: loopResult.code,
              errorMessage: loopResult.message,
            });
            writer.send({
              event: "error",
              data: {
                error: loopResult.message,
              },
            });
            return;
          }

          let completion:
            | Awaited<ReturnType<typeof runChatgptStreamingCompletion>>
            | Awaited<ReturnType<typeof runOpenRouterStreamingCompletion>>;
          try {
            if (inferenceSource === "chatgpt") {
              runtimeTurnStage = "chatgpt_completion";
              completion = await runAbortableWithRuntimeCancellation({
                ctx,
                ownerId: actor.dbUserId,
                runId,
                operation: async (signal) =>
                  await runChatgptStreamingCompletion({
                    ctx,
                    userId: actor.dbUserId,
                    modelId: requestedModelId,
                    messages: loopResult.transcript,
                    maxTokens,
                    onDelta: emitDelta,
                    onReasoningSummaryPartAdded: ({ summaryIndex }) =>
                      reasoningSummaryEmitter.onPartAdded(summaryIndex),
                    onReasoningSummaryTextDelta: ({ delta, summaryIndex }) =>
                      reasoningSummaryEmitter.onTextDelta(delta, summaryIndex),
                    signal,
                  }),
              });
            } else {
              runtimeTurnStage = "openrouter_completion";
              completion = await runAbortableWithRuntimeCancellation({
                ctx,
                ownerId: actor.dbUserId,
                runId,
                operation: async (signal) =>
                  await runOpenRouterStreamingCompletion({
                    req,
                    modelRef,
                    messages: loopResult.transcript,
                    maxTokens,
                    apiKeyOverride: openRouterApiKeyOverride,
                    onDelta: emitDelta,
                    signal,
                  }),
              });
            }
          } catch (error) {
            if (isRuntimeRunCancelledError(error)) {
              await finishCancelledRun();
              return;
            }
            throw error;
          }

          if (isRuntimeCompletionFailure(completion)) {
            await finishRunBestEffortForRun({
              status: "error",
              reason: completion.code,
              errorCode: completion.code,
              errorMessage: completion.message,
            });
            writer.send({
              event: "error",
              data: {
                error: completion.message,
              },
            });
            return;
          }

          streamedContent = completion.content;
          streamedPromptTokens = completion.promptTokens;
          streamedCompletionTokens = completion.completionTokens;

          runtimeTurnStage = "assistant_persist";
          if (persistVisibleAssistantMessage) {
            try {
              await throwIfRunCancelled();
              ({
                assistantMessageId,
                assistantMessageKey,
                assistantMessageSeq,
              } = await persistRuntimeAssistantMessage({
                ctx,
                ownerId: actor.dbUserId,
                threadId: ownedThread._id,
                messageKey: assistantMessageKeyForRun,
                requestedModelId,
                inferenceSource: streamedInferenceSource,
                lane,
                inferenceLaneFallbacks: streamedInferenceLaneFallbacks,
                runId,
                content: streamedContent,
              }));
            } catch (error) {
              if (isRuntimeRunCancelledError(error)) {
                await finishCancelledRun();
                return;
              }
              const message =
                error instanceof Error ? error.message : String(error);
              await finishRunBestEffortForRun({
                status: "error",
                reason: "assistant_message_persist_failed",
                errorCode: "assistant_message_persist_failed",
                errorMessage: message || "Failed to persist assistant message.",
              });
              writer.send({
                event: "error",
                data: {
                  error: message || "Failed to persist assistant message.",
                },
              });
              return;
            }
          }

          try {
            await throwIfRunCancelled();
          } catch (error) {
            if (isRuntimeRunCancelledError(error)) {
              await finishCancelledRun();
              return;
            }
            throw error;
          }
          await finishRunBestEffortForRun({
            status: "ok",
          });
          writer.send({
            event: "done",
            data: {
              run_id: runId,
              lane,
              engine_id: "runtime_convex",
              model_id: requestedModelId,
              inference_source: streamedInferenceSource,
              inference_lane_fallbacks: streamedInferenceLaneFallbacks ?? null,
              full_content: streamedContent,
              prompt_tokens: streamedPromptTokens,
              completion_tokens: streamedCompletionTokens,
              user_message_id: userMessageId,
              user_message_key: userMessageKey,
              user_message_seq: userMessageSeq,
              assistant_message_id: assistantMessageId,
              assistant_message_key: assistantMessageKey,
              assistant_message_seq: assistantMessageSeq,
            },
          });
        });
      }
      runtimeTurnStage = "agent_loop";
      const loopResult = await executeChatToolsAgentLoop({
        ctx,
        req,
        userId: actor.dbUserId,
        threadId: String(ownedThread._id),
        authSubject: actor.authSubject,
        projectId: runtimeProjectId,
        requestedModelId,
        inferenceSource,
        modelRef,
        messages: conversationMessages,
        maxTokens,
        runId,
        communityId: runtimeCommunityId,
        communityName: runtimeCommunityName,
        communitySlug: runtimeCommunitySlug,
        communityOneLiner: runtimeCommunityOneLiner,
        communityAbout: runtimeCommunityAbout,
        communitySystemPrompt: runtimeCommunitySystemPrompt,
        threadWorkingState: ownedThread.workingState ?? null,
        allowedToolNames,
        apiKeyOverride: openRouterApiKeyOverride,
        appendRunEvent: async (event): Promise<void> => {
          await appendRunEvent(event);
        },
        touchRunHeartbeat: touchRunHeartbeatBestEffort,
      });
      if (!loopResult.ok) {
        if (loopResult.code === USER_CANCELLED_RUNTIME_CODE) {
          await finishCancelledRun();
          return runtimeJsonResponse(409, {
            ok: false,
            code: USER_CANCELLED_RUNTIME_CODE,
            error: USER_CANCELLED_RUNTIME_CODE,
            message: "Run cancelled by user.",
            run_id: runId,
          });
        }
        await finishRunBestEffortForRun({
          status: "error",
          reason: loopResult.code,
          errorCode: loopResult.code,
          errorMessage: loopResult.message,
        });
        return runtimeJsonResponse(loopResult.status, {
          ok: false,
          code: loopResult.code,
          error: loopResult.code,
          message: loopResult.message,
          run_id: runId,
        });
      }
      content = loopResult.assistantText;
      promptTokens = loopResult.promptTokens;
      completionTokens = loopResult.completionTokens;
    } else {
      const now = new Date();
      const runtimeTimeZone = "UTC";
      const authenticatedScopedSystemPrompt =
        composeCloudScopedRuntimeSystemPrompt({
          communityId: runtimeCommunityId,
          communityName: runtimeCommunityName,
          communitySlug: runtimeCommunitySlug,
          communityOneLiner: runtimeCommunityOneLiner,
          communityAbout: runtimeCommunityAbout,
          customCommunitySystemPrompt: runtimeCommunitySystemPrompt,
          currentDateTimeIso: now.toISOString(),
          currentDateLabel: new Intl.DateTimeFormat("en-US", {
            dateStyle: "full",
            timeStyle: "long",
            timeZone: runtimeTimeZone,
          }).format(now),
          currentTimeZone: runtimeTimeZone,
        });
      const chatMessages = [
        { role: "system" as const, content: authenticatedScopedSystemPrompt },
        ...conversationMessages,
      ];
      if (stream) {
        return runtimeSseResponse(async (writer) => {
          let streamedContent = "";
          let streamedPromptTokens: number | null = null;
          let streamedCompletionTokens: number | null = null;
          let streamedInferenceSource = resolvedInferenceSource;
          let streamedInferenceLaneFallbacks = inferenceLaneFallbacks;
          let assistantMessageId: string | null = null;
          let assistantMessageKey: string | null = null;
          let assistantMessageSeq: number | null = null;

          const emitDelta = (delta: string) => {
            if (!delta) return;
            streamedContent += delta;
            writer.send({
              event: "delta",
              data: {
                delta,
              },
            });
          };

          writer.send({
            event: "start",
            data: {
              run_id: runId,
              lane,
              engine_id: "runtime_convex",
              model_id: requestedModelId,
              inference_source: streamedInferenceSource,
              inference_lane_fallbacks: streamedInferenceLaneFallbacks ?? null,
            },
          });
          const streamAppendRunEvent = async (event: {
            eventType: string;
            eventKey?: string;
            payload: Record<string, unknown>;
          }): Promise<void> => {
            const created = await appendRunEvent(event);
            const mapped = mapPersistedRuntimeEventRow(created);
            if (!mapped) return;
            writer.send({
              event: "runtime_event",
              data: mapped,
            });
          };
          const reasoningSummaryEmitter = createRuntimeReasoningSummaryEmitter({
            runId,
            summaryStreamId: `${runId}:assistant_completion:0`,
            appendRunEvent: streamAppendRunEvent,
          });

          let completion:
            | Awaited<ReturnType<typeof runChatgptStreamingCompletion>>
            | Awaited<ReturnType<typeof runOpenRouterStreamingCompletion>>;
          try {
            if (inferenceSource === "chatgpt") {
              runtimeTurnStage = "chatgpt_completion";
              completion = await runAbortableWithRuntimeCancellation({
                ctx,
                ownerId: actor.dbUserId,
                runId,
                operation: async (signal) =>
                  await runChatgptStreamingCompletion({
                    ctx,
                    userId: actor.dbUserId,
                    modelId: requestedModelId,
                    messages: chatMessages,
                    maxTokens,
                    onDelta: emitDelta,
                    onReasoningSummaryPartAdded: ({ summaryIndex }) =>
                      reasoningSummaryEmitter.onPartAdded(summaryIndex),
                    onReasoningSummaryTextDelta: ({ delta, summaryIndex }) =>
                      reasoningSummaryEmitter.onTextDelta(delta, summaryIndex),
                    signal,
                  }),
              });
            } else {
              runtimeTurnStage = "openrouter_completion";
              completion = await runAbortableWithRuntimeCancellation({
                ctx,
                ownerId: actor.dbUserId,
                runId,
                operation: async (signal) =>
                  await runOpenRouterStreamingCompletion({
                    req,
                    modelRef,
                    messages: chatMessages,
                    maxTokens,
                    apiKeyOverride: openRouterApiKeyOverride,
                    onDelta: emitDelta,
                    signal,
                  }),
              });
            }
          } catch (error) {
            if (isRuntimeRunCancelledError(error)) {
              await finishCancelledRun();
              return;
            }
            throw error;
          }

          if (isRuntimeCompletionFailure(completion)) {
            await finishRunBestEffortForRun({
              status: "error",
              reason: completion.code,
              errorCode: completion.code,
              errorMessage: completion.message,
            });
            writer.send({
              event: "error",
              data: {
                error: completion.message,
              },
            });
            return;
          }

          streamedContent = completion.content;
          streamedPromptTokens = completion.promptTokens;
          streamedCompletionTokens = completion.completionTokens;

          runtimeTurnStage = "assistant_persist";
          if (persistVisibleAssistantMessage) {
            try {
              await throwIfRunCancelled();
              ({
                assistantMessageId,
                assistantMessageKey,
                assistantMessageSeq,
              } = await persistRuntimeAssistantMessage({
                ctx,
                ownerId: actor.dbUserId,
                threadId: ownedThread._id,
                messageKey: assistantMessageKeyForRun,
                requestedModelId,
                inferenceSource: streamedInferenceSource,
                lane,
                inferenceLaneFallbacks: streamedInferenceLaneFallbacks,
                runId,
                content: streamedContent,
              }));
            } catch (error) {
              if (isRuntimeRunCancelledError(error)) {
                await finishCancelledRun();
                return;
              }
              const message =
                error instanceof Error ? error.message : String(error);
              await finishRunBestEffortForRun({
                status: "error",
                reason: "assistant_message_persist_failed",
                errorCode: "assistant_message_persist_failed",
                errorMessage: message || "Failed to persist assistant message.",
              });
              writer.send({
                event: "error",
                data: {
                  error: message || "Failed to persist assistant message.",
                },
              });
              return;
            }
          }

          try {
            await throwIfRunCancelled();
          } catch (error) {
            if (isRuntimeRunCancelledError(error)) {
              await finishCancelledRun();
              return;
            }
            throw error;
          }
          await finishRunBestEffortForRun({
            status: "ok",
          });
          writer.send({
            event: "done",
            data: {
              run_id: runId,
              lane,
              engine_id: "runtime_convex",
              model_id: requestedModelId,
              inference_source: streamedInferenceSource,
              inference_lane_fallbacks: streamedInferenceLaneFallbacks ?? null,
              full_content: streamedContent,
              prompt_tokens: streamedPromptTokens,
              completion_tokens: streamedCompletionTokens,
              user_message_id: userMessageId,
              user_message_key: userMessageKey,
              user_message_seq: userMessageSeq,
              assistant_message_id: assistantMessageId,
              assistant_message_key: assistantMessageKey,
              assistant_message_seq: assistantMessageSeq,
            },
          });
        });
      }
      let completion:
        | Awaited<ReturnType<typeof runChatgptCompletion>>
        | Awaited<ReturnType<typeof runOpenRouterCompletion>>;
      try {
        if (inferenceSource === "chatgpt") {
          runtimeTurnStage = "chatgpt_completion";
          completion = await runAbortableWithRuntimeCancellation({
            ctx,
            ownerId: actor.dbUserId,
            runId,
            operation: async (signal) =>
              await runChatgptCompletion({
                ctx,
                userId: actor.dbUserId,
                modelId: requestedModelId,
                messages: chatMessages,
                maxTokens,
                signal,
              }),
          });
        } else {
          runtimeTurnStage = "openrouter_completion";
          completion = await runAbortableWithRuntimeCancellation({
            ctx,
            ownerId: actor.dbUserId,
            runId,
            operation: async (signal) =>
              await runOpenRouterCompletion({
                req,
                modelRef,
                messages: chatMessages,
                maxTokens,
                apiKeyOverride: openRouterApiKeyOverride,
                signal,
              }),
          });
        }
      } catch (error) {
        if (isRuntimeRunCancelledError(error)) {
          await finishCancelledRun();
          return runtimeJsonResponse(409, {
            ok: false,
            code: USER_CANCELLED_RUNTIME_CODE,
            error: USER_CANCELLED_RUNTIME_CODE,
            message: "Run cancelled by user.",
            run_id: runId,
          });
        }
        throw error;
      }
      if (isRuntimeCompletionFailure(completion)) {
        await finishRunBestEffortForRun({
          status: "error",
          reason: completion.code,
          errorCode: completion.code,
          errorMessage: completion.message,
        });
        return runtimeJsonResponse(completion.status, {
          ok: false,
          code: completion.code,
          error: completion.code,
          message: completion.message,
        });
      }
      content = completion.content;
      promptTokens = completion.promptTokens;
      completionTokens = completion.completionTokens;
    }

    runtimeTurnStage = "assistant_persist";
    let assistantMessageId: string | null = null;
    let assistantMessageKey: string | null = null;
    let assistantMessageSeq: number | null = null;
    if (persistVisibleAssistantMessage) {
      try {
        await throwIfRunCancelled();
        ({ assistantMessageId, assistantMessageKey, assistantMessageSeq } =
          await persistRuntimeAssistantMessage({
            ctx,
            ownerId: actor.dbUserId,
            threadId: ownedThread._id,
            messageKey: assistantMessageKeyForRun,
            requestedModelId,
            inferenceSource: resolvedInferenceSource,
            lane,
            inferenceLaneFallbacks,
            runId,
            content,
          }));
      } catch (error) {
        if (isRuntimeRunCancelledError(error)) {
          await finishCancelledRun();
          return runtimeJsonResponse(409, {
            ok: false,
            code: USER_CANCELLED_RUNTIME_CODE,
            error: USER_CANCELLED_RUNTIME_CODE,
            message: "Run cancelled by user.",
            run_id: runId,
          });
        }
        const message = error instanceof Error ? error.message : String(error);
        await finishRunBestEffortForRun({
          status: "error",
          reason: "assistant_message_persist_failed",
          errorCode: "assistant_message_persist_failed",
          errorMessage: message || "Failed to persist assistant message.",
        });
        return runtimeJsonResponse(500, {
          ok: false,
          code: "assistant_message_persist_failed",
          error: "assistant_message_persist_failed",
          message: message || "Failed to persist assistant message.",
          run_id: runId,
        });
      }
    }

    try {
      await throwIfRunCancelled();
    } catch (error) {
      if (isRuntimeRunCancelledError(error)) {
        await finishCancelledRun();
        return runtimeJsonResponse(409, {
          ok: false,
          code: USER_CANCELLED_RUNTIME_CODE,
          error: USER_CANCELLED_RUNTIME_CODE,
          message: "Run cancelled by user.",
          run_id: runId,
        });
      }
      throw error;
    }

    await finishRunBestEffortForRun({
      status: "ok",
    });
    return successResponse({
      content,
      promptTokens,
      completionTokens,
      resolvedInferenceSource,
      inferenceLaneFallbacks,
      userMessageId,
      userMessageKey,
      userMessageSeq,
      assistantMessageId,
      assistantMessageKey,
      assistantMessageSeq,
    });
  } catch (error) {
    if (isRuntimeRunCancelledError(error)) {
      if (finishRunBestEffort) {
        await finishRunBestEffort({
          status: "cancelled",
          reason: USER_CANCELLED_RUNTIME_CODE,
          errorCode: USER_CANCELLED_RUNTIME_CODE,
          errorMessage: "Run cancelled by user.",
        });
      }
      return runtimeJsonResponse(409, {
        ok: false,
        code: USER_CANCELLED_RUNTIME_CODE,
        error: USER_CANCELLED_RUNTIME_CODE,
        message: "Run cancelled by user.",
        ...(startedRunId ? { run_id: startedRunId } : null),
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    if (finishRunBestEffort) {
      await finishRunBestEffort({
        status: "error",
        reason: "runtime_turn_unhandled",
        errorCode: "runtime_turn_unhandled",
        errorMessage: message || "Runtime turn failed unexpectedly.",
      });
    }
    logStructuredError("runtime_turn_unhandled", {
      error,
      requestId,
      stage: runtimeTurnStage,
      ...runtimeTurnLogContext,
    });
    return runtimeJsonResponse(500, {
      ok: false,
      code: "runtime_turn_unhandled",
      error: "runtime_turn_unhandled",
      message: `runtime_turn_unhandled: ${
        message || "Runtime turn failed unexpectedly."
      }`,
      ...(startedRunId ? { run_id: startedRunId } : null),
    });
  }
}
