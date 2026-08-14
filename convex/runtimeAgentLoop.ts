import { api, internal } from "./_generated/api";
import {
  runChatgptNativeToolCompletion,
  type ChatgptCodexRequestMetadata,
  type ChatgptFunctionTool,
  type ChatgptToolAwareMessage,
} from "./httpChatgpt";
import {
  appendRuntimeToolCallFinished,
  appendRuntimeToolCallStarted,
} from "./runtimeToolCallEvents";
import {
  USER_CANCELLED_RUNTIME_CODE,
  isRuntimeRunCancelledError,
  runAbortableWithRuntimeCancellation,
  throwIfRuntimeRunCancelled,
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
} from "../shared/workspaceCredits";
import { founderPaidToolActionForTool } from "../shared/founderPaidTools";
import { runOpenRouterNativeToolCompletion } from "./openRouterNativeTransport";
import { type RetrievalToolName } from "../shared/retrievalTools";
import {
  extractTextFromNativeToolMessageContent,
  getNativeToolCompletionToolCalls,
  type NativeToolAwareCompletionSuccess,
  type NativeToolAwareMessage,
  type NativeToolInputContentPart,
  type NativeToolChoice,
} from "../shared/nativeToolProtocol";
import {
  type NativeToolExecutionResult,
} from "../shared/nativeToolLoop";
import { runNativeRuntimeKernel } from "../shared/runtimeKernel";
import {
  DEFAULT_RUNTIME_KERNEL_BUDGET,
  type RuntimeKernelBudget,
  type RuntimeKernelFailure,
  type RuntimeKernelFailureInput,
  type RuntimeKernelSuccess,
} from "../shared/runtimeKernelTypes";
import {
  buildOpenAiFunctionTools,
  buildResponsesApiFunctionTools,
  normalizeToolArguments as normalizeRegistryToolArguments,
} from "../shared/toolRegistry";
import type { CommunityEvidenceSurface } from "../shared/communityEvidenceContract";
import type { CommunityCustomFunnelSlot } from "../shared/communityTypes";
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
import { createRuntimeReasoningSummaryEmitter } from "./runtimeReasoningSummaryEvents";
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
  normalizeRuntimeSkillResolution,
  summarizeToolArgsForLog,
} from "./runtimeHarnessShaping";
import { composeResolvedRuntimeHarness } from "./runtimeHarnessComposition.ts";
import {
  buildRuntimeToolPolicySurface,
  classifyRuntimeToolSchedule,
  type RuntimeToolSchedulePlan,
} from "../shared/runtimeToolPolicy";
import {
  compactProviderTranscriptForContextRetry,
  estimateNativeToolTranscriptTokens,
} from "../shared/providerContextWindow";
import {
  RUNTIME_PROVIDER_CONTEXT_ATTESTATION_FAILURE_CODE,
  buildRuntimeProviderContextAttestation,
  type RuntimeProviderContextAttestationV1,
} from "../shared/runtimeProviderContextAttestation.ts";

type InferenceRole = "user" | "assistant" | "system";
type InferenceMessage = {
  role: InferenceRole;
  content: string | NativeToolInputContentPart[];
};

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
  }) => void;
};

type OpenAiCompatibleFunctionTool = ReturnType<
  typeof buildOpenAiFunctionTools
