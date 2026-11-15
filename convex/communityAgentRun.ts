// The run entry (docs/specs/agent-system-end-state.md §3.4): one funded agent
// run on Pi for the community's guide, whatever started it. It admits the
// model, claims the owner's funding once, offers the run's lens tools
// (shared/lens.ts) and runs them through the caller's executor, records the
// run's events, and on any failure releases the funding with what was spent.
// The caller decides what the answer means (a reply in a thread, a review's
// record) and settles the receipt with it.
//
// Callers: a person's private talk (runtimeAgentLoop), the guide tagged in a
// channel (communityAgentServeWorker) and the nightly memory review
// (communityMemoryReview). What a private talk adds is optional below:
// streamed text, a stop the person can press, the context receipt before the
// first request, and reads run side by side.
import { internal } from "./_generated/api";
import { createFounderInferenceUsageTotals, founderProviderRequests, observeFounderProviderResult } from "./founderInferenceUsage";
import { assertPaidLuna6ProviderHeadroom, founderInferenceBudgetFailureCode } from "./founderInferenceBudget";
import { runOpenAiNativeToolCompletion } from "./openAiNativeToolCompletion";
import { buildResponsesApiFunctionTools, normalizeToolArguments } from "../shared/toolRegistry";
import type { RetrievalToolName } from "../shared/retrievalTools";
import { LENS_TOOLS, lensHasTool } from "../shared/lens";
import type { NativeToolAwareCompletionSuccess, NativeToolAwareMessage, NativeToolChoice } from "../shared/nativeToolProtocol";
import { runPiRuntimeKernel } from "../shared/piRuntimeKernel";
import {
  DEFAULT_RUNTIME_KERNEL_BUDGET,
  type RuntimeKernelBudget,
  type RuntimeKernelFailureInput,
  type RuntimeKernelResult,
  type RuntimeKernelToolExecutionResult,
} from "../shared/runtimeKernelTypes";
import type { RuntimeKernelParams } from "../shared/runtimeKernel";
import { buildRuntimeToolPolicySurface, classifyRuntimeToolSchedule, type RuntimeToolSchedulePlan } from "../shared/runtimeToolPolicy";
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

// kernel: the loop's own result (transcript, steps, stop reason), when the
// loop ran to an end.
export type CommunityAgentRunResult =
  | { ok: true; assistantText: string; fundingSession: CommunityInferenceFundingSession; usage: CommunityAgentRunUsage; providerStarted: boolean;
      kernel: RuntimeKernelResult<RetrievalToolName> }
  | { ok: false; failureCode: string; providerStarted: boolean; kernel?: RuntimeKernelResult<RetrievalToolName> };

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

// The model may ask only for the run's lens tools.
function coerceToLensTools(
  lens: AgentRunLens,
  completion: NativeToolAwareCompletionSuccess<string> | RuntimeKernelFailureInput,
): NativeToolAwareCompletionSuccess<RetrievalToolName> | RuntimeKernelFailureInput {
  if (completion.ok === false) return completion;
  if (completion.type === "tool_call") {
    if (!lensHasTool(lens, completion.toolName)) return unsupportedToolFailure(completion.toolName);
    return { ...completion, toolName: completion.toolName };
  }
  if (completion.type === "tool_calls") {
    for (const toolCall of completion.toolCalls) {
      if (!lensHasTool(lens, toolCall.toolName)) return unsupportedToolFailure(toolCall.toolName);
    }
  }
  return completion as NativeToolAwareCompletionSuccess<RetrievalToolName>;
}

// The guide tagged in a channel, the worker with nobody present, or the
// guide in a person's private talk.
export type AgentRunLens = "guide_public" | "worker" | "member_private" | "builder_private";

// Runs an operation without a signal: for callers with no stop button.
const runDirectly = <T>(operation: (signal: AbortSignal | undefined) => Promise<T>): Promise<T> => operation(undefined);

