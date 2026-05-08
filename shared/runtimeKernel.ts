import type {
  NativeToolAwareCompletionSuccess,
  NativeToolAwareMessage,
  NativeToolCallRequest,
  NativeToolInputContentPart,
} from "./nativeToolProtocol.ts";
import { isComputerUseObservationMessage } from "./nativeToolProtocol.ts";
import type {
  RuntimeKernelBudget,
  RuntimeKernelFailure,
  RuntimeKernelFailureInput,
  RuntimeKernelResolvedStep,
  RuntimeKernelResolvedToolStep,
  RuntimeKernelResult,
  RuntimeKernelRunCompletion,
  RuntimeKernelStepRecord,
  RuntimeKernelStopReason,
  RuntimeKernelToolExecutionResult,
  RuntimeKernelToolResultEnvelope,
} from "./runtimeKernelTypes.ts";

function summarizeLongText(value: string, limit = 512): string {
  if (value.length <= limit) return value;
  const half = Math.max(32, Math.floor((limit - 5) / 2));
  return `${value.slice(0, half)}...${value.slice(-half)}`;
}

function stableSerialize(value: unknown): string {
  const seen = new WeakSet<object>();

  const encode = (input: unknown): string => {
    if (input === null || typeof input !== "object") {
      return JSON.stringify(input);
    }
    if (Array.isArray(input)) {
      return `[${input.map((entry) => encode(entry)).join(",")}]`;
    }
    if (seen.has(input)) {
      return JSON.stringify("[Circular]");
    }
    seen.add(input);
    const objectValue = input as Record<string, unknown>;
    const entries = Object.entries(objectValue).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${encode(entry)}`)
      .join(",")}}`;
  };

  return encode(value);
}

function buildObservationSignature(
  observationContent: NativeToolInputContentPart[] | null | undefined,
): string | null {
  if (!Array.isArray(observationContent) || observationContent.length === 0) {
    return null;
  }
  return observationContent
    .map((part) => {
      if (part.type === "text") {
        return `text:${summarizeLongText(part.text, 320)}`;
      }
      return `image:${summarizeLongText(String(part.imageUrl ?? ""), 96)}:${
        String(part.imageUrl ?? "").length
      }`;
    })
    .join("|");
}

function buildToolCallSignature<TToolName extends string>(params: {
  toolName: TToolName;
  normalizedArgs: Record<string, unknown>;
}): string {
  return `${params.toolName}:${stableSerialize(params.normalizedArgs)}`;
}

function buildToolResultSignature(params: {
  toolResult: RuntimeKernelToolExecutionResult;
}): string {
  const detailsSignature =
    params.toolResult.details && typeof params.toolResult.details === "object"
      ? summarizeLongText(stableSerialize(params.toolResult.details), 1024)
      : null;
  return stableSerialize({
    status: params.toolResult.status,
    exitCode: params.toolResult.exitCode,
    errorCode: params.toolResult.errorCode,
    errorMessage: params.toolResult.errorMessage,
    outputPreview: summarizeLongText(params.toolResult.outputText, 1024),
    outputLength: params.toolResult.outputText.length,
    detailsSignature,
    observationSignature: buildObservationSignature(
      params.toolResult.observationContent,
    ),
  });
}

export function buildToolResultEnvelope<TToolName extends string>(params: {
  toolName: TToolName;
  toolResult: RuntimeKernelToolExecutionResult;
}): RuntimeKernelToolResultEnvelope<TToolName> {
  return {
    tool_name: params.toolName,
    success: params.toolResult.status === "ok",
    status: params.toolResult.status,
    exit_code: params.toolResult.exitCode,
    error_code: params.toolResult.errorCode,
    error_message: params.toolResult.errorMessage,
    output: params.toolResult.outputText,
  };
}

export function buildToolResultContent<TToolName extends string>(params: {
  toolName: TToolName;
  toolResult: RuntimeKernelToolExecutionResult;
}): string {
  return JSON.stringify(buildToolResultEnvelope(params));
}