>[number];
type ChatgptCompatibleFunctionTool = ChatgptFunctionTool;
type RuntimeInferenceSource = "free" | "platform" | "chatgpt" | "user_key";
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
  projectId?: string | null;
  runId: string;
  toolCallId?: string | null;
  communityId: string | null;
  toolName: RetrievalToolName;
  args: Record<string, unknown>;
  evidenceSurface?: CommunityEvidenceSurface;
  communityFunnelSlot?: CommunityCustomFunnelSlot | null;
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
      communityOwned || params.evidenceSurface === "community_funnel_builder";
    const execution = await executePolynetCanonicalTool({
      ctx: params.ctx,
      authSubject,
      userId: params.userId,
      principalKind: communityOwned ? "community_agent" : "personal_agent",
      ...(communityMounted && params.communityId
        ? { mountedCommunityId: params.communityId }
        : {}),
      evidenceSurface: params.evidenceSurface ?? "member_agent_dock",
      funnelDraftSlot: params.communityFunnelSlot ?? null,
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
      projectId: params.projectId ?? undefined,
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
      projectId: params.projectId ?? undefined,
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
  ctx: any;
  userId: string;
  requestedModelId: string;
  inferenceSource: RuntimeInferenceSource;
  modelRef: string;
  messages: NativeToolAwareMessage[];
  maxTokens: number;
  openRouterTools: OpenAiCompatibleFunctionTool[];
  responsesApiTools: ChatgptCompatibleFunctionTool[];
  apiKeyOverride?: string | null;
  parallelToolCalls?: boolean;
  toolChoice?: NativeToolChoice;
  onReasoningSummaryTextDelta?: (params: {
    delta: string;
    summaryIndex: number;
  }) => Promise<void> | void;
  onReasoningSummaryPartAdded?: (params: {
    summaryIndex: number;
  }) => Promise<void> | void;
  requestMetadata?: ChatgptCodexRequestMetadata | null;
  signal?: AbortSignal;
}): Promise<
  NativeToolAwareCompletionSuccess<string> | RuntimeAgentLoopFailureInput
