import { api, internal } from "./_generated/api";
import { decryptStoredSecret } from "./providerConnections";
import { loadPlatformModelMap, loadPublicModelMap } from "./httpInferenceConfig";
import type { RetrievalToolName } from "../shared/retrievalTools";
import type { ThreadWorkingStatePrompt } from "../shared/runtimePrompt";
import {
  resolveActiveCapabilityFamiliesFromEntitlements,
  resolveHarnessProfileFromActiveCapabilities,
  type CapabilityFamily,
} from "../shared/canonicalGateEngine";
import {
  asRuntimeMessages,
  gateDeniedResponse,
  hasChatgptConnectionForUser,
  hasOpenRouterConnectionForUser,
  mapGateLaneToRuntimeLane,
  normalizeMaxTokens,
  normalizeSurface,
  parseRequestedFundingSource,
  resolveGateDecisionForAuthenticatedActor,
} from "./httpRuntimeSupport";

export type RuntimeCapabilityFamily = CapabilityFamily;

export type RuntimeTurnInput = {
  thread_id?: string;
  model_id?: string | null;
  surface?: "web";
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
    projectId?: unknown;
    workingState?: ThreadWorkingStatePrompt | null;
  };
  conversationMessages: Array<{ role: "user" | "assistant"; content: string }>;
  requestedModelId: string;
  lane: "public" | "platform" | "chatgpt";
  modelRef: string;
  maxTokens: number;
  stream: boolean;
  inferenceSource: "free" | "platform" | "user_key" | "chatgpt";
  openRouterApiKeyOverride: string | null;
  runtimeCommunityId: string | null;
  runtimeCommunityName: string | null;
  runtimeCommunitySlug: string | null;
  runtimeCommunityOneLiner: string | null;
  runtimeCommunityAbout: string | null;
  runtimeCommunitySystemPrompt: string | null;
  runtimeProjectId: string | null;
  runtimeSandboxMode: "workspace_write" | undefined;
  allowedToolNames: RetrievalToolName[];
  resolvedRuntimeCapabilityFamilies: RuntimeCapabilityFamily[];
  resolvedRuntimeHarnessProfile: string;
  runtimeExecutionMode: "agentic" | "chat";
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
  const goal = String(record.goal ?? "").trim() || null;
  const lastResult = String(record.lastResult ?? "").trim() || null;
  const openIssue = String(record.openIssue ?? "").trim() || null;
  const filesChanged = Array.isArray(record.filesChanged)
    ? record.filesChanged
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0)
        .slice(0, 8)
    : [];
  const verifiedFindings = Array.isArray(record.verifiedFindings)
    ? record.verifiedFindings
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0)
        .slice(0, 4)
    : [];
  if (!goal && !lastResult && !openIssue && filesChanged.length === 0 && verifiedFindings.length === 0) {
    return null;
  }
  return {
    goal,
    lastResult,
    filesChanged,
    verifiedFindings,
    openIssue,
  };
}

export function resolveAllowedToolNames(params: {
  activeCapabilityFamilies: readonly RuntimeCapabilityFamily[];
  inferenceSource: "free" | "platform" | "user_key" | "chatgpt";
}): RetrievalToolName[] {
  const toolNames: RetrievalToolName[] = [];
  if (params.activeCapabilityFamilies.includes("community_tools")) {
    toolNames.push("community_search", "community_write");
  }
  if (params.activeCapabilityFamilies.includes("web_research")) {
    toolNames.push("web_research");
  }
  if (params.activeCapabilityFamilies.includes("workspace_tools")) {
    toolNames.push(
      "list_dir",
      "read",
      "glob",
      "grep",
      "sha256",
      "write",
      "edit",
      "bash",
      "terminal_start",
      "terminal_read",
      "terminal_write",
      "terminal_stop",
    );
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
  )) as { _id?: string; communityId?: unknown; projectId?: unknown; workingState?: unknown } | null;
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

  setStage("messages");
  const runtimeMessages = asRuntimeMessages(input);
  const conversationMessages = stripSystemMessages(runtimeMessages);
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
  const requestedModelId = String(input.model_id ?? "").trim() || "gpt-5.4";
  const publicRef = publicMap[requestedModelId];
  const requestedAgenticTools = resolveRequestedAgenticTools(
    input.requested_agentic_tools,
  );
  const requestedFundingSource = parseRequestedFundingSource(
    input.requested_funding_source,
    publicRef ? "demo_public" : "platform",
  );
  const [hasUserKeyConnection, hasUserChatgptConnection] = await Promise.all([
    hasOpenRouterConnectionForUser({
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
    platformMap["gpt-5.4"] ||
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
  let openRouterApiKeyOverride: string | null = null;
  if (gateDecision.fundingSource === "user_key") {
    const connectionRow = (await ctx.runQuery(
      internal.providerConnections.getOpenRouterConnectionForUserInternal as any,
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
      openRouterApiKeyOverride = await decryptStoredSecret({
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
  const threadCommunityId = String(ownedThread.communityId ?? "").trim();
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
        system_prompt?: unknown;
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
        String(resolvedCommunity?.system_prompt ?? "").trim() || null;
    } catch (error) {
      console.warn("runtime_community_prompt_resolution_failed", {
        requestId,
        threadId: String(ownedThread._id),
        communityId: threadCommunityId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const runtimeProjectId = String(ownedThread.projectId ?? "").trim() || null;
  const resolvedRuntimeCapabilityFamilies = resolveActiveCapabilityFamiliesFromEntitlements({
    entitledCapabilityFamilies: gateDecision.entitledCapabilityFamilies,
    hasProjectContext: Boolean(runtimeProjectId),
    hasCommunityContext: Boolean(runtimeCommunityId),
  }) as RuntimeCapabilityFamily[];
  const allowedToolNames = resolveAllowedToolNames({
    activeCapabilityFamilies: resolvedRuntimeCapabilityFamilies,
    inferenceSource,
  });
  const runtimeExecutionMode: "agentic" | "chat" =
    requestedAgenticTools && allowedToolNames.length > 0
      ? "agentic"
      : "chat";
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
      openRouterApiKeyOverride,
      runtimeCommunityId,
      runtimeCommunityName,
      runtimeCommunitySlug,
      runtimeCommunityOneLiner,
      runtimeCommunityAbout,
      runtimeCommunitySystemPrompt,
      runtimeProjectId,
      runtimeSandboxMode: resolvedRuntimeCapabilityFamilies.includes("workspace_tools")
        ? "workspace_write"
        : undefined,
      allowedToolNames,
      resolvedRuntimeCapabilityFamilies,
      resolvedRuntimeHarnessProfile: resolveHarnessProfileFromActiveCapabilities({
        authState: "authenticated",
        activeCapabilityFamilies: resolvedRuntimeCapabilityFamilies,
      }),
      runtimeExecutionMode,
    },
  };
}
