import { api, internal } from "./_generated/api";
import { decryptStoredSecret } from "./providerConnections";
import { loadPlatformModelMap, loadPublicModelMap } from "./httpInferenceConfig";
import {
  PROJECT_WORKSPACE_TERMINAL_TOOL_NAMES,
  SANDBOX_FILE_SHELL_TOOL_NAMES,
  SANDBOX_PREVIEW_TOOL_NAMES,
  type RetrievalToolName,
} from "../shared/retrievalTools";
import type { ThreadWorkingStatePrompt } from "../shared/runtimePrompt";
import {
  resolveActiveCapabilityFamiliesFromEntitlements,
  resolveHarnessProfileFromActiveCapabilities,
  type CapabilityFamily,
} from "../shared/canonicalGateEngine";
import {
  canUseRuntimeEngineForTier,
  getRuntimeEngineDisplayName,
  normalizeRuntimeEngine,
  type RuntimeEngine,
} from "../shared/runtimeEngine";
import {
  normalizeCommunityLensAuthority,
  type CommunityLensAuthority,
} from "../shared/communityLensAuthority";
import {
  DEFAULT_ACTIVE_MODEL_ID,
  supportsModelImageInput,
} from "../shared/modelCatalog";
import {
  asRuntimeMessages,
  gateDeniedResponse,
  hasChatgptConnectionForUser,
  hasOpenAiConnectionForUser,
  mapGateLaneToRuntimeLane,
  normalizeMaxTokens,
  normalizeSurface,
  parseRequestedFundingSource,
  resolveGateDecisionForAuthenticatedActor,
} from "./httpRuntimeSupport";
import {
  isReadOnlyLegacyMemberAgentThreadKey,
  resolveRuntimeInvocationSurfaceForThread,
  restrictCapabilityFamiliesForInvocationSurface,
  restrictToolNamesForInvocationSurface,
  type RuntimeInvocationSurface,
} from "../shared/runtimeInvocationSurface";
import {
  buildMemberAgentConversationContext,
  type MemberAgentStoredMessage,
} from "../shared/memberAgentConversationContext";
import {
  normalizeMemberAgentSurfaceContext,
  type MemberAgentSurfaceContextV1,
} from "../shared/memberAgentSurfaceContext";
import type { NativeToolInputContentPart } from "../shared/nativeToolProtocol";

export type RuntimeCapabilityFamily = CapabilityFamily;

export type RuntimeTurnInput = {
  thread_id?: string;
  model_id?: string | null;
  runtime_engine?: RuntimeEngine | null;
  surface?: "web";
  invocation_surface?: RuntimeInvocationSurface | null;
  surface_context?: unknown;
  requested_agentic_tools?: boolean | null;
  requested_funding_source?:
    | "demo_public"
    | "user_key"
    | "user_chatgpt"
    | "platform"
    | "auto"
    | null;
  stream?: boolean;
  idempotency_key?: string | null;
  user_message_key?: string | null;
  message?: {
    text?: string | null;
  } | null;
  messages?: Array<{ role?: string | null; content?: string | null }> | null;
  max_tokens?: number | null;
};

export type PublicTurnInput = {
  model_id?: string | null;
  messages?: Array<{ role?: string | null; content?: string | null }> | null;
  stream?: boolean;
  max_tokens?: number | null;
};

