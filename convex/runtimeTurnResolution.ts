import { api, internal } from "./_generated/api";
import { parseCommunityConversationIdentity } from "../shared/communityConversationIdentity";
import { type RetrievalToolName } from "../shared/retrievalTools";
import type { ThreadWorkingStatePrompt } from "../shared/runtimePrompt";
import {
  resolveActiveCapabilityFamiliesFromEntitlements,
  resolveEntitledCapabilityFamiliesForGate,
  resolveHarnessProfileFromActiveCapabilities,
  type CapabilityFamily,
} from "../shared/canonicalGateEngine";
import {
  normalizeRuntimeEngine,
  type RuntimeEngine,
} from "../shared/runtimeEngine";
import {
  normalizeCommunityLensAuthority,
  type CommunityLensAuthority,
} from "../shared/communityLensAuthority";
import {
  asRuntimeMessages,
  normalizeMaxTokens,
} from "./httpRuntimeSupport";
import {
  isReadOnlyLegacyCommunityAgentThreadKey,
  resolveRuntimeInvocationFundingPolicy,
  resolveRuntimeInvocationSurfaceForThread,
  restrictCapabilityFamiliesForInvocationSurface,
  restrictToolNamesForInvocationSurface,
  type RuntimeInvocationSurface,
} from "../shared/runtimeInvocationSurface";
import {
  buildCommunityAgentConversationContext,
  type CommunityAgentPersistedHistorySeed,
  type CommunityAgentRuntimeHistoryPage,
} from "../shared/communityAgentConversationContext";
import {
  normalizeCommunityAgentSurfaceContext,
  type CommunityAgentSurfaceContextV1,
} from "../shared/communityAgentSurfaceContext";
import type { NativeToolInputContentPart } from "../shared/nativeToolProtocol";
import {
  COMMUNITY_OWNER_FUNDED_MODEL_ID,
  COMMUNITY_OWNER_FUNDED_MODEL_SUPPORTS_IMAGE_INPUT,
  type CommunityInferenceFundingAdmission,
} from "../shared/founderInference";

export type RuntimeCapabilityFamily = CapabilityFamily;

