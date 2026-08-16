import { describe, expect, it } from "vitest";
import {
  buildAssistantToolCallMessage,
  buildAssistantToolCallsMessage,
  findFirstUnadmittedNativeToolCall,
  type NativeToolAwareCompletionSuccess,
  type NativeToolAwareMessage,
} from "../shared/nativeToolProtocol.ts";
import {
  runNativeRuntimeKernel,
  type RuntimeKernelInputBudgetConfig,
} from "../shared/runtimeKernel.ts";
import {
  DEFAULT_RUNTIME_KERNEL_BUDGET,
  type RuntimeKernelBudget,
  type RuntimeKernelToolExecutionResult,
} from "../shared/runtimeKernelTypes.ts";

type TestToolName = "read_one" | "read_two" | "write_one" | "unadmitted";

const baseMessages: NativeToolAwareMessage[] = [
  { role: "system", content: "Inspect only the authorized community." },
  { role: "user", content: "What is happening here?" },
];

const inputBudget: RuntimeKernelInputBudgetConfig = {
  transport: "openai_responses",
  modelRef: "openai/gpt-5.6-sol",
  reservedOutputTokens: 1_600,
  toolSchemas: [],
  recordPlan: () => undefined,
  recordProjection: () => undefined,
};

function budget(
  overrides: Partial<RuntimeKernelBudget> = {},
): RuntimeKernelBudget {
  return { ...DEFAULT_RUNTIME_KERNEL_BUDGET, ...overrides };
}

function assistant(
  text: string,
): NativeToolAwareCompletionSuccess<TestToolName> {
  return {
    ok: true,
    type: "assistant",
    assistantText: text,
    promptTokens: 20,
    completionTokens: 8,
    resolvedModelId: "baseline-model",
  };
}

function toolCall(params: {
  providerCallId: string;
  toolName?: TestToolName;
  arguments?: Record<string, unknown>;
}): NativeToolAwareCompletionSuccess<TestToolName> {
  const toolName = params.toolName ?? "read_one";
  const args = params.arguments ?? { query: "recent activity" };
  return {
    ok: true,
    type: "tool_call",
    providerCallId: params.providerCallId,
    toolName,
    arguments: args,
    assistantToolCallMessage: buildAssistantToolCallMessage({
      content: null,
      providerCallId: params.providerCallId,
      toolName,
      rawArguments: JSON.stringify(args),
    }),
    promptTokens: 10,
    completionTokens: 5,
    resolvedModelId: "baseline-model",
  };
}

function toolBatch(
  calls: Array<{
    providerCallId: string;
    toolName: TestToolName;
    arguments?: Record<string, unknown>;
  }>,
): NativeToolAwareCompletionSuccess<TestToolName> {
  const normalizedCalls = calls.map((call) => ({
    ...call,
    arguments: call.arguments ?? { query: call.providerCallId },
  }));
  return {
    ok: true,
    type: "tool_calls",
    toolCalls: normalizedCalls,
    assistantToolCallMessage: buildAssistantToolCallsMessage({
      content: null,
      toolCalls: normalizedCalls.map((call) => ({
        providerCallId: call.providerCallId,
        toolName: call.toolName,
        rawArguments: JSON.stringify(call.arguments),
      })),
    }),
    promptTokens: 10,
    completionTokens: 5,
    resolvedModelId: "baseline-model",
  };
}

function success(outputText: string): RuntimeKernelToolExecutionResult {
  return {
    status: "ok",
    exitCode: 0,
    outputText,
    errorCode: null,
    errorMessage: null,
  };
}

function failure(
  errorCode = "tool_failed",
  errorMessage = "Tool failed.",
): RuntimeKernelToolExecutionResult {
  return {
    status: "error",
    exitCode: null,
    outputText: "",
    errorCode,
    errorMessage,
  };
}

