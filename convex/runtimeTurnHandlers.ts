import { runChatgptCompletion } from "./httpChatgpt";
import { loadPublicModelMap } from "./httpInferenceConfig";
import {
  normalizeMaxTokens,
  normalizeMessages,
  runOpenRouterCompletion,
} from "./httpRuntimeSupport";
import {
  buildRuntimeRunPersistenceHelpers,
  buildRuntimeTurnSuccessResponder,
} from "./httpRuntimeTurnState";
import { executeChatToolsAgentLoop, executeWorkspaceAgentLoop } from "./httpDaytona";
import { composeCloudScopedSystemPrompt } from "../shared/runtimePrompt";
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

export type JsonResponseFn = (
  req: Request,
  status: number,
  payload: unknown,
) => Response;

export type SseResponseFn = (
  req: Request,
  events: Array<{ event: string; data: Record<string, unknown> }>,
) => Response;

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
  if (
    messages.length === 0 ||
    messages[messages.length - 1]?.role !== "user"
  ) {
    return jsonResponse(req, 400, {
      ok: false,
      code: "no_user_message",
      error: "no_user_message",
      message: "A trailing user message is required.",
    });
  }

  const maxTokens = normalizeMaxTokens(input.max_tokens, 2048);
  const runId =
    String((input as { idempotency_key?: unknown }).idempotency_key ?? "")
      .trim() || `convex_runtime:${crypto.randomUUID()}`;
  const completion = await runOpenRouterCompletion({
    req,
    modelRef,
    messages,
    maxTokens,
  });
  if ("ok" in completion && completion.ok === false) {
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
  const stream = input.stream !== false;
  if (!stream) {
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

  return sseResponse(req, [
    {
      event: "start",
      data: {
        run_id: runId,
        lane: "public",
        engine_id: "public_convex",
        model_id: modelId,
        inference_source: "free",
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
      },
    },
    {
      event: "delta",
      data: {
        delta: content,
        full_content: content,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
      },
    },
    {
      event: "done",
      data: {
        run_id: runId,
        lane: "public",
        engine_id: "public_convex",
        model_id: modelId,
        inference_source: "free",
        full_content: content,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
      },
    },
  ]);
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
  const runtimeSseResponse = (
    events: Array<{ event: string; data: Record<string, unknown> }>,
  ): Response =>
    withRuntimeHeaders(
      sseResponse(
        req,
        events.map((entry) => ({
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
        })),
      ),
    );

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
      requestedExecutionTarget,
      requiresWorkspaceTools,
      lane,
      modelRef,
      maxTokens,
      stream,
      inferenceSource,
      openRouterApiKeyOverride,
      runtimeCommunityId,
      runtimeCommunityName,
      runtimeCommunitySystemPrompt,
      runtimeProjectId,
      runtimeSandboxMode,
      allowedToolNames,
      resolvedRuntimeCapabilityFamilies,
      resolvedRuntimeHarnessProfile,
      runtimeExecutionMode,
    } = resolved.value;
    const runId =
      String(input.idempotency_key ?? "").trim() ||
      `convex_runtime:${crypto.randomUUID()}`;
    runtimeTurnStage = "run_start";
    const explicitUserMessageKey = String(input.user_message_key ?? "").trim();
    const userMessageKeyForRun =
      explicitUserMessageKey || `user:${threadKey}:${runId}`;
    const assistantMessageKeyForRun = `assistant:${threadKey}:${runId}`;
    const latestUserText = String(
      conversationMessages[conversationMessages.length - 1]?.content ?? "",
    ).trim();
    const runStartedAt = Date.now();
    const runStartArgs: Record<string, unknown> = {
      ownerId: actor.dbUserId,
      threadId: ownedThread._id,
      runId,
      lane,
      requestedExecutionTarget,
      requiresWorkspaceTools,
      projectId: runtimeProjectId ?? undefined,
      modelId: requestedModelId,
      engineId: "runtime_turn",
      executionMode: runtimeExecutionMode,
      sandboxMode: runtimeSandboxMode,
      contractName:
        requiresWorkspaceTools
          ? "capability_composed_workspace_v1"
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

    const { appendRunEvent, finishRunBestEffort } =
      buildRuntimeRunPersistenceHelpers({
        ctx,
        userId: actor.dbUserId,
        threadId: String(ownedThread._id),
        runId,
      });

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
    const existingReplay = await lookupExistingRuntimeReplay({
      ctx,
      ownerId: actor.dbUserId,
      threadId: ownedThread._id,
      assistantMessageKeyForRun,
      userMessageKeyForRun,
      inferenceSource,
    });
    if (existingReplay) {
      await finishRunBestEffort({
        status: "ok",
        reason: "idempotent_replay",
      });
      return successResponse(existingReplay);
    }

    let userMessageId: string | null = null;
    let userMessageKey: string | null = null;
    let userMessageSeq: number | null = null;
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
      await finishRunBestEffort({
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

    let content = "";
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    await appendRunEvent({
      eventType: "tool_policy_resolved",
      eventKey: `${runId}:tool_policy_resolved:1`,
        payload: {
          run_id: runId,
          requires_workspace_tools: requiresWorkspaceTools,
          allowed_tool_names: allowedToolNames,
          capability_families: resolvedRuntimeCapabilityFamilies,
          harness_profile: resolvedRuntimeHarnessProfile,
      },
    });
    if (runtimeExecutionMode === "agentic") {
      if (requiresWorkspaceTools && !runtimeProjectId) {
        await finishRunBestEffort({
          status: "error",
          reason: "project_required",
          errorCode: "project_required",
          errorMessage: "Workspace turns require a bound project.",
        });
        return runtimeJsonResponse(400, {
          ok: false,
          code: "project_required",
          error: "project_required",
          message: "Workspace turns require a bound project.",
          run_id: runId,
        });
      }
      runtimeTurnStage =
        requiresWorkspaceTools
          ? "workspace_loop"
          : "agent_loop";
      const loopResult =
        requiresWorkspaceTools
          ? await executeWorkspaceAgentLoop({
              ctx,
              req,
              userId: actor.dbUserId,
              authSubject: actor.authSubject,
              projectId: runtimeProjectId!,
              requestedModelId,
              inferenceSource,
              modelRef,
              messages: conversationMessages,
              maxTokens,
              runId,
              communityId: runtimeCommunityId,
              communityName: runtimeCommunityName,
              communitySystemPrompt: runtimeCommunitySystemPrompt,
              threadWorkingState: ownedThread.workingState ?? null,
              allowedToolNames,
              apiKeyOverride: openRouterApiKeyOverride,
              appendRunEvent,
            })
          : await executeChatToolsAgentLoop({
              ctx,
              req,
              userId: actor.dbUserId,
              requestedModelId,
              inferenceSource,
              modelRef,
              messages: conversationMessages,
              maxTokens,
              runId,
              communityId: runtimeCommunityId,
              communityName: runtimeCommunityName,
              communitySystemPrompt: runtimeCommunitySystemPrompt,
              threadWorkingState: ownedThread.workingState ?? null,
              allowedToolNames,
              apiKeyOverride: openRouterApiKeyOverride,
              appendRunEvent,
            });
      if (!loopResult.ok) {
        await finishRunBestEffort({
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
      const authenticatedScopedSystemPrompt = composeCloudScopedSystemPrompt({
        communityId: runtimeCommunityId,
        communityName: runtimeCommunityName,
        customCommunitySystemPrompt: runtimeCommunitySystemPrompt,
      });
      const chatMessages = [
        { role: "system" as const, content: authenticatedScopedSystemPrompt },
        ...conversationMessages,
      ];
      const completion =
        inferenceSource === "chatgpt"
          ? await (async () => {
              runtimeTurnStage = "chatgpt_completion";
              return runChatgptCompletion({
                ctx,
                userId: actor.dbUserId,
                modelId: requestedModelId,
                messages: chatMessages,
                maxTokens,
              });
            })()
          : await (async () => {
              runtimeTurnStage = "openrouter_completion";
              return runOpenRouterCompletion({
                req,
                modelRef,
                messages: chatMessages,
                maxTokens,
                apiKeyOverride: openRouterApiKeyOverride,
              });
            })();
      if ("ok" in completion && completion.ok === false) {
        await finishRunBestEffort({
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
    try {
      ({ assistantMessageId, assistantMessageKey, assistantMessageSeq } =
        await persistRuntimeAssistantMessage({
          ctx,
          ownerId: actor.dbUserId,
          threadId: ownedThread._id,
          messageKey: assistantMessageKeyForRun,
          requestedModelId,
          inferenceSource,
          lane,
          runId,
          content,
        }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await finishRunBestEffort({
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

    await finishRunBestEffort({
      status: "ok",
    });
    return successResponse({
      content,
      promptTokens,
      completionTokens,
      resolvedInferenceSource: inferenceSource,
      userMessageId,
      userMessageKey,
      userMessageSeq,
      assistantMessageId,
      assistantMessageKey,
      assistantMessageSeq,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("runtime_turn_unhandled", {
      requestId,
      stage: runtimeTurnStage,
      message,
    });
    return runtimeJsonResponse(500, {
      ok: false,
      code: "runtime_turn_unhandled",
      error: "runtime_turn_unhandled",
      message: `runtime_turn_unhandled: ${
        message || "Runtime turn failed unexpectedly."
      }`,
    });
  }
}
