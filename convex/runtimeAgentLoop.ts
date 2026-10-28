import { api, internal } from "./_generated/api";
import {
  COMMUNITY_MEMORY_RECALL_LIMIT,
  buildCommunityMemoryRecallQuery,
  parseCommunityMemoryRecallEntries,
  renderCommunityMemoryRecall,
} from "../shared/communityMemoryRecall";
import type { FounderProviderRequestUsage } from "../shared/founderInference";
import { normalizeCommunityResourceRuntimeLaneState } from "../shared/communityResourceLane";
import {
  appendRuntimeToolCallFinished,
  appendRuntimeToolCallStarted,
} from "./runtimeToolCallEvents";
import {
  RUNTIME_RUN_NOT_ACTIVE_CODE,
  USER_CANCELLED_RUNTIME_CODE,
  isRuntimeRunCancelledError,
  isRuntimeRunInactiveError,
  runAbortableWithRuntimeCancellation,
  throwIfRuntimeRunCannotContinue,
} from "./runtimeCancellation";
import { executeWebResearch } from "./webResearchTools";
import type { WebResearchBillingEvidence } from "./webSearchTypes";
import { classifyWebResearchUrlAccess } from "../shared/webResearchUrlPolicy.ts";
import {
  authorizeFounderPaidToolFundingSession,
  failFounderPaidToolFundingSession,
  markFounderPaidToolProviderStarted,
  settleFounderPaidToolFundingSession,
  type FounderPaidToolFundingSession,
} from "./founderPaidToolRuntime";
import {
  estimateWebResearchVendorCostUsd,
  type WebResearchCreditAction,
} from "../shared/providerPricing";
import { founderPaidToolActionForTool } from "../shared/founderPaidTools";
import { type RetrievalToolName } from "../shared/retrievalTools";
import {
  extractTextFromNativeToolMessageContent,
  findFirstUnadmittedNativeToolCall,
  type NativeToolAwareCompletionSuccess,
  type NativeToolAwareMessage,
  type NativeToolInputContentPart,
  type NativeToolChoice,
} from "../shared/nativeToolProtocol";
import { runNativeRuntimeKernel } from "../shared/runtimeKernel";
import {
  DEFAULT_RUNTIME_KERNEL_BUDGET,
  type RuntimeKernelBudget,
  type RuntimeKernelFailure,
  type RuntimeKernelFailureInput,
  type RuntimeKernelSuccess,
  type RuntimeKernelToolExecutionResult as NativeToolExecutionResult,
} from "../shared/runtimeKernelTypes";
import {
  buildResponsesApiFunctionTools,
  normalizeToolArguments as normalizeRegistryToolArguments,
} from "../shared/toolRegistry";
import type { CommunityEvidenceSurface } from "../shared/communityEvidenceContract";
import {
  buildPlatformHarnessRuntimePromptBundle,
  type RuntimeCommunityPromptFields,
  type ThreadWorkingStatePrompt,
} from "../shared/runtimePrompt";
import {
  restrictToolNamesForInvocationSurface,
  type RuntimeInvocationSurface,
} from "../shared/runtimeInvocationSurface";
import {
  buildRuntimeTurnEnvelope,
  type RuntimeTurnEnvelopeV1,
} from "../shared/runtimeTurnEnvelope";
import {
  buildRuntimeContextManifest,
} from "../shared/runtimeContextManifest.ts";
import {
  renderMemberAgentIdentityContext,
  type MemberIdentityContextStatus,
} from "../shared/memberAgentIdentityContext.ts";
import type { MemberAgentSurfaceContextV1 } from "../shared/memberAgentSurfaceContext.ts";
import { loadRuntimeTurnContextPacketForRun } from "./runtimeTurnContext";
import { parseProviderModelRef } from "./httpInferenceConfig";
import { runOpenAiNativeToolCompletion } from "./openAiNativeToolCompletion";
import { logStructuredError, summarizeErrorForLog } from "./errorLogging";
import {
  type ActiveRuntimeToolBatchTelemetry,
  type RuntimeToolBatchExecutionMode,
  buildToolBatchTelemetryPayload,
} from "./runtimeHarnessTelemetry";
import { executePlatformOperation } from "./platformOperationExecutor.ts";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor.ts";
import {
  POLYNET_CANONICAL_TOOL_NAMES,
  type PolynetCanonicalToolName,
} from "../shared/polynetCanonicalToolContract.ts";
import {
  formatJsonToolOutput,
  summarizeToolArgsForLog,
} from "./runtimeHarnessShaping";
import { composeResolvedRuntimeHarness } from "./runtimeHarnessComposition.ts";
import {
  buildRuntimeToolPolicySurface,
  classifyRuntimeToolSchedule,
  type RuntimeToolSchedulePlan,
} from "../shared/runtimeToolPolicy";
import {
  buildRuntimeContextProjectionEvidence,
} from "../shared/providerContextWindow";
import {
  RUNTIME_PROVIDER_CONTEXT_ATTESTATION_FAILURE_CODE,
  buildRuntimeProviderContextAttestation,
  type RuntimeProviderContextAttestationV1,
} from "../shared/runtimeProviderContextAttestation.ts";
import {
  buildRuntimeInputBudgetEvidence,
  resolveRuntimeProviderBudgetIdentity,
} from "../shared/runtimeInputBudget.ts";
import {
  MEMBER_AGENT_CONTEXT_PAGE_SIZE,
  type MemberAgentPersistedHistorySeed,
  type MemberAgentRuntimeHistoryPage,
} from "../shared/memberAgentConversationContext.ts";
import { selectMemberAgentHistoryForBudget } from "../shared/memberAgentHistorySelection.ts";

type InferenceRole = "user" | "assistant" | "system";
type InferenceMessage = {
  role: InferenceRole;
  content: string | NativeToolInputContentPart[];
};

function toNativeInferenceMessage(
  message: InferenceMessage,
): NativeToolAwareMessage {
  if (message.role === "user") {
    return { role: "user", content: message.content };
  }
  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: extractTextFromNativeToolMessageContent(message.content),
    };
  }
  return {
    role: "system",
    content: extractTextFromNativeToolMessageContent(message.content),
  };
}

type RuntimeAgentLoopSuccess = RuntimeKernelSuccess<string>;
type RuntimeAgentLoopFailure = RuntimeKernelFailure<string>;
type RuntimeAgentLoopFailureInput = RuntimeKernelFailureInput;
type RuntimeProviderLifecycleHooks = {
  beforeProviderRequest?: () => Promise<void>;
  recordInitialProviderContextAttestation?: (
    attestation: RuntimeProviderContextAttestationV1,
  ) => Promise<{ ok: boolean; errorCode?: string | null }>;
  observeProviderResult?: (result: {
    ok: boolean;
    code: string | null;
    promptTokens: number | null;
    completionTokens: number | null;
    providerRequestUsage?: FounderProviderRequestUsage;
  }) => void;
  // Output text as the model writes it. completionIndex tells model turns apart:
  // text from a turn that ends in tool calls is a preamble, not the final reply.
  onAssistantTextDelta?: (delta: string, completionIndex: number) => void;
};

class RuntimeProviderLifecycleHookError extends Error {
  readonly originalError: unknown;

  constructor(originalError: unknown) {
    super(
      originalError instanceof Error
        ? originalError.message
        : String(originalError ?? "provider_lifecycle_hook_failed"),
    );
    this.name = "RuntimeProviderLifecycleHookError";
    this.originalError = originalError;
  }
}

// Every turn is founder-funded through OpenAI.
type RuntimeInferenceSource = "platform";
const CHAT_TOOLS_RUNTIME_KERNEL_BUDGET: RuntimeKernelBudget =
  DEFAULT_RUNTIME_KERNEL_BUDGET;
const RUNTIME_PARALLEL_READ_TOOLS_FLAG =
  "RUNTIME_PARALLEL_READ_TOOLS_ENABLED";