export type RuntimeTurnInput = {
  thread_id?: string;
  model_id?: string | null;
  runtime_engine?: RuntimeEngine | null;
  surface?: "web";
  invocation_surface?: RuntimeInvocationSurface | null;
  surface_context?: unknown;
  requested_agentic_tools?: boolean | null;
  stream?: boolean;
  idempotency_key?: string | null;
  user_message_key?: string | null;
  message?: {
    text?: string | null;
  } | null;
  messages?: Array<{ role?: string | null; content?: string | null }> | null;
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
    workingState?: ThreadWorkingStatePrompt | null;
  };
  conversationMessages: Array<{
    role: "user" | "assistant";
    content: string | NativeToolInputContentPart[];
  }>;
  persistedConversationHistory: CommunityAgentPersistedHistorySeed | null;
  requestedModelId: string;
  lane: "platform";
  modelRef: string;
  maxTokens: number;
  stream: boolean;
  inferenceSource: "platform";
  requestedRuntimeEngine: RuntimeEngine | null;
  runtimeCommunityId: string | null;
  runtimeCommunityName: string | null;
  runtimeCommunitySlug: string | null;
  runtimeCommunityOneLiner: string | null;
  runtimeCommunityAbout: string | null;
  runtimeCommunityChannels: Array<{ slug: string; name: string }>;
  runtimeCommunitySystemPrompt: string | null;
  runtimeCommunityLensAuthority: CommunityLensAuthority | null;
  allowedToolNames: RetrievalToolName[];
  resolvedRuntimeCapabilityFamilies: RuntimeCapabilityFamily[];
  resolvedRuntimeHarnessProfile: string;
  invocationSurface: RuntimeInvocationSurface;
  communityAgentSurfaceContext: CommunityAgentSurfaceContextV1 | null;
  communityInferenceAdmission: CommunityInferenceFundingAdmission | null;
};

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
  inferenceSource: "platform";
}): RetrievalToolName[] {
  const toolNames: RetrievalToolName[] = [];
  if (params.activeCapabilityFamilies.includes("product_docs")) {
    toolNames.push("search_product_docs", "get_product_doc");
  }
  if (params.activeCapabilityFamilies.includes("community_tools")) {
    toolNames.push(
      "polynet_list",
      "polynet_read",
      "polynet_search",
      "polynet_write",
      "polynet_call",
    );
  }
  if (params.activeCapabilityFamilies.includes("web_research")) {
    toolNames.push("web_research", "web_crawl");
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
  )) as { _id?: string; communityId?: unknown; contextVersion?: unknown; workingState?: unknown } | null;
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
  if (!invocationSurface) {
    return {
      ok: false,
      response: fail(400, {
        ok: false,
        code: "invalid_invocation_surface",
        error: "invalid_invocation_surface",
        message:
          "invocation_surface must explicitly match the canonical community agent thread.",
      }),
    };
  }
  const rawRuntimeEngine = String(input.runtime_engine ?? "").trim();
  const requestedRuntimeEngine = normalizeRuntimeEngine(rawRuntimeEngine);
  if (
    rawRuntimeEngine.length > 0 &&
    requestedRuntimeEngine !== "polynet"
  ) {
    return {
      ok: false,
      response: fail(400, {
        ok: false,
        code: "unsupported_runtime_engine",
        error: "unsupported_runtime_engine",
        message: "The native Polynet runtime is the only supported runtime engine.",
      }),
    };
  }
  if (input.requested_agentic_tools !== true) {
    return {
      ok: false,
      response: fail(400, {
        ok: false,
        code: "agentic_runtime_required",
        error: "agentic_runtime_required",
        message: "Native Polynet turns require governed agent tools.",
      }),
    };
  }
  let communityAgentSurfaceContext =
    invocationSurface === "member_agent_dock"
      ? normalizeCommunityAgentSurfaceContext(input.surface_context)
      : null;
  if (invocationSurface === "member_agent_dock" && !communityAgentSurfaceContext) {
    return {
      ok: false,
      response: fail(400, {
        ok: false,
        code: "member_agent_surface_context_required",
        error: "member_agent_surface_context_required",
        message: "The community agent turn requires a valid current surface.",
      }),
    };
  }
  if (
    invocationSurface === "member_agent_dock" &&
    communityAgentSurfaceContext?.kind !== "community"
  ) {
    return {
      ok: false,
      response: fail(403, {
        ok: false,
        code: "member_agent_community_context_required",
        error: "member_agent_community_context_required",
        message: "Community AI is available from inside a joined community.",
      }),
    };
  }

  setStage("messages");
  let conversationMessages: Array<{
    role: "user" | "assistant";
    content: string | NativeToolInputContentPart[];
  }>;
  let hasPersistedImageInput = false;
  let persistedConversationHistory: CommunityAgentPersistedHistorySeed | null = null;
  const usesPersistedConversation = invocationSurface === "member_agent_dock";
  if (usesPersistedConversation) {
    const expectedUserMessageKey = String(input.user_message_key ?? "").trim();
    if (!expectedUserMessageKey) {
      return {
        ok: false,
        response: fail(400, {
          ok: false,
          code: "persisted_user_message_key_required",
          error: "persisted_user_message_key_required",
          message: "This agent surface requires a persisted user message.",
        }),
      };
    }
    try {
      const historyPage = (await ctx.runQuery(
        internal.threads.listCommunityAgentRuntimeMessagesInternal as any,
        {
          ownerId: actor.dbUserId,
          threadId: ownedThread._id,
          expectedUserMessageKey,
        },
      )) as CommunityAgentRuntimeHistoryPage;
      const context = buildCommunityAgentConversationContext({
        rows: historyPage.rows,
        expectedUserMessageKey,
      });
      if (!context.ok) throw new Error(context.code);
      if (context.expectedUserSeq !== historyPage.expectedUserSeq) {
        throw new Error("persisted_user_message_seq_mismatch");
      }
      conversationMessages = context.messages;
      hasPersistedImageInput = context.hasImageInput;
      persistedConversationHistory = {
        ...historyPage,
        expectedUserMessageKey,
      };
    } catch {
      return {
        ok: false,
        response: fail(409, {
          ok: false,
          code: "persisted_conversation_context_unavailable",
          error: "persisted_conversation_context_unavailable",
          message: "The persisted conversation changed before this turn could start.",
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
  // Every runtime turn is founder-funded: the community's plan pays for OpenAI's
  // community model. resolveRuntimeInvocationFundingPolicy rejects any surface
  // that is not.
  resolveRuntimeInvocationFundingPolicy(invocationSurface);
  const requestedModelId = COMMUNITY_OWNER_FUNDED_MODEL_ID;
  if (hasPersistedImageInput && !COMMUNITY_OWNER_FUNDED_MODEL_SUPPORTS_IMAGE_INPUT) {
    return {
      ok: false,
      response: fail(400, {
        ok: false,
        code: "image_model_unsupported",
        error: "image_model_unsupported",
        message: "This model cannot inspect images. Remove the image or use an image-capable model.",
      }),
    };
  }
  const maxTokens = normalizeMaxTokens(input.max_tokens, 2048);
  const stream = input.stream !== false;
  const lane = "platform" as const;
  const modelRef = `openai/${COMMUNITY_OWNER_FUNDED_MODEL_ID}`;
  const inferenceSource = "platform" as const;
  const entitledCapabilityFamilies = resolveEntitledCapabilityFamiliesForGate({
    authState: "authenticated",
  }) as RuntimeCapabilityFamily[];

  let runtimeCommunityId: string | null = null;
  let runtimeCommunityName: string | null = null;
  let runtimeCommunitySlug: string | null = null;
  let runtimeCommunityOneLiner: string | null = null;
  let runtimeCommunityAbout: string | null = null;
  let runtimeCommunityChannels: Array<{ slug: string; name: string }> = [];
  let runtimeCommunitySystemPrompt: string | null = null;
  let runtimeCommunityLensAuthority: CommunityLensAuthority | null = null;
  const threadCommunityId = String(ownedThread.communityId ?? "").trim();
  if (
    invocationSurface === "member_agent_dock" &&
    isReadOnlyLegacyCommunityAgentThreadKey(threadKey)
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
  if (parseCommunityConversationIdentity({ threadKey, communityId: threadCommunityId ?? undefined }) && communityAgentSurfaceContext?.kind === "community") {
    communityAgentSurfaceContext = { ...communityAgentSurfaceContext, community_conversation: true };
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
        community_channels?: unknown;
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
      runtimeCommunityChannels = Array.isArray(resolvedCommunity?.community_channels)
        ? (resolvedCommunity.community_channels as Array<{ slug?: unknown; name?: unknown }>)
            .map((channel) => ({ slug: String(channel?.slug ?? "").trim(), name: String(channel?.name ?? "").trim() }))
            .filter((channel) => /^[a-z0-9][a-z0-9-]*$/.test(channel.slug))
        : [];
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
  if (invocationSurface === "member_agent_dock" && communityAgentSurfaceContext) {
    const surfaceCommunitySlug =
      communityAgentSurfaceContext.kind === "community"
        ? communityAgentSurfaceContext.community_slug
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
          message: "The visible page changed before the community agent turn could start.",
        }),
      };
    }
  }

  let communityInferenceAdmission: CommunityInferenceFundingAdmission | null = null;
  if (!runtimeCommunityId) {
    return {
      ok: false,
      response: fail(403, {
        ok: false,
        code: "member_agent_community_context_required",
        error: "member_agent_community_context_required",
        message: "Community AI is available from inside a joined community.",
      }),
    };
  }
  setStage("community_inference_funding");
  const admission = (await ctx.runQuery(
    internal.founderInference.resolveCommunityInferenceFundingAdmissionInternal as any,
    { communityId: runtimeCommunityId },
  )) as CommunityInferenceFundingAdmission;
  if (admission.ok === false) {
    return {
      ok: false,
      response: fail(403, {
        ok: false,
        code: "community_ai_unavailable",
        error: "community_ai_unavailable",
        message: "Community AI is currently unavailable. The community owner can restore it from Billing.",
        funding_code: admission.code,
        community_id: runtimeCommunityId,
      }),
    };
  }
  communityInferenceAdmission = admission;

  const resolvedRuntimeCapabilityFamilies = restrictCapabilityFamiliesForInvocationSurface({
    invocationSurface,
    capabilityFamilies: resolveActiveCapabilityFamiliesFromEntitlements({
      entitledCapabilityFamilies,
      hasProjectContext: false,
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
    ],
  });
  if (allowedToolNames.length === 0) {
    return {
      ok: false,
      response: fail(403, {
        ok: false,
        code: "governed_agent_tools_unavailable",
        error: "governed_agent_tools_unavailable",
        message: "No governed tools are available for this agent surface.",
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
      persistedConversationHistory,
      requestedModelId,
      lane,
      modelRef,
      maxTokens,
      stream,
      inferenceSource,
      requestedRuntimeEngine,
      runtimeCommunityId,
      runtimeCommunityName,
      runtimeCommunitySlug,
      runtimeCommunityOneLiner,
      runtimeCommunityAbout,
      runtimeCommunityChannels,
      runtimeCommunitySystemPrompt,
      runtimeCommunityLensAuthority,
      allowedToolNames,
      resolvedRuntimeCapabilityFamilies,
      resolvedRuntimeHarnessProfile: resolveHarnessProfileFromActiveCapabilities({
        authState: "authenticated",
        activeCapabilityFamilies: resolvedRuntimeCapabilityFamilies,
      }),
      invocationSurface,
      communityAgentSurfaceContext,
      communityInferenceAdmission,
    },
  };
}