export type AuthenticatedActor = {
  userId: string;
  dbUserId: any;
  authSubject: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export type RequireAuthenticatedActor = (
  ctx: unknown,
  req: Request,
) => Promise<
  | { ok: true; actor: AuthenticatedActor }
  | { ok: false; response: Response }
>;

export type RuntimeTurnResolution = {
  actor: AuthenticatedActor;
  threadKey: string;
  ownedThread: {
    _id: string;
    communityId?: unknown;
    contextVersion?: unknown;
    projectId?: unknown;
    workingState?: ThreadWorkingStatePrompt | null;
  };
  conversationMessages: Array<{
    role: "user" | "assistant";
    content: string | NativeToolInputContentPart[];
  }>;
  requestedModelId: string;
  lane: "public" | "platform" | "chatgpt";
  modelRef: string;
  maxTokens: number;
  stream: boolean;
  inferenceSource: "free" | "platform" | "user_key" | "chatgpt";
  runtimeAccountPlan: "free" | "premium";
  requestedRuntimeEngine: RuntimeEngine | null;
  providerApiKeyOverride: string | null;
  runtimeCommunityId: string | null;
  runtimeCommunityName: string | null;
  runtimeCommunitySlug: string | null;
  runtimeCommunityOneLiner: string | null;
  runtimeCommunityAbout: string | null;
  runtimeCommunitySystemPrompt: string | null;
  runtimeCommunityLensAuthority: CommunityLensAuthority | null;
  runtimeProjectId: string | null;
  runtimeSandboxMode: "sandbox_write" | "workspace_write" | undefined;
  allowedToolNames: RetrievalToolName[];
  resolvedRuntimeCapabilityFamilies: RuntimeCapabilityFamily[];
  resolvedRuntimeHarnessProfile: string;
  runtimeExecutionMode: "agentic" | "chat";
  invocationSurface: RuntimeInvocationSurface;
  memberAgentSurfaceContext: MemberAgentSurfaceContextV1 | null;
};

function resolveRequestedAgenticTools(raw: unknown): boolean {
  return raw === true;
}

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

function normalizeThreadWorkingState(raw: unknown): ThreadWorkingStatePrompt | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const version = Number(record.version);
  const statusRaw = String(record.status ?? "").trim();
  const status =
    statusRaw === "idle" ||
    statusRaw === "in_progress" ||
    statusRaw === "blocked" ||
    statusRaw === "needs_verification" ||
    statusRaw === "complete"
      ? statusRaw
      : null;
  const goal = String(record.goal ?? "").trim() || null;
  const currentStep = String(record.currentStep ?? "").trim() || null;
  const normalizeStringList = (raw: unknown, maxItems: number): string[] =>
    Array.isArray(raw)
      ? raw
          .map((value) => String(value ?? "").trim())
          .filter((value) => value.length > 0)
          .slice(0, maxItems)
      : [];
  const plan = normalizeStringList(record.plan, 5);
  const completedSteps = normalizeStringList(record.completedSteps, 8);
  const decisions = normalizeStringList(record.decisions, 5);
  const openQuestions = normalizeStringList(record.openQuestions, 4);
  const focusFiles = normalizeStringList(record.focusFiles, 8);
  const lastResult = String(record.lastResult ?? "").trim() || null;
  const blocker = String(record.blocker ?? record.openIssue ?? "").trim() || null;
  const openIssue = String(record.openIssue ?? blocker ?? "").trim() || null;
  const nextAction = String(record.nextAction ?? "").trim() || null;
  const verificationStatusRaw = String(record.verificationStatus ?? "").trim();
  const verificationStatus =
    verificationStatusRaw === "not_needed" ||
    verificationStatusRaw === "needed" ||
    verificationStatusRaw === "passed" ||
    verificationStatusRaw === "failed"
      ? verificationStatusRaw
      : null;
  const filesTouched = Array.isArray(record.filesTouched)
    ? normalizeStringList(record.filesTouched, 10)
    : [];
  const filesChanged = Array.isArray(record.filesChanged)
    ? normalizeStringList(record.filesChanged, 8)
    : [];
  const verifiedFindings = Array.isArray(record.verifiedFindings)
    ? normalizeStringList(record.verifiedFindings, 4)
    : [];
  const recentActions = Array.isArray(record.recentActions)
    ? normalizeStringList(record.recentActions, 6)
    : [];
  const lastDiagnostic = String(record.lastDiagnostic ?? "").trim() || null;
  if (
    !goal &&
    !status &&
    !currentStep &&
    plan.length === 0 &&
    completedSteps.length === 0 &&
    decisions.length === 0 &&
    openQuestions.length === 0 &&
    focusFiles.length === 0 &&
    !lastResult &&
    !openIssue &&
    !nextAction &&
    !verificationStatus &&
    !lastDiagnostic &&
    filesTouched.length === 0 &&
    filesChanged.length === 0 &&
    verifiedFindings.length === 0 &&
    recentActions.length === 0
  ) {
    return null;
  }
  return {
    version: Number.isFinite(version) ? Math.max(1, Math.floor(version)) : 1,
    goal,
    status,
    currentStep,
    plan,
    completedSteps,
    decisions,
    openQuestions,
    focusFiles,
    lastResult,
    verificationStatus,
    filesTouched,
    filesChanged,
    verifiedFindings,
    recentActions,
    lastDiagnostic,
    openIssue,
    blocker,
    nextAction,
  };
}