function buildWebResearchCostMetadata(params: {
  estimatedVendorCostUsd: number;
  finalVendorCostUsd: number;
  billingEvidence?: WebResearchBillingEvidence;
}): Record<string, unknown> {
  const evidence = params.billingEvidence as any;
  const usage = evidence?.usage && typeof evidence.usage === "object" ? evidence.usage : null;
  return {
    estimated_vendor_cost_usd: params.estimatedVendorCostUsd,
    final_vendor_cost_usd: params.finalVendorCostUsd,
    final_cost_source: typeof evidence?.costSource === "string" ? evidence.costSource : "estimated",
    final_provider: typeof evidence?.provider === "string" ? evidence.provider : null,
    final_backends: Array.isArray(evidence?.backends) ? evidence.backends : [],
    final_model: typeof evidence?.model === "string" ? evidence.model : null,
    xai_cost_in_usd_ticks:
      typeof usage?.costInUsdTicks === "number" ? usage.costInUsdTicks : null,
    server_side_tool_usage:
      usage?.serverSideToolUsage && typeof usage.serverSideToolUsage === "object"
        ? usage.serverSideToolUsage
        : null,
    num_server_side_tools_used:
      typeof usage?.numServerSideToolsUsed === "number" ? usage.numServerSideToolsUsed : null,
  };
}

function readRuntimeBooleanFlag(name: string, defaultValue: boolean): boolean {
  try {
    const rawValue = (globalThis as any)?.process?.env?.[name];
    if (typeof rawValue !== "string" || !rawValue.trim()) return defaultValue;
    const value = rawValue.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(value)) return true;
    if (["0", "false", "no", "off"].includes(value)) return false;
  } catch {
    // Convex runtime may not expose process.env; keep the safe default.
  }
  return defaultValue;
}

