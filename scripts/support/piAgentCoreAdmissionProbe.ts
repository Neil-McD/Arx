import {
  runAgentLoop,
  type AgentContext,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
  type StreamFn,
} from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import {
  DEFAULT_RUNTIME_KERNEL_BUDGET,
  type RuntimeKernelToolExecutionResult,
  type RuntimeKernelToolResultEnvelope,
} from "../../shared/runtimeKernelTypes.ts";
import {
  advanceRuntimeToolResultState,
  buildRuntimeToolExecutionExceptionResult,
  buildRuntimeToolResultContent,
  buildRuntimeToolResultEnvelope,
  INITIAL_RUNTIME_TOOL_RESULT_STATE,
  type RuntimeToolResultState,
  type RuntimeToolResultTerminalSignal,
} from "../../shared/runtimeToolResultState.ts";
import { buildRuntimeToolCallSignature } from "../../shared/runtimeToolSignatures.ts";

export type PiAdmissionScenario =
  | "assistant_final"
  | "admitted_tool"
  | "unknown_tool"
  | "invalid_arguments"
  | "aborted"
  | "serial_batch"
  | "parallel_batch"
  | "over_budget_batch"
  | "repeated_batch"
  | "repeated_across_turns"
  | "inactive_before_admission"
  | "inactive_between_preflight_and_start"
  | "mixed_valid_invalid_batch"
  | "mixed_unknown_batch"
  | "duplicate_call_ids";

export type PiResultFixtureCall = {
  id: string;
  name?: (typeof ADMITTED_TOOL_NAMES)[number];
  query: string;
  result?: RuntimeKernelToolExecutionResult;
  throwMessage?: string;
  abort?: boolean;
  waitForCallId?: string;
  forgeTransport?: boolean;
};

export type PiResultFixture = {
  batches: PiResultFixtureCall[][];
  executionMode?: "sequential" | "parallel";
  maxRepeatedIdenticalCalls?: number;
  maxConsecutiveFailures?: number;
  maxNoProgressSteps?: number;
};

type PiAssistantMessage = Extract<AgentMessage, { role: "assistant" }>;
type PiToolResultMessage = Extract<AgentMessage, { role: "toolResult" }>;
type PiModel = Parameters<StreamFn>[0];
type PiProviderContext = Parameters<StreamFn>[1];
type PiAssistantStream = Awaited<ReturnType<StreamFn>>;
type PiAssistantStreamEvent = PiAssistantStream extends AsyncIterable<infer T>
  ? T
  : never;

const SYSTEM_PROMPT = "Inspect only the server-authorized Polynet community.";
const ADMITTED_TOOL_NAMES = ["polynet_read_one", "polynet_read_two"] as const;
const UNKNOWN_TOOL_NAME = "polynet_unadmitted_write";

const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
};

const PROBE_MODEL = {
  id: "polynet-pi-admission-probe",
  name: "Polynet Pi admission probe",
  api: "openai-responses",
  provider: "openai",
  baseUrl: "https://invalid.local",
  reasoning: false,
  input: ["text"],
  cost: ZERO_USAGE.cost,
  contextWindow: 16_384,
  maxTokens: 1_024,
} as PiModel;

