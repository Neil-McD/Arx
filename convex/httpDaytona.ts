import { api, internal } from "./_generated/api";
import {
  runChatgptNativeToolCompletion,
  type ChatgptFunctionTool,
  type ChatgptToolAwareMessage,
} from "./httpChatgpt";
import { loadDaytonaConfig, type DaytonaConfig } from "./daytonaSandboxClient";
import {
  resolveWorkspaceProjectContext,
  type WorkspaceSandboxSession,
} from "./daytonaWorkspaceSession";
import {
  appendWorkspaceToolCallFinished,
  appendWorkspaceToolCallStarted,
} from "./daytonaRuntimeEvents";
import {
  USER_CANCELLED_RUNTIME_CODE,
  isRuntimeRunCancelledError,
  runAbortableWithRuntimeCancellation,
  throwIfRuntimeRunCancelled,
} from "./runtimeCancellation";
import {
  editDaytonaWorkspaceFile,
  globDaytonaWorkspacePaths,
  grepDaytonaWorkspaceFiles,
  listDaytonaWorkspaceDirectory,
  readDaytonaWorkspaceFile,
  runDaytonaWorkspaceBash,
  sha256DaytonaWorkspaceFile,
  writeDaytonaWorkspaceFile,
} from "./daytonaWorkspaceTools";
import { executeWebResearch } from "./webResearchTools";
import type { WebResearchBillingEvidence } from "./webSearchTypes";
import {
  settleReservedCreditsBestEffort,
  settleReservedCreditsStrict,
} from "./workspaceCreditSettlement";
import {
  creditsToUsd,
  estimateWebResearchVendorCostUsd,
  PAID_TOOL_PRICING_VERSION,
  PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
  priceVendorCostUsdToWorkspaceCredits,
  priceWebResearchCredits,
  type WebResearchCreditAction,
} from "../shared/workspaceCredits";
import { runOpenRouterNativeToolCompletion } from "./openRouterNativeTransport";
import {
  type RetrievalToolName,
  isComputerUseToolName,
  requiresWorkspaceSandbox,
} from "../shared/retrievalTools";
import productDocsIndexJson from "../docs/product/generated/index.json";
import {
  executeGetProductDocTool,
  executeSearchProductDocsTool,
} from "../shared/productDocsRuntime.ts";
import {
  buildActiveCommunityContextToolPayload,
} from "../shared/communityContextTool.ts";
import type { ProductDocsSearchIndex } from "../shared/productDocsSearch.ts";
import {
  getNativeToolCompletionToolCalls,
  type NativeToolAwareCompletionSuccess,
  type NativeToolAwareMessage,
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
  projectResponsesApiToolSchema,
  normalizeToolArguments as normalizeRegistryToolArguments,
  type ResponsesApiFunctionTool,
} from "../shared/toolRegistry";
import {
  buildPlatformHarnessRuntimeSystemPrompt,
  type RuntimeCommunityPromptFields,
  type ThreadWorkingStatePrompt,
} from "../shared/runtimePrompt";
import { loadRuntimeTurnContextPacketForRun } from "./runtimeTurnContext";
import { createRuntimeReasoningSummaryEmitter } from "./runtimeReasoningSummaryEvents";
import { parseProviderModelRef } from "./httpInferenceConfig";
import { runOpenAiNativeToolCompletion } from "./openAiNativeToolCompletion";
import { logStructuredError, summarizeErrorForLog } from "./errorLogging";
import { createPolyNetExecutionSession } from "./runtimeExecutionSession";
import {
  type ActiveRuntimeToolBatchTelemetry,
  type RuntimeToolBatchExecutionMode,
  buildToolBatchTelemetryPayload,
} from "./runtimeHarnessTelemetry";
import {
  buildMountedAppOpenAiTools,
  buildMountedAppResponsesTools,
  formatJsonToolOutput,
  normalizeRuntimeMountedUserPlatformAppTools,
  normalizeRuntimeSkillResolution,
  readFailureOutputPreview,
  summarizeToolArgsForLog,
} from "./runtimeHarnessShaping";
import { composeResolvedRuntimeHarness } from "./runtimeHarnessComposition.ts";
import {
  type RuntimeMountedMcpTool,
} from "./runtimeMcpManager";
import {
  normalizeResolveMountedToolsArguments,
  RESOLVE_MOUNTED_TOOLS_INPUT_SCHEMA,
  RESOLVE_MOUNTED_TOOLS_TOOL_NAME,
} from "./runtimeMountedToolExposure";
import {
  classifyRuntimeToolSchedule,
  type RuntimeToolSchedulePlan,
} from "../shared/runtimeToolPolicy";
import {
  buildPlatformSkillToolNamesForSelection,
  type PlatformSkillSelectionSummary,
} from "../shared/platformSkills";

type InferenceRole = "user" | "assistant" | "system";
type InferenceMessage = {
  role: InferenceRole;
  content: string;
};

type RuntimeAgentLoopSuccess = RuntimeKernelSuccess<string>;
type RuntimeAgentLoopFailure = RuntimeKernelFailure<string>;
type RuntimeAgentLoopFailureInput = RuntimeKernelFailureInput;

type OpenAiCompatibleFunctionTool = ReturnType<
  typeof buildOpenAiFunctionTools
>[number];
type ChatgptCompatibleFunctionTool = ChatgptFunctionTool;
const productDocsIndex = productDocsIndexJson as ProductDocsSearchIndex;

type RuntimeInferenceSource = "free" | "platform" | "chatgpt" | "user_key";
const CHAT_TOOLS_RUNTIME_KERNEL_BUDGET: RuntimeKernelBudget =
  DEFAULT_RUNTIME_KERNEL_BUDGET;
