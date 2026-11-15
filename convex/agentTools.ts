// The one router for the guide's tools (docs/specs/agent-system-end-state.md):
// every guide run, in a private talk or tagged in a channel, calls its tools
// here. The run's lens says which tools it has (shared/lens.ts); the five
// Polynet tools go to the canonical executor, which checks each call against
// the caller's lens; web_research is paid from the community's funding.
import { internal } from "./_generated/api";
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
import type { RuntimeKernelToolExecutionResult as NativeToolExecutionResult } from "../shared/runtimeKernelTypes";
import { normalizeToolArguments as normalizeRegistryToolArguments } from "../shared/toolRegistry";
import type { CommunityEvidenceSurface } from "../shared/communityEvidenceContract";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor.ts";
import {
  POLYNET_CANONICAL_TOOL_NAMES,
  type PolynetCanonicalToolName,
} from "../shared/polynetCanonicalToolContract.ts";
import { formatJsonToolOutput } from "./runtimeHarnessShaping";
import { guideRunLens, lensHasTool } from "../shared/lens";

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

export async function runAgentTool(params: {
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
  // The pod a guide run started in (community concierge only).
  podRoomId?: string | null;
  signal?: AbortSignal;
}): Promise<NativeToolExecutionResult> {
  // The run's lens decides which tools it has; a tool outside it is refused
  // before anything runs (shared/lens.ts).
  const lens = guideRunLens(params.evidenceSurface);
  if (!lensHasTool(lens, params.toolName)) {
    return {
      status: "error",
      exitCode: null,
      outputText: "",
      errorCode: "tool_not_in_lens",
      errorMessage: `${String(params.toolName)} isn't one of this run's tools.`,
    };
  }
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
      // A call names its capability in target; everything else in path.
      const path = String(normalizedArgs.path ?? normalizedArgs.target ?? "").trim();
      if (path === "/" && params.toolName === "polynet_list") {
        const context = await params.ctx.runQuery(internal.communityAgent.resolveRuntimeCommunityPromptContextInternal, { authSubject, userId: params.userId as any, communityId: params.communityId as any });
        normalizedArgs = { ...normalizedArgs, path: `/communities/${context.community_slug}/` };
      } else if (!path.startsWith("/communities/")) {
        return { status: "error", exitCode: null, outputText: "", errorCode: "community_context_mismatch", errorMessage: "Use paths within this conversation's community." };
      }
    }
    const execution = await executePolynetCanonicalTool({
      ...(communityOwned && params.podRoomId ? { podRoomId: params.podRoomId } : {}),
      toolCallId: params.toolCallId,
      communityBoundConversation: params.communityBoundConversation,
      runId: params.runId,
      ctx: params.ctx,
      authSubject,
      userId: params.userId,
      principalKind: communityOwned ? "community_agent" : "community_agent_for_member",
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
    errorCode: "tool_not_in_lens",
    errorMessage: `${params.toolName} isn't one of this run's tools.`,
  };
}