export async function executeRetrievalHarnessTool(params: {
  ctx: any;
  userId: string;
  authSubject?: string | null;
  runId: string;
  toolCallId?: string | null;
  communityId: string | null;
  toolName: RetrievalToolName;
  args: Record<string, unknown>;
  evidenceSurface?: CommunityEvidenceSurface;
  communityBoundConversation?: boolean;
  signal?: AbortSignal;
}): Promise<NativeToolExecutionResult> {
  let normalizedArgs: Record<string, unknown>;
  try {
    normalizedArgs = normalizeRegistryToolArguments(params.toolName, params.args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "error",
      exitCode: null,
      outputText: "",
      errorCode: "invalid_tool_args",
      errorMessage: message || "Invalid tool arguments.",
    };
  }

  if (params.toolName === "search_product_docs") {
    const execution = await executePlatformOperation({
      operationId: "product_docs.search",
      authSubject: params.authSubject,
      input: normalizedArgs,
    });
    if (!execution.ok) {
      return {
        status: "error",
        exitCode: null,
        outputText: execution.value
          ? formatJsonToolOutput(execution.value)
          : "",
        errorCode: execution.code,
        errorMessage: execution.message,
      };
    }
    return {
      status: "ok",
      exitCode: 0,
      outputText: formatJsonToolOutput(execution.value),
      errorCode: null,
      errorMessage: null,
    };
  }

  if (params.toolName === "get_product_doc") {
    const execution = await executePlatformOperation({
      operationId: "product_docs.read",
      authSubject: params.authSubject,
      input: normalizedArgs,
    });
    if (!execution.ok) {
      return {
        status: "error",
        exitCode: null,
        outputText: execution.value
          ? formatJsonToolOutput(execution.value)
          : "",
        errorCode: execution.code,
        errorMessage: execution.message,
      };
    }
    return {
      status: "ok",
      exitCode: 0,
      outputText: formatJsonToolOutput(execution.value),
      errorCode: null,
      errorMessage: null,
    };
  }

  if (
    (POLYNET_CANONICAL_TOOL_NAMES as readonly string[]).includes(
      params.toolName,
    )
  ) {
    const authSubject = String(params.authSubject ?? "").trim();
    if (!authSubject) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "authenticated_user_required",
        errorMessage: `${params.toolName} requires an authenticated user.`,
      };
    }
    const communityOwned =
      params.evidenceSurface === "community_concierge";
    const communityMounted =
      communityOwned || params.communityBoundConversation === true;
    if (params.communityBoundConversation && !params.communityId) throw new Error("community_context_required");
    if (params.communityBoundConversation) {
      const path = String(normalizedArgs.path ?? "").trim();
      if (path === "/" && params.toolName === "polynet_list") {
        const context = await params.ctx.runQuery(internal.communityAgent.resolveRuntimeCommunityPromptContextInternal, { authSubject, userId: params.userId as any, communityId: params.communityId as any });
        normalizedArgs = { ...normalizedArgs, path: `/communities/${context.community_slug}/` };
      } else if (!path.startsWith("/communities/")) {
        return { status: "error", exitCode: null, outputText: "", errorCode: "community_context_mismatch", errorMessage: "Use paths within this conversation's community." };
      }
    }
    const execution = await executePolynetCanonicalTool({
      toolCallId: params.toolCallId,
      communityBoundConversation: params.communityBoundConversation,
      runId: params.runId,
      ctx: params.ctx,
      authSubject,
      userId: params.userId,
      principalKind: communityOwned ? "community_agent" : "personal_agent",
      ...(communityMounted && params.communityId
        ? { mountedCommunityId: params.communityId }
        : {}),
      evidenceSurface: params.evidenceSurface ?? "member_agent_dock",
      toolName: params.toolName as PolynetCanonicalToolName,
      input: normalizedArgs,
    });
    if (!execution.ok) {
      return {
        status: "error",
        exitCode: null,
        outputText: execution.value
          ? formatJsonToolOutput(execution.value)
          : "",
        errorCode: execution.code,
        errorMessage: execution.message,
      };
    }
    return {
      status: "ok",
      exitCode: 0,
      outputText: formatJsonToolOutput(execution.value),
      errorCode: null,
      errorMessage: null,
    };
  }

  if (params.toolName === "member_conversations_list") {
    try {
      const payload = await params.ctx.runQuery(
        internal.threads.listMemberConversationsForToolInternal as any,
        {
          ownerId: params.userId as any,
          limit:
            typeof normalizedArgs.limit === "number"
              ? normalizedArgs.limit
              : undefined,
        },
      );
      return {
        status: "ok",
        exitCode: 0,
        outputText: formatJsonToolOutput(payload),
        errorCode: null,
        errorMessage: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "member_conversations_list_failed",
        errorMessage: message || "Member conversation listing failed.",
      };
    }
  }

  if (params.toolName === "member_conversation_read") {
    try {
      const payload = await params.ctx.runQuery(
        internal.threads.readMemberConversationForToolInternal as any,
        {
          ownerId: params.userId as any,
          episodeId: String(normalizedArgs.episodeId ?? "") as any,
        },
      );
      return {
        status: "ok",
        exitCode: 0,
        outputText: formatJsonToolOutput(payload),
        errorCode: null,
        errorMessage: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "member_conversation_read_failed",
        errorMessage: message || "Member conversation read failed.",
      };
    }
  }

  if (params.toolName === "member_profile_confirm_facts") {
    if (!params.communityId) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_required",
        errorMessage: "member_profile_confirm_facts requires an active community context.",
      };
    }
    const authSubject = String(params.authSubject ?? "").trim();
    if (!authSubject) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "authenticated_user_required",
        errorMessage: "member_profile_confirm_facts requires an authenticated user.",
      };
    }
    try {
      const payload = await params.ctx.runMutation(
        (api as any).memberOntology.confirmMemberInterviewFacts as any,
        {
          authSubject,
          communityId: params.communityId as any,
          confirmMarker: String(normalizedArgs.confirmMarker ?? ""),
          facts: Array.isArray(normalizedArgs.facts)
            ? normalizedArgs.facts
            : [],
        },
      );
      return {
        status: "ok",
        exitCode: 0,
        outputText: formatJsonToolOutput(payload),
        errorCode: null,
        errorMessage: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "member_profile_confirm_facts_failed",
        errorMessage: message || "Member profile fact confirmation failed.",
      };
    }
  }

  if (params.toolName === "web_crawl") {
    const access = classifyWebResearchUrlAccess(String(normalizedArgs.url ?? "").trim());
    if (!access.ok || !access.normalizedUrl) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: access.code ?? "invalid_tool_args",
        errorMessage: access.message ?? "web_crawl requires a valid public web URL.",
      };
    }
    if (normalizedArgs.destination === "active_community_sources") {
      try {
        await params.ctx.runQuery(
          (internal as any).communityResources.requireCommunitySourceManagerInternal,
          {
            userId: params.userId,
            communityId: params.communityId,
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: message || "community_forbidden",
          errorMessage: "Only community managers can add crawled sources.",
        };
      }
    }
    const webResearchAction = "crawl" as WebResearchCreditAction;
    const webResearchVendorCostUsd = estimateWebResearchVendorCostUsd(webResearchAction);
    let fundingSession: FounderPaidToolFundingSession;
    try {
      fundingSession = await authorizeFounderPaidToolFundingSession({
        ctx: params.ctx,
        communityId: params.communityId,
        actorUserId: params.userId,
        sourceRunId: params.runId,
        toolCallId: String(params.toolCallId ?? "").trim(),
        toolName: "web_crawl",
        action: "crawl",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: message || "founder_paid_tool_authorization_failed",
        errorMessage: "Paid web crawl is unavailable for this community.",
      };
    }
    try {
      await markFounderPaidToolProviderStarted({ ctx: params.ctx, session: fundingSession });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: message || "founder_paid_tool_provider_blocked",
        errorMessage: "Paid web crawl could not start.",
      };
    }
    let payload: unknown;
    try {
      payload = await params.ctx.runAction((internal as any).communityResources.crawlWebRoot, {
        userId: params.userId as any,
        communityId: params.communityId as any,
        rootUrl: access.normalizedUrl,
        strategy: normalizedArgs.strategy,
        destination: normalizedArgs.destination,
        maxPages: normalizedArgs.maxPages,
        maxDepth: normalizedArgs.maxDepth,
        maxChars: normalizedArgs.maxChars,
      });
    } catch (error) {
      try {
        await failFounderPaidToolFundingSession({
          ctx: params.ctx,
          session: fundingSession,
          failureCode: "web_crawl_failed",
        });
      } catch {
        // The lease reconciler remains the final financial safety net.
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "web_crawl_failed",
        errorMessage: message || "Web crawl failed.",
      };
    }

    const settlement = await settleFounderPaidToolFundingSession({
      ctx: params.ctx,
      session: fundingSession,
      rawVendorCostUsd: webResearchVendorCostUsd,
      provider: "source_url_fetcher",
      evidence: "estimated",
      metadata: {
        provider: "source_url_fetcher",
        final_cost_source: "estimated",
      },
      outcomeCode: "web_crawl_completed",
    });
    if (settlement.status !== "settled") {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "founder_paid_tool_cost_indeterminate",
        errorMessage: "Web crawl completed, but its provider cost exceeded the reserved ceiling.",
      };
    }
    return {
      status: "ok",
      exitCode: 0,
      outputText: JSON.stringify(payload, null, 2),
      errorCode: null,
      errorMessage: null,
      details: payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : null,
    };
  }

  if (params.toolName === "web_research") {
    const action =
      String(normalizedArgs.action ?? "").trim() === "find_in_page"
        ? "find_in_page"
        : String(normalizedArgs.action ?? "").trim() === "open_page"
          ? "open_page"
          : "search";
    const query = String(normalizedArgs.query ?? "").trim();
    if ((action === "search" || action === "find_in_page") && !query) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "invalid_tool_args",
        errorMessage:
          action === "find_in_page"
            ? "web_research find_in_page requires a query."
            : "web_research search requires a query.",
      };
    }
    if (action === "open_page" || action === "find_in_page") {
      const access = classifyWebResearchUrlAccess(String(normalizedArgs.url ?? "").trim());
      if (!access.ok) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: access.code ?? "invalid_tool_args",
          errorMessage: access.message ?? "web_research requires a valid public web URL.",
        };
      }
    }
    const webResearchAction = action as WebResearchCreditAction;
    const webResearchVendorCostUsd = estimateWebResearchVendorCostUsd(webResearchAction);
    let fundingSession: FounderPaidToolFundingSession;
    try {
      fundingSession = await authorizeFounderPaidToolFundingSession({
        ctx: params.ctx,
        communityId: params.communityId,
        actorUserId: params.userId,
        sourceRunId: params.runId,
        toolCallId: String(params.toolCallId ?? "").trim(),
        toolName: "web_research",
        action: founderPaidToolActionForTool({
          toolName: "web_research",
          action,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: message || "founder_paid_tool_authorization_failed",
        errorMessage: "Paid web research is unavailable for this community.",
      };
    }
    try {
      await markFounderPaidToolProviderStarted({ ctx: params.ctx, session: fundingSession });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: message || "founder_paid_tool_provider_blocked",
        errorMessage: "Paid web research could not start.",
      };
    }
    let result: Awaited<ReturnType<typeof executeWebResearch>>;
    try {
      result = await executeWebResearch({
        action,
        query: query || undefined,
        url:
          typeof normalizedArgs.url === "string" ? normalizedArgs.url : undefined,
      });
    } catch (error) {
      try {
        await failFounderPaidToolFundingSession({
          ctx: params.ctx,
          session: fundingSession,
          failureCode: "web_research_failed",
        });
      } catch {
        // The lease reconciler remains the final financial safety net.
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "web_research_failed",
        errorMessage: message || "Web research failed.",
      };
    }
    if (!result.ok) {
      try {
        await failFounderPaidToolFundingSession({
          ctx: params.ctx,
          session: fundingSession,
          failureCode: result.code,
        });
      } catch {
        // The lease reconciler remains the final financial safety net.
      }
      return {
        status: "error",
        exitCode: null,
        outputText: String(result.outputPreview ?? ""),
        errorCode: result.code,
        errorMessage: result.message,
      };
    }
    const finalVendorCostUsd =
      typeof result.billingEvidence?.rawVendorCostUsd === "number"
        ? Math.max(0, result.billingEvidence.rawVendorCostUsd)
        : webResearchVendorCostUsd;
    const provider = String(result.billingEvidence?.provider ?? "mixed").trim() || "mixed";
    const settlement = await settleFounderPaidToolFundingSession({
      ctx: params.ctx,
      session: fundingSession,
      rawVendorCostUsd: finalVendorCostUsd,
      provider,
      evidence:
        result.billingEvidence?.costSource === "provider_exact"
          ? "exact"
          : "estimated",
      metadata: buildWebResearchCostMetadata({
        estimatedVendorCostUsd: webResearchVendorCostUsd,
        finalVendorCostUsd,
        billingEvidence: result.billingEvidence,
      }),
      outcomeCode: "web_research_completed",
    });
    if (settlement.status !== "settled") {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "founder_paid_tool_cost_indeterminate",
        errorMessage: "Web research completed, but its provider cost exceeded the reserved ceiling.",
      };
    }
    return {
      status: "ok",
      exitCode: result.exitCode,
      outputText: result.outputText || "(no output)",
      errorCode: null,
      errorMessage: null,
      details:
        Array.isArray(result.webSources) && result.webSources.length > 0
          ? { web_sources: result.webSources }
          : null,
    };
  }

  return {
    status: "error",
    exitCode: null,
    outputText: "",
    errorCode: "tool_not_allowed",
    errorMessage: `${params.toolName} is not active in this run's capability profile.`,
  };
}