describe("native runtime kernel behavioral baseline", () => {
  it("preserves durable input and appends the final assistant response", async () => {
    const result = await runNativeRuntimeKernel<TestToolName>({
      messages: baseMessages,
      budget: budget(),
      inputBudget,
      runCompletion: async () => assistant("Two discussions are active."),
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      executeTool: async () => success("unused"),
    });

    expect(result).toMatchObject({
      ok: true,
      assistantText: "Two discussions are active.",
      stopReason: "assistant_final",
      stepCount: 0,
      promptTokens: 20,
      completionTokens: 8,
    });
    expect(result.transcript).toEqual([
      ...baseMessages,
      { role: "assistant", content: "Two discussions are active." },
    ]);
  });

  it("round-trips one normalized tool result through the provider transcript", async () => {
    const requests: NativeToolAwareMessage[][] = [];
    let invocation = 0;
    const result = await runNativeRuntimeKernel<TestToolName>({
      messages: baseMessages,
      budget: budget(),
      inputBudget,
      runCompletion: async (messages) => {
        requests.push(messages);
        invocation += 1;
        if (invocation === 1) {
          return toolCall({ providerCallId: "call-1" });
        }
        const payload = JSON.parse(
          String(
            messages.at(-1)?.role === "tool" ? messages.at(-1)?.content : "",
          ),
        ) as Record<string, unknown>;
        expect(payload).toEqual({
          tool_name: "read_one",
          success: true,
          status: "ok",
          exit_code: 0,
          error_code: null,
          error_message: null,
          output: "Two recent discussions.",
        });
        return assistant("The community has two recent discussions.");
      },
      normalizeToolArguments: (_toolName, rawArgs) => ({
        ...rawArgs,
        normalized: true,
      }),
      executeTool: async ({ normalizedArgs }) => {
        expect(normalizedArgs).toEqual({
          query: "recent activity",
          normalized: true,
        });
        return success("Two recent discussions.");
      },
    });

    expect(result.ok).toBe(true);
    expect(result.stepCount).toBe(1);
    expect(requests).toHaveLength(2);
  });

  it("turns invalid arguments into a tool error without invoking the executor", async () => {
    let providerCalls = 0;
    let executorCalls = 0;
    const result = await runNativeRuntimeKernel<TestToolName>({
      messages: baseMessages,
      budget: budget(),
      inputBudget,
      runCompletion: async (messages) => {
        providerCalls += 1;
        if (providerCalls === 1) {
          return toolCall({ providerCallId: "invalid-1" });
        }
        const lastMessage = messages.at(-1);
        expect(lastMessage?.role).toBe("tool");
        expect(JSON.parse(String(lastMessage?.content))).toMatchObject({
          success: false,
          error_code: "invalid_tool_arguments",
          error_message: "query must be a string",
        });
        return assistant("I could not run that malformed request.");
      },
      normalizeToolArguments: () => {
        throw new Error("query must be a string");
      },
      executeTool: async () => {
        executorCalls += 1;
        return success("must not run");
      },
    });

    expect(result.ok).toBe(true);
    expect(executorCalls).toBe(0);
    expect(result.steps[0]).toMatchObject({
      toolResultStatus: "error",
      toolResultErrorCode: "invalid_tool_arguments",
    });
  });

  it("blocks an over-budget batch before executing any member of it", async () => {
    let executorCalls = 0;
    const result = await runNativeRuntimeKernel<TestToolName>({
      messages: baseMessages,
      budget: budget({ maxToolSteps: 1 }),
      inputBudget,
      runCompletion: async () =>
        toolBatch([
          { providerCallId: "batch-1", toolName: "read_one" },
          { providerCallId: "batch-2", toolName: "read_two" },
        ]),
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      executeTool: async () => {
        executorCalls += 1;
        return success("must not run");
      },
    });

    expect(result).toMatchObject({
      ok: false,
      code: "tool_budget_exhausted",
      stopReason: "tool_budget_exhausted",
      pendingToolCallId: "batch-2",
      stepCount: 0,
    });
    expect(executorCalls).toBe(0);
    expect(result.transcript).toEqual(baseMessages);
  });

  it("blocks a repeated identical call before executing it twice", async () => {
    let providerCalls = 0;
    let executorCalls = 0;
    const result = await runNativeRuntimeKernel<TestToolName>({
      messages: baseMessages,
      budget: budget({
        maxRepeatedIdenticalCalls: 1,
        maxNoProgressSteps: 10,
      }),
      inputBudget,
      runCompletion: async () => {
        providerCalls += 1;
        return toolCall({ providerCallId: `repeat-${providerCalls}` });
      },
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      executeTool: async () => {
        executorCalls += 1;
        return success("same result");
      },
    });

    expect(result).toMatchObject({
      ok: false,
      code: "repeated_call_blocked",
      stopReason: "repeated_call_blocked",
      pendingToolCallId: "repeat-2",
      stepCount: 1,
    });
    expect(executorCalls).toBe(1);
  });

  it("stops at the configured consecutive failure bound", async () => {
    const result = await runNativeRuntimeKernel<TestToolName>({
      messages: baseMessages,
      budget: budget({ maxConsecutiveFailures: 1 }),
      inputBudget,
      runCompletion: async () => toolCall({ providerCallId: "failure-1" }),
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      executeTool: async () => failure(),
    });

    expect(result).toMatchObject({
      ok: false,
      code: "consecutive_failures_exhausted",
      stopReason: "consecutive_failures_exhausted",
      stepCount: 1,
    });
  });

  it("stops after a configured number of successful but stagnant steps", async () => {
    let providerCalls = 0;
    const result = await runNativeRuntimeKernel<TestToolName>({
      messages: baseMessages,
      budget: budget({
        maxRepeatedIdenticalCalls: 10,
        maxNoProgressSteps: 1,
      }),
      inputBudget,
      runCompletion: async () => {
        providerCalls += 1;
        return toolCall({ providerCallId: `stagnant-${providerCalls}` });
      },
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      executeTool: async () => success("unchanged"),
    });

    expect(result).toMatchObject({
      ok: false,
      code: "no_progress_exhausted",
      stopReason: "no_progress_exhausted",
      stepCount: 2,
    });
    expect(result.steps.at(-1)).toMatchObject({
      madeProgress: false,
      consecutiveNoProgressCount: 1,
    });
  });

  it("maps provider cancellation to the canonical terminal reason", async () => {
    const result = await runNativeRuntimeKernel<TestToolName>({
      messages: baseMessages,
      budget: budget(),
      inputBudget,
      runCompletion: async () => ({
        ok: false,
        status: 409,
        code: "user_cancelled",
        message: "Run cancelled by user.",
      }),
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      executeTool: async () => success("unused"),
    });

    expect(result).toMatchObject({
      ok: false,
      code: "user_cancelled",
      stopReason: "user_cancelled",
      stepCount: 0,
    });
  });

  it("maps tool cancellation without appending misleading tool artifacts", async () => {
    const result = await runNativeRuntimeKernel<TestToolName>({
      messages: baseMessages,
      budget: budget(),
      inputBudget,
      runCompletion: async () => toolCall({ providerCallId: "cancel-1" }),
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      executeTool: async () =>
        failure("user_cancelled", "Run cancelled by user."),
    });

    expect(result).toMatchObject({
      ok: false,
      code: "user_cancelled",
      stopReason: "user_cancelled",
      stepCount: 1,
    });
    expect(result.transcript).toEqual(baseMessages);
  });

  it("executes admitted parallel batches concurrently and records results in source order", async () => {
    let providerCalls = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    let started = 0;
    let release!: () => void;
    const bothStarted = new Promise<void>((resolve) => {
      release = resolve;
    });

    const result = await runNativeRuntimeKernel<TestToolName>({
      messages: baseMessages,
      budget: budget(),
      inputBudget,
      runCompletion: async (messages) => {
        providerCalls += 1;
        if (providerCalls === 1) {
          return toolBatch([
            { providerCallId: "parallel-1", toolName: "read_one" },
            { providerCallId: "parallel-2", toolName: "read_two" },
          ]);
        }
        expect(
          messages
            .filter((message) => message.role === "tool")
            .map((message) => message.tool_call_id),
        ).toEqual(["parallel-1", "parallel-2"]);
        return assistant("Parallel reads complete.");
      },
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      executeTool: async ({ providerCallId }) => {
        started += 1;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        if (started === 2) release();
        await bothStarted;
        inFlight -= 1;
        return success(providerCallId);
      },
      onToolBatchResolved: () => ({ executionMode: "parallel" }),
    });

    expect(result.ok).toBe(true);
    expect(result.stepCount).toBe(2);
    expect(maxInFlight).toBe(2);
  });

  it("keeps serial batch execution and transcript order deterministic", async () => {
    let providerCalls = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    const executionOrder: string[] = [];
    const result = await runNativeRuntimeKernel<TestToolName>({
      messages: baseMessages,
      budget: budget(),
      inputBudget,
      runCompletion: async (messages) => {
        providerCalls += 1;
        if (providerCalls === 1) {
          return toolBatch([
            { providerCallId: "serial-1", toolName: "write_one" },
            { providerCallId: "serial-2", toolName: "read_one" },
          ]);
        }
        expect(
          messages
            .filter((message) => message.role === "tool")
            .map((message) => message.tool_call_id),
        ).toEqual(["serial-1", "serial-2"]);
        return assistant("Serial tools complete.");
      },
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      executeTool: async ({ providerCallId }) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        executionOrder.push(providerCallId);
        inFlight -= 1;
        return success(providerCallId);
      },
      onToolBatchResolved: () => ({ executionMode: "serial" }),
    });

    expect(result.ok).toBe(true);
    expect(executionOrder).toEqual(["serial-1", "serial-2"]);
    expect(maxInFlight).toBe(1);
  });

  it("rejects empty assistant responses and malformed tool batches", async () => {
    const emptyAssistant = await runNativeRuntimeKernel<TestToolName>({
      messages: baseMessages,
      budget: budget(),
      inputBudget,
      runCompletion: async () => assistant("   "),
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      executeTool: async () => success("unused"),
    });
    const emptyBatch = await runNativeRuntimeKernel<TestToolName>({
      messages: baseMessages,
      budget: budget(),
      inputBudget,
      runCompletion: async () => toolBatch([]),
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      executeTool: async () => success("unused"),
    });
    const duplicateIds = await runNativeRuntimeKernel<TestToolName>({
      messages: baseMessages,
      budget: budget(),
      inputBudget,
      runCompletion: async () =>
        toolBatch([
          { providerCallId: "duplicate", toolName: "read_one" },
          { providerCallId: "duplicate", toolName: "read_two" },
        ]),
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      executeTool: async () => success("unused"),
    });

    expect(emptyAssistant).toMatchObject({
      ok: false,
      code: "empty_response",
      stopReason: "empty_response",
    });
    expect(emptyBatch).toMatchObject({
      ok: false,
      code: "invalid_model_output",
      stopReason: "invalid_model_output",
    });
    expect(duplicateIds).toMatchObject({
      ok: false,
      code: "invalid_model_output",
      stopReason: "invalid_model_output",
      pendingToolCallId: "duplicate",
    });
  });

  it("identifies the first provider tool outside the server-admitted set", () => {
    const completion = toolBatch([
      { providerCallId: "allowed-1", toolName: "read_one" },
      { providerCallId: "blocked-1", toolName: "unadmitted" },
      { providerCallId: "allowed-2", toolName: "read_two" },
    ]);

    expect(
      findFirstUnadmittedNativeToolCall({
        completion,
        admittedToolNames: ["read_one", "read_two"],
      }),
    ).toMatchObject({
      providerCallId: "blocked-1",
      toolName: "unadmitted",
    });
    expect(
      findFirstUnadmittedNativeToolCall({
        completion,
        admittedToolNames: ["read_one", "read_two", "unadmitted"],
      }),
    ).toBeNull();
  });
});
