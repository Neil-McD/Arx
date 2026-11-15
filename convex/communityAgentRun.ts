// The run entry (docs/specs/agent-system-end-state.md §3.4): one funded agent
// run on Pi for the community's guide, whatever started it. It admits the
// model, claims the owner's funding once, runs the five tools through the
// caller's executor, records the run's events, and on any failure releases
// the funding with what was spent. The caller decides what the answer means
// (a reply in a thread, a review's record) and settles the receipt with it.
//
// Callers: the guide tagged in a channel (communityAgentServeWorker) and the
// nightly memory review (communityMemoryReview). The member's own session
// moves here in slice 5.
import { internal } from "./_generated/api";
import { createFounderInferenceUsageTotals, founderProviderRequests, observeFounderProviderResult } from "./founderInferenceUsage";
import { assertPaidLuna6ProviderHeadroom, founderInferenceBudgetFailureCode } from "./founderInferenceBudget";
import { runOpenAiNativeToolCompletion } from "./openAiNativeToolCompletion";
import {
  buildCommunityAgentConciergeFunctionTools,
  isCommunityAgentConciergeToolName,
  normalizeCommunityAgentConciergeToolArguments,
  type CommunityAgentConciergeToolName,
} from "../shared/communityAgentConciergeTools";
import type { NativeToolAwareCompletionSuccess, NativeToolChoice } from "../shared/nativeToolProtocol";
import { runPiRuntimeKernel } from "../shared/piRuntimeKernel";
import {
  DEFAULT_RUNTIME_KERNEL_BUDGET,
  type RuntimeKernelFailureInput,
  type RuntimeKernelToolExecutionResult,
} from "../shared/runtimeKernelTypes";
import type { CommunityInferenceFundingAdmission, CommunityInferenceSurface } from "../shared/founderInference";
import {
  claimCommunityInferenceFundingSession,
  failCommunityInferenceFundingSession,
  markCommunityInferenceFundingSessionProviderStarted,
  providerFailureIsKnownPreSpend,
  type CommunityInferenceFundingSession,
} from "./founderInferenceRuntime";
import { buildRuntimeInputBudgetEvidence } from "../shared/runtimeInputBudget.ts";
import { buildRuntimeContextProjectionEvidence } from "../shared/providerContextWindow.ts";

const internalRefs = internal as any;

export type CommunityAgentRunEvent = {
  kind: "input_budget" | "context_projection" | "tool_call" | "tool_result" | "error" | "final";
  content: string;
  toolName?: string;
  status?: string;
  errorCode?: string;
};

export type CommunityAgentRunRecorder = {
  record: (event: CommunityAgentRunEvent) => Promise<void>;
  recordRequired: (event: CommunityAgentRunEvent) => Promise<void>;
  flushAll: () => Promise<void>;
};

export type CommunityAgentRunUsage = ReturnType<typeof createFounderInferenceUsageTotals>;

export type CommunityAgentRunResult =
  | { ok: true; assistantText: string; fundingSession: CommunityInferenceFundingSession; usage: CommunityAgentRunUsage; providerStarted: boolean }
  | { ok: false; failureCode: string; providerStarted: boolean };

function unsupportedToolFailure(toolName: unknown): RuntimeKernelFailureInput {
  const pendingToolName = String(toolName ?? "").trim();
  return {
    ok: false,
    status: 502,
    code: "unsupported_concierge_tool",
    stopReason: "invalid_model_output",
    message: pendingToolName
      ? `Community concierge returned unsupported tool call "${pendingToolName}".`
      : "Community concierge returned an unsupported tool call.",
    ...(pendingToolName ? { pendingToolName } : {}),
  };
}

// The model may ask only for the five tools.
function coerceToFiveTools(
  completion: NativeToolAwareCompletionSuccess<string> | RuntimeKernelFailureInput,
): NativeToolAwareCompletionSuccess<CommunityAgentConciergeToolName> | RuntimeKernelFailureInput {
  if (completion.ok === false) return completion;
  if (completion.type === "tool_call") {
    if (!isCommunityAgentConciergeToolName(completion.toolName)) return unsupportedToolFailure(completion.toolName);
    return { ...completion, toolName: completion.toolName };
  }
  if (completion.type === "tool_calls") {
    for (const toolCall of completion.toolCalls) {
      if (!isCommunityAgentConciergeToolName(toolCall.toolName)) return unsupportedToolFailure(toolCall.toolName);
    }
    return completion as NativeToolAwareCompletionSuccess<CommunityAgentConciergeToolName>;
  }
  return completion as NativeToolAwareCompletionSuccess<CommunityAgentConciergeToolName>;
}