const QUERY_PARAMETERS = Type.Object(
  {
    query: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

class DeterministicAssistantStream
  implements AsyncIterable<PiAssistantStreamEvent>
{
  constructor(
    private readonly events: PiAssistantStreamEvent[],
    private readonly finalMessage: PiAssistantMessage,
  ) {}

  async *[Symbol.asyncIterator](): AsyncIterator<PiAssistantStreamEvent> {
    for (const event of this.events) yield event;
  }

  async result(): Promise<PiAssistantMessage> {
    return this.finalMessage;
  }
}

function assistantMessage(params: {
  content: PiAssistantMessage["content"];
  stopReason: PiAssistantMessage["stopReason"];
  errorMessage?: string;
}): PiAssistantMessage {
  return {
    role: "assistant",
    content: params.content,
    api: PROBE_MODEL.api,
    provider: PROBE_MODEL.provider,
    model: PROBE_MODEL.id,
    usage: ZERO_USAGE,
    stopReason: params.stopReason,
    ...(params.errorMessage ? { errorMessage: params.errorMessage } : null),
    timestamp: 0,
  };
}

function completedStream(message: PiAssistantMessage): PiAssistantStream {
  const terminalEvent: PiAssistantStreamEvent =
    message.stopReason === "error" || message.stopReason === "aborted"
      ? ({ type: "error", reason: message.stopReason, error: message } as PiAssistantStreamEvent)
      : ({ type: "done", reason: message.stopReason, message } as PiAssistantStreamEvent);
  return new DeterministicAssistantStream(
    [
      { type: "start", partial: message } as PiAssistantStreamEvent,
      terminalEvent,
    ],
    message,
  ) as unknown as PiAssistantStream;
}

function toolCallMessage(
  calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
): PiAssistantMessage {
  return assistantMessage({
    content: calls.map((call) => ({ type: "toolCall", ...call })),
    stopReason: "toolUse",
  });
}

function textMessage(text: string): PiAssistantMessage {
  return assistantMessage({
    content: [{ type: "text", text }],
    stopReason: "stop",
  });
}

function extractAssistantText(messages: AgentMessage[]): string {
  const message = [...messages]
    .reverse()
    .find((candidate): candidate is PiAssistantMessage => candidate.role === "assistant");
  if (!message) return "";
  return message.content
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function toolResults(context: PiProviderContext): PiToolResultMessage[] {
  return context.messages.filter(
    (message): message is PiToolResultMessage => message.role === "toolResult",
  );
}

function projectCanonicalToolResults(
  messages: AgentMessage[],
  canonicalResults: ReadonlyMap<string, RuntimeKernelToolExecutionResult>,
): AgentMessage[] {
  return messages.map((message) => {
    if (message.role !== "toolResult") return message;
    const toolResult = canonicalResults.get(message.toolCallId);
    if (!toolResult) return message;
    return {
      ...message,
      content: [
        {
          type: "text",
          text: buildRuntimeToolResultContent({
            toolName: message.toolName,
            toolResult,
          }),
        },
      ],
      details: { canonicalToolResult: toolResult },
      isError: toolResult.status === "error",
    };
  });
}

function removeSerialCancellationArtifacts(params: {
  messages: AgentMessage[];
  cancelledToolCallId: string | null;
}): AgentMessage[] {
  if (!params.cancelledToolCallId) return params.messages;
  return params.messages.flatMap((message) => {
    if (
      message.role === "toolResult" &&
      message.toolCallId === params.cancelledToolCallId
    ) {
      return [];
    }
    if (message.role !== "assistant") return [message];
    let cancelledCallReached = false;
    const content = message.content.filter((part) => {
      if (part.type !== "toolCall") return true;
      if (part.id === params.cancelledToolCallId) cancelledCallReached = true;
      return !cancelledCallReached;
    });
    return content.length > 0 ? [{ ...message, content }] : [];
  });
}

export type PiAdmissionProbeResult = {
  scenario: PiAdmissionScenario;
  providerCalls: number;
  executedToolNames: string[];
  eventTypes: AgentEvent["type"][];
  providerSystemPrompts: Array<string | undefined>;
  providerToolNames: string[][];
  observedToolResults: Array<{
    toolCallId: string;
    toolName: string;
    isError: boolean;
    text: string;
  }>;
  returnedToolResults: Array<{
    toolCallId: string;
    toolName: string;
    isError: boolean;
    text: string;
  }>;
  admittedToolStartIds: string[];
  admittedToolFinishes: Array<{
    toolCallId: string;
    isError: boolean;
  }>;
  executedToolCallIds: string[];
  admissionFailure: {
    code:
      | "invalid_model_output"
      | "tool_budget_exhausted"
      | "repeated_call_blocked"
      | "runtime_run_not_active";
    pendingToolCallId: string | null;
    pendingToolName: string | null;
  } | null;
  finalAssistantText: string;
  finalStopReason: PiAssistantMessage["stopReason"] | null;
  maxInFlight: number;
  resultSteps: Array<{
    toolCallId: string;
    toolName: string;
    envelope: RuntimeKernelToolResultEnvelope;
    toolResultSignature: string;
    madeProgress: boolean;
    consecutiveFailureCount: number;
    consecutiveNoProgressCount: number;
  }>;
  terminalSignal: RuntimeToolResultTerminalSignal | null;
  projectedToolResultIds: string[];
  projectedAssistantToolCallIds: string[];
};

export async function runPiAgentCoreAdmissionProbe(
  scenario: PiAdmissionScenario,
  resultFixture?: PiResultFixture,
): Promise<PiAdmissionProbeResult> {
  const executedToolNames: string[] = [];
  const executedToolCallIds: string[] = [];
  const eventTypes: AgentEvent["type"][] = [];
  const admittedToolStartIds: string[] = [];
  const admittedToolFinishes: PiAdmissionProbeResult["admittedToolFinishes"] = [];
  const providerSystemPrompts: Array<string | undefined> = [];
  const providerToolNames: string[][] = [];
  const observedToolResults: PiAdmissionProbeResult["observedToolResults"] = [];
  let providerCalls = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  let toolStepCount = 0;
  let lastToolSignature: string | null = null;
  let repeatedCallCount = 0;
  let activeCheckCount = 0;
  let toolResultState: RuntimeToolResultState = {
    ...INITIAL_RUNTIME_TOOL_RESULT_STATE,
  };
  let terminalSignal: RuntimeToolResultTerminalSignal | null = null;
  const canonicalToolResults = new Map<
    string,
    RuntimeKernelToolExecutionResult
  >();
  const resultSteps: PiAdmissionProbeResult["resultSteps"] = [];

  type AdmissionFailure = NonNullable<PiAdmissionProbeResult["admissionFailure"]>;
  type BatchDecision = {
    allowed: boolean;
    failure: AdmissionFailure | null;
    callIds: Set<string>;
    nextToolStepCount: number;
    nextLastToolSignature: string | null;
    nextRepeatedCallCount: number;
    preparedCalls: Array<{
      id: string;
      name: (typeof ADMITTED_TOOL_NAMES)[number];
      toolSignature: string;
    }>;
  };

  let currentBatchDecision: BatchDecision | null = null;
  let admissionFailure: AdmissionFailure | null = null;

  const maxToolSteps = scenario === "over_budget_batch" ? 1 : 50;
  const maxRepeatedIdenticalCalls =
    resultFixture?.maxRepeatedIdenticalCalls ??
    (scenario === "repeated_batch" || scenario === "repeated_across_turns"
      ? 1
      : 2);
  const resultBudget = {
    ...DEFAULT_RUNTIME_KERNEL_BUDGET,
    maxConsecutiveFailures:
      resultFixture?.maxConsecutiveFailures ??
      DEFAULT_RUNTIME_KERNEL_BUDGET.maxConsecutiveFailures,
    maxNoProgressSteps:
      resultFixture?.maxNoProgressSteps ??
      DEFAULT_RUNTIME_KERNEL_BUDGET.maxNoProgressSteps,
  };
  const isRunActive = () => {
    activeCheckCount += 1;
    if (scenario === "inactive_before_admission") return false;
    if (scenario === "inactive_between_preflight_and_start") {
      return activeCheckCount === 1;
    }
    return true;
  };

  const normalizeToolArguments = (
    _toolName: (typeof ADMITTED_TOOL_NAMES)[number],
    rawArgs: unknown,
  ): { query: string } => {
    if (!rawArgs || typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
      throw new Error("tool arguments must be an object");
    }
    const query = (rawArgs as { query?: unknown }).query;
    if (typeof query !== "string") throw new Error("query must be a string");
    return { query };
  };

  const preflightAssistantBatch = (message: PiAssistantMessage): void => {
    const calls = message.content.filter(
      (part): part is Extract<(typeof message.content)[number], { type: "toolCall" }> =>
        part.type === "toolCall",
    );
    if (calls.length === 0) {
      currentBatchDecision = null;
      return;
    }
    currentBatchDecision = null;

    const firstUnknown = calls.find(
      (call) => !ADMITTED_TOOL_NAMES.includes(call.name as (typeof ADMITTED_TOOL_NAMES)[number]),
    );
    const duplicateId = calls.find(
      (call, index) => calls.findIndex((candidate) => candidate.id === call.id) !== index,
    );
    let failure: AdmissionFailure | null = null;

    if (firstUnknown) {
      failure = {
        code: "invalid_model_output",
        pendingToolCallId: firstUnknown.id,
        pendingToolName: firstUnknown.name,
      };
    } else if (duplicateId) {
      failure = {
        code: "invalid_model_output",
        pendingToolCallId: duplicateId.id,
        pendingToolName: duplicateId.name,
      };
    } else if (calls.length > Math.max(0, maxToolSteps - toolStepCount)) {
      const remainingToolBudget = Math.max(0, maxToolSteps - toolStepCount);
      const blockedCall = calls[Math.min(remainingToolBudget, calls.length - 1)]!;
      failure = {
        code: "tool_budget_exhausted",
        pendingToolCallId: blockedCall.id,
        pendingToolName: blockedCall.name,
      };
    } else {
      let simulatedLastSignature = lastToolSignature;
      let simulatedRepeatedCount = repeatedCallCount;
      const preparedCalls: BatchDecision["preparedCalls"] = [];
      for (const call of calls) {
        let normalizedArgs: Record<string, unknown>;
        try {
          normalizedArgs = normalizeToolArguments(
            call.name as (typeof ADMITTED_TOOL_NAMES)[number],
            call.arguments,
          );
        } catch (error) {
          normalizedArgs = call.arguments;
          canonicalToolResults.set(call.id, {
            status: "error",
            exitCode: null,
            outputText: "",
            errorCode: "invalid_tool_arguments",
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
        const signature = buildRuntimeToolCallSignature({
          toolName: call.name,
          normalizedArgs,
        });
        const nextRepeatedCount =
          signature === simulatedLastSignature ? simulatedRepeatedCount + 1 : 1;
        if (nextRepeatedCount > maxRepeatedIdenticalCalls) {
          failure = {
            code: "repeated_call_blocked",
            pendingToolCallId: call.id,
            pendingToolName: call.name,
          };
          break;
        }
        simulatedLastSignature = signature;
        simulatedRepeatedCount = nextRepeatedCount;
        preparedCalls.push({
          id: call.id,
          name: call.name as (typeof ADMITTED_TOOL_NAMES)[number],
          toolSignature: signature,
        });
      }
      if (!failure && !isRunActive()) {
        failure = {
          code: "runtime_run_not_active",
          pendingToolCallId: calls[0]?.id ?? null,
          pendingToolName: calls[0]?.name ?? null,
        };
      }
      currentBatchDecision = {
        allowed: failure === null,
        failure,
        callIds: new Set(calls.map((call) => call.id)),
        nextToolStepCount: toolStepCount + calls.length,
        nextLastToolSignature: simulatedLastSignature,
        nextRepeatedCallCount: simulatedRepeatedCount,
        preparedCalls,
      };
    }

    admissionFailure = failure;
    currentBatchDecision ??= {
      allowed: false,
      failure,
      callIds: new Set(calls.map((call) => call.id)),
      nextToolStepCount: toolStepCount,
      nextLastToolSignature: lastToolSignature,
      nextRepeatedCallCount: repeatedCallCount,
      preparedCalls: [],
    };
  };

  const fixtureCalls = new Map(
    (resultFixture?.batches.flat() ?? []).map((call) => [call.id, call]),
  );
  const callStarted = new Map<string, Promise<void>>();
  const markCallStarted = new Map<string, () => void>();
  for (const id of fixtureCalls.keys()) {
    callStarted.set(
      id,
      new Promise<void>((resolve) => markCallStarted.set(id, resolve)),
    );
  }

  const executeCanonicalTool = async (params: {
    toolCallId: string;
    query: string;
  }): Promise<RuntimeKernelToolExecutionResult> => {
    const fixture = fixtureCalls.get(params.toolCallId);
    markCallStarted.get(params.toolCallId)?.();
    if (fixture?.waitForCallId) {
      await callStarted.get(fixture.waitForCallId);
    }
    if (fixture?.throwMessage) throw new Error(fixture.throwMessage);
    if (fixture?.abort) controller.abort("user_cancelled");
    return (
      fixture?.result ?? {
        status: "ok",
        exitCode: 0,
        outputText: `result:${params.query}`,
        errorCode: null,
        errorMessage: null,
        details: { authority: "closed_probe_registry" },
      }
    );
  };

  const buildTool = (toolName: (typeof ADMITTED_TOOL_NAMES)[number]): AgentTool => ({
    name: toolName,
    label: `Read with ${toolName}`,
    description: "Read only the already-authorized Polynet community.",
    parameters: QUERY_PARAMETERS,
    executionMode:
      resultFixture?.executionMode ??
      (scenario === "serial_batch" ? "sequential" : "parallel"),
    prepareArguments: (args) => normalizeToolArguments(toolName, args),
    execute: async (toolCallId, args) => {
      if (
        !currentBatchDecision?.allowed ||
        !currentBatchDecision.callIds.has(toolCallId) ||
        !admittedToolStartIds.includes(toolCallId)
      ) {
        throw new Error("Pi attempted to execute outside Polynet admission.");
      }
      executedToolNames.push(toolName);
      executedToolCallIds.push(toolCallId);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      let toolResult: RuntimeKernelToolExecutionResult;
      try {
        toolResult = await executeCanonicalTool({
          toolCallId,
          query: String((args as { query?: unknown }).query ?? ""),
        });
      } catch (error) {
        toolResult = buildRuntimeToolExecutionExceptionResult(error);
      } finally {
        inFlight -= 1;
      }
      canonicalToolResults.set(toolCallId, toolResult);
      return {
        content: [
          {
            type: "text",
            text: fixtureCalls.get(toolCallId)?.forgeTransport
              ? JSON.stringify({ forged: true })
              : buildRuntimeToolResultContent({ toolName, toolResult }),
          },
        ],
        details: fixtureCalls.get(toolCallId)?.forgeTransport
          ? { authority: "untrusted_transport" }
          : { canonicalToolResult: toolResult },
      };
    },
  });

  const tools = ADMITTED_TOOL_NAMES.map(buildTool);
  const streamFn: StreamFn = async (_model, context, options) => {
    providerCalls += 1;
    providerSystemPrompts.push(context.systemPrompt);
    providerToolNames.push((context.tools ?? []).map((tool) => tool.name));
    observedToolResults.push(
      ...toolResults(context).map((message) => ({
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        isError: message.isError,
        text: message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(""),
      })),
    );

    if (scenario === "aborted" || options?.signal?.aborted) {
      return completedStream(
        assistantMessage({
          content: [],
          stopReason: "aborted",
          errorMessage: "Run cancelled by user.",
        }),
      );
    }

    const fixtureBatch = resultFixture?.batches[providerCalls - 1];
    if (fixtureBatch) {
      return completedStream(
        toolCallMessage(
          fixtureBatch.map((call) => ({
            id: call.id,
            name: call.name ?? ADMITTED_TOOL_NAMES[0],
            arguments: { query: call.query },
          })),
        ),
      );
    }
    if (resultFixture) {
      return completedStream(textMessage("Pi admission probe complete."));
    }

    if (
      scenario === "repeated_across_turns" &&
      (providerCalls === 1 || providerCalls === 2)
    ) {
      return completedStream(
        toolCallMessage([
          {
            id: `repeat-turn-${providerCalls}`,
            name: ADMITTED_TOOL_NAMES[0],
            arguments: { query: "same" },
          },
        ]),
      );
    }
    if (providerCalls > 1) {
      return completedStream(textMessage("Pi admission probe complete."));
    }
    if (scenario === "assistant_final") {
      return completedStream(textMessage("Pi admission probe complete."));
    }
    if (scenario === "unknown_tool") {
      return completedStream(
        toolCallMessage([
          { id: "unknown-1", name: UNKNOWN_TOOL_NAME, arguments: { query: "x" } },
        ]),
      );
    }
    if (scenario === "invalid_arguments") {
      return completedStream(
        toolCallMessage([
          {
            id: "invalid-1",
            name: ADMITTED_TOOL_NAMES[0],
            arguments: { query: { nested: "invalid" } },
          },
        ]),
      );
    }
    if (
      scenario === "serial_batch" ||
      scenario === "parallel_batch" ||
      scenario === "over_budget_batch"
    ) {
      return completedStream(
        toolCallMessage([
          {
            id: "batch-1",
            name: ADMITTED_TOOL_NAMES[0],
            arguments: { query: "one" },
          },
          {
            id: "batch-2",
            name: ADMITTED_TOOL_NAMES[1],
            arguments: { query: "two" },
          },
        ]),
      );
    }
    if (scenario === "repeated_batch") {
      return completedStream(
        toolCallMessage([
          {
            id: "repeat-1",
            name: ADMITTED_TOOL_NAMES[0],
            arguments: { query: "same" },
          },
          {
            id: "repeat-2",
            name: ADMITTED_TOOL_NAMES[0],
            arguments: { query: "same" },
          },
        ]),
      );
    }
    if (scenario === "mixed_valid_invalid_batch") {
      return completedStream(
        toolCallMessage([
          {
            id: "mixed-invalid",
            name: ADMITTED_TOOL_NAMES[0],
            arguments: { query: { nested: "invalid" } },
          },
          {
            id: "mixed-valid",
            name: ADMITTED_TOOL_NAMES[1],
            arguments: { query: "valid" },
          },
        ]),
      );
    }
    if (scenario === "mixed_unknown_batch") {
      return completedStream(
        toolCallMessage([
          {
            id: "mixed-allowed",
            name: ADMITTED_TOOL_NAMES[0],
            arguments: { query: "allowed" },
          },
          {
            id: "mixed-unknown",
            name: UNKNOWN_TOOL_NAME,
            arguments: { query: "blocked" },
          },
        ]),
      );
    }
    if (scenario === "duplicate_call_ids") {
      return completedStream(
        toolCallMessage([
          {
            id: "duplicate",
            name: ADMITTED_TOOL_NAMES[0],
            arguments: { query: "one" },
          },
          {
            id: "duplicate",
            name: ADMITTED_TOOL_NAMES[1],
            arguments: { query: "two" },
          },
        ]),
      );
    }
    return completedStream(
      toolCallMessage([
        {
          id:
            scenario === "inactive_before_admission"
              ? "inactive-1"
              : scenario === "inactive_between_preflight_and_start"
                ? "inactive-race-1"
              : "admitted-1",
          name: ADMITTED_TOOL_NAMES[0],
          arguments: { query: "recent activity" },
        },
      ]),
    );
  };

  const context: AgentContext = {
    systemPrompt: SYSTEM_PROMPT,
    messages: [],
    tools,
  };
  const controller = new AbortController();
  if (scenario === "aborted") controller.abort("user_cancelled");
  const messages = await runAgentLoop(
    [
      {
        role: "user",
        content: "What is happening in this community?",
        timestamp: 0,
      },
    ],
    context,
    {
      model: PROBE_MODEL,
      convertToLlm: (input) =>
        projectCanonicalToolResults(input, canonicalToolResults) as PiProviderContext["messages"],
      toolExecution:
        resultFixture?.executionMode ??
        (scenario === "serial_batch" ? "sequential" : "parallel"),
      beforeToolCall: async ({ toolCall }) => {
        if (
          !currentBatchDecision?.allowed ||
          !currentBatchDecision.callIds.has(toolCall.id)
        ) {
          return {
            block: true,
            reason:
              currentBatchDecision?.failure?.code ??
              "runtime_tool_admission_unavailable",
            terminate: true,
          };
        }
        return undefined;
      },
      afterToolCall: async ({ toolCall }) => {
        const toolResult = canonicalToolResults.get(toolCall.id);
        if (!toolResult) return undefined;
        return {
          content: [
            {
              type: "text",
              text: buildRuntimeToolResultContent({
                toolName: toolCall.name,
                toolResult,
              }),
            },
          ],
          details: { canonicalToolResult: toolResult },
          isError: toolResult.status === "error",
        };
      },
      shouldStopAfterTurn: () =>
        admissionFailure !== null || terminalSignal !== null,
    },
    (event) => {
      eventTypes.push(event.type);
      if (event.type === "message_end" && event.message.role === "assistant") {
        preflightAssistantBatch(event.message);
        return;
      }
      if (event.type === "tool_execution_start") {
        if (currentBatchDecision?.allowed && !isRunActive()) {
          admissionFailure = {
            code: "runtime_run_not_active",
            pendingToolCallId: event.toolCallId,
            pendingToolName: event.toolName,
          };
          currentBatchDecision = {
            ...currentBatchDecision,
            allowed: false,
            failure: admissionFailure,
          };
        }
        if (
          currentBatchDecision?.allowed &&
          currentBatchDecision.callIds.has(event.toolCallId) &&
          ADMITTED_TOOL_NAMES.includes(
            event.toolName as (typeof ADMITTED_TOOL_NAMES)[number],
          )
        ) {
          admittedToolStartIds.push(event.toolCallId);
        }
        return;
      }
      if (event.type === "turn_end" && currentBatchDecision?.allowed) {
        for (const prepared of currentBatchDecision.preparedCalls) {
          const toolResult = canonicalToolResults.get(prepared.id);
          if (!toolResult) continue;
          const transition = advanceRuntimeToolResultState({
            state: toolResultState,
            toolSignature: prepared.toolSignature,
            toolResult,
            budget: resultBudget,
          });
          toolResultState = transition.state;
          resultSteps.push({
            toolCallId: prepared.id,
            toolName: prepared.name,
            envelope: buildRuntimeToolResultEnvelope({
              toolName: prepared.name,
              toolResult,
            }),
            toolResultSignature: transition.toolResultSignature,
            madeProgress: transition.madeProgress,
            consecutiveFailureCount: transition.state.consecutiveFailureCount,
            consecutiveNoProgressCount:
              transition.state.consecutiveNoProgressCount,
          });
          terminalSignal ??= transition.terminalSignal;
        }
        toolStepCount = currentBatchDecision.nextToolStepCount;
        lastToolSignature = currentBatchDecision.nextLastToolSignature;
        repeatedCallCount = currentBatchDecision.nextRepeatedCallCount;
        return;
      }
      if (
        event.type === "tool_execution_end" &&
        admittedToolStartIds.includes(event.toolCallId)
      ) {
        admittedToolFinishes.push({
          toolCallId: event.toolCallId,
          isError: event.isError,
        });
      }
    },
    controller.signal,
    streamFn,
  );
  const finalAssistant = [...messages]
    .reverse()
    .find((message): message is PiAssistantMessage => message.role === "assistant");
  const canonicalMessages = projectCanonicalToolResults(
    messages,
    canonicalToolResults,
  );
  const cancelledToolCallId =
    resultFixture?.executionMode === "sequential" &&
    terminalSignal?.code === "user_cancelled"
      ? resultSteps.find(
          (step) => step.envelope.error_code === "user_cancelled",
        )?.toolCallId ?? null
      : null;
  const projectedMessages = removeSerialCancellationArtifacts({
    messages: canonicalMessages,
    cancelledToolCallId,
  });
  const returnedToolResults = projectedMessages
    .filter((message): message is PiToolResultMessage => message.role === "toolResult")
    .map((message) => ({
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      isError: message.isError,
      text: message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(""),
    }));
  const projectedToolResultIds = returnedToolResults.map(
    (entry) => entry.toolCallId,
  );
  const projectedAssistantToolCallIds = projectedMessages.flatMap((message) =>
    message.role === "assistant"
      ? message.content.flatMap((part) =>
          part.type === "toolCall" ? [part.id] : [],
        )
      : [],
  );

  return {
    scenario,
    providerCalls,
    executedToolNames,
    eventTypes,
    providerSystemPrompts,
    providerToolNames,
    observedToolResults,
    returnedToolResults,
    admittedToolStartIds,
    admittedToolFinishes,
    executedToolCallIds,
    admissionFailure,
    finalAssistantText: extractAssistantText(messages),
    finalStopReason: finalAssistant?.stopReason ?? null,
    maxInFlight,
    resultSteps,
    terminalSignal,
    projectedToolResultIds,
    projectedAssistantToolCallIds,
  };
}

export const PI_AGENT_CORE_ADMISSION_CONSTANTS = {
  admittedToolNames: ADMITTED_TOOL_NAMES,
  unknownToolName: UNKNOWN_TOOL_NAME,
  systemPrompt: SYSTEM_PROMPT,
} as const;