async function runProviderNativeToolCompletion(params: {
  modelRef: string;
  messages: NativeToolAwareMessage[];
  maxTokens: number;
  tools: Parameters<typeof runOpenAiNativeToolCompletion>[0]["tools"];
  parallelToolCalls?: boolean;
  toolChoice?: NativeToolChoice;
  onTextDelta?: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<
  NativeToolAwareCompletionSuccess<string> | RuntimeAgentLoopFailureInput
> {
  const parsedProviderRef = parseProviderModelRef(params.modelRef);
  if (parsedProviderRef?.provider !== "openai") {
    return {
      ok: false,
      status: 503,
      code: "runtime_model_provider_unsupported",
      message: "The community model must be an OpenAI model.",
    };
  }
  return runOpenAiNativeToolCompletion({
    modelId: parsedProviderRef.providerModel,
    messages: params.messages,
    maxTokens: params.maxTokens,
    tools: params.tools,
    parallelToolCalls: params.parallelToolCalls,
    toolChoice: params.toolChoice,
    onTextDelta: params.onTextDelta,
    signal: params.signal,
  });
}

async function executeRetrievalAgentLoop(
  params: RuntimeCommunityPromptFields & RuntimeProviderLifecycleHooks & {
    ctx: any;
    req: Request;
    userId: string;
    threadId?: string | null;
    requestedModelId: string;
    inferenceSource: RuntimeInferenceSource;
    modelRef: string;
    messages: InferenceMessage[];
    persistedConversationHistory?: MemberAgentPersistedHistorySeed | null;
    maxTokens: number;
    runId: string;
    harnessName: "chat_tools";
    loopBudget: RuntimeKernelBudget;
    allowedToolNames: readonly RetrievalToolName[];
    invocationSurface: RuntimeInvocationSurface;
    memberAgentSurfaceContext?: MemberAgentSurfaceContextV1 | null;
      communitySystemPrompt?: string | null;
    communityContextVersion?: number | null;
    threadWorkingState?: ThreadWorkingStatePrompt | null;
    authSubject?: string | null;
    appendRunEvent: (params: {
      eventType: string;
      eventKey?: string;
      payload: Record<string, unknown>;
    }) => Promise<void>;
    refreshRuntimeContextSnapshot?: (
      phase?: "started" | "active",
      runtimeTurnEnvelope?: RuntimeTurnEnvelopeV1 | null,
    ) => Promise<void>;
    touchRunHeartbeat?: () => Promise<void>;
  },
): Promise<RuntimeAgentLoopSuccess | RuntimeAgentLoopFailure> {
  const now = new Date();
  const runtimeTimeZone = "UTC";
  const runtimeDateTimeIso = now.toISOString();
  const runtimeDateLabel = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: runtimeTimeZone,
  }).format(now);
  const communityResourceLane = normalizeCommunityResourceRuntimeLaneState(
    await params.ctx.runQuery(
      internal.runtimeCommunityResourceLane.resolveRuntimeCommunityResourceLaneInternal,
      {
        userId: params.userId as any,
        authSubject: params.authSubject ?? undefined,
        communityId: params.communityId ? (params.communityId as any) : undefined,
      },
    ),
  );
  const resolvedHarness = composeResolvedRuntimeHarness({
    communityResourceLane,
  });
  const effectiveAllowedToolNames = restrictToolNamesForInvocationSurface({
    invocationSurface: params.invocationSurface,
    toolNames: params.allowedToolNames,
  });
  const latestUserContent = [...params.messages]
    .reverse()
    .find((message) => message.role === "user")?.content;
  const latestUserTextForRuntimeContext =
    extractTextFromNativeToolMessageContent(latestUserContent) ||
    (Array.isArray(latestUserContent) && latestUserContent.some((part) => part.type === "image")
      ? "[Image attached]"
      : null);
  const runtimeTurnEnvelope = buildRuntimeTurnEnvelope({
    latestUserText: latestUserTextForRuntimeContext,
    threadWorkingState: params.threadWorkingState,
    threadId: params.threadId ?? null,
    communityId: params.communityId ?? null,
    communityResourceLane: resolvedHarness.communityResourceLane,
    communityLensAuthority: params.communityLensAuthority ?? null,
    allowedToolNames: effectiveAllowedToolNames,
    memberAgentSurfaceContext: params.memberAgentSurfaceContext,
  });
  try {
    await params.refreshRuntimeContextSnapshot?.("started", runtimeTurnEnvelope);
  } catch {
    // Best-effort snapshot persistence; the explicit prompt envelope below remains canonical.
  }
  const runtimeTurnContext = (
    await loadRuntimeTurnContextPacketForRun({
      ctx: params.ctx,
      ownerId: params.userId,
      threadId: params.threadId ?? undefined,
      runId: params.runId,
      latestUserText: latestUserTextForRuntimeContext,
      runtimeTurnEnvelope,
      threadWorkingState: params.threadWorkingState,
    })
  ).packet;
  let memberIdentityContextMd: string | null = null;
  let memberIdentityContextStatus: MemberIdentityContextStatus = "not_applicable";
  if (params.invocationSurface === "member_agent_dock" && !(params.memberAgentSurfaceContext?.kind === "community" && params.memberAgentSurfaceContext.community_conversation)) {
    memberIdentityContextStatus = "empty";
    try {
      const identity = await params.ctx.runQuery(
        internal.profiles.resolveMemberAgentIdentityContextInternal,
        { userId: params.userId as any },
      );
      memberIdentityContextMd = renderMemberAgentIdentityContext(
        identity
          ? {
              displayName: identity.display_name,
              handle: identity.handle,
              bio: identity.bio,
              timezone: identity.timezone,
              socialLinks: identity.social_links,
            }
          : null,
      );
      memberIdentityContextStatus = memberIdentityContextMd ? "loaded" : "empty";
    } catch {
      // Identity context improves personalization but must never block a member turn.
      memberIdentityContextMd = null;
      memberIdentityContextStatus = "error";
    }
  }
  // Accepted community memory reaches the turn by a server-run canonical search,
  // not only when the model chooses to look. Same authority, mount and retrieval
  // receipt as a model-issued polynet_search; failure never blocks the turn.
  let communityMemoryRecallMd: string | null = null;
  const communityMemoryRecallQuery = buildCommunityMemoryRecallQuery(
    extractTextFromNativeToolMessageContent(latestUserContent),
  );
  const communityMemoryRecallSlug = String(params.communitySlug ?? "").trim();
  if (
    params.invocationSurface === "member_agent_dock" &&
    params.communityId &&
    communityMemoryRecallSlug &&
    communityMemoryRecallQuery &&
    effectiveAllowedToolNames.includes("polynet_search")
  ) {
    let recallStatus: "loaded" | "empty" | "error" = "error";
    let recallPaths: string[] = [];
    let recallRetrievalId: string | null = null;
    try {
      const recall = await executeRetrievalHarnessTool({
        ctx: params.ctx,
        userId: params.userId,
        communityId: params.communityId,
        authSubject: params.authSubject,
        runId: params.runId,
        toolCallId: `${params.runId}:community_memory_recall`,
        toolName: "polynet_search",
        args: {
          path: `/communities/${communityMemoryRecallSlug}/memory/`,
          query: communityMemoryRecallQuery,
          limit: COMMUNITY_MEMORY_RECALL_LIMIT,
        },
        evidenceSurface: "member_agent_dock",
        communityBoundConversation:
          params.memberAgentSurfaceContext?.kind === "community" &&
          params.memberAgentSurfaceContext.community_conversation === true,
      });
      if (recall.status === "ok") {
        const parsed = parseCommunityMemoryRecallEntries(recall.outputText, communityMemoryRecallSlug);
        communityMemoryRecallMd = renderCommunityMemoryRecall(parsed.entries);
        recallPaths = parsed.entries.map((entry) => entry.path);
        recallRetrievalId = parsed.retrievalId;
        recallStatus = communityMemoryRecallMd ? "loaded" : "empty";
      }
    } catch {
      communityMemoryRecallMd = null;
    }
    try {
      await params.appendRunEvent({
        eventType: "community_memory_recall",
        eventKey: `${params.runId}:community_memory_recall:1`,
        payload: {
          version: 1,
          run_id: params.runId,
          status: recallStatus,
          result_count: recallPaths.length,
          memory_paths: recallPaths,
          retrieval_id: recallRetrievalId,
        },
      });
    } catch {
      // Best-effort receipt; the prompt bundle receipt records the injected section.
    }
  }
  const runtimePromptBundle = buildPlatformHarnessRuntimePromptBundle({
    loopBudget: params.loopBudget,
    allowedToolNames: effectiveAllowedToolNames,
    communityResourceLane: resolvedHarness.communityResourceLane,
    harnessName: params.harnessName,
    communityId: params.communityId,
    communityName: params.communityName,
    communitySlug: params.communitySlug,
    communityOneLiner: params.communityOneLiner,
    communityAbout: params.communityAbout,
    communityChannels: params.communityChannels,
    communitySystemPrompt: params.communitySystemPrompt,
    communityLensAuthority: params.communityLensAuthority,
    runtimeTurnContext,
    currentDateTimeIso: runtimeDateTimeIso,
    currentDateLabel: runtimeDateLabel,
    currentTimeZone: runtimeTimeZone,
    invocationSurface: params.invocationSurface,
    memberAgentSurfaceContext: params.memberAgentSurfaceContext,
    memberIdentityContextMd,
    communityMemoryRecallMd,
    promptExtensions: resolvedHarness.promptExtensions,
  });
  const systemPrompt = runtimePromptBundle.text;
  const promptSuffixChars = resolvedHarness.promptExtensions.reduce(
    (total, section) => total + String(section.text ?? "").length,
    0,
  );
  const providerToolPolicySurface = buildRuntimeToolPolicySurface({
    fixedToolNames: effectiveAllowedToolNames,
  });
  const activeProviderTools = {
    responsesTools: buildResponsesApiFunctionTools(effectiveAllowedToolNames),
    activeToolNames: [...effectiveAllowedToolNames],
    activeToolPolicies: providerToolPolicySurface.policies,
    activeToolPolicySummary: providerToolPolicySurface.summary,
  };
  const inputBudgetIdentity = resolveRuntimeProviderBudgetIdentity({
    inferenceSource: params.inferenceSource,
    requestedModelId: params.requestedModelId,
    modelRef: params.modelRef,
  });
  const resolvedProviderToolSchemas = activeProviderTools.responsesTools;
  let conversationMessagesForProvider = params.messages;
  if (params.persistedConversationHistory) {
    const historySeed = params.persistedConversationHistory;
    let loadedRows = [...historySeed.rows];
    let pagesRead = 1;
    let hasMore = historySeed.hasMore;
    let nextBeforeSeq = historySeed.nextBeforeSeq;
    let selection = selectMemberAgentHistoryForBudget({
      rows: loadedRows,
      expectedUserMessageKey: historySeed.expectedUserMessageKey,
      systemPrompt,
      ...inputBudgetIdentity,
      toolSchemas: resolvedProviderToolSchemas,
      reservedOutputTokens: params.maxTokens,
    });
    try {
      if (!selection.ok) throw new Error(selection.code);
      while (hasMore && !selection.blockedByBudget) {
        if (typeof nextBeforeSeq !== "number") {
          throw new Error("persisted_history_cursor_missing");
        }
        const previousBeforeSeq = nextBeforeSeq;
        const page = (await params.ctx.runQuery(
          internal.threads.listMemberAgentRuntimeMessagesInternal as any,
          {
            ownerId: params.userId as any,
            threadId: params.threadId as any,
            expectedUserMessageKey: historySeed.expectedUserMessageKey,
            beforeSeq: previousBeforeSeq,
          },
        )) as MemberAgentRuntimeHistoryPage;
        if (
          page.expectedUserSeq !== historySeed.expectedUserSeq ||
          page.rows.some((row) => row.seq >= previousBeforeSeq) ||
          (page.hasMore &&
            (typeof page.nextBeforeSeq !== "number" ||
              page.nextBeforeSeq >= previousBeforeSeq))
        ) {
          throw new Error("persisted_history_page_invalid");
        }
        loadedRows = [...loadedRows, ...page.rows];
        pagesRead += 1;
        hasMore = page.hasMore;
        nextBeforeSeq = page.nextBeforeSeq;
        selection = selectMemberAgentHistoryForBudget({
          rows: loadedRows,
          expectedUserMessageKey: historySeed.expectedUserMessageKey,
          systemPrompt,
          ...inputBudgetIdentity,
          toolSchemas: resolvedProviderToolSchemas,
          reservedOutputTokens: params.maxTokens,
        });
        if (!selection.ok) throw new Error(selection.code);
      }
      const stopReason = selection.blockedByBudget
        ? selection.budgetPlan.failureCode &&
          selection.budgetPlan.failureCode !== "context_window_exceeded"
          ? "budget_unavailable"
          : "input_budget"
        : "history_exhausted";
      const selectedSeqs = selection.selectedEntries.map((entry) => entry.seq);
      conversationMessagesForProvider = selection.selectedEntries.map(
        (entry): InferenceMessage => ({
          role: entry.role,
          content: entry.content,
        }),
      );
      await params.appendRunEvent({
        eventType: "runtime_persisted_history_selected",
        eventKey: `${params.runId}:runtime_persisted_history_selected:1`,
        payload: {
          version: 1,
          run_id: params.runId,
          invocation_surface: params.invocationSurface,
          expected_user_message_key: historySeed.expectedUserMessageKey,
          expected_user_seq: historySeed.expectedUserSeq,
          oldest_selected_seq:
            selectedSeqs.length > 0 ? Math.min(...selectedSeqs) : null,
          newest_selected_seq:
            selectedSeqs.length > 0 ? Math.max(...selectedSeqs) : null,
          selected_message_count: selection.selectedEntries.length,
          selected_episode_count: selection.selectedEpisodeCount,
          loaded_row_count: loadedRows.length,
          loaded_complete_episode_count: selection.loadedCompleteEpisodeCount,
          ignored_leading_message_count: selection.ignoredLeadingMessageCount,
          page_size: MEMBER_AGENT_CONTEXT_PAGE_SIZE,
          pages_read: pagesRead,
          has_older:
            hasMore ||
            selection.loadedCompleteEpisodeCount > selection.selectedEpisodeCount ||
            selection.ignoredLeadingMessageCount > 0,
          stop_reason: stopReason,
          budget_profile_key: selection.budgetPlan.profileKey,
          budget_failure_code: selection.budgetPlan.failureCode,
        },
      });
    } catch (error) {
      logStructuredError("persisted_history_selection_failed", {
        error,
        runId: params.runId,
        threadId: params.threadId ?? undefined,
        invocationSurface: params.invocationSurface,
      });
      const fallbackTranscript: NativeToolAwareMessage[] = [
        { role: "system", content: systemPrompt },
        ...params.messages.map(toNativeInferenceMessage),
      ];
      return {
        ok: false,
        status: 503,
        code: "persisted_history_selection_failed",
        stopReason: "model_error",
        message: "The agent could not safely load this conversation. Please retry.",
        promptTokens: null,
        completionTokens: null,
        transcript: fallbackTranscript,
        stepCount: 0,
        steps: [],
      };
    }
  }
  const runtimeContextManifest = buildRuntimeContextManifest({
    generatedAt: runtimeDateTimeIso,
    userId: params.userId ?? null,
    threadId: params.threadId ?? null,
    communityId: params.communityId ?? null,
    communityContextVersion: params.communityContextVersion ?? null,
    harnessName: params.harnessName,
    inferenceSource: params.inferenceSource,
    latestUserText: latestUserTextForRuntimeContext,
    messages: conversationMessagesForProvider.map((message) => ({
      role: message.role,
      content: extractTextFromNativeToolMessageContent(message.content),
    })),
    allowedToolNames: effectiveAllowedToolNames,
    communityResourceLane: resolvedHarness.communityResourceLane,
    communityAbout: params.communityAbout ?? null,
    promptSections: runtimePromptBundle.sections,
    runtimeTurnEnvelope,
    runtimeTurnContext,
    invocationSurface: params.invocationSurface,
    memberAgentSurfaceContext: params.memberAgentSurfaceContext,
    memberIdentityContextMd,
    memberIdentityContextStatus,
  });
  const nativeTranscript: NativeToolAwareMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationMessagesForProvider.map(toNativeInferenceMessage),
  ];
  try {
    await params.appendRunEvent({
      eventType: "runtime_prompt_bundle_resolved",
      eventKey: `${params.runId}:runtime_prompt_bundle_resolved:1`,
      payload: {
        version: 3,
        run_id: params.runId,
        base_prompt_chars: runtimePromptBundle.text.length - promptSuffixChars,
        prompt_suffix_chars: promptSuffixChars,
        system_prompt_chars: systemPrompt.length,
        sections: runtimePromptBundle.sections,
      },
    });
  } catch {
    // Best-effort prompt receipt only; prompt assembly remains canonical for the turn.
  }
  try {
    await params.appendRunEvent({
      eventType: "runtime_context_manifest_resolved",
      eventKey: `${params.runId}:runtime_context_manifest_resolved:1`,
      payload: {
        run_id: params.runId,
        manifest: runtimeContextManifest,
      },
    });
  } catch {
    // Best-effort audit evidence only; prompt/tool assembly remains canonical for the turn.
  }
  const parallelReadToolsEnabled = readRuntimeBooleanFlag(
    RUNTIME_PARALLEL_READ_TOOLS_FLAG,
    true,
  );
  const providerToolChoice: NativeToolChoice = "auto";
  let reasoningSummaryStreamCount = 0;
  let activeToolBatchTelemetry: ActiveRuntimeToolBatchTelemetry | null = null;

  const flushActiveToolBatchTelemetry = async (options: {
    terminalStopReason?: string | null;
    terminalFailureCode?: string | null;
    pendingToolCallId?: string | null;
  } = {}): Promise<void> => {
    if (!activeToolBatchTelemetry) return;
    const telemetry = activeToolBatchTelemetry;
    activeToolBatchTelemetry = null;
    try {
      await params.appendRunEvent({
        eventType: "tool_batch_telemetry",
        eventKey: `${params.runId}:tool_batch_telemetry:${telemetry.startingIteration}`,
        payload: buildToolBatchTelemetryPayload({
          runId: params.runId,
          harnessName: params.harnessName,
          telemetry,
          terminalStopReason: options.terminalStopReason ?? null,
          terminalFailureCode: options.terminalFailureCode ?? null,
          pendingToolCallId: options.pendingToolCallId ?? null,
        }),
      });
    } catch {
      // Best-effort runtime evidence only.
    }
  };

  const markActiveBatchToolStarted = (params: {
    providerCallId: string;
    toolName: string;
    startedAtMs: number;
  }): void => {
    if (!activeToolBatchTelemetry) return;
    const record =
      activeToolBatchTelemetry.recordsByCallId.get(params.providerCallId);
    if (!record) return;
    record.toolName = params.toolName;
    record.startedAtMs = params.startedAtMs;
  };

  const markActiveBatchToolFinished = (params: {
    providerCallId: string;
    finishedAtMs: number;
  }): void => {
    if (!activeToolBatchTelemetry) return;
    const record =
      activeToolBatchTelemetry.recordsByCallId.get(params.providerCallId);
    if (!record) return;
    record.finishedAtMs = params.finishedAtMs;
    if (typeof record.startedAtMs === "number") {
      record.durationMs = Math.max(0, params.finishedAtMs - record.startedAtMs);
    }
  };

  const initializeActiveToolBatchTelemetry = (params: {
    steps: Array<{ providerCallId: string; toolName: string }>;
    startingIteration: number;
    isBatch: boolean;
    remainingToolBudget: number;
    schedule: RuntimeToolSchedulePlan;
    actualExecutionMode: RuntimeToolBatchExecutionMode;
  }): void => {
    activeToolBatchTelemetry = {
      startingIteration: params.startingIteration,
      batchCallCount: params.steps.length,
      isBatch: params.isBatch,
      remainingToolBudget: params.remainingToolBudget,
      parallelReadToolsEnabled,
      scheduledAtMs: Date.now(),
      schedule: params.schedule,
      actualExecutionMode: params.actualExecutionMode,
      completedToolCount: 0,
      recordsByCallId: new Map(
        params.steps.map((step, index) => [
          step.providerCallId,
          {
            providerCallId: step.providerCallId,
            toolName: step.toolName,
            index,
            iteration: null,
            startedAtMs: null,
            finishedAtMs: null,
            durationMs: null,
            status: null,
            errorCode: null,
            madeProgress: null,
            repeatedCallCount: null,
            consecutiveFailureCount: null,
            consecutiveNoProgressCount: null,
          },
        ]),
      ),
    };
  };
  try {
    await params.appendRunEvent({
      eventType: "provider_tool_surface_resolved",
      eventKey: `${params.runId}:provider_tool_surface_resolved:initial`,
      payload: {
        run_id: params.runId,
        stage: "initial",
        fixed_allowed_tool_count: effectiveAllowedToolNames.length,
        base_fixed_allowed_tool_count: params.allowedToolNames.length,
        active_tool_count: activeProviderTools.activeToolNames.length,
        tool_policy_enforcement: "full_access_audit",
        tool_policy_summary: activeProviderTools.activeToolPolicySummary,
      },
    });
  } catch {
    // Best-effort runtime evidence only.
  }
  try {
    const throwIfRunCannotContinue = async (): Promise<void> => {
      await throwIfRuntimeRunCannotContinue({
        ctx: params.ctx,
        ownerId: params.userId,
        runId: params.runId,
      });
    };
    const loopStartedAt = Date.now();
    const attestedSurface =
      params.invocationSurface === "member_agent_dock" ? params.invocationSurface : null;
    let initialProviderContextAttested = !attestedSurface;
    const ensureInitialProviderContextAttestation = async (
      providerMessages: NativeToolAwareMessage[],
    ): Promise<RuntimeAgentLoopFailureInput | null> => {
      if (initialProviderContextAttested || !attestedSurface) return null;
      try {
        await throwIfRunCannotContinue();
        if (
          !params.recordInitialProviderContextAttestation ||
          !params.threadId ||
          !params.communityId ||
          typeof params.communityContextVersion !== "number"
        ) {
          throw new Error("runtime_provider_context_attestation_inputs_missing");
        }
        const attestation = await buildRuntimeProviderContextAttestation({
          surface: attestedSurface,
          runId: params.runId,
          userId: params.userId,
          threadId: params.threadId,
          communityId: params.communityId,
          communityContextVersion: params.communityContextVersion,
          requestedModelId: params.requestedModelId,
          inferenceSource: params.inferenceSource,
          modelRef: params.modelRef,
          maxOutputTokens: params.maxTokens,
          toolChoice: providerToolChoice,
          parallelToolCalls:
            providerToolChoice === "auto" && parallelReadToolsEnabled,
          messages: providerMessages,
          promptSections: runtimePromptBundle.sections,
          contextManifest: runtimeContextManifest,
          toolSchemaFormat: "responses_api",
          toolNames: activeProviderTools.activeToolNames,
          providerTools: activeProviderTools.responsesTools,
        });
        const persisted =
          await params.recordInitialProviderContextAttestation(attestation);
        if (persisted?.ok !== true) {
          throw new Error(
            String(persisted?.errorCode ?? "").trim() ||
              RUNTIME_PROVIDER_CONTEXT_ATTESTATION_FAILURE_CODE,
          );
        }
        initialProviderContextAttested = true;
        return null;
      } catch (error) {
        if (
          isRuntimeRunCancelledError(error) ||
          isRuntimeRunInactiveError(error)
        ) {
          throw error;
        }
        logStructuredError("runtime_provider_context_attestation_failed", {
          error,
          runId: params.runId,
          threadId: params.threadId ?? undefined,
          communityId: params.communityId ?? undefined,
          invocationSurface: attestedSurface,
          requestedModelId: params.requestedModelId,
        });
        return {
          ok: false,
          status: 503,
          code: RUNTIME_PROVIDER_CONTEXT_ATTESTATION_FAILURE_CODE,
          stopReason: "model_error",
          message: "The agent could not safely prepare this turn. Please retry.",
        };
      }
    };
    const loopResult = await runNativeRuntimeKernel<string>({
      messages: nativeTranscript,
      budget: params.loopBudget,
      inputBudget: {
        ...inputBudgetIdentity,
        reservedOutputTokens: params.maxTokens,
        toolSchemas: resolvedProviderToolSchemas,
        recordPlan: async (budgetPlan) => {
          await params.appendRunEvent({
            eventType:
              budgetPlan.kind === "initial"
                ? "runtime_input_budget_planned"
                : "runtime_input_budget_delta",
            eventKey: `${params.runId}:runtime_input_budget:${budgetPlan.sequence}`,
            payload: {
              run_id: params.runId,
              ...buildRuntimeInputBudgetEvidence(budgetPlan),
            },
          });
        },
        recordProjection: async (projection) => {
          await params.appendRunEvent({
            eventType: "runtime_context_projected",
            eventKey: `${params.runId}:runtime_context_projection:${projection.sequence}`,
            payload: {
              run_id: params.runId,
              ...buildRuntimeContextProjectionEvidence(projection),
            },
          });
        },
      },
      runCompletion: async (messages) => {
        const attestationFailure =
          await ensureInitialProviderContextAttestation(messages);
        if (attestationFailure) return attestationFailure;
        let completion:
          | NativeToolAwareCompletionSuccess<string>
          | RuntimeAgentLoopFailureInput;
        let providerResultObserved = false;
        const completionIndex = reasoningSummaryStreamCount;
        const onAssistantTextDelta = params.onAssistantTextDelta;
        reasoningSummaryStreamCount += 1;
        try {
          completion = await runAbortableWithRuntimeCancellation({
            ctx: params.ctx,
            ownerId: params.userId,
            runId: params.runId,
            touchHeartbeat: params.touchRunHeartbeat,
            operation: async (signal) => {
              try {
                await params.beforeProviderRequest?.();
              } catch (error) {
                if (
                  isRuntimeRunCancelledError(error) ||
                  isRuntimeRunInactiveError(error)
                ) {
                  throw error;
                }
                throw new RuntimeProviderLifecycleHookError(error);
              }
              return await runProviderNativeToolCompletion({
                modelRef: params.modelRef,
                messages,
                maxTokens: params.maxTokens,
                tools: activeProviderTools.responsesTools,
                parallelToolCalls:
                  providerToolChoice === "auto" && parallelReadToolsEnabled,
                toolChoice: providerToolChoice,
                onTextDelta: onAssistantTextDelta
                  ? (delta) => onAssistantTextDelta(delta, completionIndex)
                  : undefined,
                signal,
              });
            },
          });
          providerResultObserved = true;
          const observedUsage = completion as {
            promptTokens?: number | null;
            completionTokens?: number | null;
            providerRequestUsage?: FounderProviderRequestUsage;
          };
          params.observeProviderResult?.({
            ok: completion.ok !== false,
            code: completion.ok === false ? completion.code : null,
            promptTokens: observedUsage.promptTokens ?? null,
            completionTokens: observedUsage.completionTokens ?? null,
            providerRequestUsage: observedUsage.providerRequestUsage,
          });
          await throwIfRunCannotContinue();
        } catch (error) {
          if (isRuntimeRunCancelledError(error)) {
            if (!providerResultObserved) {
              params.observeProviderResult?.({
                ok: false,
                code: USER_CANCELLED_RUNTIME_CODE,
                promptTokens: null,
                completionTokens: null,
              });
            }
            return {
              ok: false,
              status: 409,
              code: USER_CANCELLED_RUNTIME_CODE,
              stopReason: "user_cancelled",
              message: error.message,
            };
          }
          if (isRuntimeRunInactiveError(error)) {
            if (!providerResultObserved) {
              params.observeProviderResult?.({
                ok: false,
                code: RUNTIME_RUN_NOT_ACTIVE_CODE,
                promptTokens: null,
                completionTokens: null,
              });
            }
            return {
              ok: false,
              status: 409,
              code: RUNTIME_RUN_NOT_ACTIVE_CODE,
              stopReason: "model_error",
              message: error.message,
            };
          }
          if (error instanceof RuntimeProviderLifecycleHookError) throw error;
          if (!providerResultObserved) {
            params.observeProviderResult?.({
              ok: false,
              code: "agent_loop_provider_crash",
              promptTokens: null,
              completionTokens: null,
            });
          }
          const summary = summarizeErrorForLog(error);
          logStructuredError("agent_loop_provider_completion_crashed", {
            error,
            runId: params.runId,
            threadId: params.threadId ?? undefined,
            communityId: params.communityId ?? undefined,
            inferenceSource: params.inferenceSource,
            requestedModelId: params.requestedModelId,
            modelRef: params.modelRef,
            allowedToolNames: effectiveAllowedToolNames,
          });
          return {
            ok: false,
            status: 502,
            code: "agent_loop_provider_crash",
            stopReason: "model_error",
            message: `Provider completion crashed: ${summary.message}`,
          };
        }
        if (!completion.ok) return completion;
        const unknownToolCall = findFirstUnadmittedNativeToolCall({
          completion,
          admittedToolNames: activeProviderTools.activeToolNames,
        });
        if (unknownToolCall) {
          return {
            ok: false,
            status: 502,
            code: "invalid_model_output",
            stopReason: "invalid_model_output",
            message: "Provider returned an unknown tool name.",
            pendingToolCallId: unknownToolCall.providerCallId,
            pendingToolName: unknownToolCall.toolName,
          };
        }
        return completion as NativeToolAwareCompletionSuccess<string>;
      },
      normalizeToolArguments: (toolName, rawArgs) =>
        normalizeRegistryToolArguments(
          toolName as RetrievalToolName,
          rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
            ? rawArgs
            : {},
        ),
      onToolBatchResolved: async ({
        steps,
        isBatch,
        remainingToolBudget,
        toolStepCount,
      }) => {
        const schedule = classifyRuntimeToolSchedule({
          toolCalls: steps.map((step, index) => ({
            providerCallId: step.providerCallId,
            toolName: step.toolName,
            index,
            normalizedArgs: step.normalizedArgs,
          })),
          policies: activeProviderTools.activeToolPolicies,
          enableParallelReadBatches: parallelReadToolsEnabled,
        });
        const actualExecutionMode: RuntimeToolBatchExecutionMode =
          schedule.executionMode === "parallel_read_batch"
            ? "parallel"
            : "serial";
        initializeActiveToolBatchTelemetry({
          steps,
          startingIteration: toolStepCount + 1,
          isBatch,
          remainingToolBudget,
          schedule,
          actualExecutionMode,
        });
        try {
          await params.appendRunEvent({
            eventType: "tool_schedule_resolved",
            eventKey: `${params.runId}:tool_schedule_resolved:${
              toolStepCount + 1
            }:${steps.map((step) => step.providerCallId).join(":")}`,
            payload: {
              run_id: params.runId,
              harness_name: params.harnessName,
              decision: schedule.decision,
              execution_mode: schedule.executionMode,
              reason: schedule.reason,
              parallel_read_tools_enabled: parallelReadToolsEnabled,
              is_batch: isBatch,
              batch_call_count: steps.length,
              starting_iteration: toolStepCount + 1,
              remaining_tool_budget: remainingToolBudget,
              summary: schedule.summary,
              calls: schedule.calls,
            },
          });
          return {
            executionMode: actualExecutionMode,
          };
        } catch {
          // Best-effort runtime evidence only.
        }
        return { executionMode: actualExecutionMode };
      },
      executeTool: async ({ providerCallId, toolName, normalizedArgs }) => {
        markActiveBatchToolStarted({
          providerCallId,
          toolName,
          startedAtMs: Date.now(),
        });
        try {
          try {
            await throwIfRunCannotContinue();
          } catch (error) {
            if (isRuntimeRunCancelledError(error)) {
              return {
                status: "error",
                exitCode: null,
                outputText: "",
                errorCode: USER_CANCELLED_RUNTIME_CODE,
                errorMessage: error.message,
              };
            }
            throw error;
          }
        const isFixedTool = effectiveAllowedToolNames.includes(
          toolName as RetrievalToolName,
        );
        if (!isFixedTool) {
          return {
            status: "error",
            exitCode: null,
            outputText: "",
            errorCode: "tool_not_found",
            errorMessage: `${toolName} is not active for this runtime.`,
          };
        }

        try {
          const toolResult = await runAbortableWithRuntimeCancellation({
            ctx: params.ctx,
            ownerId: params.userId,
            runId: params.runId,
            touchHeartbeat: params.touchRunHeartbeat,
            operation: async (signal) =>
              await executeRetrievalHarnessTool({
                ctx: params.ctx,
                userId: params.userId,
                communityId: params.communityId ?? null,
                authSubject: params.authSubject,
                runId: params.runId,
                toolCallId: providerCallId,
                toolName: toolName as RetrievalToolName,
                args: normalizedArgs,
                evidenceSurface:
                  params.invocationSurface === "member_agent_dock"
                    ? "member_agent_dock"
                    : "coding_harness",
                communityBoundConversation: params.memberAgentSurfaceContext?.kind === "community" && params.memberAgentSurfaceContext.community_conversation === true,
                signal,
              }),
          });
          await throwIfRunCannotContinue();
          return toolResult;
        } catch (error) {
          if (isRuntimeRunCancelledError(error)) {
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: USER_CANCELLED_RUNTIME_CODE,
              errorMessage: error.message,
            };
          }
          const summary = summarizeErrorForLog(error);
          logStructuredError("agent_loop_tool_execution_crashed", {
            error,
            runId: params.runId,
            threadId: params.threadId ?? undefined,
            communityId: params.communityId ?? undefined,
            ...summarizeToolArgsForLog(toolName, normalizedArgs),
          });
          return {
            status: "error",
            exitCode: null,
            outputText: "",
            errorCode: "runtime_tool_execute_failed",
            errorMessage: `Runtime tool execution failed: ${summary.message}`,
          };
        }
        } finally {
          markActiveBatchToolFinished({
            providerCallId,
            finishedAtMs: Date.now(),
          });
        }
      },
      onToolStepStart: async ({ iteration, step }) => {
        if (activeToolBatchTelemetry) {
          const record =
            activeToolBatchTelemetry.recordsByCallId.get(step.providerCallId);
          if (record) {
            record.iteration = iteration;
          }
        }
        await appendRuntimeToolCallStarted({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          harnessName: params.harnessName,
          communityId: params.communityId,
          iteration,
          providerCallId: step.providerCallId,
          toolName: step.toolName,
          args: step.normalizedArgs,
        });
      },
      onToolStepFinish: async ({
        iteration,
        step,
        toolResult,
        toolResultEnvelope,
        madeProgress,
        repeatedCallCount,
        consecutiveFailureCount,
        consecutiveNoProgressCount,
      }) => {
        if (activeToolBatchTelemetry) {
          const record =
            activeToolBatchTelemetry.recordsByCallId.get(step.providerCallId);
          if (record) {
            record.iteration = iteration;
            record.status = toolResult.status;
            record.errorCode = toolResult.errorCode;
            record.madeProgress = madeProgress;
            record.repeatedCallCount = repeatedCallCount;
            record.consecutiveFailureCount = consecutiveFailureCount;
            record.consecutiveNoProgressCount = consecutiveNoProgressCount;
          }
        }
        await appendRuntimeToolCallFinished({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          harnessName: params.harnessName,
          iteration,
          providerCallId: step.providerCallId,
          toolName: step.toolName,
          args: step.normalizedArgs,
          toolResult,
          toolResultEnvelope,
        });
        if (toolResult.status !== "ok") {
          console.error("tool_loop_tool_call_failed", {
            runId: params.runId,
            threadId: params.threadId ?? undefined,
            harnessName: params.harnessName,
            providerCallId: step.providerCallId,
            iteration,
            communityId: params.communityId ?? undefined,
            errorCode: toolResult.errorCode,
            errorMessage: toolResult.errorMessage,
            exitCode: toolResult.exitCode,
            hasOutputText: Boolean(toolResult.outputText),
            outputLength: String(toolResult.outputText ?? "").length,
            ...summarizeToolArgsForLog(step.toolName, step.normalizedArgs),
          });
        }
        if (activeToolBatchTelemetry) {
          activeToolBatchTelemetry.completedToolCount += 1;
          if (
            activeToolBatchTelemetry.completedToolCount >=
            activeToolBatchTelemetry.batchCallCount
          ) {
            await flushActiveToolBatchTelemetry();
          }
        }
      },
    });
    const loopFailure = loopResult.ok
      ? null
      : (loopResult as RuntimeKernelFailure<string>);
    let terminalFailureCode: string | null = null;
    let pendingToolCallId: string | null = null;
    let loopErrorPayload: Record<string, unknown> = {};
    if (loopFailure) {
      terminalFailureCode = loopFailure.code;
      pendingToolCallId = loopFailure.pendingToolCallId ?? null;
      loopErrorPayload = {
        error_code: loopFailure.code,
        error_message: loopFailure.message,
      };
    }
    if (activeToolBatchTelemetry) {
      await flushActiveToolBatchTelemetry({
        terminalStopReason: loopResult.stopReason,
        terminalFailureCode,
        pendingToolCallId,
      });
    }

    try {
      await params.appendRunEvent({
        eventType: "agent_loop_stopped",
        eventKey: `${params.runId}:agent_loop_stopped:1`,
        payload: {
          run_id: params.runId,
          harness: {
            kind: params.harnessName,
          },
          stop_reason: loopResult.stopReason,
          step_count: loopResult.stepCount,
          total_latency_ms: Date.now() - loopStartedAt,
          status: loopResult.ok ? "ok" : "error",
          ...loopErrorPayload,
        },
      });
    } catch {
      // Best-effort runtime evidence only.
    }
    return loopResult;
  } catch (error) {
    if (error instanceof RuntimeProviderLifecycleHookError) {
      throw error.originalError;
    }
    if (isRuntimeRunCancelledError(error)) {
      if (activeToolBatchTelemetry) {
        await flushActiveToolBatchTelemetry({
          terminalStopReason: "user_cancelled",
          terminalFailureCode: USER_CANCELLED_RUNTIME_CODE,
        });
      }
      return {
        ok: false,
        status: 409,
        code: USER_CANCELLED_RUNTIME_CODE,
        stopReason: "user_cancelled",
        message: error.message,
        promptTokens: null,
        completionTokens: null,
        transcript: [...nativeTranscript],
        stepCount: 0,
        steps: [],
      };
    }
    if (isRuntimeRunInactiveError(error)) {
      if (activeToolBatchTelemetry) {
        await flushActiveToolBatchTelemetry({
          terminalStopReason: "model_error",
          terminalFailureCode: RUNTIME_RUN_NOT_ACTIVE_CODE,
        });
      }
      return {
        ok: false,
        status: 409,
        code: RUNTIME_RUN_NOT_ACTIVE_CODE,
        stopReason: "model_error",
        message: error.message,
        promptTokens: null,
        completionTokens: null,
        transcript: [...nativeTranscript],
        stepCount: 0,
        steps: [],
      };
    }
    const summary = summarizeErrorForLog(error);
    logStructuredError("agent_loop_unhandled_crash", {
      error,
      runId: params.runId,
      threadId: params.threadId ?? undefined,
      communityId: params.communityId ?? undefined,
      inferenceSource: params.inferenceSource,
      requestedModelId: params.requestedModelId,
      allowedToolNames: effectiveAllowedToolNames,
    });
    try {
      await params.appendRunEvent({
        eventType: "agent_loop_internal_error",
        eventKey: `${params.runId}:agent_loop_internal_error:1`,
        payload: {
          run_id: params.runId,
          inference_source: params.inferenceSource,
          model_id: params.requestedModelId,
          error_name: summary.name,
          error_message: summary.message,
          stack_preview: summary.stackPreview,
        },
      });
    } catch {
      // ignore best-effort debug event persistence failures
    }
    if (activeToolBatchTelemetry) {
      await flushActiveToolBatchTelemetry({
        terminalStopReason: "model_error",
        terminalFailureCode: "agent_loop_internal_error",
      });
    }
    return {
      ok: false,
      status: 502,
      code: "agent_loop_internal_error",
      stopReason: "model_error",
      message: `Agent loop crashed: ${summary.message}`,
      promptTokens: null,
      completionTokens: null,
      transcript: [...nativeTranscript],
      stepCount: 0,
      steps: [],
    };
  }
}