export function resolveAllowedToolNames(params: {
  activeCapabilityFamilies: readonly RuntimeCapabilityFamily[];
  inferenceSource: "free" | "platform" | "user_key" | "chatgpt";
}): RetrievalToolName[] {
  const toolNames: RetrievalToolName[] = [];
  if (params.activeCapabilityFamilies.includes("product_docs")) {
    toolNames.push("search_product_docs", "get_product_doc");
  }
  if (params.activeCapabilityFamilies.includes("community_tools")) {
    toolNames.push(
      "get_active_community_context",
      "community_resources_map",
      "community_resources_read",
      "community_resources_list",
      "community_resource_read",
      "community_resources_search",
      "community_search",
      "community_chat_search",
      "community_chat_read",
      "community_ai_feed_search",
      "community_ai_feed_read",
      "community_write",
    );
  }
  if (params.activeCapabilityFamilies.includes("web_research")) {
    toolNames.push("web_research", "web_crawl");
  }
  if (params.activeCapabilityFamilies.includes("sandbox_tools")) {
    toolNames.push(...SANDBOX_FILE_SHELL_TOOL_NAMES);
    toolNames.push(...SANDBOX_PREVIEW_TOOL_NAMES);
  }
  if (params.activeCapabilityFamilies.includes("workspace_tools")) {
    toolNames.push(...PROJECT_WORKSPACE_TERMINAL_TOOL_NAMES);
    if (params.inferenceSource === "chatgpt") {
      toolNames.push(
        "computer_open_url",
        "computer_screenshot",
        "computer_click",
        "computer_type",
        "computer_keypress",
        "computer_scroll",
        "computer_stop",
      );
    }
  }
  return toolNames.filter((value, index, list) => list.indexOf(value) === index);
}