const RUNTIME_PARALLEL_READ_TOOLS_FLAG =
  "RUNTIME_PARALLEL_READ_TOOLS_ENABLED";

function buildEffectiveAllowedToolNames(params: {
  baseAllowedToolNames: readonly RetrievalToolName[];
  selectedPlatformSkills: readonly PlatformSkillSelectionSummary[];
}): RetrievalToolName[] {
  const allowed = [...params.baseAllowedToolNames];
  if (!allowed.includes("get_active_community_context")) return allowed;
  for (const toolName of buildPlatformSkillToolNamesForSelection(
    params.selectedPlatformSkills,
  )) {
    if (!allowed.includes(toolName)) allowed.push(toolName);
  }
  return allowed;
}

function newCreditKey(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function isWorkspaceCreditBudgetExpired(
  session: WorkspaceSandboxSession | null | undefined,
): boolean {
  const expiresAt = Number(session?.creditBudgetExpiresAt ?? 0);
  return Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() >= expiresAt;
}

function buildWorkspaceCreditBudgetSignal(
  session: WorkspaceSandboxSession,
  parentSignal?: AbortSignal,
): { signal?: AbortSignal; cleanup: () => void } {
  const expiresAt = Number(session.creditBudgetExpiresAt ?? 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    return { signal: parentSignal, cleanup: () => {} };
  }
  const remainingMs = Math.max(0, expiresAt - Date.now());
  const controller = new AbortController();
  let settled = false;
  const cleanupFns: Array<() => void> = [];
  const abort = () => {
    if (settled) return;
    settled = true;
    controller.abort();
  };
  const timeout = setTimeout(abort, remainingMs);
  cleanupFns.push(() => clearTimeout(timeout));
  if (parentSignal) {
    if (parentSignal.aborted) {
      abort();
    } else {
      const onAbort = () => abort();
      parentSignal.addEventListener("abort", onAbort, { once: true });
      cleanupFns.push(() => parentSignal.removeEventListener("abort", onAbort));
    }
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      settled = true;
      for (const cleanup of cleanupFns) cleanup();
    },
  };
}

