import type {
  NativeToolAssistantMessage,
  NativeToolAwareCompletionSuccess,
  NativeToolAwareMessage,
  NativeToolInputContentPart,
} from "./nativeToolProtocol";

export type RuntimeKernelStopReason =
  | "assistant_final"
  | "tool_budget_exhausted"
  | "repeated_call_blocked"
  | "consecutive_failures_exhausted"
  | "no_progress_exhausted"
  | "empty_response"
  | "invalid_model_output"
  | "user_cancelled"
  | "model_error"
  | "tool_error_unrecoverable";

export const RECOVERABLE_RUNTIME_KERNEL_STOP_REASONS: RuntimeKernelStopReason[] = [
  "tool_budget_exhausted",
  "repeated_call_blocked",
  "consecutive_failures_exhausted",
  "no_progress_exhausted",
];

const RECOVERABLE_RUNTIME_KERNEL_STOP_REASON_SET = new Set<string>(
  RECOVERABLE_RUNTIME_KERNEL_STOP_REASONS,
);

export function isRecoverableRuntimeKernelStopReason(value: unknown): boolean {
  return RECOVERABLE_RUNTIME_KERNEL_STOP_REASON_SET.has(
    String(value ?? "").trim(),
  );
}

export type RuntimeKernelBudget = {
  maxToolSteps: number;
  maxRepeatedIdenticalCalls: number;
  maxConsecutiveFailures: number;
  maxNoProgressSteps: number;
};

export const DEFAULT_RUNTIME_KERNEL_BUDGET: RuntimeKernelBudget = {
  maxToolSteps: 50,
  maxRepeatedIdenticalCalls: 2,
  maxConsecutiveFailures: 5,
  maxNoProgressSteps: 5,
};

export type RuntimeKernelToolExecutionResult = {
  status: "ok" | "error";
  exitCode: number | null;
  outputText: string;
  errorCode: string | null;
  errorMessage: string | null;
  details?: Record<string, unknown> | null;
  observationContent?: NativeToolInputContentPart[] | null;
};

export type RuntimeKernelToolResultEnvelope<TToolName extends string = string> = {
  tool_name: TToolName;
  success: boolean;
  status: "ok" | "error";
  exit_code: number | null;
  error_code: string | null;
  error_message: string | null;
  output: string;
};

export type RuntimeKernelFailureInput = {
  ok: false;
  status: number;
  code: string;
  message: string;
  pendingToolCallId?: string;
  pendingToolName?: string;
  stopReason?: RuntimeKernelStopReason;
};

export type RuntimeKernelFinalStep = {
  kind: "assistant_final";
  assistantText: string;
  promptTokens: number | null;
  completionTokens: number | null;
};

export type RuntimeKernelResolvedToolStep<TToolName extends string = string> = {
  kind: "tool_follow_up";
  providerCallId: string;
  toolName: TToolName;
  rawArguments: Record<string, unknown>;
  normalizedArgs: Record<string, unknown>;
  argumentError?: {
    code: "invalid_tool_arguments";
    message: string;
  };
  assistantToolCallMessage: NativeToolAssistantMessage;
  promptTokens: number | null;
  completionTokens: number | null;
};

export type RuntimeKernelResolvedToolBatchStep<TToolName extends string = string> = {
  kind: "tool_follow_up_batch";
  steps: RuntimeKernelResolvedToolStep<TToolName>[];
};

export type RuntimeKernelResolvedStep<TToolName extends string = string> =
  | RuntimeKernelFinalStep
  | RuntimeKernelResolvedToolStep<TToolName>
  | RuntimeKernelResolvedToolBatchStep<TToolName>;

export type RuntimeKernelStepRecord<TToolName extends string = string> = {
  iteration: number;
  providerCallId: string;
  toolName: TToolName;
  rawArguments: Record<string, unknown>;
  normalizedArgs: Record<string, unknown>;
  toolSignature: string;
  repeatedCallCount: number;
  toolResultStatus?: "ok" | "error";
  toolResultErrorCode?: string | null;
  toolResultSignature?: string | null;
  madeProgress?: boolean;
  consecutiveFailureCount?: number;
  consecutiveNoProgressCount?: number;
  outputPreview?: string | null;
  blocked?: boolean;
};

type RuntimeKernelBaseResult<TToolName extends string = string> = {
  promptTokens: number | null;
  completionTokens: number | null;
  transcript: NativeToolAwareMessage[];
  stepCount: number;
  steps: RuntimeKernelStepRecord<TToolName>[];
};

export type RuntimeKernelSuccess<TToolName extends string = string> =
  RuntimeKernelBaseResult<TToolName> & {
    ok: true;
    assistantText: string;
    stopReason: "assistant_final";
  };

export type RuntimeKernelFailure<TToolName extends string = string> =
  RuntimeKernelBaseResult<TToolName> & {
    ok: false;
    status: number;
    code: string;
    stopReason: RuntimeKernelStopReason;
    message: string;
    pendingToolCallId?: string;
    pendingToolName?: string;
  };

export type RuntimeKernelResult<TToolName extends string = string> =
  | RuntimeKernelSuccess<TToolName>
  | RuntimeKernelFailure<TToolName>;

// toolChoice "none" asks for an answer without tools: the kernel sends it once
// the tool budget is spent. A runner that ignores it keeps the old behavior,
// where a further tool call ends the turn as tool_budget_exhausted.
export type RuntimeKernelRunCompletion<TToolName extends string> = (
  messages: NativeToolAwareMessage[],
  options?: { toolChoice?: "none" },
) => Promise<
  NativeToolAwareCompletionSuccess<TToolName> | RuntimeKernelFailureInput
>;