> {
  if (params.inferenceSource === "chatgpt") {
    return runChatgptNativeToolCompletion({
      ctx: params.ctx,
      userId: params.userId,
      modelId: params.requestedModelId,
      messages: params.messages as ChatgptToolAwareMessage[],
      maxTokens: params.maxTokens,
      tools: params.responsesApiTools,
      parallelToolCalls: params.parallelToolCalls,
      toolChoice: params.toolChoice,
      onReasoningSummaryTextDelta: params.onReasoningSummaryTextDelta,
      onReasoningSummaryPartAdded: params.onReasoningSummaryPartAdded,
      requestMetadata: params.requestMetadata,
      signal: params.signal,
    });
  }
  const parsedProviderRef = parseProviderModelRef(params.modelRef);
  if (
    (params.inferenceSource === "platform" || params.inferenceSource === "user_key") &&
    parsedProviderRef?.provider === "openai"
  ) {
    return runOpenAiNativeToolCompletion({
      modelId: parsedProviderRef.providerModel,
      messages: params.messages,
      maxTokens: params.maxTokens,
      tools: params.responsesApiTools,
      apiKeyOverride: params.inferenceSource === "user_key" ? params.apiKeyOverride : null,
      parallelToolCalls: params.parallelToolCalls,
      toolChoice: params.toolChoice,
      signal: params.signal,
    });
  }
  return runOpenRouterNativeToolCompletion({
    modelRef: params.modelRef,
    messages: params.messages,
    maxTokens: params.maxTokens,
    tools: params.openRouterTools,
    apiKeyOverride: params.apiKeyOverride,
    parallelToolCalls: params.parallelToolCalls,
    toolChoice: params.toolChoice,
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
    maxTokens: number;
    runId: string;
    harnessName: "chat_tools";
    loopBudget: RuntimeKernelBudget;
    allowedToolNames: readonly RetrievalToolName[];
    invocationSurface: RuntimeInvocationSurface;
    memberAgentSurfaceContext?: MemberAgentSurfaceContextV1 | null;
    communityFunnelSlot?: CommunityCustomFunnelSlot | null;
    communitySystemPrompt?: string | null;
    communityContextVersion?: number | null;
    projectId?: string | null;
    threadWorkingState?: ThreadWorkingStatePrompt | null;
    authSubject?: string | null;
    apiKeyOverride?: string | null;
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
  const skillResolution = normalizeRuntimeSkillResolution(
    await params.ctx.runQuery(
      internal.runtimeSkillResolution.resolveRuntimeSkillSelectionInternal,
      {
        userId: params.userId as any,
        authSubject: params.authSubject ?? undefined,
        communityId: params.communityId ? (params.communityId as any) : undefined,
        messages: params.messages.map((message) => ({
          role: String(message.role ?? ""),
          content: extractTextFromNativeToolMessageContent(message.content),
        })),
      },
    ),
  );
  const resolvedHarness = composeResolvedRuntimeHarness({
    skillResolution,
  });
  const platformSkills = resolvedHarness.platformSkillInventory;
  const selectedPlatformSkills = resolvedHarness.selectedPlatformSkills;
  const effectiveAllowedToolNames = restrictToolNamesForInvocationSurface({
    invocationSurface: params.invocationSurface,
    toolNames: params.allowedToolNames,
  });
  const installedUserPlatformSkills = resolvedHarness.personalSkillInventory;
  const selectedUserPlatformSkills = resolvedHarness.selectedPersonalSkills;
  const attachedCommunitySkills =
    resolvedHarness.activeCommunityModule?.attachedSkills ?? [];
  const selectedCommunitySkills =
    resolvedHarness.activeCommunityModule?.selectedSkills ?? [];
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
    projectId: params.projectId ?? null,
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
      projectId: params.projectId ?? null,
      authSubject: params.authSubject ?? null,
      runId: params.runId,
      latestUserText: latestUserTextForRuntimeContext,
      runtimeTurnEnvelope,
      threadWorkingState: params.threadWorkingState,
    })
  ).packet;
  const projectContext = runtimeTurnContext.projectContext ?? null;
  let memberIdentityContextMd: string | null = null;
  let memberIdentityContextStatus: MemberIdentityContextStatus = "not_applicable";
  if (params.invocationSurface === "member_agent_dock") {
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
    communitySystemPrompt: params.communitySystemPrompt,
    communityLensAuthority: params.communityLensAuthority,
    agentName: params.agentName,
    agentSoul: params.agentSoul,
    projectLabel: projectContext?.label ?? null,
    projectDescription: projectContext?.description ?? null,
    runtimeTurnContext,
    currentDateTimeIso: runtimeDateTimeIso,
    currentDateLabel: runtimeDateLabel,
    currentTimeZone: runtimeTimeZone,
    invocationSurface: params.invocationSurface,
    memberAgentSurfaceContext: params.memberAgentSurfaceContext,
    memberIdentityContextMd,
    promptExtensions: resolvedHarness.promptExtensions,
  });
  const systemPrompt = runtimePromptBundle.text;
  const promptSuffixChars = resolvedHarness.promptExtensions.reduce(
    (total, section) => total + String(section.text ?? "").length,
    0,
  );
  const runtimeContextManifest = buildRuntimeContextManifest({
    generatedAt: runtimeDateTimeIso,
    userId: params.userId ?? null,
    threadId: params.threadId ?? null,
    communityId: params.communityId ?? null,
    communityContextVersion: params.communityContextVersion ?? null,
    projectId: params.projectId ?? null,
    harnessName: params.harnessName,
    inferenceSource: params.inferenceSource,
    latestUserText: latestUserTextForRuntimeContext,
    messages: params.messages.map((message) => ({
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
    {
      role: "system",
      content: systemPrompt,
    },
    ...params.messages.map((message): NativeToolAwareMessage => {
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
    }),
  ];
  const buildActiveProviderTools = () => {
    const policySurface = buildRuntimeToolPolicySurface({
      fixedToolNames: effectiveAllowedToolNames,
    });
    return {
      openAiTools: buildOpenAiFunctionTools(effectiveAllowedToolNames),
      responsesTools: buildResponsesApiFunctionTools(effectiveAllowedToolNames),
      activeToolNames: [...effectiveAllowedToolNames],
      activeToolPolicies: policySurface.policies,
      activeToolPolicySummary: policySurface.summary,
    };
  };
  const initialProviderTools = buildActiveProviderTools();
  try {
    await params.appendRunEvent({
      eventType: "runtime_prompt_bundle_resolved",
      eventKey: `${params.runId}:runtime_prompt_bundle_resolved:1`,
      payload: {
        version: 2,
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
  let reasoningSummaryPartAddedCount = 0;
  let reasoningSummaryTextDeltaCount = 0;
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
  if (platformSkills.length > 0) {
    try {
      await params.appendRunEvent({
        eventType: "platform_skills_resolved",
        eventKey: `${params.runId}:platform_skills_resolved:1`,
        payload: {
          run_id: params.runId,
          community_scope_id: params.communityId ?? null,
          community_resource_lane: resolvedHarness.communityResourceLane,
          requested_skill_mention_tokens:
            skillResolution.requested_mention_tokens,
          ambiguous_skill_mention_tokens:
            skillResolution.ambiguous_mention_tokens,
          skills: platformSkills.map((skill) => {
            const selected = selectedPlatformSkills.find(
              (candidate) =>
                candidate.platform_skill_id === skill.platform_skill_id,
            );
            return {
              platform_skill_id: skill.platform_skill_id,
              catalog_skill_id: skill.catalog_skill_id,
              required_capability: skill.requires_capability,
              skill_name: skill.name,
              skill_mention_token: skill.mention_token,
              selected: Boolean(selected),
              activation_route: selected?.activation_route ?? null,
              activation_reason: selected?.activation_reason ?? null,
            };
          }),
          selected_skill_mention_tokens: selectedPlatformSkills.map(
            (skill) => skill.mention_token,
          ),
        },
      });
    } catch {
      // Best-effort runtime evidence only.
    }
  }
  if (installedUserPlatformSkills.length > 0) {
    try {
      await params.appendRunEvent({
        eventType: "personal_skills_resolved",
        eventKey: `${params.runId}:personal_skills_resolved:1`,
        payload: {
          run_id: params.runId,
          user_scope_id: params.userId ?? null,
          requested_skill_mention_tokens:
            skillResolution.requested_mention_tokens,
          ambiguous_skill_mention_tokens:
            skillResolution.ambiguous_mention_tokens,
          skills: installedUserPlatformSkills.map((skill) => {
            const selected = selectedUserPlatformSkills.find(
              (candidate) =>
                candidate.user_platform_skill_install_id ===
                skill.user_platform_skill_install_id,
            );
            return {
              user_platform_skill_install_id:
                skill.user_platform_skill_install_id,
              skill_package_id: skill.skill_package_id,
              skill_revision_id: selected?.skill_revision_id ?? null,
              skill_name: skill.name,
              skill_mention_token: skill.mention_token,
              selected: Boolean(selected),
              activation_route: selected?.activation_route ?? null,
              activation_reason: selected?.activation_reason ?? null,
            };
          }),
          selected_skill_mention_tokens: selectedUserPlatformSkills.map(
            (skill) => skill.mention_token,
          ),
        },
      });
    } catch {
      // Best-effort runtime evidence only.
    }
  }
  if (attachedCommunitySkills.length > 0) {
    try {
      await params.appendRunEvent({
        eventType: "community_skills_resolved",
        eventKey: `${params.runId}:community_skills_resolved:1`,
        payload: {
          run_id: params.runId,
          community_scope_id: params.communityId ?? null,
          requested_skill_mention_tokens:
            skillResolution.requested_mention_tokens,
          ambiguous_skill_mention_tokens:
            skillResolution.ambiguous_mention_tokens,
          skills: attachedCommunitySkills.map((skill) => {
            const selected = selectedCommunitySkills.find(
                (candidate) =>
                  candidate.community_skill_attachment_id ===
                  skill.community_skill_attachment_id,
              );
            return {
              community_skill_attachment_id:
                skill.community_skill_attachment_id,
              skill_package_id: skill.skill_package_id,
              skill_revision_id: selected?.skill_revision_id ?? null,
              skill_name: skill.name,
              skill_mention_token: skill.mention_token,
              selected: Boolean(selected),
              activation_route: selected?.activation_route ?? null,
              activation_reason: selected?.activation_reason ?? null,
            };
          }),
          selected_skill_mention_tokens: selectedCommunitySkills.map(
            (skill) => skill.mention_token,
          ),
        },
      });
    } catch {
      // Best-effort runtime evidence only.
    }
  }
  if (
    installedUserPlatformSkills.length > 0 ||
    attachedCommunitySkills.length > 0
  ) {
    try {
      await params.appendRunEvent({
        eventType: "effective_harness_resolved",
        eventKey: `${params.runId}:effective_harness_resolved:1`,
        payload: {
          run_id: params.runId,
          user_scope_id: params.userId ?? null,
          community_scope_id: params.communityId ?? null,
          requested_skill_mention_tokens:
            resolvedHarness.requestedSkillMentionTokens,
          ambiguous_skill_mention_tokens:
            resolvedHarness.ambiguousSkillMentionTokens,
          personal_skill_mention_tokens: installedUserPlatformSkills.map(
            (skill) => skill.mention_token,
          ),
          selected_personal_skill_mention_tokens:
            selectedUserPlatformSkills.map((skill) => skill.mention_token),
          community_skill_mention_tokens: attachedCommunitySkills.map(
            (skill) => skill.mention_token,
          ),
          selected_community_skill_mention_tokens:
            selectedCommunitySkills.map((skill) => skill.mention_token),
        },
      });
    } catch {
      // Best-effort runtime evidence only.
    }
  }
  try {
    await params.appendRunEvent({
      eventType: "provider_tool_surface_resolved",
      eventKey: `${params.runId}:provider_tool_surface_resolved:initial`,
      payload: {
        run_id: params.runId,
        stage: "initial",
        fixed_allowed_tool_count: effectiveAllowedToolNames.length,
        base_fixed_allowed_tool_count: params.allowedToolNames.length,
        active_tool_count: initialProviderTools.activeToolNames.length,
        tool_policy_enforcement: "full_access_audit",
        tool_policy_summary: initialProviderTools.activeToolPolicySummary,
      },
    });
  } catch {
    // Best-effort runtime evidence only.
  }
  try {
    const throwIfCancelled = async (): Promise<void> => {
      await throwIfRuntimeRunCancelled({
        ctx: params.ctx,
        ownerId: params.userId,
        runId: params.runId,
      });
    };
    const loopStartedAt = Date.now();
    const chatgptCodexRequestId = String(params.threadId ?? "").trim() || params.runId;
    const attestedSurface =
      params.invocationSurface === "member_agent_dock" ||
      params.invocationSurface === "community_funnel_builder"
        ? params.invocationSurface
        : null;
    if (attestedSurface) {
      let attestationPersisted = false;
      try {
        await throwIfCancelled();
        if (
          !params.recordInitialProviderContextAttestation ||
          !params.threadId ||
          !params.communityId ||
          typeof params.communityContextVersion !== "number"
        ) {
          throw new Error("runtime_provider_context_attestation_inputs_missing");
        }
        const parsedProviderRef = parseProviderModelRef(params.modelRef);
        const useResponsesApiTools =
          params.inferenceSource === "chatgpt" ||
          ((params.inferenceSource === "platform" ||
            params.inferenceSource === "user_key") &&
            parsedProviderRef?.provider === "openai");
        const attestation = await buildRuntimeProviderContextAttestation({
          surface: attestedSurface,
          runId: params.runId,
          userId: params.userId,
          threadId: params.threadId,
          communityId: params.communityId,
          communityContextVersion: params.communityContextVersion,
          funnelSlot: params.communityFunnelSlot ?? null,
          requestedModelId: params.requestedModelId,
          inferenceSource: params.inferenceSource,
          modelRef: params.modelRef,
          maxOutputTokens: params.maxTokens,
          toolChoice: providerToolChoice,
          parallelToolCalls:
            providerToolChoice === "auto" && parallelReadToolsEnabled,
          messages: nativeTranscript,
          promptSections: runtimePromptBundle.sections,
          contextManifest: runtimeContextManifest,
          toolSchemaFormat: useResponsesApiTools
            ? "responses_api"
            : "openai_compatible",
          toolNames: initialProviderTools.activeToolNames,
          providerTools: useResponsesApiTools
            ? initialProviderTools.responsesTools
            : initialProviderTools.openAiTools,
        });
        const persisted =
          await params.recordInitialProviderContextAttestation(attestation);
        if (persisted?.ok !== true) {
          throw new Error(
            String(persisted?.errorCode ?? "").trim() ||
              RUNTIME_PROVIDER_CONTEXT_ATTESTATION_FAILURE_CODE,
          );
        }
        attestationPersisted = true;
      } catch (error) {
        if (isRuntimeRunCancelledError(error)) throw error;
        logStructuredError("runtime_provider_context_attestation_failed", {
          error,
          runId: params.runId,
          threadId: params.threadId ?? undefined,
          communityId: params.communityId ?? undefined,
          invocationSurface: attestedSurface,
          requestedModelId: params.requestedModelId,
        });
      }
      if (!attestationPersisted) {
        return {
          ok: false,
          status: 503,
          code: RUNTIME_PROVIDER_CONTEXT_ATTESTATION_FAILURE_CODE,
          stopReason: "model_error",
          message: "The agent could not safely prepare this turn. Please retry.",
          promptTokens: null,
          completionTokens: null,
          transcript: [...nativeTranscript],
          stepCount: 0,
          steps: [],
        };
      }
    }
    const loopResult = await runNativeRuntimeKernel<string>({
      messages: nativeTranscript,
      budget: params.loopBudget,
      prepareProviderTranscript: ({ transcript, forceCompaction }) => {
        if (forceCompaction) {
          return compactProviderTranscriptForContextRetry(transcript);
        }
        const estimatedTokens = estimateNativeToolTranscriptTokens(transcript);
        return {
          messages: transcript,
          compactedToolResults: 0,
          originalEstimatedTokens: estimatedTokens,
          projectedEstimatedTokens: estimatedTokens,
        };
      },
      onProviderContextCompacted: async (projection) => {
        try {
          await params.appendRunEvent({
            eventType: "provider_context_compacted",
            eventKey: `${params.runId}:provider_context_compacted:1`,
            payload: {
              run_id: params.runId,
              trigger: projection.trigger,
              compacted_tool_result_count: projection.compactedToolResults,
              original_estimated_tokens: projection.originalEstimatedTokens,
              projected_estimated_tokens: projection.projectedEstimatedTokens,
              durable_transcript_preserved: true,
              retry_limit: 1,
            },
          });
        } catch {
          // Best-effort context receipt only; recovery must not fail on telemetry.
        }
      },
      runCompletion: async (messages) => {
        let completion:
          | NativeToolAwareCompletionSuccess<string>
          | RuntimeAgentLoopFailureInput;
        let providerResultObserved = false;
        const reasoningSummaryEmitter = createRuntimeReasoningSummaryEmitter({
          runId: params.runId,
          summaryStreamId: `${params.runId}:tool_completion:${reasoningSummaryStreamCount}`,
          appendRunEvent: params.appendRunEvent,
        });
        reasoningSummaryStreamCount += 1;
        try {
          const providerTools = buildActiveProviderTools();
          completion = await runAbortableWithRuntimeCancellation({
            ctx: params.ctx,
            ownerId: params.userId,
            runId: params.runId,
            operation: async (signal) => {
              await params.beforeProviderRequest?.();
              return await runProviderNativeToolCompletion({
                ctx: params.ctx,
                userId: params.userId,
                requestedModelId: params.requestedModelId,
                inferenceSource: params.inferenceSource,
                modelRef: params.modelRef,
                messages,
                maxTokens: params.maxTokens,
                openRouterTools: providerTools.openAiTools,
                responsesApiTools: providerTools.responsesTools,
                apiKeyOverride: params.apiKeyOverride,
                parallelToolCalls:
                  providerToolChoice === "auto" && parallelReadToolsEnabled,
                toolChoice: providerToolChoice,
                requestMetadata: {
                  sessionId: chatgptCodexRequestId,
                  threadId: chatgptCodexRequestId,
                },
                onReasoningSummaryPartAdded: async ({ summaryIndex }) => {
                  try {
                    reasoningSummaryPartAddedCount += 1;
                    await reasoningSummaryEmitter.onPartAdded(summaryIndex);
                  } catch {
                    // Best-effort UX event; do not fail the loop if summary persistence fails.
                  }
                },
                onReasoningSummaryTextDelta: async ({
                  delta,
                  summaryIndex,
                }) => {
                  if (!delta) return;
                  try {
                    reasoningSummaryTextDeltaCount += 1;
                    await reasoningSummaryEmitter.onTextDelta(
                      delta,
                      summaryIndex,
                    );
                  } catch {
                    // Best-effort UX event; do not fail the loop if summary persistence fails.
                  }
                },
                signal,
              });
            },
          });
          providerResultObserved = true;
          params.observeProviderResult?.({
            ok: completion.ok !== false,
            code: completion.ok === false ? completion.code : null,
            promptTokens: completion.ok === false ? null : completion.promptTokens,
            completionTokens: completion.ok === false ? null : completion.completionTokens,
          });
          await throwIfCancelled();
        } catch (error) {
          if (!providerResultObserved) {
            params.observeProviderResult?.({
              ok: false,
              code: isRuntimeRunCancelledError(error)
                ? USER_CANCELLED_RUNTIME_CODE
                : "agent_loop_provider_crash",
              promptTokens: null,
              completionTokens: null,
            });
          }
          if (isRuntimeRunCancelledError(error)) {
            return {
              ok: false,
              status: 409,
              code: USER_CANCELLED_RUNTIME_CODE,
              stopReason: "user_cancelled",
              message: error.message,
            };
          }
          const summary = summarizeErrorForLog(error);
          logStructuredError("agent_loop_provider_completion_crashed", {
            error,
            runId: params.runId,
            threadId: params.threadId ?? undefined,
            projectId: params.projectId ?? undefined,
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
        const providerTools = buildActiveProviderTools();
        const completionToolCalls = getNativeToolCompletionToolCalls(completion);
        const unknownToolCall = completionToolCalls.find(
          (toolCall) =>
            !providerTools.activeToolNames.some(
              (toolName) => toolName === toolCall.toolName,
            ),
        );
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
        const providerToolSurface = buildActiveProviderTools();
        const schedule = classifyRuntimeToolSchedule({
          toolCalls: steps.map((step, index) => ({
            providerCallId: step.providerCallId,
            toolName: step.toolName,
            index,
            normalizedArgs: step.normalizedArgs,
          })),
          policies: providerToolSurface.activeToolPolicies,
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
            await throwIfCancelled();
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
            operation: async (signal) =>
              await executeRetrievalHarnessTool({
                ctx: params.ctx,
                userId: params.userId,
                communityId: params.communityId ?? null,
                authSubject: params.authSubject,
                projectId: params.projectId,
                runId: params.runId,
                toolCallId: providerCallId,
                toolName: toolName as RetrievalToolName,
                args: normalizedArgs,
                evidenceSurface:
                  params.invocationSurface === "member_agent_dock"
                    ? "member_agent_dock"
                    : params.invocationSurface === "community_funnel_builder"
                      ? "community_funnel_builder"
                      : "coding_harness",
                communityFunnelSlot: params.communityFunnelSlot ?? null,
                signal,
              }),
          });
          await throwIfCancelled();
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
            projectId: params.projectId ?? undefined,
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
            projectId: params.projectId ?? undefined,
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
    const summary = summarizeErrorForLog(error);
    logStructuredError("agent_loop_unhandled_crash", {
      error,
      runId: params.runId,
      threadId: params.threadId ?? undefined,
      projectId: params.projectId ?? undefined,
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
    projectId?: string | null;
    requestedModelId: string;
    inferenceSource: RuntimeInferenceSource;
    modelRef: string;
    messages: InferenceMessage[];
    maxTokens: number;
    runId: string;
    allowedToolNames: readonly RetrievalToolName[];
    invocationSurface: RuntimeInvocationSurface;
    memberAgentSurfaceContext?: MemberAgentSurfaceContextV1 | null;
    communityFunnelSlot?: CommunityCustomFunnelSlot | null;
    communitySystemPrompt?: string | null;
    communityContextVersion?: number | null;
    threadWorkingState?: ThreadWorkingStatePrompt | null;
    apiKeyOverride?: string | null;
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