function buildWebResearchSettlementMetadata(params: {
  reserveCredits: number;
  reserveVendorCostUsd: number;
  finalVendorCostUsd: number;
  billingEvidence?: WebResearchBillingEvidence;
}): Record<string, unknown> {
  const evidence = params.billingEvidence as any;
  const usage = evidence?.usage && typeof evidence.usage === "object" ? evidence.usage : null;
  return {
    pricing_version: PAID_TOOL_PRICING_VERSION,
    target_gross_margin_bps: PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
    reserve_credits: params.reserveCredits,
    reserve_vendor_cost_usd: params.reserveVendorCostUsd,
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

function buildResolveMountedToolsOpenAiTool(): OpenAiCompatibleFunctionTool {
  return {
    type: "function",
    function: {
      name: RESOLVE_MOUNTED_TOOLS_TOOL_NAME,
      description:
        "Resolve connected personal app tools by search query. Use this before calling a mounted app tool that is not yet exposed.",
      parameters: RESOLVE_MOUNTED_TOOLS_INPUT_SCHEMA,
      strict: true,
    },
  };
}

function buildResolveMountedToolsResponsesTool(): ResponsesApiFunctionTool {
  const projection = projectResponsesApiToolSchema(
    RESOLVE_MOUNTED_TOOLS_INPUT_SCHEMA,
  );
  return {
    type: "function",
    name: RESOLVE_MOUNTED_TOOLS_TOOL_NAME,
    description:
      "Resolve connected personal app tools by search query. Use this before calling a mounted app tool that is not yet exposed.",
    parameters: projection.parameters,
    strict: projection.strict,
  };
}


async function executeRetrievalHarnessTool(params: {
  ctx: any;
  userId: string;
  authSubject?: string | null;
  projectId?: string | null;
  runId: string;
  communityId: string | null;
  toolName: RetrievalToolName;
  args: Record<string, unknown>;
  workspaceSession?: WorkspaceSandboxSession | null;
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
    const payload = executeSearchProductDocsTool({
      index: productDocsIndex,
      query: String(normalizedArgs.query ?? ""),
      limit: typeof normalizedArgs.limit === "number" ? normalizedArgs.limit : undefined,
      section:
        typeof normalizedArgs.section === "string"
          ? normalizedArgs.section
          : undefined,
      audience:
        typeof normalizedArgs.audience === "string"
          ? normalizedArgs.audience
          : undefined,
    });
    return {
      status: "ok",
      exitCode: 0,
      outputText: formatJsonToolOutput(payload),
      errorCode: null,
      errorMessage: null,
    };
  }

  if (params.toolName === "get_product_doc") {
    const payload = executeGetProductDocTool({
      index: productDocsIndex,
      slug: String(normalizedArgs.slug ?? ""),
      heading:
        typeof normalizedArgs.heading === "string"
          ? normalizedArgs.heading
          : undefined,
    });
    if (!payload.ok) {
      return {
        status: "error",
        exitCode: null,
        outputText: formatJsonToolOutput(payload),
        errorCode: payload.code,
        errorMessage: payload.message,
      };
    }
    return {
      status: "ok",
      exitCode: 0,
      outputText: formatJsonToolOutput(payload),
      errorCode: null,
      errorMessage: null,
    };
  }

  if (params.toolName === "get_active_community_context") {
    if (!params.communityId) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_required",
        errorMessage:
          "get_active_community_context requires an active community context.",
      };
    }
    try {
      const resolvedCommunity = await params.ctx.runQuery(
        internal.communityAgent.resolveRuntimeCommunityPromptContextInternal as any,
        {
          userId: params.userId,
          authSubject: params.authSubject ?? undefined,
          communityId: params.communityId,
        },
      );
      const resolvedCommunityId = String(
        (resolvedCommunity as { community_id?: unknown } | null)?.community_id ??
          "",
      ).trim();
      if (!resolvedCommunityId) {
        throw new Error("community_context_unavailable");
      }
      const payload = buildActiveCommunityContextToolPayload(
        (resolvedCommunity ?? {}) as Record<string, unknown>,
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
        errorCode: "community_context_failed",
        errorMessage: message || "Community context lookup failed.",
      };
    }
  }

  if (params.toolName === "community_search") {
    if (!params.communityId) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_required",
        errorMessage: "community_search requires an active community context.",
      };
    }
    try {
      const payload = await params.ctx.runAction(
        internal.communityArchive.searchCommunityKnowledgeInternal as any,
        {
          userId: params.userId,
          authSubject: params.authSubject ?? undefined,
          communityId: params.communityId,
          query: String(normalizedArgs.query ?? "").trim(),
        },
      );
      const ok = Boolean((payload as { ok?: boolean } | null)?.ok);
      if (!ok) {
        const reasonCode = String(
          (payload as { reason_code?: unknown } | null)?.reason_code ?? "",
        ).trim();
        const message = String(
          (payload as { message?: unknown } | null)?.message ?? "",
        ).trim();
        return {
          status: "error",
          exitCode: null,
          outputText: formatJsonToolOutput(payload),
          errorCode: reasonCode || "community_search_failed",
          errorMessage: message || "Community search failed.",
        };
      }
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
        errorCode: "community_search_failed",
        errorMessage: message || "Community search failed.",
      };
    }
  }

  if (params.toolName === "community_resources_list") {
    if (!params.communityId) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_required",
        errorMessage: "community_resources_list requires an active community context.",
      };
    }
    try {
      const payload = await params.ctx.runQuery(
        internal.communityResources.listCommunityResourceDirectoryInternal as any,
        {
          userId: params.userId,
          authSubject: params.authSubject ?? undefined,
          communityId: params.communityId,
          path:
            typeof normalizedArgs.path === "string"
              ? normalizedArgs.path
              : undefined,
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
        errorCode: "community_resources_list_failed",
        errorMessage: message || "Community resource listing failed.",
      };
    }
  }

  if (params.toolName === "community_resource_read") {
    if (!params.communityId) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_required",
        errorMessage: "community_resource_read requires an active community context.",
      };
    }
    try {
      const payload = await params.ctx.runQuery(
        internal.communityResources.readCommunityResourceDirectoryInternal as any,
        {
          userId: params.userId,
          authSubject: params.authSubject ?? undefined,
          communityId: params.communityId,
          ref: String(normalizedArgs.ref ?? ""),
          offset:
            typeof normalizedArgs.offset === "number"
              ? normalizedArgs.offset
              : undefined,
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
        errorCode: "community_resource_read_failed",
        errorMessage: message || "Community resource read failed.",
      };
    }
  }

  if (params.toolName === "community_resources_search") {
    if (!params.communityId) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_required",
        errorMessage: "community_resources_search requires an active community context.",
      };
    }
    try {
      const payload = await params.ctx.runQuery(
        internal.communityResources.searchCommunityResourceDirectoryInternal as any,
        {
          userId: params.userId,
          authSubject: params.authSubject ?? undefined,
          communityId: params.communityId,
          query: String(normalizedArgs.query ?? ""),
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
        errorCode: "community_resources_search_failed",
        errorMessage: message || "Community resource search failed.",
      };
    }
  }

  if (params.toolName === "community_resource_builder_list") {
    if (!params.communityId) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_required",
        errorMessage: "community_resource_builder_list requires an active community context.",
      };
    }
    try {
      const payload = await params.ctx.runQuery(
        api.communityResources.listCommunityResourceBuilderDirectory as any,
        {
          userId: params.userId,
          authSubject: params.authSubject ?? undefined,
          communityId: params.communityId,
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
        errorCode: "community_resource_builder_list_failed",
        errorMessage: message || "Community resource builder listing failed.",
      };
    }
  }

  if (params.toolName === "community_resource_builder_read") {
    if (!params.communityId) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_required",
        errorMessage: "community_resource_builder_read requires an active community context.",
      };
    }
    try {
      const payload = await params.ctx.runQuery(
        api.communityResources.readCommunityResourceBuilderResource as any,
        {
          userId: params.userId,
          authSubject: params.authSubject ?? undefined,
          communityId: params.communityId,
          resourceId:
            typeof normalizedArgs.resourceId === "string"
              ? normalizedArgs.resourceId
              : undefined,
          moduleId:
            typeof normalizedArgs.moduleId === "string"
              ? normalizedArgs.moduleId
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
        errorCode: "community_resource_builder_read_failed",
        errorMessage: message || "Community resource builder read failed.",
      };
    }
  }

  if (params.toolName === "community_resource_builder_health") {
    if (!params.communityId) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_required",
        errorMessage: "community_resource_builder_health requires an active community context.",
      };
    }
    try {
      const payload = await params.ctx.runQuery(
        api.communityResources.getCommunityResourceBuilderHealth as any,
        {
          userId: params.userId,
          authSubject: params.authSubject ?? undefined,
          communityId: params.communityId,
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
        errorCode: "community_resource_builder_health_failed",
        errorMessage: message || "Community resource builder health failed.",
      };
    }
  }

  if (params.toolName === "community_resource_builder_ensure_scaffold") {
    if (!params.communityId) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_required",
        errorMessage: "community_resource_builder_ensure_scaffold requires an active community context.",
      };
    }
    try {
      const payload = await params.ctx.runMutation(
        api.communityResources.ensureCommunityResourceWikiScaffold as any,
        {
          userId: params.userId,
          authSubject: params.authSubject ?? undefined,
          communityId: params.communityId,
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
        errorCode: "community_resource_builder_ensure_scaffold_failed",
        errorMessage: message || "Community resource scaffold setup failed.",
      };
    }
  }

  if (params.toolName === "community_resource_builder_stage_changeset") {
    if (!params.communityId) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_required",
        errorMessage: "community_resource_builder_stage_changeset requires an active community context.",
      };
    }
    try {
      const payload = await params.ctx.runMutation(
        api.communityResources.stageCommunityResourceBuilderChangeset as any,
        {
          userId: params.userId,
          authSubject: params.authSubject ?? undefined,
          communityId: params.communityId,
          summary:
            typeof normalizedArgs.summary === "string"
              ? normalizedArgs.summary
              : "",
          operations: Array.isArray(normalizedArgs.operations)
            ? normalizedArgs.operations
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
        errorCode: "community_resource_builder_stage_changeset_failed",
        errorMessage: message || "Community resource changeset staging failed.",
      };
    }
  }

  if (params.toolName === "community_resource_builder_apply_changeset") {
    if (!params.communityId) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_required",
        errorMessage: "community_resource_builder_apply_changeset requires an active community context.",
      };
    }
    try {
      const payload = await params.ctx.runMutation(
        api.communityResources.applyCommunityResourceBuilderChangeset as any,
        {
          userId: params.userId,
          authSubject: params.authSubject ?? undefined,
          communityId: params.communityId,
          changesetId:
            typeof normalizedArgs.changesetId === "string"
              ? normalizedArgs.changesetId
              : "",
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
        errorCode: "community_resource_builder_apply_changeset_failed",
        errorMessage: message || "Community resource changeset apply failed.",
      };
    }
  }

  if (params.toolName === "community_write") {
    if (!params.communityId) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_required",
        errorMessage: "community_write requires an active community context.",
      };
    }
    try {
      const payload = await params.ctx.runMutation(
        api.community.publishCommunityAiFeedAgentPost as any,
        {
          userId: params.userId,
          authSubject: params.authSubject ?? undefined,
          communityId: params.communityId,
          postType: String(normalizedArgs.post_type ?? "observation"),
          title:
            typeof normalizedArgs.title === "string"
              ? normalizedArgs.title
              : undefined,
          body: String(normalizedArgs.body ?? ""),
          evidence: Array.isArray(normalizedArgs.evidence)
            ? normalizedArgs.evidence.map((value) => String(value ?? ""))
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
        errorCode: "community_write_failed",
        errorMessage: message || "Community write failed.",
      };
    }
  }

  if (params.toolName === "web_research") {
    const action =
      String(normalizedArgs.action ?? "").trim() === "find_in_page"
        ? "find_in_page"
        : String(normalizedArgs.action ?? "").trim() === "open_page"
          ? "open_page"
          : "search";
    const webResearchAction = action as WebResearchCreditAction;
    const webResearchCredits = priceWebResearchCredits(webResearchAction);
    const webResearchVendorCostUsd = estimateWebResearchVendorCostUsd(webResearchAction);
    const creditKey = newCreditKey("web");
    try {
      await params.ctx.runMutation(internal.workspaceCredits.reserveCreditsInternal as any, {
        creditKey,
        userId: params.userId,
        communityId: params.communityId ?? undefined,
        projectId: params.projectId ?? undefined,
        runId: params.runId,
        toolName: params.toolName,
        action,
        vendor: action === "search" ? "openai_xai_fallback" : "jina",
        credits: webResearchCredits,
        rawVendorCostUsd: webResearchVendorCostUsd,
        polynetPriceUsd: creditsToUsd(webResearchCredits),
        metadata: {
          pricing_version: PAID_TOOL_PRICING_VERSION,
          target_gross_margin_bps: PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
          estimated_vendor_cost_usd: webResearchVendorCostUsd,
        },
        nowMs: Date.now(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: message === "credits_exhausted" ? "workspace_credits_exhausted" : "workspace_credits_unavailable",
        errorMessage:
          message === "credits_exhausted"
            ? "Web research uses paid provider calls, so it needs tool balance before it runs."
            : "Tool balance is unavailable for web research.",
        details: {
          tool_kind: "web_research",
          required_credits: webResearchCredits,
        },
      };
    }

    let result: Awaited<ReturnType<typeof executeWebResearch>>;
    try {
      result = await executeWebResearch({
        action,
        query:
          typeof normalizedArgs.query === "string"
            ? normalizedArgs.query
            : undefined,
        url:
          typeof normalizedArgs.url === "string" ? normalizedArgs.url : undefined,
      });
    } catch (error) {
      await settleReservedCreditsBestEffort({
        ctx: params.ctx,
        creditKey,
        status: "refunded",
        failureReason: "web_research_threw",
      });
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
      await settleReservedCreditsBestEffort({
        ctx: params.ctx,
        creditKey,
        status: "refunded",
        failureReason: result.code,
      });
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
    const finalWebResearchCredits = priceVendorCostUsdToWorkspaceCredits({
      rawVendorCostUsd: finalVendorCostUsd,
    });
    try {
      await settleReservedCreditsStrict({
        ctx: params.ctx,
        creditKey,
        status: "succeeded",
        creditsSettled: finalWebResearchCredits,
        rawVendorCostUsd: finalVendorCostUsd,
        metadata: buildWebResearchSettlementMetadata({
          reserveCredits: webResearchCredits,
          reserveVendorCostUsd: webResearchVendorCostUsd,
          finalVendorCostUsd,
          billingEvidence: result.billingEvidence,
        }),
      });
    } catch {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "credits_settlement_failed",
        errorMessage: "Web research succeeded, but credit settlement failed. Try again.",
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

  if (
    params.toolName === "list_dir" ||
    params.toolName === "read" ||
    params.toolName === "glob" ||
    params.toolName === "grep" ||
    params.toolName === "sha256" ||
    params.toolName === "write" ||
    params.toolName === "edit" ||
    params.toolName === "bash"
  ) {
    const workspaceSession = params.workspaceSession ?? null;
    const projectId = String(
      params.projectId ?? workspaceSession?.projectId ?? "",
    ).trim();
    if (!projectId || !workspaceSession) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "project_required",
        errorMessage: `${params.toolName} requires a bound computer workspace.`,
      };
    }
    if (isWorkspaceCreditBudgetExpired(workspaceSession)) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "workspace_credits_exhausted",
        errorMessage: "This workspace tool budget expired. Add balance to keep using workspace tools.",
        details: {
          tool_kind: "workspace_tools",
        },
      };
    }
    const budgetSignal = buildWorkspaceCreditBudgetSignal(
      workspaceSession,
      params.signal,
    );
    const startedBeforeBudgetExpiry = !isWorkspaceCreditBudgetExpired(workspaceSession);
    const result = await (async () => {
      try {
        return params.toolName === "list_dir"
          ? await listDaytonaWorkspaceDirectory({
            config: workspaceSession.config,
            toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
            sandboxId: workspaceSession.providerSandboxId,
            relPath: String(normalizedArgs.path ?? ".") || ".",
            signal: budgetSignal.signal,
          })
          : params.toolName === "read"
            ? await readDaytonaWorkspaceFile({
              config: workspaceSession.config,
              toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
              sandboxId: workspaceSession.providerSandboxId,
              relPath: String(normalizedArgs.path ?? "").trim(),
              offset:
                typeof normalizedArgs.offset === "number"
                  ? normalizedArgs.offset
                  : undefined,
              limit:
                typeof normalizedArgs.limit === "number"
                  ? normalizedArgs.limit
                  : undefined,
              signal: budgetSignal.signal,
            })
            : params.toolName === "glob"
              ? await globDaytonaWorkspacePaths({
                config: workspaceSession.config,
                toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                sandboxId: workspaceSession.providerSandboxId,
                pattern: String(normalizedArgs.pattern ?? "").trim(),
                relPath:
                  typeof normalizedArgs.path === "string"
                    ? normalizedArgs.path
                    : undefined,
                signal: budgetSignal.signal,
              })
              : params.toolName === "grep"
                ? await grepDaytonaWorkspaceFiles({
                  config: workspaceSession.config,
                  toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                  sandboxId: workspaceSession.providerSandboxId,
                  pattern: String(normalizedArgs.pattern ?? "").trim(),
                  relPath:
                    typeof normalizedArgs.path === "string"
                      ? normalizedArgs.path
                      : undefined,
                  signal: budgetSignal.signal,
                })
                : params.toolName === "sha256"
                  ? await sha256DaytonaWorkspaceFile({
                    config: workspaceSession.config,
                    toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                    sandboxId: workspaceSession.providerSandboxId,
                    relPath: String(normalizedArgs.path ?? "").trim(),
                    signal: budgetSignal.signal,
                  })
                  : params.toolName === "write"
                    ? await writeDaytonaWorkspaceFile({
                      config: workspaceSession.config,
                      toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                      sandboxId: workspaceSession.providerSandboxId,
                      relPath: String(normalizedArgs.path ?? "").trim(),
                      content: String(normalizedArgs.content ?? ""),
                      signal: budgetSignal.signal,
                    })
                    : params.toolName === "edit"
                      ? await editDaytonaWorkspaceFile({
                        config: workspaceSession.config,
                        toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                        sandboxId: workspaceSession.providerSandboxId,
                        relPath: String(normalizedArgs.path ?? "").trim(),
                        oldText: String(normalizedArgs.old_text ?? ""),
                        newText: String(normalizedArgs.new_text ?? ""),
                        replaceAll: normalizedArgs.replace_all === true,
                        signal: budgetSignal.signal,
                      })
                      : await runDaytonaWorkspaceBash({
                        config: workspaceSession.config,
                        toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                        sandboxId: workspaceSession.providerSandboxId,
                        command: String(normalizedArgs.command ?? ""),
                        relPath:
                          typeof normalizedArgs.cwd === "string"
                            ? normalizedArgs.cwd
                            : undefined,
                        signal: budgetSignal.signal,
                      });
      } finally {
        budgetSignal.cleanup();
      }
    })();
    if (
      startedBeforeBudgetExpiry &&
      budgetSignal.signal?.aborted &&
      isWorkspaceCreditBudgetExpired(workspaceSession)
    ) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "workspace_credits_exhausted",
        errorMessage: "This workspace tool budget expired. Add balance to keep using workspace tools.",
        details: {
          tool_kind: "workspace_tools",
        },
      };
    }
    if (!result.ok) {
      const detailsExitCode =
        typeof result.details?.exit_code === "number" &&
        Number.isFinite(result.details.exit_code)
          ? Math.floor(result.details.exit_code)
          : null;
      return {
        status: "error",
        exitCode: detailsExitCode,
        outputText: String(result.details?.output_preview ?? ""),
        errorCode: result.code,
        errorMessage: result.message,
      };
    }
    return {
      status: "ok",
      exitCode: result.exitCode,
      outputText: result.outputText || "(no output)",
      errorCode: null,
      errorMessage: null,
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
  onReasoningSummaryTextDelta?: (params: {
    delta: string;
    summaryIndex: number;
  }) => Promise<void> | void;
  onReasoningSummaryPartAdded?: (params: {
    summaryIndex: number;
  }) => Promise<void> | void;
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
      onReasoningSummaryTextDelta: params.onReasoningSummaryTextDelta,
      onReasoningSummaryPartAdded: params.onReasoningSummaryPartAdded,
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
    signal: params.signal,
  });
}