export async function runFundedCommunityAgent(args: {
  ctx: any;
  communityId: unknown;
  // Whose request this is (the member who tagged the guide, or the owner for
  // work with nobody present). Funding is always the owner's.
  actorUserId: unknown;
  surface: CommunityInferenceSurface;
  receiptKey: string;
  sourceRunId: string;
  admission: CommunityInferenceFundingAdmission;
  messages: any[];
  maxOutputTokens: number;
  maxToolSteps: number;
  promptCacheKey: string;
  recorder: CommunityAgentRunRecorder;
  executeTool: (toolName: CommunityAgentConciergeToolName, rawArguments: Record<string, unknown>) => Promise<RuntimeKernelToolExecutionResult>;
  // Checked before each model request (a source's access can end mid-run).
  beforeEachCompletion?: () => Promise<void>;
  // Tool results the caller's rules refused are logged as refused.
  isRefusal?: (errorCode: string | null | undefined) => boolean;
  // A caller that parses its own calls (the nightly review) takes the
  // model's arguments as they are; otherwise the general rules apply.
  normalizeToolArguments?: (toolName: CommunityAgentConciergeToolName, rawArgs: Record<string, unknown>) => Record<string, unknown>;
  // What the run's log says about a call (by default, the tool's name).
  describeToolCall?: (toolName: string, args: Record<string, unknown>) => string;
  maxConsecutiveFailures?: number;
  // The first model request's tool choice, e.g. a review that must write
  // (its one write may be empty).
  firstToolChoice?: NativeToolChoice<CommunityAgentConciergeToolName>;
}): Promise<CommunityAgentRunResult> {
  const tools = buildCommunityAgentConciergeFunctionTools();
  let usage = createFounderInferenceUsageTotals("");
  let providerStarted = false;
  let fundingSession: CommunityInferenceFundingSession | null = null;

  const releaseFunding = async (failureCode: string, disposition: "failed" | "indeterminate") => {
    if (!fundingSession) return;
    await failCommunityInferenceFundingSession({
      ctx: args.ctx, session: fundingSession,
      promptTokens: usage.promptTokens, completionTokens: usage.completionTokens,
      providerRequests: founderProviderRequests(usage),
      usageComplete: providerStarted ? usage.complete : true,
      failureCode, disposition,
    });
  };

  let completion: any;
  let requests = 0;
  try {
    await args.beforeEachCompletion?.();
    const admittedModelId = await args.ctx.runQuery(internalRefs.founderInference.resolveCommunityInferenceModelInternal, {
      communityId: args.communityId, receiptKey: args.receiptKey, surface: args.surface,
    });
    usage = createFounderInferenceUsageTotals(admittedModelId);
    completion = await runPiRuntimeKernel<CommunityAgentConciergeToolName>({
      messages: args.messages,
      budget: {
        ...DEFAULT_RUNTIME_KERNEL_BUDGET, maxToolSteps: args.maxToolSteps,
        maxConsecutiveFailures: args.maxConsecutiveFailures ?? 2, maxNoProgressSteps: args.maxConsecutiveFailures ?? 2,
      },
      inputBudget: {
        transport: "openai_responses",
        modelRef: `openai/${admittedModelId}`,
        reservedOutputTokens: args.maxOutputTokens,
        toolSchemas: tools,
        recordPlan: async (budgetPlan) => {
          await args.recorder.recordRequired({
            kind: "input_budget", status: budgetPlan.plan.fits ? "fits" : "rejected",
            errorCode: budgetPlan.plan.failureCode ?? undefined,
            content: JSON.stringify(buildRuntimeInputBudgetEvidence(budgetPlan)),
          });
        },
        recordProjection: async (projection) => {
          await args.recorder.recordRequired({
            kind: "context_projection", status: "projected",
            content: JSON.stringify(buildRuntimeContextProjectionEvidence(projection)),
          });
        },
      },
      runCompletion: async (kernelMessages, options) => {
        let toolCompletion;
        try {
          await args.beforeEachCompletion?.();
          if (!fundingSession) {
            fundingSession = await claimCommunityInferenceFundingSession({
              ctx: args.ctx, receiptKey: args.receiptKey, sourceRunId: args.sourceRunId,
              communityId: args.communityId, actorUserId: args.actorUserId, surface: args.surface, admission: args.admission,
            });
          }
          if (fundingSession.modelId !== admittedModelId) throw new Error("founder_inference_model_changed_before_start");
          assertPaidLuna6ProviderHeadroom({ session: fundingSession, usage, maxOutputTokens: args.maxOutputTokens });
          if (!providerStarted) {
            await markCommunityInferenceFundingSessionProviderStarted({ ctx: args.ctx, session: fundingSession });
            providerStarted = true;
          }
          const toolChoice = options?.toolChoice ?? (requests++ === 0 ? args.firstToolChoice : undefined);
          toolCompletion = await runOpenAiNativeToolCompletion({
            modelId: fundingSession.modelId,
            messages: kernelMessages,
            maxTokens: args.maxOutputTokens,
            tools,
            ...(toolChoice ? { toolChoice } : {}),
            parallelToolCalls: false,
            promptCacheKey: args.promptCacheKey,
          });
        } catch (error) {
          if (providerStarted && !founderInferenceBudgetFailureCode(error)) usage.complete = false;
          throw error;
        }
        observeFounderProviderResult(usage, toolCompletion,
          toolCompletion.ok === false && providerFailureIsKnownPreSpend(toolCompletion.code));
        return coerceToFiveTools(toolCompletion);
      },
      normalizeToolArguments: args.normalizeToolArguments ?? normalizeCommunityAgentConciergeToolArguments,
      onToolStepStart: async ({ step }) => {
        await args.recorder.flushAll();
        const content = args.describeToolCall?.(String(step.toolName), (step as any).normalizedArgs ?? {}) ?? String(step.toolName);
        await args.recorder.record({ kind: "tool_call", toolName: String(step.toolName), status: "running", content });
      },
      onToolStepFinish: async ({ step, toolResult }) => {
        const refused = Boolean(args.isRefusal?.(toolResult.errorCode));
        await args.recorder.record({
          kind: "tool_result", toolName: String(step.toolName),
          status: refused ? "refused" : toolResult.status, errorCode: toolResult.errorCode ?? undefined,
          content: toolResult.status === "ok" ? "Tool completed" : refused ? "Tool call refused by the turn's rules" : "Tool failed",
        });
      },
      executeTool: async ({ toolName, rawArguments }) => await args.executeTool(toolName, rawArguments),
    });
  } catch (error) {
    const failureCode = founderInferenceBudgetFailureCode(error) ?? (providerStarted
      ? "provider_exception"
      : String(error instanceof Error ? error.message : error).slice(0, 120) || "funding_authority_changed");
    await releaseFunding(failureCode, providerStarted ? "indeterminate" : "failed");
    await args.recorder.flushAll();
    await args.recorder.record({ kind: "error", errorCode: failureCode, content: "The community agent could not complete this turn." });
    return { ok: false, failureCode, providerStarted };
  }
  await args.recorder.flushAll();
  if (completion?.ok === false) {
    const failureCode = String(completion.code ?? "provider_error");
    await releaseFunding(failureCode, !providerStarted || providerFailureIsKnownPreSpend(failureCode) ? "failed" : "indeterminate");
    await args.recorder.record({ kind: "error", errorCode: failureCode, content: "The community agent could not complete this turn." });
    return { ok: false, failureCode, providerStarted };
  }
  const assistantText = String(completion?.assistantText ?? "");
  await args.recorder.record({ kind: "final", status: "completed", content: assistantText });
  if (!fundingSession) {
    return { ok: false, failureCode: "community_inference_funding_session_missing", providerStarted };
  }
  return { ok: true, assistantText, fundingSession, usage, providerStarted };
}