function buildToolExecutionExceptionResult(
  error: unknown,
): RuntimeKernelToolExecutionResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: "error",
    exitCode: null,
    outputText: "",
    errorCode: "tool_execution_exception",
    errorMessage: message || "Tool execution failed.",
  };
}

function normalizeToolBalanceTerminalCode(code: string | null | undefined): string | null {
  const normalized = String(code ?? "").trim().toLowerCase();
  if (normalized === "credits_exhausted" || normalized === "workspace_credits_exhausted") {
    return "workspace_credits_exhausted";
  }
  if (normalized === "credits_unavailable" || normalized === "workspace_credits_unavailable") {
    return "workspace_credits_unavailable";
  }
  return null;
}

function buildToolBalanceTerminalSignal<TToolName extends string>(
  toolResult: RuntimeKernelToolExecutionResult,
): {
  status: number;
  code: RuntimeKernelFailure<TToolName>["code"];
  stopReason: RuntimeKernelStopReason;
  message: string;
  toolKind: string | null;
  requiredCredits: number | null;
} | null {
  const code = normalizeToolBalanceTerminalCode(toolResult.errorCode);
  if (!code) return null;
  const details = toolResult.details && typeof toolResult.details === "object"
    ? toolResult.details
    : null;
  const rawRequiredCredits = Number(details?.required_credits ?? details?.requiredCredits ?? 0);
  const fallbackMessage =
    code === "workspace_credits_exhausted"
      ? "Premium tools use paid provider or sandbox infrastructure, so they need tool balance before they run."
      : "Tool balance is unavailable for premium tools.";
  return {
    status: 402,
    code,
    stopReason: "tool_error_unrecoverable",
    message: String(toolResult.errorMessage ?? "").trim() || fallbackMessage,
    toolKind: typeof details?.tool_kind === "string"
      ? details.tool_kind
      : typeof details?.toolKind === "string"
        ? details.toolKind
        : null,
    requiredCredits: Number.isFinite(rawRequiredCredits) && rawRequiredCredits > 0
      ? rawRequiredCredits
      : null,
  };
}

function toKernelFailure<TToolName extends string>(params: {
  failure: RuntimeKernelFailureInput;
  transcript: NativeToolAwareMessage[];
  steps: RuntimeKernelStepRecord<TToolName>[];
  stepCount: number;
  promptTokens: number | null;
  completionTokens: number | null;
}): RuntimeKernelFailure<TToolName> {
  const stopReason: RuntimeKernelStopReason =
    params.failure.stopReason ??
    (params.failure.code === "user_cancelled" ? "user_cancelled" : "model_error");
  return {
    ok: false,
    status: params.failure.status,
    code: params.failure.code,
    stopReason,
    message: params.failure.message,
    toolKind: params.failure.toolKind ?? null,
    requiredCredits: params.failure.requiredCredits ?? null,
    pendingToolCallId: params.failure.pendingToolCallId,
    pendingToolName: params.failure.pendingToolName,
    transcript: [...params.transcript],
    stepCount: params.stepCount,
    steps: [...params.steps],
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
  };
}

function isRuntimeKernelFailureInput<TToolName extends string>(
  value: RuntimeKernelFailureInput | RuntimeKernelResolvedStep<TToolName>,
): value is RuntimeKernelFailureInput {
  return "ok" in value && value.ok === false;
}

async function resolveLoopStep<TToolName extends string>(params: {
  completion: NativeToolAwareCompletionSuccess<TToolName>;
  normalizeToolArguments: (
    toolName: TToolName,
    rawArgs: Record<string, unknown>,
  ) => Record<string, unknown>;
}): Promise<
  RuntimeKernelResolvedStep<TToolName> | RuntimeKernelFailureInput