async function executeRetrievalAgentLoop(
  params: RuntimeCommunityPromptFields & {
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
    communitySystemPrompt?: string | null;
    projectId?: string | null;
    threadWorkingState?: ThreadWorkingStatePrompt | null;
    authSubject?: string | null;
    workspaceSession?: WorkspaceSandboxSession | null;
    apiKeyOverride?: string | null;
    appendRunEvent: (params: {
      eventType: string;
      eventKey?: string;
      payload: Record<string, unknown>;
    }) => Promise<void>;
    touchRunHeartbeat?: () => Promise<void>;
  },
): Promise<RuntimeAgentLoopSuccess | RuntimeAgentLoopFailure> {
  const projectContext = await resolveWorkspaceProjectContext({
    ctx: params.ctx,
    projectId: params.projectId,
    authSubject: params.authSubject,
  });
  const now = new Date();
  const runtimeTimeZone = "UTC";
  const runtimeDateTimeIso = now.toISOString();
  const runtimeDateLabel = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: runtimeTimeZone,
  }).format(now);
  const mountedUserPlatformAppTools = normalizeRuntimeMountedUserPlatformAppTools(
    await params.ctx.runQuery(
      internal.userPlatformAppMounts.listRuntimeUserPlatformMountedToolsInternal,
      {
        userId: params.userId as any,
      },
    ),
  );
  const runtimeMountedUserPlatformAppTools: RuntimeMountedMcpTool[] =
    mountedUserPlatformAppTools.map((tool) => ({
      scope: "user",
      mount_id: tool.user_platform_app_mount_id,
      runtime_tool_name: `me__${tool.namespaced_tool_name}`,
      developer_app_id: tool.developer_app_id,
      catalog_app_id: tool.catalog_app_id,
      app_name: tool.app_name,
      endpoint_url: tool.endpoint_url,
      auth_type: tool.auth_type,
      tool_name: tool.tool_name,
      namespaced_tool_name: tool.namespaced_tool_name,
      description: tool.description,
      input_schema: tool.input_schema,
      risk_level: tool.risk_level,
    }));
  const skillResolution = normalizeRuntimeSkillResolution(
    await params.ctx.runQuery(
      internal.runtimeSkillResolution.resolveRuntimeSkillSelectionInternal,
      {
        userId: params.userId as any,
        authSubject: params.authSubject ?? undefined,
        communityId: params.communityId ? (params.communityId as any) : undefined,
        messages: params.messages.map((message) => ({
          role: String(message.role ?? ""),
          content: String(message.content ?? ""),
        })),
      },
    ),
  );
  const resolvedHarness = composeResolvedRuntimeHarness({
    personalMountedTools: runtimeMountedUserPlatformAppTools,
    skillResolution,
  });
  const platformSkills = resolvedHarness.platformSkillInventory;
  const selectedPlatformSkills = resolvedHarness.selectedPlatformSkills;
  const effectiveAllowedToolNames = buildEffectiveAllowedToolNames({
    baseAllowedToolNames: params.allowedToolNames,
    selectedPlatformSkills,
  });
  const installedUserPlatformSkills = resolvedHarness.personalSkillInventory;
  const selectedUserPlatformSkills = resolvedHarness.selectedPersonalSkills;
  const attachedCommunitySkills =
    resolvedHarness.activeCommunityModule?.attachedSkills ?? [];
  const selectedCommunitySkills =
    resolvedHarness.activeCommunityModule?.selectedSkills ?? [];
  const executionSession = createPolyNetExecutionSession({
    ctx: params.ctx,
    userId: params.userId,
    authSubject: params.authSubject,
    projectId: params.projectId,
    threadId: params.threadId,
    runId: params.runId,
    mountedTools: resolvedHarness.runtimeMountedTools,
    mountedToolDiscoveryCatalog: resolvedHarness.discoveryMountedTools,
    mountedPromptSuffix: resolvedHarness.systemPromptSuffix,
    initialWorkspaceSession: params.workspaceSession ?? null,
    appendRunEvent: params.appendRunEvent,
    touchRunHeartbeat: params.touchRunHeartbeat,
    loadConnectionBundle: async ({ developerAppId }) =>
      (await params.ctx.runAction(
        internal.appOAuth.getFreshDeveloperAppConnectionBundleInternal,
        {
          developerAppId: developerAppId as any,
        },
      )) as {
        app: any;
        connection: any;
        secret: string | null;
      } | null,
  });

  const latestUserTextForRuntimeContext =
    [...params.messages].reverse().find((message) => message.role === "user")
      ?.content ?? null;
  const runtimeTurnContext = (
    await loadRuntimeTurnContextPacketForRun({
      ctx: params.ctx,
      ownerId: params.userId,
      threadId: params.threadId ?? undefined,
      projectId: params.projectId ?? null,
      runId: params.runId,
      latestUserText: latestUserTextForRuntimeContext,
      threadWorkingState: params.threadWorkingState,
    })
  ).packet;
  const baseSystemPrompt = buildPlatformHarnessRuntimeSystemPrompt({
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
    agentName: params.agentName,
    agentSoul: params.agentSoul,
    projectLabel: projectContext.label,
    projectDescription: projectContext.description,
    runtimeTurnContext,
    currentDateTimeIso: runtimeDateTimeIso,
    currentDateLabel: runtimeDateLabel,
    currentTimeZone: runtimeTimeZone,
  });
  const systemPrompt = `${baseSystemPrompt}${executionSession.buildPromptSuffix()}`;
  const nativeTranscript: NativeToolAwareMessage[] = [
    {
      role: "system",
      content: systemPrompt,
    },
    ...params.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
  const buildActiveProviderTools = () =>
    executionSession.buildProviderTools({
      allowedToolNames: effectiveAllowedToolNames,
      buildFixedOpenAiTools: buildOpenAiFunctionTools,
      buildFixedResponsesTools: buildResponsesApiFunctionTools,
      buildMountedOpenAiTools: buildMountedAppOpenAiTools,
      buildMountedResponsesTools: buildMountedAppResponsesTools,
      buildResolverOpenAiTool: buildResolveMountedToolsOpenAiTool,
      buildResolverResponsesTool: buildResolveMountedToolsResponsesTool,
    });
  const initialProviderTools = buildActiveProviderTools();
  const parallelReadToolsEnabled = readRuntimeBooleanFlag(
    RUNTIME_PARALLEL_READ_TOOLS_FLAG,
    true,
  );
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
  if (runtimeMountedUserPlatformAppTools.length > 0) {
    try {
      await params.appendRunEvent({
        eventType: "platform_app_tools_resolved",
        eventKey: `${params.runId}:platform_app_tools_resolved:1`,
        payload: {
          run_id: params.runId,
          user_scope_id: params.userId ?? null,
          tools: runtimeMountedUserPlatformAppTools.map((tool) => ({
            runtime_tool_name: tool.runtime_tool_name,
            app_name: tool.app_name,
            tool_name: tool.tool_name,
            namespaced_tool_name: tool.namespaced_tool_name,
            risk_level: tool.risk_level,
          })),
        },
      });
    } catch {
      // Best-effort runtime evidence only.
    }
  }
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
          skills: platformSkills.map((skill) => ({
            platform_skill_id: skill.platform_skill_id,
            catalog_skill_id: skill.catalog_skill_id,
            required_capability: skill.requires_capability,
            skill_name: skill.name,
            skill_mention_token: skill.mention_token,
            selected: selectedPlatformSkills.some(
              (candidate) =>
                candidate.platform_skill_id === skill.platform_skill_id,
            ),
          })),
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
          skills: attachedCommunitySkills.map((skill) => ({
            community_skill_attachment_id: skill.community_skill_attachment_id,
            skill_package_id: skill.skill_package_id,
            skill_revision_id:
              selectedCommunitySkills.find(
                (candidate) =>
                  candidate.community_skill_attachment_id ===
                  skill.community_skill_attachment_id,
              )?.skill_revision_id ?? null,
            skill_name: skill.name,
            skill_mention_token: skill.mention_token,
          })),
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
    resolvedHarness.runtimeMountedTools.length > 0 ||
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
          runtime_mounted_tool_names:
            resolvedHarness.runtimeMountedTools.map(
              (tool) => tool.runtime_tool_name,
            ),
          discovery_mounted_tool_names:
            resolvedHarness.discoveryMountedTools.map(
              (tool) => tool.runtime_tool_name,
            ),
          shadowed_mounted_tool_names:
            resolvedHarness.shadowedRuntimeToolNames,
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
        mounted_catalog_count: runtimeMountedUserPlatformAppTools.length,
        active_tool_count: initialProviderTools.activeToolNames.length,
        exposed_mounted_tool_count: initialProviderTools.activeToolNames.filter(
          (toolName) =>
            runtimeMountedUserPlatformAppTools.some(
              (tool) => tool.runtime_tool_name === toolName,
            ),
        ).length,
        resolver_enabled: initialProviderTools.activeToolNames.includes(
          RESOLVE_MOUNTED_TOOLS_TOOL_NAME,
        ),
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
    const loopResult = await runNativeRuntimeKernel<string>({
      messages: nativeTranscript,
      budget: params.loopBudget,
      runCompletion: async (messages) => {
        let completion:
          | NativeToolAwareCompletionSuccess<string>
          | RuntimeAgentLoopFailureInput;
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
            operation: async (signal) =>
              await runProviderNativeToolCompletion({
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
                parallelToolCalls: parallelReadToolsEnabled,
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
              }),
          });
          await throwIfCancelled();
        } catch (error) {
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
        const unknownToolCall = getNativeToolCompletionToolCalls(completion).find(
          (toolCall) => !providerTools.activeToolNames.includes(toolCall.toolName),
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
      normalizeToolArguments: (toolName, rawArgs) => {
        return executionSession.normalizeToolArguments({
          toolName,
          rawArgs,
          allowedToolNames: effectiveAllowedToolNames,
          normalizeFixedToolArguments: normalizeRegistryToolArguments,
        });
      },
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
        if (toolName === RESOLVE_MOUNTED_TOOLS_TOOL_NAME) {
          const resolution = executionSession.resolveMountedToolExposure(
            normalizedArgs as ReturnType<typeof normalizeResolveMountedToolsArguments>,
          );
          try {
            const providerToolSurface = buildActiveProviderTools();
            await params.appendRunEvent({
              eventType: "mounted_tool_exposure_resolved",
              payload: {
                query: resolution.resolution.query,
                scope: resolution.resolution.scope,
                requested_limit: resolution.resolution.requestedLimit,
                total_catalog_count: resolution.resolution.totalCatalogCount,
                total_matched_count: resolution.resolution.totalMatchedCount,
                total_exposed_count: resolution.resolution.totalExposedCount,
                newly_exposed_tool_names:
                  resolution.resolution.newlyExposedTools.map(
                    (tool) => tool.runtime_tool_name,
                  ),
                already_exposed_tool_names:
                  resolution.resolution.alreadyExposedTools,
                remaining_exposure_capacity:
                  resolution.resolution.remainingExposureCapacity,
                active_provider_tool_count:
                  providerToolSurface.activeToolNames.length,
                tool_policy_enforcement: "full_access_audit",
                tool_policy_summary:
                  providerToolSurface.activeToolPolicySummary,
              },
            });
          } catch {
            // Best-effort runtime evidence only.
          }
          return {
            status: "ok" as const,
            exitCode: 0,
            outputText: resolution.outputText,
            errorCode: null,
            errorMessage: null,
            details: {
              mounted_tool_resolution: resolution.resolution,
            },
          };
        }
        const isFixedTool = effectiveAllowedToolNames.includes(
          toolName as RetrievalToolName,
        );
        if (!isFixedTool) {
          const mountedTool = executionSession.getMountedTool(toolName);
          if (!mountedTool) {
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: "mounted_app_tool_not_found",
              errorMessage: `${toolName} is not active for this runtime.`,
            };
          }
          try {
            const toolResult = await runAbortableWithRuntimeCancellation({
              ctx: params.ctx,
              ownerId: params.userId,
              runId: params.runId,
              operation: async (signal) =>
                await executionSession.executeMountedTool({
                  runtimeToolName: toolName,
                  argumentsObject: normalizedArgs,
                  signal,
                }),
            });
            await throwIfCancelled();
            return toolResult as NativeToolExecutionResult;
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
            logStructuredError("agent_loop_mounted_app_tool_execution_crashed", {
              error,
              runId: params.runId,
              threadId: params.threadId ?? undefined,
              communityId: params.communityId ?? undefined,
              developerAppId: mountedTool.developer_app_id,
              mountedToolScope: mountedTool.scope,
              mountedToolName: mountedTool.runtime_tool_name,
              toolName,
              ...summarizeToolArgsForLog(toolName, normalizedArgs),
            });
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: "mounted_app_tool_execute_failed",
              errorMessage: `Mounted app tool execution failed: ${summary.message}`,
            };
          }
        }

        if (
          toolName === "terminal_start" ||
          toolName === "terminal_read" ||
          toolName === "terminal_write" ||
          toolName === "terminal_stop"
        ) {
          try {
            const toolResult = await executionSession.executeTerminalTool({
              toolName,
              normalizedArgs,
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
            logStructuredError("agent_loop_terminal_tool_execution_crashed", {
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
              errorCode: "terminal_operation_failed",
              errorMessage: `Terminal operation failed: ${summary.message}`,
            };
          }
        }

        if (isComputerUseToolName(toolName as RetrievalToolName)) {
          try {
            const toolResult = await runAbortableWithRuntimeCancellation({
              ctx: params.ctx,
              ownerId: params.userId,
              runId: params.runId,
              operation: async (signal) =>
                await executionSession.executeComputerTool({
                  toolName,
                  normalizedArgs,
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
            logStructuredError("agent_loop_computer_tool_execution_crashed", {
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
              errorCode: "computer_tool_execute_failed",
              errorMessage: `Computer tool execution failed: ${summary.message}`,
            };
          }
        }

        const needsWorkspaceSession = requiresWorkspaceSandbox(
          toolName as RetrievalToolName,
        );

        if (needsWorkspaceSession && !executionSession.hasWorkspaceSession()) {
          try {
            await throwIfCancelled();
          } catch (error) {
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: USER_CANCELLED_RUNTIME_CODE,
              errorMessage: error instanceof Error ? error.message : "Cancelled",
            };
          }
          let created: Awaited<
            ReturnType<typeof executionSession.ensureWorkspaceForTool>
          >;
          try {
            created = await executionSession.ensureWorkspaceForTool({
              toolName,
            });
          } catch (error) {
            const summary = summarizeErrorForLog(error);
            logStructuredError("agent_loop_workspace_session_create_crashed", {
              error,
              runId: params.runId,
              threadId: params.threadId ?? undefined,
              toolName,
              projectId: params.projectId ?? undefined,
              communityId: params.communityId ?? undefined,
            });
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: "workspace_session_create_failed",
              errorMessage: `Workspace session create failed: ${summary.message}`,
            };
          }
          if (!created.ok) {
            return {
              status: "error",
              exitCode: null,
              outputText: readFailureOutputPreview((created as any).details),
              errorCode: created.code,
              errorMessage: created.message,
              details: (created as { details?: Record<string, unknown> | null }).details ?? null,
            };
          }
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
                toolName: toolName as RetrievalToolName,
                args: normalizedArgs,
                workspaceSession: executionSession.getWorkspaceSession(),
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
            errorCode: "workspace_tool_execute_failed",
            errorMessage: `Workspace tool execution failed: ${summary.message}`,
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
        await appendWorkspaceToolCallStarted({
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
        await appendWorkspaceToolCallFinished({
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
  } finally {
    await executionSession.dispose();
  }
}

async function executeChatToolsAgentLoop(
  params: RuntimeCommunityPromptFields & {
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
    communitySystemPrompt?: string | null;
    threadWorkingState?: ThreadWorkingStatePrompt | null;
    apiKeyOverride?: string | null;
    appendRunEvent: (params: {
      eventType: string;
      eventKey?: string;
      payload: Record<string, unknown>;
    }) => Promise<void>;
    touchRunHeartbeat?: () => Promise<void>;
  },
): Promise<RuntimeAgentLoopSuccess | RuntimeAgentLoopFailure> {
  return await executeRetrievalAgentLoop({
    ...params,
    harnessName: "chat_tools",
    loopBudget: CHAT_TOOLS_RUNTIME_KERNEL_BUDGET,
  });
}

export type { DaytonaConfig };
export {
  executeChatToolsAgentLoop,
  listDaytonaWorkspaceDirectory,
  loadDaytonaConfig,
};