export async function resolveAuthenticatedRuntimeTurn(args: {
  ctx: any;
  req: Request;
  input: RuntimeTurnInput;
  requireAuthenticatedActor: RequireAuthenticatedActor;
  setStage: (stage: string) => void;
  fail: (status: number, payload: Record<string, unknown>) => Response;
  requestId: string;
}): Promise<{ ok: true; value: RuntimeTurnResolution } | { ok: false; response: Response }> {
  const { ctx, req, input, requireAuthenticatedActor, setStage, fail, requestId } = args;

  setStage("auth");
  const auth = await requireAuthenticatedActor(ctx, req);
  if (!auth.ok) return { ok: false, response: auth.response };
  const actor = auth.actor;

  setStage("thread_lookup");
  const threadKey = String(input.thread_id ?? "").trim();
  if (!threadKey) {
    return {
      ok: false,
      response: fail(400, {
        ok: false,
        code: "invalid_request",
        error: "invalid_request",
        message: "thread_id is required.",
      }),
    };
  }
  const ownedThread = (await ctx.runQuery(
    api.threads.getCloudThreadByThreadKey as any,
    {
      ownerId: actor.dbUserId,
      threadKey,
    },
  )) as { _id?: string; communityId?: unknown; contextVersion?: unknown; projectId?: unknown; workingState?: unknown } | null;
  if (!ownedThread?._id) {
    return {
      ok: false,
      response: fail(404, {
        ok: false,
        code: "thread_not_found",
        error: "thread_not_found",
        message: "Cloud thread not found.",
      }),
    };
  }

  const invocationSurface = resolveRuntimeInvocationSurfaceForThread({
    requestedSurface: input.invocation_surface,
    threadKey,
  });
  const memberAgentSurfaceContext =
    invocationSurface === "member_agent_dock"
      ? normalizeMemberAgentSurfaceContext(input.surface_context)
      : null;
  if (invocationSurface === "member_agent_dock" && !memberAgentSurfaceContext) {
    return {
      ok: false,
      response: fail(400, {
        ok: false,
        code: "member_agent_surface_context_required",
        error: "member_agent_surface_context_required",
        message: "The member agent turn requires a valid current surface.",
      }),
    };
  }

  setStage("messages");
  let conversationMessages: Array<{
    role: "user" | "assistant";
    content: string | NativeToolInputContentPart[];
  }>;
  let hasMemberAgentImageInput = false;
  if (invocationSurface === "member_agent_dock") {
    const expectedUserMessageKey = String(input.user_message_key ?? "").trim();
    if (!expectedUserMessageKey) {
      return {
        ok: false,
        response: fail(400, {
          ok: false,
          code: "member_agent_user_message_key_required",
          error: "member_agent_user_message_key_required",
          message: "The member agent turn requires a persisted user message.",
        }),
      };
    }
    try {
      const storedRows = (await ctx.runQuery(
        internal.threads.listMemberAgentRuntimeMessagesInternal as any,
        {
          ownerId: actor.dbUserId,
          threadId: ownedThread._id,
          expectedUserMessageKey,
        },
      )) as MemberAgentStoredMessage[];
      const context = buildMemberAgentConversationContext({
        rows: storedRows,
        expectedUserMessageKey,
      });
      if (!context.ok) throw new Error(context.code);
      conversationMessages = context.messages;
      hasMemberAgentImageInput = context.hasImageInput;
    } catch {
      return {
        ok: false,
        response: fail(409, {
          ok: false,
          code: "member_agent_context_unavailable",
          error: "member_agent_context_unavailable",
          message: "The member agent conversation changed before this turn could start.",
        }),
      };
    }
  } else {
    const runtimeMessages = asRuntimeMessages(input);
    conversationMessages = stripSystemMessages(runtimeMessages);
  }
  if (
    conversationMessages.length === 0 ||
    conversationMessages[conversationMessages.length - 1]?.role !== "user"
  ) {
    return {
      ok: false,
      response: fail(400, {
        ok: false,
        code: "no_user_message",
        error: "no_user_message",
        message: "A trailing user message is required.",
      }),
    };
  }

  setStage("gate");
  const publicMap = loadPublicModelMap();
  const platformMap = loadPlatformModelMap();
  const requestedModelId = String(input.model_id ?? "").trim() || DEFAULT_ACTIVE_MODEL_ID;
  if (hasMemberAgentImageInput && !supportsModelImageInput(requestedModelId)) {
    return {
      ok: false,
      response: fail(400, {
        ok: false,
        code: "member_agent_image_model_unsupported",
        error: "member_agent_image_model_unsupported",
        message: "This model cannot inspect images. Remove the image or use an image-capable model.",
      }),
    };
  }
  const publicRef = publicMap[requestedModelId];
  const requestedRuntimeEngine = normalizeRuntimeEngine(input.runtime_engine);
  if (
    input.runtime_engine !== undefined &&
    input.runtime_engine !== null &&
    String(input.runtime_engine).trim().length > 0 &&
    !requestedRuntimeEngine
  ) {
    return {
      ok: false,
      response: fail(400, {
        ok: false,
        code: "invalid_runtime_engine",
        error: "invalid_runtime_engine",
        message: "runtime_engine must be either polynet or codex.",
      }),
    };
  }
  if (hasMemberAgentImageInput && requestedRuntimeEngine === "codex") {
    return {
      ok: false,
      response: fail(400, {
        ok: false,
        code: "member_agent_image_runtime_unsupported",
        error: "member_agent_image_runtime_unsupported",
        message: "Image turns use the Polynet runtime. Start a new image turn with that runtime selected.",
      }),
    };
  }
  const requestedAgenticTools = resolveRequestedAgenticTools(
    input.requested_agentic_tools,
  );
  const requestedFundingSource = parseRequestedFundingSource(
    input.requested_funding_source,
    publicRef ? "demo_public" : "platform",
  );
  const [hasUserKeyConnection, hasUserChatgptConnection] = await Promise.all([
    hasOpenAiConnectionForUser({
      ctx,
      userId: actor.dbUserId,
    }),
    hasChatgptConnectionForUser({
      ctx,
      userId: actor.dbUserId,
    }),
  ]);
  const gateDecision = await resolveGateDecisionForAuthenticatedActor({
    ctx,
    authSubject: actor.authSubject,
    surface: normalizeSurface(input.surface, "web"),
    requestedFundingSource,
    hasUserKeyConnection,
    hasUserChatgptConnection,
  });
  if (!gateDecision.allowed) {
    return {
      ok: false,
      response: gateDeniedResponse(
        (_req, status, payload) => fail(status, payload as Record<string, unknown>),
        req,
        {
          decision: gateDecision,
          requestedModelId,
        },
      ),
    };
  }

  setStage("provider_connection");
  const lane = mapGateLaneToRuntimeLane({ lane: gateDecision.lane });
  const fallbackPublicRef = Object.values(publicMap).find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
  const fallbackPlatformRef =
    readEnv("ARX_PLATFORM_DEFAULT_MODEL") ||
    platformMap[DEFAULT_ACTIVE_MODEL_ID] ||
    platformMap["gpt-5.5"] ||
    requestedModelId;
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
  const runtimeAccountPlan: "free" | "premium" =
    gateDecision.canonicalTier === "architect" ||
    gateDecision.effectiveTier === "architect"
      ? "premium"
      : "free";
  if (
    requestedRuntimeEngine &&
    !canUseRuntimeEngineForTier({
      engine: requestedRuntimeEngine,
      accountTier: runtimeAccountPlan,
    })
  ) {
    const runtimeLabel = getRuntimeEngineDisplayName(requestedRuntimeEngine);
    return {
      ok: false,
      response: fail(403, {
        ok: false,
        code: "runtime_plan_required",
        error: "runtime_plan_required",
        message: `${runtimeLabel} requires Polynet Premium. Upgrade in Billing to use Codex and premium agent runtimes.`,
        cta: "upgrade",
        runtime_engine_requested: requestedRuntimeEngine,
        runtime_engine_resolved: null,
        required_plan: "premium",
      }),
    };
  }
  let providerApiKeyOverride: string | null = null;
  if (gateDecision.fundingSource === "user_key") {
    const connectionRow = (await ctx.runQuery(
      internal.providerConnections.getOpenAiConnectionForUserInternal as any,
      {
        userId: actor.dbUserId,
      },
    )) as { encryptedSecretHex?: unknown; secretIvHex?: unknown } | null;
    if (!connectionRow?.encryptedSecretHex || !connectionRow?.secretIvHex) {
      return {
        ok: false,
        response: fail(403, {
          ok: false,
          code: "provider_connection_required",
          error: "provider_connection_required",
          message: "Connect a provider to use this model.",
          gate_code: "provider_connection_required",
          cta: "connect_provider",
          lane: gateDecision.lane,
          model_id: requestedModelId,
        }),
      };
    }
    try {
      providerApiKeyOverride = await decryptStoredSecret({
        encryptedSecretHex: String(connectionRow.encryptedSecretHex),
        secretIvHex: String(connectionRow.secretIvHex),
      });
    } catch {
      return {
        ok: false,
        response: fail(503, {
          ok: false,
          code: "provider_connection_unavailable",
          error: "provider_connection_unavailable",
          message:
            "Stored provider credentials are unavailable. Reconnect your provider and retry.",
          gate_code: "provider_connection_required",
          cta: "connect_provider",
          lane: gateDecision.lane,
          model_id: requestedModelId,
        }),
      };
    }
  }

  let runtimeCommunityId: string | null = null;
  let runtimeCommunityName: string | null = null;
  let runtimeCommunitySlug: string | null = null;
  let runtimeCommunityOneLiner: string | null = null;
  let runtimeCommunityAbout: string | null = null;
  let runtimeCommunitySystemPrompt: string | null = null;
  let runtimeCommunityLensAuthority: CommunityLensAuthority | null = null;
  const threadCommunityId = String(ownedThread.communityId ?? "").trim();
  if (
    invocationSurface === "member_agent_dock" &&
    isReadOnlyLegacyMemberAgentThreadKey(threadKey)
  ) {
    return {
      ok: false,
      response: fail(403, {
        ok: false,
        code: "member_agent_legacy_episode_read_only",
        error: "member_agent_legacy_episode_read_only",
        message: "Historical member-agent episodes are available through recall only.",
      }),
    };
  }
  if (threadCommunityId) {
    try {
      const resolvedCommunity = (await ctx.runQuery(
        internal.communityAgent.resolveRuntimeCommunityPromptContextInternal as any,
        {
          userId: actor.dbUserId,
          authSubject: actor.authSubject,
          communityId: threadCommunityId,
        },
      )) as {
        community_id?: unknown;
        community_name?: unknown;
        community_slug?: unknown;
        community_one_liner?: unknown;
        community_about?: unknown;
        community_system_prompt?: unknown;
        community_lens_authority?: unknown;
      } | null;
      runtimeCommunityId =
        String(resolvedCommunity?.community_id ?? "").trim() || null;
      runtimeCommunityName =
        String(resolvedCommunity?.community_name ?? "").trim() || null;
      runtimeCommunitySlug =
        String(resolvedCommunity?.community_slug ?? "").trim() || null;
      runtimeCommunityOneLiner =
        String(resolvedCommunity?.community_one_liner ?? "").trim() || null;
      runtimeCommunityAbout =
        String(resolvedCommunity?.community_about ?? "").trim() || null;
      runtimeCommunitySystemPrompt =
        String(resolvedCommunity?.community_system_prompt ?? "").trim() || null;
      runtimeCommunityLensAuthority = normalizeCommunityLensAuthority(
        resolvedCommunity?.community_lens_authority,
      );
      if (!runtimeCommunityId) {
        throw new Error("community_lens_unavailable");
      }
      if (!runtimeCommunityLensAuthority) {
        throw new Error("community_lens_authority_unavailable");
      }
    } catch (error) {
      console.warn("runtime_community_prompt_resolution_failed", {
        requestId,
        threadId: String(ownedThread._id),
        communityId: threadCommunityId,
        message: error instanceof Error ? error.message : String(error),
      });
      return {
        ok: false,
        response: fail(403, {
          ok: false,
          code: "community_lens_unavailable",
          error: "community_lens_unavailable",
          message:
            "This thread's community context is no longer available. Clear the community context or rejoin the community and retry.",
          community_id: threadCommunityId,
        }),
      };
    }
  }
  if (invocationSurface === "member_agent_dock" && memberAgentSurfaceContext) {
    const surfaceCommunitySlug =
      memberAgentSurfaceContext.kind === "community"
        ? memberAgentSurfaceContext.community_slug
        : null;
    const lensMatchesSurface = surfaceCommunitySlug
      ? runtimeCommunitySlug === surfaceCommunitySlug
      : runtimeCommunityId === null;
    if (!lensMatchesSurface) {
      return {
        ok: false,
        response: fail(409, {
          ok: false,
          code: "member_agent_surface_lens_mismatch",
          error: "member_agent_surface_lens_mismatch",
          message: "The visible page changed before the member agent turn could start.",
        }),
      };
    }
  }

  const runtimeProjectId = String(ownedThread.projectId ?? "").trim() || null;
  const resolvedRuntimeCapabilityFamilies = restrictCapabilityFamiliesForInvocationSurface({
    invocationSurface,
    capabilityFamilies: resolveActiveCapabilityFamiliesFromEntitlements({
      entitledCapabilityFamilies: gateDecision.entitledCapabilityFamilies,
      hasProjectContext: Boolean(runtimeProjectId),
      hasCommunityContext: Boolean(runtimeCommunityId),
    }) as RuntimeCapabilityFamily[],
  });
  const allowedToolNames = restrictToolNamesForInvocationSurface({
    invocationSurface,
    toolNames: [
      ...resolveAllowedToolNames({
        activeCapabilityFamilies: resolvedRuntimeCapabilityFamilies,
        inferenceSource,
      }),
      ...(invocationSurface === "member_agent_dock"
        ? ([
            "member_conversations_list",
            "member_conversation_read",
            "polynet_list_communities",
            "polynet_get_community",
          ] as const)
        : []),
    ],
  });
  const runtimeExecutionMode: "agentic" | "chat" =
    requestedAgenticTools && allowedToolNames.length > 0
      ? "agentic"
      : "chat";
  if (hasMemberAgentImageInput && runtimeExecutionMode !== "agentic") {
    return {
      ok: false,
      response: fail(400, {
        ok: false,
        code: "member_agent_image_runtime_unsupported",
        error: "member_agent_image_runtime_unsupported",
        message: "Image turns require the Polynet agent runtime.",
      }),
    };
  }
  return {
    ok: true,
    value: {
      actor,
      threadKey,
      ownedThread: {
        ...ownedThread,
        _id: String(ownedThread._id),
        workingState: normalizeThreadWorkingState(ownedThread.workingState),
      },
      conversationMessages,
      requestedModelId,
      lane,
      modelRef,
      maxTokens,
      stream,
      inferenceSource,
      runtimeAccountPlan,
      requestedRuntimeEngine,
      providerApiKeyOverride,
      runtimeCommunityId,
      runtimeCommunityName,
      runtimeCommunitySlug,
      runtimeCommunityOneLiner,
      runtimeCommunityAbout,
      runtimeCommunitySystemPrompt,
      runtimeCommunityLensAuthority,
      runtimeProjectId,
      runtimeSandboxMode: resolvedRuntimeCapabilityFamilies.includes("workspace_tools")
        ? "workspace_write"
        : resolvedRuntimeCapabilityFamilies.includes("sandbox_tools")
          ? "sandbox_write"
          : undefined,
      allowedToolNames,
      resolvedRuntimeCapabilityFamilies,
      resolvedRuntimeHarnessProfile: resolveHarnessProfileFromActiveCapabilities({
        authState: "authenticated",
        activeCapabilityFamilies: resolvedRuntimeCapabilityFamilies,
      }),
      runtimeExecutionMode,
      invocationSurface,
      memberAgentSurfaceContext,
    },
  };
}
