import type {
  NativeToolAwareCompletionSuccess,
  NativeToolAwareMessage,
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

  const providerCallId = String(params.completion.providerCallId ?? "").trim();
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
      params.completion.toolName,
      params.completion.arguments,
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
      pendingToolName: params.completion.toolName,
    };
  }

  return {
    kind: "tool_follow_up",
    providerCallId,
    toolName: params.completion.toolName,
    rawArguments: params.completion.arguments,
    normalizedArgs,
    assistantToolCallMessage: params.completion.assistantToolCallMessage,
    promptTokens: params.completion.promptTokens,
    completionTokens: params.completion.completionTokens,
  };
}

function appendToolResultToTranscript<TToolName extends string>(params: {
  transcript: NativeToolAwareMessage[];
  step: RuntimeKernelResolvedToolStep<TToolName>;
  toolResultEnvelope: RuntimeKernelToolResultEnvelope<TToolName>;
  toolResult: RuntimeKernelToolExecutionResult;
}): void {
  params.transcript.push(params.step.assistantToolCallMessage);
  params.transcript.push({
    role: "tool",
    tool_call_id: params.step.providerCallId,
    content: JSON.stringify(params.toolResultEnvelope),
  });
  if (
    Array.isArray(params.toolResult.observationContent) &&
    params.toolResult.observationContent.length > 0
  ) {
    for (let index = params.transcript.length - 1; index >= 0; index -= 1) {
      if (isComputerUseObservationMessage(params.transcript[index]!)) {
        params.transcript.splice(index, 1);
        break;
      }
    }
    params.transcript.push({
      role: "user",
      content: params.toolResult.observationContent,
    });
  }
}

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

  while (true) {
    const completion = await params.runCompletion(transcript);
    if (!completion.ok) {
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

    const iteration = toolStepCount + 1;
    const toolSignature = buildToolCallSignature({
      toolName: resolvedStep.toolName,
      normalizedArgs: resolvedStep.normalizedArgs,
    });
    repeatedCallCount =
      toolSignature === lastToolSignature ? repeatedCallCount + 1 : 1;

    if (toolStepCount >= params.budget.maxToolSteps) {
      steps.push({
        iteration,
        providerCallId: resolvedStep.providerCallId,
        toolName: resolvedStep.toolName,
        rawArguments: resolvedStep.rawArguments,
        normalizedArgs: resolvedStep.normalizedArgs,
        toolSignature,
        repeatedCallCount,
        blocked: true,
      });
      return {
        ok: false,
        status: 502,
        code: "tool_budget_exhausted",
        stopReason: "tool_budget_exhausted",
        message: `Tool loop exhausted max tool steps (${params.budget.maxToolSteps}).`,
        pendingToolCallId: resolvedStep.providerCallId,
        pendingToolName: resolvedStep.toolName,
        promptTokens,
        completionTokens,
        transcript: [...transcript],
        stepCount: toolStepCount,
        steps: [...steps],
      };
    }

    if (repeatedCallCount > params.budget.maxRepeatedIdenticalCalls) {
      steps.push({
        iteration,
        providerCallId: resolvedStep.providerCallId,
        toolName: resolvedStep.toolName,
        rawArguments: resolvedStep.rawArguments,
        normalizedArgs: resolvedStep.normalizedArgs,
        toolSignature,
        repeatedCallCount,
        blocked: true,
      });
      return {
        ok: false,
        status: 409,
        code: "repeated_call_blocked",
        stopReason: "repeated_call_blocked",
        message:
          "Tool loop blocked a repeated identical tool call because it was not making progress.",
        pendingToolCallId: resolvedStep.providerCallId,
        pendingToolName: resolvedStep.toolName,
        promptTokens,
        completionTokens,
        transcript: [...transcript],
        stepCount: toolStepCount,
        steps: [...steps],
      };
    }

    await params.onToolStepStart?.({
      iteration,
      step: resolvedStep,
      repeatedCallCount,
      toolSignature,
    });

    const toolResult = await params.executeTool({
      iteration,
      providerCallId: resolvedStep.providerCallId,
      toolName: resolvedStep.toolName,
      normalizedArgs: resolvedStep.normalizedArgs,
      rawArguments: resolvedStep.rawArguments,
    });
    const toolResultEnvelope = buildToolResultEnvelope({
      toolName: resolvedStep.toolName,
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
      providerCallId: resolvedStep.providerCallId,
      toolName: resolvedStep.toolName,
      rawArguments: resolvedStep.rawArguments,
      normalizedArgs: resolvedStep.normalizedArgs,
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
      step: resolvedStep,
      toolResult,
      toolResultEnvelope,
      toolResultSignature,
      madeProgress,
      repeatedCallCount,
      consecutiveFailureCount,
      consecutiveNoProgressCount,
    });

    if (toolResult.errorCode === "user_cancelled") {
      return {
        ok: false,
        status: 409,
        code: "user_cancelled",
        stopReason: "user_cancelled",
        message: toolResult.errorMessage || "Run cancelled by user.",
        promptTokens,
        completionTokens,
        transcript: [...transcript],
        stepCount: iteration,
        steps: [...steps],
      };
    }

    appendToolResultToTranscript({
      transcript,
      step: resolvedStep,
      toolResultEnvelope,
      toolResult,
    });

    toolStepCount = iteration;
    lastToolSignature = toolSignature;
    lastToolResultSignature = toolResultSignature;

    if (
      consecutiveFailureCount >= params.budget.maxConsecutiveFailures
    ) {
      return {
        ok: false,
        status: 502,
        code: "consecutive_failures_exhausted",
        stopReason: "consecutive_failures_exhausted",
        message:
          "Tool loop stopped after repeated tool failures without recovery.",
        promptTokens,
        completionTokens,
        transcript: [...transcript],
        stepCount: toolStepCount,
        steps: [...steps],
      };
    }

    if (consecutiveNoProgressCount >= params.budget.maxNoProgressSteps) {
      return {
        ok: false,
        status: 502,
        code: "no_progress_exhausted",
        stopReason: "no_progress_exhausted",
        message:
          "Tool loop stopped because recent tool steps were not making meaningful progress.",
        promptTokens,
        completionTokens,
        transcript: [...transcript],
        stepCount: toolStepCount,
        steps: [...steps],
      };
    }
  }
}
