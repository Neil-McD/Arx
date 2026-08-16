import { describe, expect, it } from "vitest";
import {
  buildAssistantToolCallMessage,
  buildAssistantToolCallsMessage,
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
  type RuntimeKernelToolResultEnvelope,
} from "../shared/runtimeKernelTypes.ts";
import {
  runPiAgentCoreAdmissionProbe,
  type PiResultFixture,
  type PiResultFixtureCall,
} from "./support/piAgentCoreAdmissionProbe.ts";

type ToolName = "polynet_read_one" | "polynet_read_two";
type ParityScenario =
  | "admitted_tool"
  | "tool_failure"
  | "failure_then_success"
  | "consecutive_failures"
  | "no_progress"
  | "changed_result"
  | "parallel_mixed_results"
  | "tool_cancelled_serial"
  | "tool_cancelled_parallel"
  | "executor_exception";

type ComparableResultStep = {
  toolCallId: string;
  toolName: string;
  envelope: RuntimeKernelToolResultEnvelope;
  toolResultSignature: string;
  madeProgress: boolean;
  consecutiveFailureCount: number;
  consecutiveNoProgressCount: number;
};

const baseMessages: NativeToolAwareMessage[] = [
  {
    role: "system",
    content: "Inspect only the server-authorized Polynet community.",
  },
  { role: "user", content: "What is happening in this community?" },
];

const inputBudget: RuntimeKernelInputBudgetConfig = {
  transport: "openai_responses",
  modelRef: "openai/gpt-5.6-sol",
  reservedOutputTokens: 1_600,
  toolSchemas: [],
  recordPlan: () => undefined,
  recordProjection: () => undefined,
};

function budgetForScenario(scenario: ParityScenario): RuntimeKernelBudget {
  return {
    ...DEFAULT_RUNTIME_KERNEL_BUDGET,
    maxRepeatedIdenticalCalls:
      scenario === "no_progress" || scenario === "changed_result" ? 10 : 2,
    maxConsecutiveFailures:
      scenario === "consecutive_failures"
        ? 2
        : scenario === "executor_exception"
          ? 1
          : 5,
    maxNoProgressSteps: scenario === "no_progress" ? 1 : 5,
  };
}

function assistant(text: string): NativeToolAwareCompletionSuccess<ToolName> {
  return {
    ok: true,
    type: "assistant",
    assistantText: text,
    promptTokens: 20,
    completionTokens: 8,
    resolvedModelId: "parity-model",
  };
}

function toolCall(params: {
  id: string;
  toolName?: ToolName;
  query: string;
}): NativeToolAwareCompletionSuccess<ToolName> {
  const toolName = params.toolName ?? "polynet_read_one";
  const args = { query: params.query };
  return {
    ok: true,
    type: "tool_call",
    providerCallId: params.id,
    toolName,
    arguments: args,
    assistantToolCallMessage: buildAssistantToolCallMessage({
      content: null,
      providerCallId: params.id,
      toolName,
      rawArguments: JSON.stringify(args),
    }),
    promptTokens: 10,
    completionTokens: 5,
    resolvedModelId: "parity-model",
  };
}

function toolBatch(
  calls: Array<{ id: string; toolName: ToolName; query: string }>,
): NativeToolAwareCompletionSuccess<ToolName> {
  return {
    ok: true,
    type: "tool_calls",
    toolCalls: calls.map((call) => ({
      providerCallId: call.id,
      toolName: call.toolName,
      arguments: { query: call.query },
    })),
    assistantToolCallMessage: buildAssistantToolCallsMessage({
      content: null,
      toolCalls: calls.map((call) => ({
        providerCallId: call.id,
        toolName: call.toolName,
        rawArguments: JSON.stringify({ query: call.query }),
      })),
    }),
    promptTokens: 10,
    completionTokens: 5,
    resolvedModelId: "parity-model",
  };
}

