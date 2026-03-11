import { api, internal } from "./_generated/api";
import { decryptStoredSecret } from "./providerConnections";
import { runChatgptCompletion } from "./httpChatgpt";
import {
  loadPlatformModelMap,
  loadPublicModelMap,
} from "./httpInferenceConfig";
import {
  asRuntimeMessages,
  extractInferenceSourceFromContentJson,
  extractTextFromContentJson,
  gateDeniedResponse,
  hasChatgptConnectionForUser,
  hasOpenRouterConnectionForUser,
  mapGateLaneToRuntimeLane,
  normalizeMaxTokens,
  normalizeMessages,
  normalizeSurface,
  parseOpenRouterError,
  parseRequestedFundingSource,
  resolveGateDecisionForAuthenticatedActor,
  runOpenRouterCompletion,
} from "./httpRuntimeSupport";
import {
  buildRuntimeRunPersistenceHelpers,
  buildRuntimeTurnSuccessResponder,
  normalizePersistedId,
  normalizePersistedSeq,
} from "./httpRuntimeTurnState";
import {
  executeCommunityAgentLoop,
  executeDaytonaAgentLoop,
  executeDaytonaProbeToolCall,
  loadDaytonaConfig,
  stopDaytonaSandbox,
  type DaytonaConfig,
} from "./httpDaytona";
import { composeCloudScopedSystemPrompt } from "../shared/communitySystemPromptResolver";

type RuntimeSurface = "web" | "mobile";
type GateModelClass = "free_model" | "paid_model";
type RequestedExecutionTarget = "chat" | "daytona_workspace";
type GateCode =
  | "ok"
  | "auth_required"
  | "tier_required"
  | "provider_connection_required"
  | "plan_required"
  | "community_entitlement_required"
  | "community_role_required"
  | "project_required"
  | "runner_unavailable";
type GateCta = "none" | "sign_in" | "upgrade" | "connect_provider" | "join" | "request_access" | "checkout";
type GateLane = "public" | "platform" | "chatgpt" | "daytona_cloud";
type RequestedFundingSource = "demo_public" | "user_key" | "user_chatgpt" | "platform";
type ResolvedGateDecision = {
  allowed: boolean;
  code: GateCode;
  cta: GateCta;
  lane: GateLane | null;
  fundingSource: RequestedFundingSource | null;
};

type RuntimeTurnInput = {
  thread_id?: string;
  model_id?: string | null;
  surface?: "web" | "mobile";
  requested_execution_target?: "chat" | "daytona_workspace" | null;
  requested_funding_source?: "demo_public" | "user_key" | "user_chatgpt" | "platform" | "auto" | null;
  stream?: boolean;
  idempotency_key?: string | null;
  user_message_key?: string | null;
  message?: {
    text?: string | null;
  } | null;
  messages?: Array<{ role?: string | null; content?: string | null }> | null;
  max_tokens?: number | null;
};

type PublicTurnInput = {
  model_id?: string | null;
  messages?: Array<{ role?: string | null; content?: string | null }> | null;
  stream?: boolean;
  max_tokens?: number | null;
};

function resolveRequestedExecutionTarget(raw: unknown): RequestedExecutionTarget {
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (normalized === "daytona_workspace") return "daytona_workspace";
  return "chat";
}

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: string;
    handler: unknown;
  }) => void;
};

type HttpActionLike = (handler: (ctx: unknown, req: Request) => Promise<Response>) => unknown;

type RequireAuthenticatedActor = (
  ctx: unknown,
  req: Request,
) => Promise<
  | {
      ok: true;
      actor: {
        userId: string;
        dbUserId: any;
        authSubject: string;
        email: string | null;
        displayName: string | null;
        avatarUrl: string | null;
      };
    }
  | { ok: false; response: Response }
>;

type SseEventWriter = (event: string, data: Record<string, unknown>) => void;

type RegisterRuntimeTurnRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  jsonResponse: (req: Request, status: number, payload: unknown) => Response;
  optionsResponse: (req: Request) => Response;
  sseResponse: (req: Request, events: Array<{ event: string; data: Record<string, unknown> }>) => Response;
  sseLiveResponse: (req: Request, producer: (emit: SseEventWriter) => Promise<void>) => Response;
  requireAuthenticatedActor: RequireAuthenticatedActor;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function stripSystemMessages(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages.filter(
    (message): message is { role: "user" | "assistant"; content: string } =>
      message.role === "user" || message.role === "assistant",
  );
}

function resolveRuntimeCapabilityFamilies(params: {
  requestedExecutionTarget: RequestedExecutionTarget;
  hasCommunityContext: boolean;
}): string[] {
  const families: string[] = [];
  if (params.hasCommunityContext) families.push("community_tools");
  if (params.requestedExecutionTarget === "daytona_workspace") families.push("coding_tools");
  return families;
}