> {
  if (params.completion.type === "assistant") {
    const assistantText = params.completion.assistantText.trim();
    if (!assistantText) {
      return {
        ok: false,
        status: 502,
        code: "empty_response",
        stopReason: "empty_response",
        message: "Tool loop model returned an empty response.",
      };
    }
    return {
      kind: "assistant_final",
      assistantText,
      promptTokens: params.completion.promptTokens,
      completionTokens: params.completion.completionTokens,
    };
  }

  const toolCalls: NativeToolCallRequest<TToolName>[] =
    params.completion.type === "tool_call"
      ? [
          {
            providerCallId: params.completion.providerCallId,
            toolName: params.completion.toolName,
            arguments: params.completion.arguments,
          },
        ]
      : params.completion.toolCalls;

  if (toolCalls.length === 0) {
    return {
      ok: false,
      status: 502,
      code: "invalid_model_output",
      stopReason: "invalid_model_output",
      message: "Provider returned an empty tool-call batch.",
    };
  }

  const seenCallIds = new Set<string>();
  const resolvedToolSteps: RuntimeKernelResolvedToolStep<TToolName>[] = [];
  for (const toolCall of toolCalls) {
    const resolved = resolveToolCallStep({
      toolCall,
      assistantToolCallMessage: params.completion.assistantToolCallMessage,
      promptTokens: params.completion.promptTokens,
      completionTokens: params.completion.completionTokens,
      normalizeToolArguments: params.normalizeToolArguments,
    });
    if (isRuntimeKernelFailureInput(resolved)) return resolved;
    if (seenCallIds.has(resolved.providerCallId)) {
      return {
        ok: false,
        status: 502,
        code: "invalid_model_output",
        stopReason: "invalid_model_output",
        message: "Provider returned duplicate tool call IDs.",
        pendingToolCallId: resolved.providerCallId,
        pendingToolName: resolved.toolName,
      };
    }
    seenCallIds.add(resolved.providerCallId);
    resolvedToolSteps.push(resolved);
  }

  if (resolvedToolSteps.length === 1) return resolvedToolSteps[0]!;
  return {
    kind: "tool_follow_up_batch",
    steps: resolvedToolSteps,
  };
}

function resolveToolCallStep<TToolName extends string>(params: {
  toolCall: NativeToolCallRequest<TToolName>;
  assistantToolCallMessage: RuntimeKernelResolvedToolStep<TToolName>["assistantToolCallMessage"];
  promptTokens: number | null;
  completionTokens: number | null;
  normalizeToolArguments: (
    toolName: TToolName,
    rawArgs: Record<string, unknown>,
  ) => Record<string, unknown>;
}): RuntimeKernelResolvedToolStep<TToolName> | RuntimeKernelFailureInput {
  const providerCallId = String(params.toolCall.providerCallId ?? "").trim();
  if (!providerCallId) {
    return {
      ok: false,
      status: 502,
      code: "invalid_model_output",
      stopReason: "invalid_model_output",
      message: "Provider returned a tool call without a call_id.",
    };
  }

  let normalizedArgs: Record<string, unknown>;
  try {
    normalizedArgs = params.normalizeToolArguments(
      params.toolCall.toolName,
      params.toolCall.arguments,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 502,
      code: "invalid_model_output",
      stopReason: "invalid_model_output",
      message: message || "Provider returned invalid tool arguments.",
      pendingToolCallId: providerCallId,
      pendingToolName: params.toolCall.toolName,
    };
  }

  return {
    kind: "tool_follow_up",
    providerCallId,
    toolName: params.toolCall.toolName,
    rawArguments: params.toolCall.arguments,
    normalizedArgs,
    assistantToolCallMessage: params.assistantToolCallMessage,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
  };
}

function removeLatestComputerUseObservationMessage(
  transcript: NativeToolAwareMessage[],
): void {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    if (isComputerUseObservationMessage(transcript[index]!)) {
      transcript.splice(index, 1);
      break;
    }
  }
}