function nextCompletion(
  scenario: ParityScenario,
  providerCall: number,
): NativeToolAwareCompletionSuccess<ToolName> {
  if (scenario === "failure_then_success") {
    if (providerCall === 1)
      return toolCall({ id: "failure-1", query: "failure-1" });
    if (providerCall === 2)
      return toolCall({ id: "success-2", query: "success-2" });
  }
  if (scenario === "consecutive_failures" && providerCall <= 2) {
    return toolCall({
      id: `consecutive-${providerCall}`,
      query: `consecutive-${providerCall}`,
    });
  }
  if (scenario === "no_progress" && providerCall <= 2) {
    return toolCall({ id: `stagnant-${providerCall}`, query: "same" });
  }
  if (scenario === "changed_result" && providerCall <= 2) {
    return toolCall({ id: `changed-${providerCall}`, query: "same" });
  }
  if (providerCall > 1) return assistant("Pi admission probe complete.");
  if (scenario === "parallel_mixed_results") {
    return toolBatch([
      {
        id: "parallel-slow-success",
        toolName: "polynet_read_one",
        query: "slow",
      },
      {
        id: "parallel-error",
        toolName: "polynet_read_two",
        query: "error",
      },
    ]);
  }
  if (scenario === "tool_cancelled_parallel") {
    return toolBatch([
      {
        id: "parallel-cancelled",
        toolName: "polynet_read_one",
        query: "cancel",
      },
      {
        id: "parallel-success",
        toolName: "polynet_read_two",
        query: "success",
      },
    ]);
  }
  const id =
    scenario === "admitted_tool"
      ? "admitted-1"
      : scenario === "tool_failure"
        ? "failure-1"
        : scenario === "tool_cancelled_serial"
          ? "serial-cancelled"
          : "exception-1";
  return toolCall({
    id,
    query: scenario === "admitted_tool" ? "recent activity" : "one",
  });
}

function canonicalResult(params: {
  id: string;
  query: string;
}): RuntimeKernelToolExecutionResult {
  if (params.id === "exception-1") {
    throw new Error("unexpected executor failure");
  }
  if (
    params.id.startsWith("failure-") ||
    params.id.startsWith("consecutive-") ||
    params.id === "parallel-error"
  ) {
    return {
      status: "error",
      exitCode: null,
      outputText: "",
      errorCode: "tool_failed",
      errorMessage: "Tool failed.",
      details: { authority: "closed_probe_registry" },
    };
  }
  if (params.id.includes("cancelled")) {
    return {
      status: "error",
      exitCode: null,
      outputText: "",
      errorCode: "user_cancelled",
      errorMessage: "Run cancelled by user.",
      details: { authority: "closed_probe_registry" },
    };
  }
  const outputText = params.id.startsWith("changed-")
    ? params.id === "changed-1"
      ? "result-a"
      : "result-b"
    : params.id.startsWith("stagnant-")
      ? "unchanged"
      : `result:${params.query}`;
  return {
    status: "ok",
    exitCode: 0,
    outputText,
    errorCode: null,
    errorMessage: null,
    details: { authority: "closed_probe_registry" },
  };
}

function fixtureCall(params: {
  id: string;
  query: string;
  name?: ToolName;
  waitForCallId?: string;
  abort?: boolean;
  forgeTransport?: boolean;
}): PiResultFixtureCall {
  let result: RuntimeKernelToolExecutionResult | undefined;
  let throwMessage: string | undefined;
  try {
    result = canonicalResult(params);
  } catch (error) {
    throwMessage = error instanceof Error ? error.message : String(error);
  }
  return {
    ...params,
    result,
    throwMessage,
  };
}

