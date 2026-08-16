import {
  runAgentLoop,
  type AgentContext,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
  type StreamFn,
} from "@earendil-works/pi-agent-core";
import { Type } from "typebox";

export type PiAdmissionScenario =
  | "assistant_final"
  | "admitted_tool"
  | "unknown_tool"
  | "invalid_arguments"
  | "aborted"
  | "serial_batch"
  | "parallel_batch";

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
  finalAssistantText: string;
  finalStopReason: PiAssistantMessage["stopReason"] | null;
  maxInFlight: number;
};

export async function runPiAgentCoreAdmissionProbe(
  scenario: PiAdmissionScenario,
): Promise<PiAdmissionProbeResult> {
  const executedToolNames: string[] = [];
  const eventTypes: AgentEvent["type"][] = [];
  const providerSystemPrompts: Array<string | undefined> = [];
  const providerToolNames: string[][] = [];
  const observedToolResults: PiAdmissionProbeResult["observedToolResults"] = [];
  let providerCalls = 0;
  let inFlight = 0;
  let maxInFlight = 0;

  const buildTool = (toolName: (typeof ADMITTED_TOOL_NAMES)[number]): AgentTool => ({
    name: toolName,
    label: `Read with ${toolName}`,
    description: "Read only the already-authorized Polynet community.",
    parameters: QUERY_PARAMETERS,
    executionMode: scenario === "serial_batch" ? "sequential" : "parallel",
    execute: async (_toolCallId, args) => {
      executedToolNames.push(toolName);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              tool_name: toolName,
              query: String((args as { query?: unknown }).query ?? ""),
            }),
          },
        ],
        details: { authority: "closed_probe_registry" },
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
    if (scenario === "serial_batch" || scenario === "parallel_batch") {
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
    return completedStream(
      toolCallMessage([
        {
          id: "admitted-1",
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
      convertToLlm: (input) => input as PiProviderContext["messages"],
      toolExecution: scenario === "serial_batch" ? "sequential" : "parallel",
    },
    (event) => {
      eventTypes.push(event.type);
    },
    controller.signal,
    streamFn,
  );
  const finalAssistant = [...messages]
    .reverse()
    .find((message): message is PiAssistantMessage => message.role === "assistant");

  return {
    scenario,
    providerCalls,
    executedToolNames,
    eventTypes,
    providerSystemPrompts,
    providerToolNames,
    observedToolResults,
    finalAssistantText: extractAssistantText(messages),
    finalStopReason: finalAssistant?.stopReason ?? null,
    maxInFlight,
  };
}

export const PI_AGENT_CORE_ADMISSION_CONSTANTS = {
  admittedToolNames: ADMITTED_TOOL_NAMES,
  unknownToolName: UNKNOWN_TOOL_NAME,
  systemPrompt: SYSTEM_PROMPT,
} as const;