function appendComputerUseObservationMessage(params: {
  transcript: NativeToolAwareMessage[];
  observationContent: NativeToolInputContentPart[] | null;
}): void {
  if (!params.observationContent || params.observationContent.length === 0) {
    return;
  }
  removeLatestComputerUseObservationMessage(params.transcript);
  params.transcript.push({
    role: "user",
    content: params.observationContent,
  });
}

function appendToolResultToTranscript<TToolName extends string>(params: {
  transcript: NativeToolAwareMessage[];
  step: RuntimeKernelResolvedToolStep<TToolName>;
  toolResultEnvelope: RuntimeKernelToolResultEnvelope<TToolName>;
  appendAssistantMessage: boolean;
}): void {
  if (params.appendAssistantMessage) {
    params.transcript.push(params.step.assistantToolCallMessage);
  }
  params.transcript.push({
    role: "tool",
    tool_call_id: params.step.providerCallId,
    content: JSON.stringify(params.toolResultEnvelope),
  });
}

export type RuntimeKernelToolBatchPlan = {
  executionMode: "serial" | "parallel";
};

export async function runNativeRuntimeKernel<TToolName extends string>(params: {
  messages: NativeToolAwareMessage[];
  budget: RuntimeKernelBudget;
  runCompletion: RuntimeKernelRunCompletion<TToolName>;
  normalizeToolArguments: (
    toolName: TToolName,
    rawArgs: Record<string, unknown>,
  ) => Record<string, unknown>;
  executeTool: (params: {
    iteration: number;
    providerCallId: string;
    toolName: TToolName;
    normalizedArgs: Record<string, unknown>;
    rawArguments: Record<string, unknown>;
  }) => Promise<RuntimeKernelToolExecutionResult>;
  onToolStepStart?: (params: {
    iteration: number;
    step: RuntimeKernelResolvedToolStep<TToolName>;
    repeatedCallCount: number;
    toolSignature: string;
  }) => Promise<void> | void;
  onToolBatchResolved?: (params: {
    steps: RuntimeKernelResolvedToolStep<TToolName>[];
    isBatch: boolean;
    remainingToolBudget: number;
    toolStepCount: number;
  }) => Promise<RuntimeKernelToolBatchPlan | void> | RuntimeKernelToolBatchPlan | void;
  onToolStepFinish?: (params: {
    iteration: number;
    step: RuntimeKernelResolvedToolStep<TToolName>;
    toolResult: RuntimeKernelToolExecutionResult;
    toolResultEnvelope: RuntimeKernelToolResultEnvelope<TToolName>;
    toolResultSignature: string;
    madeProgress: boolean;
    repeatedCallCount: number;
    consecutiveFailureCount: number;
    consecutiveNoProgressCount: number;
  }) => Promise<void> | void;
}): Promise<RuntimeKernelResult<TToolName>> {
  const transcript = [...params.messages];
  const steps: RuntimeKernelStepRecord<TToolName>[] = [];
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let toolStepCount = 0;
  let lastToolSignature: string | null = null;
  let lastToolResultSignature: string | null = null;
  let repeatedCallCount = 0;
  let consecutiveFailureCount = 0;
  let consecutiveNoProgressCount = 0;

  type RuntimeKernelTerminalSignal = {
    status: number;
    code: RuntimeKernelFailure<TToolName>["code"];
    stopReason: RuntimeKernelStopReason;
    message: string;
    toolKind?: string | null;
    requiredCredits?: number | null;
  };

  const buildTerminalFailure = (
    signal: RuntimeKernelTerminalSignal,
  ): RuntimeKernelFailure<TToolName> => ({
    ok: false,
    status: signal.status,
    code: signal.code,
    stopReason: signal.stopReason,
    message: signal.message,
    toolKind: signal.toolKind ?? null,
    requiredCredits: signal.requiredCredits ?? null,
    promptTokens,
    completionTokens,
    transcript: [...transcript],
    stepCount: toolStepCount,
    steps: [...steps],
  });

  while (true) {
    const completion = await params.runCompletion(transcript);
    if (completion.ok === false) {
      return toKernelFailure({
        failure: completion,
        transcript,
        steps,
        stepCount: toolStepCount,
        promptTokens,
        completionTokens,
      });
    }

    promptTokens = completion.promptTokens;
    completionTokens = completion.completionTokens;

    const resolvedStep = await resolveLoopStep({
      completion,
      normalizeToolArguments: params.normalizeToolArguments,
    });
    if (isRuntimeKernelFailureInput(resolvedStep)) {
      return toKernelFailure({
        failure: resolvedStep,
        transcript,
        steps,
        stepCount: toolStepCount,
        promptTokens,
        completionTokens,
      });
    }

    if (resolvedStep.kind === "assistant_final") {
      const finalTranscript: NativeToolAwareMessage[] = [
        ...transcript,
        {
          role: "assistant",
          content: resolvedStep.assistantText,
        },
      ];
      return {
        ok: true,
        assistantText: resolvedStep.assistantText,
        promptTokens,
        completionTokens,
        transcript: finalTranscript,
        stepCount: toolStepCount,
        steps: [...steps],
        stopReason: "assistant_final",
      };
    }

    const toolSteps: RuntimeKernelResolvedToolStep<TToolName>[] =
      resolvedStep.kind === "tool_follow_up_batch"
        ? resolvedStep.steps
        : [resolvedStep];
    const remainingToolBudget = Math.max(
      0,
      params.budget.maxToolSteps - toolStepCount,
    );
    const batchPlan = await params.onToolBatchResolved?.({
      steps: toolSteps,
      isBatch: resolvedStep.kind === "tool_follow_up_batch",
      remainingToolBudget,
      toolStepCount,
    });
    const batchExecutionMode =
      batchPlan && typeof batchPlan === "object"
        ? batchPlan.executionMode
        : null;
    const executeBatchInParallel =
      batchExecutionMode === "parallel" && toolSteps.length > 1;
    if (toolSteps.length > remainingToolBudget) {
      const blockedStep =
        toolSteps[Math.min(remainingToolBudget, toolSteps.length - 1)] ??
        toolSteps[0]!;
      const blockedIteration = toolStepCount + remainingToolBudget + 1;
      const blockedToolSignature = buildToolCallSignature({
        toolName: blockedStep.toolName,
        normalizedArgs: blockedStep.normalizedArgs,
      });
      steps.push({
        iteration: blockedIteration,
        providerCallId: blockedStep.providerCallId,
        toolName: blockedStep.toolName,
        rawArguments: blockedStep.rawArguments,
        normalizedArgs: blockedStep.normalizedArgs,
        toolSignature: blockedToolSignature,
        repeatedCallCount:
          blockedToolSignature === lastToolSignature
            ? repeatedCallCount + 1
            : 1,
        blocked: true,
      });
      return {
        ok: false,
        status: 502,
        code: "tool_budget_exhausted",
        stopReason: "tool_budget_exhausted",
        message: `Tool loop exhausted max tool steps (${params.budget.maxToolSteps}).`,
        pendingToolCallId: blockedStep.providerCallId,
        pendingToolName: blockedStep.toolName,
        promptTokens,
        completionTokens,
        transcript: [...transcript],
        stepCount: toolStepCount,
        steps: [...steps],
      };
    }

    let assistantMessageAppended = false;
    let pendingObservationContent: NativeToolInputContentPart[] | null = null;

    const preparedToolSteps: Array<{
      iteration: number;
      step: RuntimeKernelResolvedToolStep<TToolName>;
      toolSignature: string;
      repeatedCallCount: number;
    }> = [];
    let simulatedToolStepCount: number = toolStepCount;
    let simulatedLastToolSignature: string | null = lastToolSignature;
    let simulatedRepeatedCallCount: number = repeatedCallCount;

    for (const toolStep of toolSteps) {
      const iteration = simulatedToolStepCount + 1;
      const toolSignature = buildToolCallSignature({
        toolName: toolStep.toolName,
        normalizedArgs: toolStep.normalizedArgs,
      });
      const nextRepeatedCallCount =
        toolSignature === simulatedLastToolSignature
          ? simulatedRepeatedCallCount + 1
          : 1;

      if (nextRepeatedCallCount > params.budget.maxRepeatedIdenticalCalls) {
        appendComputerUseObservationMessage({
          transcript,
          observationContent: pendingObservationContent,
        });
        steps.push({
          iteration,
          providerCallId: toolStep.providerCallId,
          toolName: toolStep.toolName,
          rawArguments: toolStep.rawArguments,
          normalizedArgs: toolStep.normalizedArgs,
          toolSignature,
          repeatedCallCount: nextRepeatedCallCount,
          blocked: true,
        });
        return {
          ok: false,
          status: 409,
          code: "repeated_call_blocked",
          stopReason: "repeated_call_blocked",
          message:
            "Tool loop blocked a repeated identical tool call because it was not making progress.",
          pendingToolCallId: toolStep.providerCallId,
          pendingToolName: toolStep.toolName,
          promptTokens,
          completionTokens,
          transcript: [...transcript],
          stepCount: toolStepCount,
          steps: [...steps],
        };
      }

      preparedToolSteps.push({
        iteration,
        step: toolStep,
        toolSignature,
        repeatedCallCount: nextRepeatedCallCount,
      });
      simulatedToolStepCount = iteration;
      simulatedLastToolSignature = toolSignature;
      simulatedRepeatedCallCount = nextRepeatedCallCount;
    }

    const executePreparedToolStep = async (prepared: {
      iteration: number;
      step: RuntimeKernelResolvedToolStep<TToolName>;
    }): Promise<RuntimeKernelToolExecutionResult> =>
      params.executeTool({
        iteration: prepared.iteration,
        providerCallId: prepared.step.providerCallId,
        toolName: prepared.step.toolName,
        normalizedArgs: prepared.step.normalizedArgs,
        rawArguments: prepared.step.rawArguments,
      });

    const processPreparedToolResult = async (
      prepared: {
        iteration: number;
        step: RuntimeKernelResolvedToolStep<TToolName>;
        toolSignature: string;
        repeatedCallCount: number;
      },
      toolResult: RuntimeKernelToolExecutionResult,
      options?: {
        recordUserCancelledArtifacts?: boolean;
      },
    ): Promise<RuntimeKernelTerminalSignal | null> => {
      const { iteration, step: toolStep, toolSignature } = prepared;
      repeatedCallCount = prepared.repeatedCallCount;

      const toolResultEnvelope = buildToolResultEnvelope({
        toolName: toolStep.toolName,
        toolResult,
      });
      const toolResultSignature = buildToolResultSignature({
        toolResult,
      });
      const madeProgress =
        toolResult.status === "ok" &&
        (toolSignature !== lastToolSignature ||
          toolResultSignature !== lastToolResultSignature);

      consecutiveFailureCount =
        toolResult.status === "ok" ? 0 : consecutiveFailureCount + 1;
      consecutiveNoProgressCount = madeProgress
        ? 0
        : consecutiveNoProgressCount + 1;

      steps.push({
        iteration,
        providerCallId: toolStep.providerCallId,
        toolName: toolStep.toolName,
        rawArguments: toolStep.rawArguments,
        normalizedArgs: toolStep.normalizedArgs,
        toolSignature,
        repeatedCallCount,
        toolResultStatus: toolResult.status,
        toolResultErrorCode: toolResult.errorCode,
        toolResultSignature,
        madeProgress,
        consecutiveFailureCount,
        consecutiveNoProgressCount,
        outputPreview: summarizeLongText(toolResult.outputText, 320),
      });

      await params.onToolStepFinish?.({
        iteration,
        step: toolStep,
        toolResult,
        toolResultEnvelope,
        toolResultSignature,
        madeProgress,
        repeatedCallCount,
        consecutiveFailureCount,
        consecutiveNoProgressCount,
      });

      const recordUserCancelledArtifacts =
        options?.recordUserCancelledArtifacts === true;
      const shouldAppendTranscript =
        toolResult.errorCode !== "user_cancelled" || recordUserCancelledArtifacts;

      if (shouldAppendTranscript) {
        appendToolResultToTranscript({
          transcript,
          step: toolStep,
          toolResultEnvelope,
          appendAssistantMessage: !assistantMessageAppended,
        });
        assistantMessageAppended = true;
      }

      if (
        Array.isArray(toolResult.observationContent) &&
        toolResult.observationContent.length > 0 &&
        (toolResult.errorCode !== "user_cancelled" || recordUserCancelledArtifacts)
      ) {
        pendingObservationContent = toolResult.observationContent;
      }

      toolStepCount = iteration;
      lastToolSignature = toolSignature;
      lastToolResultSignature = toolResultSignature;

      if (toolResult.errorCode === "user_cancelled") {
        return {
          status: 409,
          code: "user_cancelled",
          stopReason: "user_cancelled",
          message: toolResult.errorMessage || "Run cancelled by user.",
        };
      }

      const toolBalanceTerminalSignal =
        buildToolBalanceTerminalSignal<TToolName>(toolResult);
      if (toolBalanceTerminalSignal) return toolBalanceTerminalSignal;

      if (consecutiveFailureCount >= params.budget.maxConsecutiveFailures) {
        return {
          status: 502,
          code: "consecutive_failures_exhausted",
          stopReason: "consecutive_failures_exhausted",
          message:
            "Tool loop stopped after repeated tool failures without recovery.",
        };
      }

      if (consecutiveNoProgressCount >= params.budget.maxNoProgressSteps) {
        return {
          status: 502,
          code: "no_progress_exhausted",
          stopReason: "no_progress_exhausted",
          message:
            "Tool loop stopped because recent tool steps were not making meaningful progress.",
        };
      }
      return null;
    };

    if (executeBatchInParallel) {
      let terminalSignal: RuntimeKernelTerminalSignal | null = null;
      for (const prepared of preparedToolSteps) {
        await params.onToolStepStart?.({
          iteration: prepared.iteration,
          step: prepared.step,
          repeatedCallCount: prepared.repeatedCallCount,
          toolSignature: prepared.toolSignature,
        });
      }
      const settledResults = await Promise.allSettled(
        preparedToolSteps.map(executePreparedToolStep),
      );
      for (const [index, prepared] of preparedToolSteps.entries()) {
        const settled = settledResults[index];
        const toolResult =
          settled?.status === "fulfilled"
            ? settled.value
            : buildToolExecutionExceptionResult(settled?.reason);
        const terminalFailure = await processPreparedToolResult(
          prepared,
          toolResult,
          { recordUserCancelledArtifacts: true },
        );
        if (!terminalSignal && terminalFailure) {
          terminalSignal = terminalFailure;
        }
      }
      if (terminalSignal) {
        appendComputerUseObservationMessage({
          transcript,
          observationContent: pendingObservationContent,
        });
        return buildTerminalFailure(terminalSignal);
      }
    } else {
      for (const prepared of preparedToolSteps) {
        await params.onToolStepStart?.({
          iteration: prepared.iteration,
          step: prepared.step,
          repeatedCallCount: prepared.repeatedCallCount,
          toolSignature: prepared.toolSignature,
        });
        const toolResult = await executePreparedToolStep(prepared);
        const terminalFailure = await processPreparedToolResult(
          prepared,
          toolResult,
        );
        if (terminalFailure) {
          appendComputerUseObservationMessage({
            transcript,
            observationContent: pendingObservationContent,
          });
          return buildTerminalFailure(terminalFailure);
        }
      }
    }

    appendComputerUseObservationMessage({
      transcript,
      observationContent: pendingObservationContent,
    });
  }
}
