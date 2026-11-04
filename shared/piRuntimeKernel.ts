// The agent loop, on Pi (pi-agent-core): Pi sequences the run and calls our
// hooks; the rules (budgets, limits, cancellation, transcript, steps and
// receipts) stay ours, in RuntimeKernelRun (shared/runtimeKernel.ts).
//
// - streamFn: one model request through our funded completion, with our input
//   budget and context projection (RuntimeKernelRun.nextStep). A finished run
//   ends Pi with a final message; a failure ends it as an error.
// - beforeToolCall: starts an admitted step, or blocks the rest of a serial
//   batch once a step has ended the run.
// - afterToolCall: records a serial step's result as soon as it lands.
// - finishTurn: records a parallel batch in source order, then ends the run on
//   a terminal signal.
import { runAgentLoop, type AgentContext, type AgentLoopConfig, type AgentTool } from "@earendil-works/pi-agent-core";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import {
  RuntimeKernelRun,
  type RuntimeKernelParams,
  type RuntimeKernelPreparedToolStep,
  type RuntimeKernelTerminalSignal,
} from "./runtimeKernel.ts";
import type { RuntimeKernelResult, RuntimeKernelToolExecutionResult } from "./runtimeKernelTypes.ts";

const PI_MODEL = {
  id: "polynet-funded",
  name: "Polynet funded completion",
  api: "openai-responses",
  provider: "polynet",
  baseUrl: "",
  reasoning: false,
  input: ["text", "image"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000_000,
  maxTokens: 1_000_000,
} as const;

const PI_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

type PiBatch<TToolName extends string> = {
  byCallId: Map<string, RuntimeKernelPreparedToolStep<TToolName>>;
  prepared: RuntimeKernelPreparedToolStep<TToolName>[];
  parallel: boolean;
  results: Map<string, RuntimeKernelToolExecutionResult>;
  terminal: RuntimeKernelTerminalSignal | null;
};

export async function runPiRuntimeKernel<TToolName extends string>(
  params: RuntimeKernelParams<TToolName>,
): Promise<RuntimeKernelResult<TToolName>> {
  const run = new RuntimeKernelRun(params);
  let result: RuntimeKernelResult<TToolName> | null = null;
  let batch: PiBatch<TToolName> | null = null;
  // A throw from the model call or from a caller's hook escapes the run
  // unchanged: Pi would otherwise turn it into a tool error or a model_error,
  // and callers branch on the thrown code (the rate limit, the run budget).
  let thrown: { error: unknown } | null = null;
  const capture = (error: unknown) => { thrown ??= { error }; };

  // Tools are declared to Pi by name as the model calls them; Pi never sees
  // their schemas or validates their arguments (normalizeToolArguments does).
  const tools: AgentTool<any>[] = [];
  const toolFor = (name: string): AgentTool<any> => {
    let tool = tools.find((candidate) => candidate.name === name);
    if (!tool) {
      tool = {
        name,
        label: name,
        description: name,
        parameters: { type: "object" } as any,
        executionMode: "sequential",
        execute: async (toolCallId: string) => {
          const prepared = batch?.byCallId.get(toolCallId);
          if (!batch || !prepared) throw new Error("pi_runtime_unadmitted_tool_call");
          if (thrown) throw new Error("run_ended");
          const toolResult = await run.executeStep(prepared);
          batch.results.set(toolCallId, toolResult);
          return { content: [{ type: "text", text: toolResult.outputText }], details: {} };
        },
      } as AgentTool<any>;
      tools.push(tool);
    }
    return tool;
  };

  const message = (content: unknown[], stopReason: "stop" | "toolUse" | "error") => ({
    role: "assistant",
    content,
    api: PI_MODEL.api,
    provider: PI_MODEL.provider,
    model: PI_MODEL.id,
    usage: PI_USAGE,
    stopReason,
    timestamp: Date.now(),
  });

  const streamFn = () => {
    const stream = createAssistantMessageEventStream();
    void (async () => {
      let reply: ReturnType<typeof message>;
      try {
        const next = await run.nextStep();
        if (next.kind === "result") {
          result = next.result;
          reply = next.result.ok
            ? message([{ type: "text", text: next.result.assistantText }], "stop")
            : message([], "error");
        } else {
          batch = {
            byCallId: new Map(next.prepared.map((prepared) => [prepared.step.providerCallId, prepared])),
            prepared: next.prepared,
            parallel: next.parallel,
            results: new Map(),
            terminal: null,
          };
          for (const prepared of next.prepared) {
            toolFor(prepared.step.toolName).executionMode = next.parallel ? "parallel" : "sequential";
          }
          reply = message(next.prepared.map((prepared) => ({
            type: "toolCall",
            id: prepared.step.providerCallId,
            name: prepared.step.toolName,
            arguments: prepared.step.rawArguments ?? {},
          })), "toolUse");
        }
      } catch (error) {
        capture(error);
        reply = message([], "error");
      }
      stream.push({ type: "start", partial: reply } as any);
      if (reply.stopReason === "error") stream.push({ type: "error", reason: "error", error: reply } as any);
      else stream.push({ type: "done", reason: reply.stopReason, message: reply } as any);
    })();
    return stream;
  };

  const config: AgentLoopConfig = {
    model: PI_MODEL as any,
    // streamFn reads the run's own transcript, never Pi's copy.
    convertToLlm: (messages) => messages as any,
    toolExecution: "parallel",
    beforeToolCall: async ({ toolCall }) => {
      const prepared = batch?.byCallId.get(toolCall.id);
      if (!batch || !prepared) return { block: true, reason: "pi_runtime_unadmitted_tool_call" };
      // A serial batch stops at the first step that ends the run.
      if (batch.terminal || thrown) return { block: true, reason: "run_ended" };
      try {
        await run.startStep(prepared);
      } catch (error) {
        capture(error);
        return { block: true, reason: "run_ended" };
      }
      return undefined;
    },
    afterToolCall: async ({ toolCall }) => {
      if (!batch || batch.parallel || batch.terminal || thrown) return undefined;
      const prepared = batch.byCallId.get(toolCall.id);
      const toolResult = batch.results.get(toolCall.id);
      if (!prepared || !toolResult) return undefined;
      try {
        batch.terminal = await run.processResult(prepared, toolResult);
      } catch (error) {
        capture(error);
      }
      return undefined;
    },
    finishTurn: async () => {
      if (result || thrown) return { action: "end" };
      const current = batch;
      if (!current) return { action: "end" };
      batch = null;
      if (current.parallel) {
        try {
          for (const prepared of current.prepared) {
            const toolResult = current.results.get(prepared.step.providerCallId);
            if (!toolResult) continue;
            const terminal = await run.processResult(prepared, toolResult, { recordUserCancelledArtifacts: true });
            if (!current.terminal && terminal) current.terminal = terminal;
          }
        } catch (error) {
          capture(error);
          return { action: "end" };
        }
      }
      if (current.terminal) {
        result = run.terminate(current.terminal);
        return { action: "end" };
      }
      run.finishBatch();
      return undefined;
    },
  } as AgentLoopConfig;

  const context: AgentContext = { messages: [], tools };
  try {
    await runAgentLoop([], context, config, async () => undefined, undefined, streamFn as any);
  } catch (error) {
    capture(error);
  }
  const escaped = thrown as { error: unknown } | null;
  if (escaped) throw escaped.error;
  return result ?? run.failure({
    ok: false,
    status: 502,
    code: "invalid_model_output",
    stopReason: "invalid_model_output",
    message: "The agent loop ended without a result.",
  });
}
