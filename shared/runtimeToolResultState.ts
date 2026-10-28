import type {
  RuntimeKernelBudget,
  RuntimeKernelStopReason,
  RuntimeKernelToolExecutionResult,
  RuntimeKernelToolResultEnvelope,
} from "./runtimeKernelTypes.ts";
import { buildRuntimeToolResultSignature } from "./runtimeToolSignatures.ts";

export type RuntimeToolResultState = {
  lastToolSignature: string | null;
  lastToolResultSignature: string | null;
  consecutiveFailureCount: number;
  consecutiveNoProgressCount: number;
};

export type RuntimeToolResultTerminalSignal = {
  status: number;
  code: string;
  stopReason: RuntimeKernelStopReason;
  message: string;
};

export type RuntimeToolResultTransition = {
  toolResultSignature: string;
  madeProgress: boolean;
  state: RuntimeToolResultState;
  terminalSignal: RuntimeToolResultTerminalSignal | null;
};

export function buildRuntimeToolResultEnvelope<
  TToolName extends string,
>(params: {
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

export function buildRuntimeToolExecutionExceptionResult(
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

export function advanceRuntimeToolResultState(params: {
  state: RuntimeToolResultState;
  toolSignature: string;
  toolResult: RuntimeKernelToolExecutionResult;
  budget: Pick<
    RuntimeKernelBudget,
    "maxConsecutiveFailures" | "maxNoProgressSteps"
  >;
}): RuntimeToolResultTransition {
  const toolResultSignature = buildRuntimeToolResultSignature({
    toolResult: params.toolResult,
  });
  const madeProgress =
    params.toolResult.status === "ok" &&
    (params.toolSignature !== params.state.lastToolSignature ||
      toolResultSignature !== params.state.lastToolResultSignature);
  const consecutiveFailureCount =
    params.toolResult.status === "ok"
      ? 0
      : params.state.consecutiveFailureCount + 1;
  const consecutiveNoProgressCount = madeProgress
    ? 0
    : params.state.consecutiveNoProgressCount + 1;
  const state: RuntimeToolResultState = {
    lastToolSignature: params.toolSignature,
    lastToolResultSignature: toolResultSignature,
    consecutiveFailureCount,
    consecutiveNoProgressCount,
  };

  let terminalSignal: RuntimeToolResultTerminalSignal | null = null;
  if (params.toolResult.errorCode === "user_cancelled") {
    terminalSignal = {
      status: 409,
      code: "user_cancelled",
      stopReason: "user_cancelled",
      message: params.toolResult.errorMessage || "Run cancelled by user.",
    };
  } else if (consecutiveFailureCount >= params.budget.maxConsecutiveFailures) {
    terminalSignal = {
      status: 502,
      code: "consecutive_failures_exhausted",
      stopReason: "consecutive_failures_exhausted",
      message:
        "Tool loop stopped after repeated tool failures without recovery.",
    };
  } else if (consecutiveNoProgressCount >= params.budget.maxNoProgressSteps) {
    terminalSignal = {
      status: 502,
      code: "no_progress_exhausted",
      stopReason: "no_progress_exhausted",
      message:
        "Tool loop stopped because recent tool steps were not making meaningful progress.",
    };
  }

  return { toolResultSignature, madeProgress, state, terminalSignal };
}
