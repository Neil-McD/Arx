import type {
  NativeToolAssistantMessage,
  NativeToolAwareCompletionSuccess,
  NativeToolAwareMessage,
} from "./nativeToolProtocol";

export type NativeToolExecutionResult = {
  status: "ok" | "error";
  exitCode: number | null;
  outputText: string;
  errorCode: string | null;
  errorMessage: string | null;
};

export type NativeToolResultEnvelope<TToolName extends string = string> = {
  tool_name: TToolName;
  success: boolean;
  status: "ok" | "error";
  exit_code: number | null;
  error_code: string | null;
  error_message: string | null;
  output: string;
};

export type NativeToolLoopFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  pendingToolCallId?: string;
  pendingToolName?: string;
};

export type NativeToolLoopSuccess = {
  ok: true;
  assistantText: string;
  promptTokens: number | null;
  completionTokens: number | null;
};

export type NativeToolLoopStep<TToolName extends string = string> =
  | {
      kind: "assistant_final";
      assistantText: string;
      promptTokens: number | null;
      completionTokens: number | null;
    }
  | {
      kind: "tool_follow_up";
      providerCallId: string;
      toolName: TToolName;
      rawArguments: Record<string, unknown>;
      normalizedArgs: Record<string, unknown>;
      assistantToolCallMessage: NativeToolAssistantMessage;
      promptTokens: number | null;
      completionTokens: number | null;
    };

export function buildToolResultEnvelope<TToolName extends string>(params: {
  toolName: TToolName;
  toolResult: NativeToolExecutionResult;
}): NativeToolResultEnvelope<TToolName> {
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
  toolResult: NativeToolExecutionResult;
}): string {
  return JSON.stringify(buildToolResultEnvelope(params));
}

async function resolveLoopStep<TToolName extends string>(params: {
  completion: NativeToolAwareCompletionSuccess<TToolName>;
  normalizeToolArguments: (
    toolName: TToolName,
    rawArgs: Record<string, unknown>,
  ) => Record<string, unknown>;
}): Promise<NativeToolLoopStep<TToolName> | NativeToolLoopFailure> {
  if (params.completion.type === "assistant") {
    const assistantText = params.completion.assistantText.trim();
    if (!assistantText) {
      return {
        ok: false,
        status: 502,
        code: "empty_response",
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

export async function runSerialNativeToolLoop<TToolName extends string>(params: {
  messages: NativeToolAwareMessage[];
  maxIterations: number;
  runCompletion: (
    messages: NativeToolAwareMessage[],
  ) => Promise<NativeToolAwareCompletionSuccess<TToolName> | NativeToolLoopFailure>;
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
  }) => Promise<NativeToolExecutionResult>;
  onToolStepStart?: (params: {
    iteration: number;
    step: Extract<NativeToolLoopStep<TToolName>, { kind: "tool_follow_up" }>;
  }) => Promise<void> | void;
  onToolStepFinish?: (params: {
    iteration: number;
    step: Extract<NativeToolLoopStep<TToolName>, { kind: "tool_follow_up" }>;
    toolResult: NativeToolExecutionResult;
    toolResultEnvelope: NativeToolResultEnvelope<TToolName>;
  }) => Promise<void> | void;
}): Promise<NativeToolLoopSuccess | NativeToolLoopFailure> {
  const transcript = [...params.messages];
  let lastPromptTokens: number | null = null;
  let lastCompletionTokens: number | null = null;

  for (let iteration = 1; iteration <= params.maxIterations; iteration += 1) {
    const completion = await params.runCompletion(transcript);
    if (!completion.ok) return completion;

    lastPromptTokens = completion.promptTokens;
    lastCompletionTokens = completion.completionTokens;

    const step = await resolveLoopStep({
      completion,
      normalizeToolArguments: params.normalizeToolArguments,
    });
    if ("ok" in step && step.ok === false) return step;

    if (step.kind === "assistant_final") {
      return {
        ok: true,
        assistantText: step.assistantText,
        promptTokens: lastPromptTokens,
        completionTokens: lastCompletionTokens,
      };
    }

    await params.onToolStepStart?.({
      iteration,
      step,
    });

    const toolResult = await params.executeTool({
      iteration,
      providerCallId: step.providerCallId,
      toolName: step.toolName,
      normalizedArgs: step.normalizedArgs,
      rawArguments: step.rawArguments,
    });
    const toolResultEnvelope = buildToolResultEnvelope({
      toolName: step.toolName,
      toolResult,
    });

    await params.onToolStepFinish?.({
      iteration,
      step,
      toolResult,
      toolResultEnvelope,
    });

    transcript.push(step.assistantToolCallMessage);
    transcript.push({
      role: "tool",
      tool_call_id: step.providerCallId,
      content: JSON.stringify(toolResultEnvelope),
    });
  }

  return {
    ok: false,
    status: 502,
    code: "run_loop_limit_exceeded",
    message: `Tool loop exceeded max tool iterations (${params.maxIterations}).`,
  };
}
