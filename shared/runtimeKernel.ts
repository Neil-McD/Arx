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
import {
  CONTEXT_WINDOW_EXCEEDED_CODE,
  CONTEXT_WINDOW_EXCEEDED_MESSAGE,
  estimateNativeToolTranscriptTokens,
  projectProviderContextToBudget,
  type ProviderContextProjection,
} from "./providerContextWindow.ts";
import { sha256RuntimeProviderContext } from "./runtimeProviderContextAttestation.ts";
import {
  planRuntimeInputBudget,
  RUNTIME_INPUT_BUDGET_INVALID_CODE,
  RUNTIME_MODEL_CAPACITY_UNKNOWN_CODE,
  type RuntimeInputBudgetPlan,
  type RuntimeProviderTransport,
} from "./runtimeInputBudget.ts";
import { buildRuntimeToolCallSignature } from "./runtimeToolSignatures.ts";
import {
  advanceRuntimeToolResultState,
  buildRuntimeToolExecutionExceptionResult,
  buildRuntimeToolResultEnvelope,
} from "./runtimeToolResultState.ts";

function summarizeLongText(value: string, limit = 512): string {
  if (value.length <= limit) return value;
  const half = Math.max(32, Math.floor((limit - 5) / 2));
  return `${value.slice(0, half)}...${value.slice(-half)}`;
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
      kind: "tool_follow_up",
      providerCallId,
      toolName: params.toolCall.toolName,
      rawArguments: params.toolCall.arguments,
      normalizedArgs: params.toolCall.arguments,
      argumentError: {
        code: "invalid_tool_arguments",
        message: message || "Provider returned invalid tool arguments.",
      },
      assistantToolCallMessage: params.assistantToolCallMessage,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
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

function removeSerialToolCallsFromLatestAssistantMessage(params: {
  transcript: NativeToolAwareMessage[];
  cancelledProviderCallId: string;
}): void {
  for (let index = params.transcript.length - 1; index >= 0; index -= 1) {
    const message = params.transcript[index]!;
    if (message.role !== "assistant" || !message.tool_calls) continue;
    const cancelledCallIndex = message.tool_calls.findIndex(
      (call) => call.id === params.cancelledProviderCallId,
    );
    if (cancelledCallIndex < 0) continue;
    const remainingToolCalls = message.tool_calls.slice(0, cancelledCallIndex);
    if (remainingToolCalls.length === 0) {
      params.transcript.splice(index, 1);
    } else {
      params.transcript[index] = {
        ...message,
        tool_calls: remainingToolCalls,
      };
    }
    return;
  }
}

export type RuntimeKernelToolBatchPlan = {
  executionMode: "serial" | "parallel";
};

export type RuntimeKernelInputBudgetConfig = {
  transport: RuntimeProviderTransport;
  modelRef: string;
  reservedOutputTokens: number;
  toolSchemas: readonly unknown[];
  recordPlan: (params: {
    sequence: number;
    kind: "initial" | "delta";
    plan: RuntimeInputBudgetPlan;
    delta: {
      estimatedInputTokens: number;
      usableInputTokens: number;
      remainingInputTokens: number;
    } | null;
  }) => Promise<void> | void;
  recordProjection: (params: {
    sequence: number;
    trigger: "preflight_overflow" | "provider_overflow";
    digest: string;
    projection: Omit<ProviderContextProjection, "messages">;
  }) => Promise<void> | void;
};

function sameRuntimeInputBudgetPlan(
  left: RuntimeInputBudgetPlan,
  right: RuntimeInputBudgetPlan,
): boolean {
  return (
    left.profileKey === right.profileKey &&
    left.reservedOutputTokens === right.reservedOutputTokens &&
    left.messageTokens === right.messageTokens &&
    left.toolSchemaTokens === right.toolSchemaTokens &&
    left.imageTokens === right.imageTokens &&
    left.estimatedInputTokens === right.estimatedInputTokens &&
    left.usableInputTokens === right.usableInputTokens &&
    left.remainingInputTokens === right.remainingInputTokens &&
    left.failureCode === right.failureCode
  );
}

export async function runNativeRuntimeKernel<TToolName extends string>(params: {
  messages: NativeToolAwareMessage[];
  budget: RuntimeKernelBudget;
  inputBudget: RuntimeKernelInputBudgetConfig;
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
  let inputBudgetPlanSequence = 0;
  let contextProjectionSequence = 0;
  let previousInputBudgetPlan: RuntimeInputBudgetPlan | null = null;

  type RuntimeKernelTerminalSignal = {
    status: number;
    code: RuntimeKernelFailure<TToolName>["code"];
    stopReason: RuntimeKernelStopReason;
    message: string;
  };

  const buildTerminalFailure = (
    signal: RuntimeKernelTerminalSignal,
  ): RuntimeKernelFailure<TToolName> => ({
    ok: false,
    status: signal.status,
    code: signal.code,
    stopReason: signal.stopReason,
    message: signal.message,
    promptTokens,
    completionTokens,
    transcript: [...transcript],
    stepCount: toolStepCount,
    steps: [...steps],
  });

  const planProviderMessages = async (
    messages: NativeToolAwareMessage[],
  ): Promise<{
    plan: RuntimeInputBudgetPlan | null;
    failure: RuntimeKernelFailureInput | null;
  }> => {
    let plan: RuntimeInputBudgetPlan;
    try {
      plan = planRuntimeInputBudget({
        transport: params.inputBudget.transport,
        modelRef: params.inputBudget.modelRef,
        messages,
        toolSchemas: params.inputBudget.toolSchemas,
        reservedOutputTokens: params.inputBudget.reservedOutputTokens,
      });
    } catch {
      return {
        plan: null,
        failure: {
          ok: false,
          status: 503,
          code: RUNTIME_INPUT_BUDGET_INVALID_CODE,
          stopReason: "model_error",
          message: "The agent could not safely calculate the model input budget.",
        },
      };
    }

    const previousPlan = previousInputBudgetPlan;
    if (!previousPlan || !sameRuntimeInputBudgetPlan(previousPlan, plan)) {
      inputBudgetPlanSequence += 1;
      try {
        await params.inputBudget.recordPlan({
          sequence: inputBudgetPlanSequence,
          kind: previousPlan ? "delta" : "initial",
          plan,
          delta: previousPlan
            ? {
                estimatedInputTokens:
                  plan.estimatedInputTokens - previousPlan.estimatedInputTokens,
                usableInputTokens:
                  plan.usableInputTokens - previousPlan.usableInputTokens,
                remainingInputTokens:
                  plan.remainingInputTokens - previousPlan.remainingInputTokens,
              }
            : null,
        });
      } catch {
        return {
          plan: null,
          failure: {
            ok: false,
            status: 503,
            code: "runtime_input_budget_evidence_unavailable",
            stopReason: "model_error",
            message: "The agent could not record the model input budget safely.",
          },
        };
      }
      previousInputBudgetPlan = plan;
    }

    if (!plan.fits && plan.failureCode !== CONTEXT_WINDOW_EXCEEDED_CODE) {
      return {
        plan,
        failure: {
          ok: false,
          status: 503,
          code:
            plan.failureCode ?? RUNTIME_MODEL_CAPACITY_UNKNOWN_CODE,
          stopReason: "model_error",
          message:
            plan.failureCode === RUNTIME_MODEL_CAPACITY_UNKNOWN_CODE
              ? "The selected provider model does not have a reviewed context capacity."
              : "The selected provider model has an invalid input budget configuration.",
        },
      };
    }

    return {
      plan,
      failure: null,
    };
  };

  const contextOverflowFailure = (): RuntimeKernelFailureInput => ({
    ok: false,
    status: 413,
    code: CONTEXT_WINDOW_EXCEEDED_CODE,
    stopReason: "model_error",
    message: CONTEXT_WINDOW_EXCEEDED_MESSAGE,
  });

  const imageInputTokensForPlan = (
    plan: RuntimeInputBudgetPlan,
  ): number | undefined =>
    plan.imageCount > 0
      ? Math.max(0, Math.floor(plan.imageTokens / plan.imageCount))
      : undefined;

  const recordProjection = async (paramsToRecord: {
    projection: ProviderContextProjection;
    trigger: "preflight_overflow" | "provider_overflow";
  }): Promise<RuntimeKernelFailureInput | null> => {
    contextProjectionSequence += 1;
    try {
      const { messages, ...projectionEvidence } = paramsToRecord.projection;
      await params.inputBudget.recordProjection({
        sequence: contextProjectionSequence,
        trigger: paramsToRecord.trigger,
        digest: await sha256RuntimeProviderContext(messages),
        projection: projectionEvidence,
      });
      return null;
    } catch {
      return {
        ok: false,
        status: 503,
        code: "runtime_context_projection_evidence_unavailable",
        stopReason: "model_error",
        message: "The agent could not record the projected model context safely.",
      };
    }
  };

  // Once the tool budget is spent, ask for an answer from what the tools found
  // instead of ending the turn with nothing to say.
  const runProviderCompletion = async (
    messages: NativeToolAwareMessage[],
  ): Promise<Awaited<ReturnType<RuntimeKernelRunCompletion<TToolName>>>> =>
    await params.runCompletion(
      messages,
      toolStepCount >= params.budget.maxToolSteps ? { toolChoice: "none" } : undefined,
    );

  while (true) {
    let providerMessages = [...transcript];
    let planned = await planProviderMessages(providerMessages);
    if (planned.failure) {
      return toKernelFailure({
        failure: planned.failure,
        transcript,
        steps,
        stepCount: toolStepCount,
        promptTokens,
        completionTokens,
      });
    }
    if (!planned.plan) {
      return buildTerminalFailure({
        status: 503,
        code: RUNTIME_INPUT_BUDGET_INVALID_CODE,
        stopReason: "model_error",
        message: "The agent could not safely calculate the model input budget.",
      });
    }
    if (!planned.plan.fits) {
      const projection = projectProviderContextToBudget({
        messages: transcript,
        targetInputTokens: Math.max(
          0,
          planned.plan.usableInputTokens - planned.plan.toolSchemaTokens,
        ),
        imageInputTokens: imageInputTokensForPlan(planned.plan),
      });
      if (!projection.changed || !projection.fitsTarget) {
        return toKernelFailure({
          failure: contextOverflowFailure(),
          transcript,
          steps,
          stepCount: toolStepCount,
          promptTokens,
          completionTokens,
        });
      }
      const projectionFailure = await recordProjection({
        projection,
        trigger: "preflight_overflow",
      });
      if (projectionFailure) {
        return toKernelFailure({
          failure: projectionFailure,
          transcript,
          steps,
          stepCount: toolStepCount,
          promptTokens,
          completionTokens,
        });
      }
      providerMessages = projection.messages;
      planned = await planProviderMessages(providerMessages);
      if (planned.failure || !planned.plan?.fits) {
        return toKernelFailure({
          failure: planned.failure ?? contextOverflowFailure(),
          transcript,
          steps,
          stepCount: toolStepCount,
          promptTokens,
          completionTokens,
        });
      }
    }

    let completion = await runProviderCompletion(providerMessages);
    if (
      completion.ok === false &&
      completion.code === CONTEXT_WINDOW_EXCEEDED_CODE &&
      planned.plan
    ) {
      const currentProviderTokens = estimateNativeToolTranscriptTokens(
        providerMessages,
        imageInputTokensForPlan(planned.plan),
      );
      const recoveryProjection = projectProviderContextToBudget({
        messages: transcript,
        targetInputTokens: Math.max(0, Math.floor(currentProviderTokens * 0.9)),
        imageInputTokens: imageInputTokensForPlan(planned.plan),
      });
      if (
        recoveryProjection.changed &&
        recoveryProjection.fitsTarget &&
        recoveryProjection.projectedEstimatedTokens <
          currentProviderTokens
      ) {
        const projectionFailure = await recordProjection({
          projection: recoveryProjection,
          trigger: "provider_overflow",
        });
        if (projectionFailure) {
          return toKernelFailure({
            failure: projectionFailure,
            transcript,
            steps,
            stepCount: toolStepCount,
            promptTokens,
            completionTokens,
          });
        }
        const recoveryPlan = await planProviderMessages(
          recoveryProjection.messages,
        );
        if (recoveryPlan.failure) {
          return toKernelFailure({
            failure: recoveryPlan.failure,
            transcript,
            steps,
            stepCount: toolStepCount,
            promptTokens,
            completionTokens,
          });
        }
        if (!recoveryPlan.plan?.fits) {
          return toKernelFailure({
            failure: contextOverflowFailure(),
            transcript,
            steps,
            stepCount: toolStepCount,
            promptTokens,
            completionTokens,
          });
        }
        completion = await runProviderCompletion(recoveryProjection.messages);
      }
    }
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
      const blockedToolSignature = buildRuntimeToolCallSignature({
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
      const toolSignature = buildRuntimeToolCallSignature({
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
    }): Promise<RuntimeKernelToolExecutionResult> => {
      if (prepared.step.argumentError) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: prepared.step.argumentError.code,
          errorMessage: prepared.step.argumentError.message,
        };
      }
      try {
        return await params.executeTool({
          iteration: prepared.iteration,
          providerCallId: prepared.step.providerCallId,
          toolName: prepared.step.toolName,
          normalizedArgs: prepared.step.normalizedArgs,
          rawArguments: prepared.step.rawArguments,
        });
      } catch (error) {
        return buildRuntimeToolExecutionExceptionResult(error);
      }
    };

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

      const toolResultEnvelope = buildRuntimeToolResultEnvelope({
        toolName: toolStep.toolName,
        toolResult,
      });
      const transition = advanceRuntimeToolResultState({
        state: {
          lastToolSignature,
          lastToolResultSignature,
          consecutiveFailureCount,
          consecutiveNoProgressCount,
        },
        toolSignature,
        toolResult,
        budget: params.budget,
      });
      const { toolResultSignature, madeProgress } = transition;
      ({
        lastToolSignature,
        lastToolResultSignature,
        consecutiveFailureCount,
        consecutiveNoProgressCount,
      } = transition.state);

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
      } else if (assistantMessageAppended) {
        removeSerialToolCallsFromLatestAssistantMessage({
          transcript,
          cancelledProviderCallId: toolStep.providerCallId,
        });
      }

      if (
        Array.isArray(toolResult.observationContent) &&
        toolResult.observationContent.length > 0 &&
        (toolResult.errorCode !== "user_cancelled" || recordUserCancelledArtifacts)
      ) {
        pendingObservationContent = toolResult.observationContent;
      }

      toolStepCount = iteration;
      return transition.terminalSignal;
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
            : buildRuntimeToolExecutionExceptionResult(settled?.reason);
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