async function executeChatToolsAgentLoop(
  params: RuntimeCommunityPromptFields & RuntimeProviderLifecycleHooks & {
    ctx: any;
    req: Request;
    userId: string;
    threadId?: string | null;
    authSubject?: string | null;
    requestedModelId: string;
    inferenceSource: RuntimeInferenceSource;
    modelRef: string;
    messages: InferenceMessage[];
    persistedConversationHistory?: MemberAgentPersistedHistorySeed | null;
    maxTokens: number;
    runId: string;
    allowedToolNames: readonly RetrievalToolName[];
    invocationSurface: RuntimeInvocationSurface;
    memberAgentSurfaceContext?: MemberAgentSurfaceContextV1 | null;
      communitySystemPrompt?: string | null;
    communityContextVersion?: number | null;
    threadWorkingState?: ThreadWorkingStatePrompt | null;
    appendRunEvent: (params: {
      eventType: string;
      eventKey?: string;
      payload: Record<string, unknown>;
    }) => Promise<void>;
    refreshRuntimeContextSnapshot?: (
      phase?: "started" | "active",
      runtimeTurnEnvelope?: RuntimeTurnEnvelopeV1 | null,
    ) => Promise<void>;
    touchRunHeartbeat?: () => Promise<void>;
  },
): Promise<RuntimeAgentLoopSuccess | RuntimeAgentLoopFailure> {
  return await executeRetrievalAgentLoop({
    ...params,
    harnessName: "chat_tools",
    loopBudget: CHAT_TOOLS_RUNTIME_KERNEL_BUDGET,
  });
}

export {
  executeChatToolsAgentLoop,
};