function fixtureForScenario(scenario: ParityScenario): PiResultFixture {
  const batches: PiResultFixtureCall[][] = [];
  for (let providerCall = 1; providerCall <= 2; providerCall += 1) {
    const completion = nextCompletion(scenario, providerCall);
    if (completion.type === "assistant") break;
    const calls =
      completion.type === "tool_calls"
        ? completion.toolCalls.map((call) => ({
            id: call.providerCallId,
            name: call.toolName,
            query: String(call.arguments.query ?? ""),
          }))
        : [
            {
              id: completion.providerCallId,
              name: completion.toolName,
              query: String(completion.arguments.query ?? ""),
            },
          ];
    batches.push(
      calls.map((call) =>
        fixtureCall({
          ...call,
          abort: call.id.includes("cancelled"),
          waitForCallId:
            call.id === "parallel-slow-success" ? "parallel-error" : undefined,
        }),
      ),
    );
  }
  return {
    batches,
    executionMode:
      scenario === "parallel_mixed_results" ||
      scenario === "tool_cancelled_parallel"
        ? "parallel"
        : "sequential",
    maxRepeatedIdenticalCalls:
      scenario === "no_progress" || scenario === "changed_result" ? 10 : 2,
    maxConsecutiveFailures:
      scenario === "consecutive_failures"
        ? 2
        : scenario === "executor_exception"
          ? 1
          : 5,
    maxNoProgressSteps: scenario === "no_progress" ? 1 : 5,
  };
}

async function runNativeParityScenario(scenario: ParityScenario) {
  let providerCalls = 0;
  let releaseSlowResult: (() => void) | null = null;
  const slowResultReleased = new Promise<void>((resolve) => {
    releaseSlowResult = resolve;
  });
  const envelopes = new Map<string, RuntimeKernelToolResultEnvelope>();

  const result = await runNativeRuntimeKernel<ToolName>({
    messages: baseMessages,
    budget: budgetForScenario(scenario),
    inputBudget,
    runCompletion: async () => {
      providerCalls += 1;
      return nextCompletion(scenario, providerCalls);
    },
    normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
    executeTool: async ({ providerCallId, normalizedArgs }) => {
      if (providerCallId === "parallel-slow-success") {
        await slowResultReleased;
      }
      if (providerCallId === "parallel-error") releaseSlowResult?.();
      return canonicalResult({
        id: providerCallId,
        query: String(normalizedArgs.query ?? ""),
      });
    },
    onToolBatchResolved: ({ isBatch }) =>
      isBatch ? { executionMode: "parallel" } : { executionMode: "serial" },
    onToolStepFinish: ({ step, toolResultEnvelope }) => {
      envelopes.set(step.providerCallId, toolResultEnvelope);
    },
  });

  const resultSteps: ComparableResultStep[] = result.steps
    .filter((step) => step.toolResultSignature)
    .map((step) => ({
      toolCallId: step.providerCallId,
      toolName: step.toolName,
      envelope: envelopes.get(step.providerCallId)!,
      toolResultSignature: step.toolResultSignature!,
      madeProgress: step.madeProgress!,
      consecutiveFailureCount: step.consecutiveFailureCount!,
      consecutiveNoProgressCount: step.consecutiveNoProgressCount!,
    }));
  const projectedToolResultIds = result.transcript
    .filter((message) => message.role === "tool")
    .map((message) => message.tool_call_id);

  return { providerCalls, result, resultSteps, projectedToolResultIds };
}

async function expectParity(scenario: ParityScenario) {
  const [native, pi] = await Promise.all([
    runNativeParityScenario(scenario),
    runPiAgentCoreAdmissionProbe("admitted_tool", fixtureForScenario(scenario)),
  ]);
  expect(pi.resultSteps).toEqual(native.resultSteps);
  expect(pi.providerCalls).toBe(native.providerCalls);
  expect(pi.terminalSignal?.code ?? null).toBe(
    native.result.ok ? null : native.result.code,
  );
  expect(pi.terminalSignal?.stopReason ?? null).toBe(
    native.result.ok ? null : native.result.stopReason,
  );
  expect(pi.projectedToolResultIds).toEqual(native.projectedToolResultIds);
  return { native, pi };
}