export async function runFundedCommunityAgent(args: {
  ctx: any;
  lens: AgentRunLens;
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
  executeTool: (toolName: RetrievalToolName, rawArguments: Record<string, unknown>, call: {
    providerCallId: string; normalizedArgs: Record<string, unknown>; iteration: number;
  }) => Promise<RuntimeKernelToolExecutionResult>;
  // Checked before each model request (a source's access can end mid-run).
  beforeEachCompletion?: () => Promise<void>;
  // Tool results the caller's rules refused are logged as refused.
  isRefusal?: (errorCode: string | null | undefined) => boolean;
  // A caller that parses its own calls (the nightly review) takes the
  // model's arguments as they are; otherwise the general rules apply.
  normalizeToolArguments?: (toolName: RetrievalToolName, rawArgs: Record<string, unknown>) => Record<string, unknown>;
  // What the run's log says about a call (by default, the tool's name).
  describeToolCall?: (toolName: string, args: Record<string, unknown>) => string;
  maxConsecutiveFailures?: number;
  // The first model request's tool choice, e.g. a review that must write
  // (its one write may be empty).
  firstToolChoice?: NativeToolChoice<RetrievalToolName>;
  // The loop's limits, when a caller sets its own (a private talk does).
  budget?: RuntimeKernelBudget;
  // Each model request's text as it arrives, with which request it was.
  onTextDelta?: (delta: string, completionIndex: number) => void;
  // Runs a model request or a tool call so the person can stop it: passes an
  // abort signal, and throws when the run was stopped.
  abortable?: <T>(operation: (signal: AbortSignal | undefined) => Promise<T>) => Promise<T>;
  // Turns what abortable threw into how the run stops (stopped by the person,
  // no longer active); anything else is a crash, as before.
  mapStopError?: (error: unknown) => RuntimeKernelFailureInput | null;
  // Before the first model request, with exactly the messages it will send
  // (a private talk records its context receipt); a failure stops the run.
  beforeFirstCompletion?: (messages: NativeToolAwareMessage[]) => Promise<RuntimeKernelFailureInput | null>;
  // Reads in one model answer may run side by side; writes always run alone.
  parallelReads?: boolean;
  // Told how each batch of tool calls was scheduled.
  onToolSchedule?: (schedule: RuntimeToolSchedulePlan, batch: { isBatch: boolean; remainingToolBudget: number; toolStepCount: number }) => Promise<void>;
  // Told about each tool call as it starts and ends, beside the run's events.
  onToolStepStart?: RuntimeKernelParams<RetrievalToolName>["onToolStepStart"];
  onToolStepFinish?: RuntimeKernelParams<RetrievalToolName>["onToolStepFinish"];
}): Promise<CommunityAgentRunResult> {
  const abortable = args.abortable ?? runDirectly;
  const lensTools = LENS_TOOLS[args.lens];
  const toolPolicies = buildRuntimeToolPolicySurface({ fixedToolNames: lensTools }).policies;
  let firstCompletionChecked = !args.beforeFirstCompletion;
  const tools = buildResponsesApiFunctionTools(lensTools);
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
  let completions = 0;
  try {
    await args.beforeEachCompletion?.();
    const admittedModelId = await args.ctx.runQuery(internalRefs.founderInference.resolveCommunityInferenceModelInternal, {
      communityId: args.communityId, receiptKey: args.receiptKey, surface: args.surface,
    });
    usage = createFounderInferenceUsageTotals(admittedModelId);
    completion = await runPiRuntimeKernel<RetrievalToolName>({
      messages: args.messages,
      budget: args.budget ?? {
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
        if (!firstCompletionChecked) {
          firstCompletionChecked = true;
          const refused = await args.beforeFirstCompletion!(kernelMessages);
          if (refused) return refused;
        }
        let toolCompletion;
        const completionIndex = completions++;
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
          const modelId = fundingSession.modelId;
          toolCompletion = await abortable((signal) => runOpenAiNativeToolCompletion({
            modelId,
            messages: kernelMessages,
            maxTokens: args.maxOutputTokens,
            tools,
            ...(toolChoice ? { toolChoice } : {}),
            parallelToolCalls: args.parallelReads === true,
            promptCacheKey: args.promptCacheKey,
            ...(args.onTextDelta ? { onTextDelta: (delta: string) => args.onTextDelta!(delta, completionIndex) } : {}),
            ...(signal ? { signal } : {}),
          }));
        } catch (error) {
          if (providerStarted && !founderInferenceBudgetFailureCode(error)) usage.complete = false;
          const stopped = args.mapStopError?.(error);
          if (stopped) return stopped;
          throw error;
        }
        observeFounderProviderResult(usage, toolCompletion,
          toolCompletion.ok === false && providerFailureIsKnownPreSpend(toolCompletion.code));
        return coerceToLensTools(args.lens, toolCompletion);
      },
      normalizeToolArguments: args.normalizeToolArguments ?? normalizeToolArguments,
      ...(args.parallelReads ? {
        onToolBatchResolved: async ({ steps, isBatch, remainingToolBudget, toolStepCount }) => {
          const schedule = classifyRuntimeToolSchedule({
            toolCalls: steps.map((step, index) => ({ providerCallId: step.providerCallId, toolName: step.toolName, index, normalizedArgs: step.normalizedArgs })),
            policies: toolPolicies,
            enableParallelReadBatches: true,
          });
          await args.onToolSchedule?.(schedule, { isBatch, remainingToolBudget, toolStepCount });
          return { executionMode: schedule.executionMode === "parallel_read_batch" ? "parallel" as const : "serial" as const };
        },
      } : {}),
      onToolStepStart: async (step) => {
        await args.recorder.flushAll();
        const content = args.describeToolCall?.(String(step.step.toolName), step.step.normalizedArgs ?? {}) ?? String(step.step.toolName);
        await args.recorder.record({ kind: "tool_call", toolName: String(step.step.toolName), status: "running", content });
        await args.onToolStepStart?.(step);
      },
      onToolStepFinish: async (finished) => {
        const { step, toolResult } = finished;
        const refused = Boolean(args.isRefusal?.(toolResult.errorCode));
        await args.recorder.record({
          kind: "tool_result", toolName: String(step.toolName),
          status: refused ? "refused" : toolResult.status, errorCode: toolResult.errorCode ?? undefined,
          content: toolResult.status === "ok" ? "Tool completed" : refused ? "Tool call refused by the turn's rules" : "Tool failed",
        });
        await args.onToolStepFinish?.(finished);
      },
      executeTool: async ({ toolName, rawArguments, providerCallId, normalizedArgs, iteration }) =>
        await args.executeTool(toolName, rawArguments, { providerCallId, normalizedArgs, iteration }),
    });
  } catch (error) {
    // A stop before the loop began (the person pressed stop) is a stop, not a crash.
    const failureCode = founderInferenceBudgetFailureCode(error) ?? args.mapStopError?.(error)?.code ?? (providerStarted
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
    return { ok: false, failureCode, providerStarted, kernel: completion };
  }
  const assistantText = String(completion?.assistantText ?? "");
  await args.recorder.record({ kind: "final", status: "completed", content: assistantText });
  if (!fundingSession) {
    return { ok: false, failureCode: "community_inference_funding_session_missing", providerStarted, kernel: completion };
  }
  return { ok: true, assistantText, fundingSession, usage, providerStarted, kernel: completion };
}