function resolveRuntimeHarnessProfile(params: {
  requestedExecutionTarget: RequestedExecutionTarget;
  capabilityFamilies: string[];
}): string {
  const hasCommunityTools = params.capabilityFamilies.includes("community_tools");
  if (params.requestedExecutionTarget === "daytona_workspace") {
    return hasCommunityTools
      ? "authenticated_daytona_workspace_with_community"
      : "authenticated_daytona_workspace";
  }
  return hasCommunityTools
    ? "authenticated_cloud_chat_with_community"
    : "authenticated_cloud_chat";
}

export function registerRuntimeTurnRoutes(args: RegisterRuntimeTurnRoutesArgs): void {
  const {
    http,
    httpAction,
    jsonResponse,
    optionsResponse,
    sseResponse,
    sseLiveResponse,
    requireAuthenticatedActor,
  } = args;

  http.route({
    path: "/runtime/public_turn",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/runtime_turn",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/public_turn",
    method: "POST",
    handler: httpAction(async (_ctx, req) => {
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
      const modelId = String(input.model_id ?? "").trim() || Object.keys(publicMap)[0] || "gpt-oss-120b-free";
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
      const runId = String(input.idempotency_key ?? "").trim() || `convex_runtime:${crypto.randomUUID()}`;
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
    }),
  });
  
  http.route({
    path: "/runtime/runtime_turn",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const requestId = crypto.randomUUID();
      let runtimeTurnStage = "request";
      const withRuntimeHeaders = (response: Response): Response => {
        response.headers.set("x-arx-request-id", requestId);
        response.headers.set("x-arx-runtime-stage", runtimeTurnStage);
        return response;
      };
      const runtimeJsonResponse = (status: number, payload: Record<string, unknown>): Response =>
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
      const runtimeSseLiveResponse = (producer: (emit: SseEventWriter) => Promise<void>): Response =>
        withRuntimeHeaders(
          sseLiveResponse(req, async (emit) => {
            await producer((event, data) =>
              emit(event, {
                request_id: requestId,
                stage:
                  typeof data?.stage === "string" && data.stage.trim()
                    ? data.stage
                    : event === "start"
                      ? "start"
                      : event === "delta"
                        ? "streaming"
                        : event === "done"
                          ? "done"
                          : runtimeTurnStage,
                ...data,
              }),
            );
          }),
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
      const auth = await requireAuthenticatedActor(ctx, req);
      if (!auth.ok) return auth.response;
      const userDbId = auth.actor.dbUserId;
      const authSubject = auth.actor.authSubject;
  
      runtimeTurnStage = "thread_lookup";
      const threadKey = String(input.thread_id ?? "").trim();
      if (!threadKey) {
        return runtimeJsonResponse(400, {
          ok: false,
          code: "invalid_request",
          error: "invalid_request",
          message: "thread_id is required.",
        });
      }
      const ownedThread = (await ctx.runQuery(api.threads.getCloudThreadByThreadKey as any, {
        ownerId: userDbId,
        threadKey,
      })) as { _id?: string } | null;
      if (!ownedThread?._id) {
        return runtimeJsonResponse(404, {
          ok: false,
          code: "thread_not_found",
          error: "thread_not_found",
          message: "Cloud thread not found.",
        });
      }
  
      runtimeTurnStage = "messages";
      const runtimeMessages = asRuntimeMessages(input);
      const conversationMessages = stripSystemMessages(runtimeMessages);
      if (conversationMessages.length === 0 || conversationMessages[conversationMessages.length - 1]?.role !== "user") {
        return runtimeJsonResponse(400, {
          ok: false,
          code: "no_user_message",
          error: "no_user_message",
          message: "A trailing user message is required.",
        });
      }
  
      runtimeTurnStage = "gate";
      const publicMap = loadPublicModelMap();
      const platformMap = loadPlatformModelMap();
      const requestedModelId = String(input.model_id ?? "").trim() || "gpt-5.4";
      const publicRef = publicMap[requestedModelId];
      const requestedExecutionTarget = resolveRequestedExecutionTarget(input.requested_execution_target);
      const requestedFundingSource = parseRequestedFundingSource(
        input.requested_funding_source,
        publicRef ? "demo_public" : "platform",
      );
      const [hasUserKeyConnection, hasUserChatgptConnection] = await Promise.all([
        hasOpenRouterConnectionForUser({
          ctx,
          userId: userDbId,
        }),
        hasChatgptConnectionForUser({
          ctx,
          userId: userDbId,
        }),
      ]);
      const gateDecision = await resolveGateDecisionForAuthenticatedActor({
        ctx,
        authSubject,
        surface: normalizeSurface(input.surface, "web"),
        modelClass: publicRef ? "free_model" : "paid_model",
        requestedExecutionTarget,
        requestedFundingSource,
        hasUserKeyConnection,
        hasUserChatgptConnection,
      });
      if (!gateDecision.allowed) {
        return gateDeniedResponse(
          (_req, status, payload) => runtimeJsonResponse(status, payload as Record<string, unknown>),
          req,
          {
          decision: gateDecision,
          requestedExecutionTarget,
          requestedModelId,
          },
        );
      }

      runtimeTurnStage = "provider_connection";
      const lane = mapGateLaneToRuntimeLane({
        requestedExecutionTarget,
        lane: gateDecision.lane,
      });
      const runId = String(input.idempotency_key ?? "").trim() || `convex_runtime:${crypto.randomUUID()}`;
      const fallbackPublicRef = Object.values(publicMap).find((value) => typeof value === "string" && value.trim().length > 0);
      const fallbackPlatformRef =
        readEnv("ARX_PLATFORM_DEFAULT_MODEL") || platformMap["gpt-5.4"] || requestedModelId;
      const modelRef =
        lane === "public"
          ? publicRef || fallbackPublicRef || requestedModelId
          : platformMap[requestedModelId] || fallbackPlatformRef;
      const maxTokens = normalizeMaxTokens(input.max_tokens, 2048);
      const stream = input.stream !== false;
      const inferenceSource: "free" | "platform" | "user_key" | "chatgpt" =
        gateDecision.fundingSource === "user_key"
          ? "user_key"
          : gateDecision.fundingSource === "user_chatgpt"
            ? "chatgpt"
          : lane === "public"
            ? "free"
            : "platform";
      let openRouterApiKeyOverride: string | null = null;
      if (gateDecision.fundingSource === "user_key") {
        const connectionRow = (await ctx.runQuery(
          internal.providerConnections.getOpenRouterConnectionForUserInternal as any,
          {
            userId: userDbId,
          },
        )) as { encryptedSecretHex?: unknown; secretIvHex?: unknown } | null;
        if (!connectionRow?.encryptedSecretHex || !connectionRow?.secretIvHex) {
          return runtimeJsonResponse(403, {
            ok: false,
            code: "provider_connection_required",
            error: "provider_connection_required",
            message: "Connect a provider to use this model.",
            gate_code: "provider_connection_required",
            cta: "connect_provider",
            lane: gateDecision.lane,
            model_id: requestedModelId,
          });
        }
        try {
          openRouterApiKeyOverride = await decryptStoredSecret({
            encryptedSecretHex: String(connectionRow.encryptedSecretHex),
            secretIvHex: String(connectionRow.secretIvHex),
          });
        } catch {
          return runtimeJsonResponse(503, {
            ok: false,
            code: "provider_connection_unavailable",
            error: "provider_connection_unavailable",
            message: "Stored provider credentials are unavailable. Reconnect your provider and retry.",
            gate_code: "provider_connection_required",
            cta: "connect_provider",
            lane: gateDecision.lane,
            model_id: requestedModelId,
          });
        }
      }
      let runtimeCommunityId: string | null = null;
      let runtimeCommunityName: string | null = null;
      let runtimeCommunitySystemPrompt: string | null = null;
      const threadCommunityId = String((ownedThread as { communityId?: unknown })?.communityId ?? "").trim();
      if (threadCommunityId) {
        try {
          const resolvedCommunity = (await ctx.runQuery(
            internal.communityAgent.resolveRuntimeCommunityPromptContextInternal as any,
            {
              userId: userDbId,
              communityId: threadCommunityId,
            },
          )) as {
            community_id?: unknown;
            community_name?: unknown;
            system_prompt?: unknown;
          } | null;
          runtimeCommunityId = String(resolvedCommunity?.community_id ?? "").trim() || null;
          runtimeCommunityName = String(resolvedCommunity?.community_name ?? "").trim() || null;
          runtimeCommunitySystemPrompt = String(resolvedCommunity?.system_prompt ?? "").trim() || null;
        } catch (error) {
          console.warn("runtime_community_prompt_resolution_failed", {
            requestId,
            runId,
            threadId: String(ownedThread._id),
            communityId: threadCommunityId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const runtimeCapabilityFamilies = resolveRuntimeCapabilityFamilies({
        requestedExecutionTarget,
        hasCommunityContext: Boolean(runtimeCommunityId),
      });
      const runtimeHarnessProfile = resolveRuntimeHarnessProfile({
        requestedExecutionTarget,
        capabilityFamilies: runtimeCapabilityFamilies,
      });
      const runtimeExecutionMode =
        requestedExecutionTarget === "daytona_workspace" || runtimeCapabilityFamilies.includes("community_tools")
          ? "agentic"
          : "chat";
      const runtimeApprovalMode = "never";
      const runtimeSandboxMode = requestedExecutionTarget === "daytona_workspace" ? "workspace_write" : undefined;
      let runtimeProjectId = String((ownedThread as { projectId?: unknown })?.projectId ?? "").trim() || null;
      runtimeTurnStage = "run_start";
      const explicitUserMessageKey = String(input.user_message_key ?? "").trim();
      const userMessageKeyForRun = explicitUserMessageKey || `user:${threadKey}:${runId}`;
      const assistantMessageKeyForRun = `assistant:${threadKey}:${runId}`;
      const latestUserText = String(conversationMessages[conversationMessages.length - 1]?.content ?? "").trim();
      const runStartedAt = Date.now();
      const runStartArgs: Record<string, unknown> = {
        ownerId: userDbId,
        threadId: ownedThread._id,
        runId,
        lane,
        requestedExecutionTarget,
        projectId: runtimeProjectId ?? undefined,
        modelId: requestedModelId,
        engineId: "runtime_turn",
        executionMode: runtimeExecutionMode,
        approvalMode: runtimeApprovalMode,
        sandboxMode: runtimeSandboxMode,
        harnessProfile: runtimeHarnessProfile,
        harnessProfileSource: "runtime_capability_resolution_v1",
        capabilityFamilies: runtimeCapabilityFamilies,
        startedAt: runStartedAt,
        nowMs: runStartedAt,
      };
      await ctx.runMutation((api as any).threads.ensureCloudRuntimeRunStarted as any, runStartArgs);

      const { appendRunEvent, finishRunBestEffort } = buildRuntimeRunPersistenceHelpers({
        ctx,
        userId: userDbId,
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
        jsonResponse: (_req, status, payload) => runtimeJsonResponse(status, payload as Record<string, unknown>),
        sseResponse: (_req, events) => runtimeSseResponse(events),
      });

      runtimeTurnStage = "idempotency_lookup";
      const existingAssistant = (await ctx.runQuery(api.threads.getCloudThreadMessageByOwnerMessageKey as any, {
        ownerId: userDbId,
        threadId: ownedThread._id,
        messageKey: assistantMessageKeyForRun,
      })) as { _id?: unknown; messageKey?: unknown; seq?: unknown; contentJson?: unknown } | null;

      if (existingAssistant) {
        const existingUser = (await ctx.runQuery(api.threads.getCloudThreadMessageByOwnerMessageKey as any, {
          ownerId: userDbId,
          threadId: ownedThread._id,
          messageKey: userMessageKeyForRun,
        })) as { _id?: unknown; messageKey?: unknown; seq?: unknown } | null;
        const content = extractTextFromContentJson(existingAssistant.contentJson);
        await finishRunBestEffort({
          status: "ok",
          reason: "idempotent_replay",
        });
        return successResponse({
          content,
          promptTokens: null,
          completionTokens: null,
          resolvedInferenceSource: extractInferenceSourceFromContentJson(existingAssistant.contentJson, inferenceSource),
          userMessageId: normalizePersistedId(existingUser?._id),
          userMessageKey: normalizePersistedId(existingUser?.messageKey),
          userMessageSeq: normalizePersistedSeq(existingUser?.seq),
          assistantMessageId: normalizePersistedId(existingAssistant?._id),
          assistantMessageKey: normalizePersistedId(existingAssistant?.messageKey),
          assistantMessageSeq: normalizePersistedSeq(existingAssistant?.seq),
        });
      }
      let daytonaProbeOutput: string | null = null;
      let daytonaProviderSandboxId: string | null = null;
      let daytonaToolboxProxyUrl: string | null = null;
      let daytonaConfigForRun: DaytonaConfig | null = null;
      let daytonaProjectVolumeId: string | null = null;
      let daytonaProjectVolumeName: string | null = null;
      let codingContinuationPrompt: string | null = null;
      let codingRelevantFiles: string[] | null = null;
      let daytonaCommunityId: string | null = null;
      let daytonaCommunityName: string | null = null;
      let daytonaCommunitySystemPrompt: string | null = null;
      const stopDaytonaSandboxBestEffort = async (state: "stopped" | "error" = "stopped") => {
        if (!runtimeProjectId || !daytonaConfigForRun || !daytonaProviderSandboxId) return;
        try {
          const stopResult = await stopDaytonaSandbox({
            config: daytonaConfigForRun,
            sandboxId: daytonaProviderSandboxId,
          });
          if (!stopResult.ok) {
            console.warn("daytona_sandbox_stop_failed", {
              requestId,
              runId,
              projectId: runtimeProjectId,
              providerSandboxId: daytonaProviderSandboxId,
              code: stopResult.code,
              message: stopResult.message,
            });
            return;
          }
          await ctx.runMutation(internal.projects.recordCloudProjectRuntimeState as any, {
            projectId: runtimeProjectId,
            providerSandboxId: daytonaProviderSandboxId,
            providerSandboxState: state,
            providerSandboxLastSeenAt: Date.now(),
            providerVolumeId: daytonaProjectVolumeId ?? undefined,
            providerVolumeName: daytonaProjectVolumeName ?? undefined,
            providerVolumeState: daytonaProjectVolumeId ? "ready" : undefined,
            providerVolumeLastSeenAt: daytonaProjectVolumeId ? Date.now() : undefined,
            nowMs: Date.now(),
          });
        } catch (error) {
          console.warn("daytona_sandbox_stop_failed", {
            requestId,
            runId,
            projectId: runtimeProjectId,
            providerSandboxId: daytonaProviderSandboxId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      };

      if (requestedExecutionTarget === "daytona_workspace") {
        try {
          daytonaCommunityId = runtimeCommunityId;
          daytonaCommunityName = runtimeCommunityName;
          daytonaCommunitySystemPrompt = runtimeCommunitySystemPrompt;

          if (!runtimeProjectId) {
            const defaultProject = (await ctx.runMutation((api as any).projects.ensureDefaultCloudProjectForOwner as any, {
              ownerId: userDbId,
              nowMs: Date.now(),
            })) as { _id?: unknown } | null;
            const defaultProjectId = String(defaultProject?._id ?? "").trim();
            if (defaultProjectId) {
              await ctx.runMutation((api as any).threads.updateCloudThread as any, {
                ownerId: userDbId,
                threadId: ownedThread._id,
                projectId: defaultProjectId,
                nowMs: Date.now(),
              });
              runtimeProjectId = defaultProjectId;
            }
          }
  
          if (!runtimeProjectId) {
            await finishRunBestEffort({
              status: "error",
              reason: "project_required",
              errorCode: "project_required",
              errorMessage: "Tool turns require a project-bound thread.",
            });
            return runtimeJsonResponse(409, {
              ok: false,
              code: "project_required",
              error: "project_required",
              message: "Tool turns require a project-bound thread.",
              run_id: runId,
            });
          }

          const runtimeProject = (await ctx.runQuery((api as any).projects.getCloudProjectById as any, {
            ownerId: userDbId,
            projectId: runtimeProjectId,
          })) as { providerVolumeId?: unknown; providerVolumeName?: unknown } | null;
          daytonaProjectVolumeId = String(runtimeProject?.providerVolumeId ?? "").trim() || null;
          daytonaProjectVolumeName = String(runtimeProject?.providerVolumeName ?? "").trim() || null;

          if (!daytonaProjectVolumeId) {
            const ensuredProject = (await ctx.runAction((api as any).projects.ensureCloudProjectVolume as any, {
              authSubject,
              projectId: runtimeProjectId,
            })) as { providerVolumeId?: unknown; providerVolumeName?: unknown } | null;
            daytonaProjectVolumeId = String(ensuredProject?.providerVolumeId ?? "").trim() || null;
            daytonaProjectVolumeName = String(ensuredProject?.providerVolumeName ?? "").trim() || null;
          }

          const loadedDaytonaConfig = loadDaytonaConfig();
          if (!loadedDaytonaConfig.ok) {
            await finishRunBestEffort({
              status: "error",
              reason: loadedDaytonaConfig.code,
              errorCode: loadedDaytonaConfig.code,
              errorMessage: loadedDaytonaConfig.message,
            });
            return runtimeJsonResponse(503, {
              ok: false,
              code: loadedDaytonaConfig.code,
              error: loadedDaytonaConfig.code,
              message: loadedDaytonaConfig.message,
              run_id: runId,
            });
          }
          daytonaConfigForRun = loadedDaytonaConfig.config;
  
          const toolCallId = `runtime_tools:${runId}:daytona_probe`;
          await appendRunEvent({
            eventType: "tool_call_requested",
            eventKey: `${runId}:tool_call_requested:daytona_probe`,
            payload: {
              run_id: runId,
              tool_call_id: toolCallId,
              tool_call_key: `${runId}:daytona_probe:p1`,
              tool_name: "bash",
              args: {
                cmd: "pwd",
                cwd: "/home/daytona/workspace",
              },
              requires_approval: false,
              policy_basis: "runtime_turn_daytona_probe",
              reason: "project_sandbox_probe",
            },
          });
          await appendRunEvent({
            eventType: "tool_call_started",
            eventKey: `${runId}:tool_call_started:daytona_probe`,
            payload: {
              run_id: runId,
              tool_call_id: toolCallId,
              attempt: 1,
              cwd: "/home/daytona/workspace",
              workspace_scope_id: runtimeProjectId,
              sandbox: {
                mode: "daytona",
                project_id: runtimeProjectId,
                ...(daytonaProjectVolumeId ? { volume_id: daytonaProjectVolumeId } : null),
              },
            },
          });
  
          const probe = await executeDaytonaProbeToolCall({
            config: daytonaConfigForRun,
            userId: userDbId,
            projectId: runtimeProjectId,
            runId,
            projectVolumeId: daytonaProjectVolumeId,
          });
          if (!probe.ok) {
            await appendRunEvent({
              eventType: "tool_call_finished",
              eventKey: `${runId}:tool_call_finished:daytona_probe`,
              payload: {
                run_id: runId,
                tool_call_id: toolCallId,
                attempt: 1,
                status: "error",
                reason: probe.code,
                error_code: probe.code,
                error_message: probe.message,
                output_preview: String(probe.details?.response_text ?? "").slice(0, 2000),
              },
            });
            await finishRunBestEffort({
              status: "error",
              reason: probe.code,
              errorCode: probe.code,
              errorMessage: probe.message,
            });
            return runtimeJsonResponse(probe.status, {
              ok: false,
              code: probe.code,
              error: probe.code,
              message: probe.message,
              run_id: runId,
            });
          }
  
          if (probe.exitCode !== null && probe.exitCode !== 0) {
            await appendRunEvent({
              eventType: "tool_call_finished",
              eventKey: `${runId}:tool_call_finished:daytona_probe`,
              payload: {
                run_id: runId,
                tool_call_id: toolCallId,
                attempt: 1,
                status: "error",
                reason: "daytona_command_failed",
                error_code: "daytona_command_failed",
                error_message: `Daytona probe command failed with exit code ${probe.exitCode}.`,
                exit_code: probe.exitCode,
                output_preview: String(probe.outputText ?? "").slice(0, 2000),
              },
            });
            await finishRunBestEffort({
              status: "error",
              reason: "daytona_command_failed",
              errorCode: "daytona_command_failed",
              errorMessage: `Daytona probe command failed with exit code ${probe.exitCode}.`,
            });
            return runtimeJsonResponse(502, {
              ok: false,
              code: "daytona_command_failed",
              error: "daytona_command_failed",
              message: `Daytona probe command failed with exit code ${probe.exitCode}.`,
              run_id: runId,
            });
          }
  
          await appendRunEvent({
            eventType: "tool_call_finished",
            eventKey: `${runId}:tool_call_finished:daytona_probe`,
            payload: {
              run_id: runId,
              tool_call_id: toolCallId,
              attempt: 1,
              status: "ok",
              reason: null,
              exit_code: probe.exitCode ?? 0,
              output_preview: String(probe.outputText ?? "").slice(0, 2000),
            },
          });
          daytonaProbeOutput = String(probe.outputText ?? "").trim() || null;
          daytonaProviderSandboxId = probe.providerSandboxId;
          daytonaToolboxProxyUrl = probe.toolboxProxyUrl;
          await ctx.runMutation(internal.projects.recordCloudProjectRuntimeState as any, {
            projectId: runtimeProjectId,
            providerSandboxId: daytonaProviderSandboxId,
            providerSandboxState: "started",
            providerSandboxLastSeenAt: Date.now(),
            providerVolumeId: daytonaProjectVolumeId ?? undefined,
            providerVolumeName: daytonaProjectVolumeName ?? undefined,
            providerVolumeState: daytonaProjectVolumeId ? "ready" : undefined,
            providerVolumeLastSeenAt: daytonaProjectVolumeId ? Date.now() : undefined,
            nowMs: Date.now(),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await finishRunBestEffort({
            status: "error",
            reason: "run_event_persist_failed",
            errorCode: "run_event_persist_failed",
            errorMessage: message || "Failed to persist runtime events.",
          });
          return runtimeJsonResponse(500, {
            ok: false,
            code: "run_event_persist_failed",
            error: "run_event_persist_failed",
            message: message || "Failed to persist runtime events.",
            run_id: runId,
          });
        }
      }
  
      let userMessageId: string | null = null;
      let userMessageKey: string | null = null;
      let userMessageSeq: number | null = null;
      try {
        const persistedUser = (await ctx.runMutation(api.threads.addCloudThreadMessage as any, {
          ownerId: userDbId,
          threadId: ownedThread._id,
          messageKey: userMessageKeyForRun,
          role: "user",
          contentJson: { text: latestUserText },
          engineId: "runtime_turn",
          modelId: requestedModelId,
          runId,
          nowMs: Date.now(),
        })) as { _id?: unknown; messageKey?: unknown; seq?: unknown } | null;
        userMessageId = String(persistedUser?._id ?? "").trim() || null;
        userMessageKey = String(persistedUser?.messageKey ?? "").trim() || null;
        const parsedSeq = Number(persistedUser?.seq);
        userMessageSeq = Number.isFinite(parsedSeq) ? Math.max(0, Math.floor(parsedSeq)) : null;
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

      if (requestedExecutionTarget === "daytona_workspace") {
        try {
          const continuation = (await ctx.runQuery(internal.threads.getCloudCodingContinuationContextInternal as any, {
            ownerId: userDbId,
            threadId: ownedThread._id,
          })) as { prompt?: unknown; handoff?: { relevantFiles?: unknown } | null } | null;
          const nextPrompt = String(continuation?.prompt ?? "").trim();
          codingContinuationPrompt = nextPrompt || null;
          const handoffRelevantFiles = Array.isArray(continuation?.handoff?.relevantFiles)
            ? continuation.handoff?.relevantFiles
            : [];
          codingRelevantFiles = handoffRelevantFiles
            .map((value) => String(value ?? "").trim())
            .filter((value) => value.length > 0)
            .slice(0, 8);
        } catch (error) {
          console.warn("coding_continuity_prompt_load_failed", {
            requestId,
            threadId: String(ownedThread._id),
            runId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (requestedExecutionTarget === "daytona_workspace" && stream) {
        if (!runtimeProjectId || !daytonaConfigForRun || !daytonaProviderSandboxId || !daytonaToolboxProxyUrl) {
          await finishRunBestEffort({
            status: "error",
            reason: "runner_unavailable",
            errorCode: "runner_unavailable",
            errorMessage: "Daytona runtime state is unavailable.",
          });
          return runtimeJsonResponse(503, {
            ok: false,
            code: "runner_unavailable",
            error: "runner_unavailable",
            message: "Daytona runtime state is unavailable.",
            run_id: runId,
          });
        }
        return runtimeSseLiveResponse(async (emit) => {
          emit("start", {
            run_id: runId,
            lane,
            engine_id: "runtime_convex",
            model_id: requestedModelId,
            inference_source: inferenceSource,
            prompt_tokens: null,
            completion_tokens: null,
            max_tokens: maxTokens,
          });
  
          const loopResult = await executeDaytonaAgentLoop({
            ctx,
            req,
            userId: userDbId,
            requestedModelId,
            inferenceSource:
              inferenceSource === "chatgpt"
                ? "chatgpt"
                : inferenceSource === "user_key"
                  ? "user_key"
                  : "platform",
            modelRef,
            messages: conversationMessages,
            maxTokens,
            apiKeyOverride: openRouterApiKeyOverride,
            runId,
            projectId: runtimeProjectId,
            daytonaConfig: daytonaConfigForRun,
            providerSandboxId: daytonaProviderSandboxId,
            toolboxProxyUrl: daytonaToolboxProxyUrl,
            initialProbeOutput: daytonaProbeOutput,
            codingContinuationPrompt,
            codingRelevantFiles,
            communityId: daytonaCommunityId,
            communityName: daytonaCommunityName,
            communitySystemPrompt: daytonaCommunitySystemPrompt,
            appendRunEvent,
          });
          if (!loopResult.ok) {
            await finishRunBestEffort({
              status: "error",
              reason: loopResult.code,
              errorCode: loopResult.code,
              errorMessage: loopResult.message,
            });
            emit("error", {
              run_id: runId,
              code: loopResult.code,
              error: loopResult.message,
              message: loopResult.message,
              tool_call_id: loopResult.pendingToolCallId ?? null,
              tool_name: loopResult.pendingToolName ?? null,
            });
            await stopDaytonaSandboxBestEffort("error");
            return;
          }
  
          const content = loopResult.assistantText;
          const promptTokens = loopResult.promptTokens;
          const completionTokens = loopResult.completionTokens;
          let assistantMessageId: string | null = null;
          let assistantMessageKey: string | null = null;
          let assistantMessageSeq: number | null = null;
          try {
            const persisted = (await ctx.runMutation(api.threads.addCloudThreadMessage as any, {
              ownerId: userDbId,
              threadId: ownedThread._id,
              messageKey: assistantMessageKeyForRun,
              role: "assistant",
              contentJson: {
                text: content,
                meta: {
                  model_id: requestedModelId,
                  inference_source: inferenceSource,
                  lane,
                },
              },
              engineId: "runtime_turn",
              modelId: requestedModelId,
              runId,
              nowMs: Date.now(),
            })) as { _id?: unknown; messageKey?: unknown; seq?: unknown } | null;
            assistantMessageId = String(persisted?._id ?? "").trim() || null;
            assistantMessageKey = String(persisted?.messageKey ?? "").trim() || null;
            const parsedSeq = Number(persisted?.seq);
            assistantMessageSeq = Number.isFinite(parsedSeq) ? Math.max(0, Math.floor(parsedSeq)) : null;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await finishRunBestEffort({
              status: "error",
              reason: "assistant_message_persist_failed",
              errorCode: "assistant_message_persist_failed",
              errorMessage: message || "Failed to persist assistant message.",
            });
            emit("error", {
              run_id: runId,
              code: "assistant_message_persist_failed",
              error: message || "Failed to persist assistant message.",
              message: message || "Failed to persist assistant message.",
            });
            return;
          }

          try {
            await ctx.runMutation(internal.threads.updateCloudThreadCodingHandoffInternal as any, {
              ownerId: userDbId,
              threadId: ownedThread._id,
              runId,
              userText: latestUserText,
              assistantText: content,
              nowMs: Date.now(),
            });
          } catch (error) {
            console.warn("coding_handoff_update_failed", {
              requestId,
              threadId: String(ownedThread._id),
              runId,
              message: error instanceof Error ? error.message : String(error),
            });
          }

          await finishRunBestEffort({
            status: "ok",
          });
  
          emit("delta", {
            delta: content,
            full_content: content,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            max_tokens: maxTokens,
          });
          emit("done", {
            run_id: runId,
            lane,
            engine_id: "runtime_convex",
            model_id: requestedModelId,
            inference_source: inferenceSource,
            full_content: content,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            user_message_id: userMessageId,
            user_message_key: userMessageKey,
            user_message_seq: userMessageSeq,
            assistant_message_id: assistantMessageId,
            assistant_message_key: assistantMessageKey,
            assistant_message_seq: assistantMessageSeq,
          });
          await stopDaytonaSandboxBestEffort("stopped");
        });
      }
  
      let content = "";
      let promptTokens: number | null = null;
      let completionTokens: number | null = null;
      if (requestedExecutionTarget === "daytona_workspace") {
        runtimeTurnStage = "daytona_loop";
        if (!runtimeProjectId || !daytonaConfigForRun || !daytonaProviderSandboxId || !daytonaToolboxProxyUrl) {
          await finishRunBestEffort({
            status: "error",
            reason: "runner_unavailable",
            errorCode: "runner_unavailable",
            errorMessage: "Daytona runtime state is unavailable.",
          });
          return runtimeJsonResponse(503, {
            ok: false,
            code: "runner_unavailable",
            error: "runner_unavailable",
            message: "Daytona runtime state is unavailable.",
            run_id: runId,
          });
        }
        const loopResult = await executeDaytonaAgentLoop({
          ctx,
          req,
          userId: userDbId,
          requestedModelId,
          inferenceSource:
            inferenceSource === "chatgpt"
              ? "chatgpt"
              : inferenceSource === "user_key"
                ? "user_key"
                : "platform",
          modelRef,
          messages: conversationMessages,
          maxTokens,
          apiKeyOverride: openRouterApiKeyOverride,
          runId,
          projectId: runtimeProjectId,
          daytonaConfig: daytonaConfigForRun,
          providerSandboxId: daytonaProviderSandboxId,
          toolboxProxyUrl: daytonaToolboxProxyUrl,
          initialProbeOutput: daytonaProbeOutput,
          codingContinuationPrompt,
          codingRelevantFiles,
          communityId: daytonaCommunityId,
          communityName: daytonaCommunityName,
          communitySystemPrompt: daytonaCommunitySystemPrompt,
          appendRunEvent,
        });
        if (!loopResult.ok) {
          await finishRunBestEffort({
            status: "error",
            reason: loopResult.code,
            errorCode: loopResult.code,
            errorMessage: loopResult.message,
          });
          await stopDaytonaSandboxBestEffort("error");
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
        try {
          await ctx.runMutation(internal.threads.updateCloudThreadCodingHandoffInternal as any, {
            ownerId: userDbId,
            threadId: ownedThread._id,
            runId,
            userText: latestUserText,
            assistantText: content,
            nowMs: Date.now(),
          });
        } catch (error) {
          console.warn("coding_handoff_update_failed", {
            requestId,
            threadId: String(ownedThread._id),
            runId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      } else if (runtimeCommunityId) {
        runtimeTurnStage = "community_loop";
        const loopResult = await executeCommunityAgentLoop({
          ctx,
          req,
          userId: userDbId,
          requestedModelId,
          inferenceSource,
          modelRef,
          messages: conversationMessages,
          maxTokens,
          runId,
          communityId: runtimeCommunityId,
          communityName: runtimeCommunityName,
          communitySystemPrompt: runtimeCommunitySystemPrompt,
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
          gateDecision.fundingSource === "user_chatgpt"
            ? await (async () => {
                runtimeTurnStage = "chatgpt_completion";
                return runChatgptCompletion({
                  ctx,
                  userId: userDbId,
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
        const persisted = (await ctx.runMutation(api.threads.addCloudThreadMessage as any, {
          ownerId: userDbId,
          threadId: ownedThread._id,
          messageKey: assistantMessageKeyForRun,
          role: "assistant",
          contentJson: {
            text: content,
            meta: {
              model_id: requestedModelId,
              inference_source: inferenceSource,
              lane,
            },
          },
          engineId: "runtime_turn",
          modelId: requestedModelId,
          runId,
          nowMs: Date.now(),
        })) as { _id?: unknown; messageKey?: unknown; seq?: unknown } | null;
        assistantMessageId = String(persisted?._id ?? "").trim() || null;
        assistantMessageKey = String(persisted?.messageKey ?? "").trim() || null;
        const parsedSeq = Number(persisted?.seq);
        assistantMessageSeq = Number.isFinite(parsedSeq) ? Math.max(0, Math.floor(parsedSeq)) : null;
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
      if (requestedExecutionTarget === "daytona_workspace") {
        await stopDaytonaSandboxBestEffort("stopped");
      }
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
          message: `runtime_turn_unhandled: ${message || "Runtime turn failed unexpectedly."}`,
        });
      }
    }),
  });
}