describe("Pi canonical tool-result state parity", () => {
  it("matches success, failure, and recovery transitions exactly", async () => {
    await expectParity("admitted_tool");
    await expectParity("tool_failure");
    const { pi } = await expectParity("failure_then_success");
    expect(pi.resultSteps.map((step) => step.consecutiveFailureCount)).toEqual([
      1, 0,
    ]);
  });

  it("matches consecutive-failure and no-progress terminal policy", async () => {
    const failure = await expectParity("consecutive_failures");
    expect(failure.pi.providerCalls).toBe(2);
    expect(failure.pi.terminalSignal?.code).toBe(
      "consecutive_failures_exhausted",
    );

    const stagnant = await expectParity("no_progress");
    expect(stagnant.pi.providerCalls).toBe(2);
    expect(stagnant.pi.resultSteps.map((step) => step.madeProgress)).toEqual([
      true,
      false,
    ]);
    expect(stagnant.pi.terminalSignal?.code).toBe("no_progress_exhausted");
  });

  it("treats a changed canonical result as progress", async () => {
    const { pi } = await expectParity("changed_result");
    expect(pi.resultSteps.map((step) => step.madeProgress)).toEqual([
      true,
      true,
    ]);
    expect(pi.terminalSignal).toBeNull();
  });

  it("records an inverted parallel completion in source order", async () => {
    const { pi } = await expectParity("parallel_mixed_results");
    expect(pi.admittedToolFinishes.map((entry) => entry.toolCallId)).toEqual([
      "parallel-error",
      "parallel-slow-success",
    ]);
    expect(pi.resultSteps.map((step) => step.toolCallId)).toEqual([
      "parallel-slow-success",
      "parallel-error",
    ]);
  });

  it("matches serial and parallel cancellation transcript semantics", async () => {
    const serial = await expectParity("tool_cancelled_serial");
    expect(serial.pi.providerCalls).toBe(1);
    expect(serial.pi.projectedToolResultIds).toEqual([]);
    expect(serial.pi.projectedAssistantToolCallIds).toEqual([]);

    const parallel = await expectParity("tool_cancelled_parallel");
    expect(parallel.pi.providerCalls).toBe(1);
    expect(parallel.pi.projectedToolResultIds).toEqual([
      "parallel-cancelled",
      "parallel-success",
    ]);
    expect(parallel.pi.projectedAssistantToolCallIds).toEqual([
      "parallel-cancelled",
      "parallel-success",
    ]);
  });

  it("canonicalizes unexpected serial executor exceptions in both runtimes", async () => {
    const { pi } = await expectParity("executor_exception");
    expect(pi.providerCalls).toBe(1);
    expect(pi.resultSteps[0]).toMatchObject({
      envelope: {
        success: false,
        error_code: "tool_execution_exception",
        error_message: "unexpected executor failure",
      },
    });
  });

  it("does not let Pi transport content forge the canonical result", async () => {
    const result = await runPiAgentCoreAdmissionProbe("admitted_tool", {
      batches: [
        [
          fixtureCall({
            id: "forged-1",
            query: "one",
            forgeTransport: true,
          }),
        ],
      ],
      executionMode: "sequential",
    });
    expect(result.returnedToolResults).toHaveLength(1);
    expect(JSON.parse(result.returnedToolResults[0]!.text)).toEqual(
      result.resultSteps[0]!.envelope,
    );
    expect(result.returnedToolResults[0]!.text).not.toContain("forged");
  });

  it("projects Pi argument-validation failures through the canonical envelope", async () => {
    const result = await runPiAgentCoreAdmissionProbe("invalid_arguments");
    expect(result.resultSteps[0]).toMatchObject({
      envelope: {
        success: false,
        status: "error",
        error_code: "invalid_tool_arguments",
        error_message: "query must be a string",
      },
      madeProgress: false,
      consecutiveFailureCount: 1,
    });
    expect(JSON.parse(result.returnedToolResults[0]!.text)).toEqual(
      result.resultSteps[0]!.envelope,
    );
    expect(JSON.parse(result.observedToolResults[0]!.text)).toEqual(
      result.resultSteps[0]!.envelope,
    );
  });
});
