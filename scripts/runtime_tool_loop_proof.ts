import assert from "node:assert/strict";
import { buildAssistantToolCallMessage } from "../shared/nativeToolProtocol.ts";
import { runNativeRuntimeKernel } from "../shared/runtimeKernel.ts";
import { DEFAULT_RUNTIME_KERNEL_BUDGET } from "../shared/runtimeKernelTypes.ts";
import { normalizeToolArguments } from "../shared/toolRegistry.ts";
import type { RetrievalToolName } from "../shared/retrievalTools.ts";

const providerRequests: unknown[][] = [];
const executed: Array<{
  toolName: RetrievalToolName;
  normalizedArgs: Record<string, unknown>;
}> = [];
let invocation = 0;

const result = await runNativeRuntimeKernel<RetrievalToolName>({
  messages: [
    { role: "system", content: "Inspect the authorized community." },
    { role: "user", content: "What is happening in this community?" },
  ],
  budget: DEFAULT_RUNTIME_KERNEL_BUDGET,
  inputBudget: {
    transport: "openai_responses",
    modelRef: "openai/gpt-5.6-sol",
    reservedOutputTokens: 1_600,
    toolSchemas: [],
    recordPlan: () => undefined,
    recordProjection: () => undefined,
  },
  runCompletion: async (messages) => {
    providerRequests.push(messages);
    invocation += 1;
    if (invocation === 1) {
      return {
        ok: true,
        type: "tool_calls",
        toolCalls: [
          {
            providerCallId: "search-1",
            toolName: "polynet_search" as const,
            arguments: {
              path: "/communities/active/chat",
              query: "recent activity",
            },
          },
        ],
        assistantToolCallMessage: buildAssistantToolCallMessage({
          providerCallId: "search-1",
          toolName: "polynet_search",
          rawArguments: JSON.stringify({
            path: "/communities/active/chat",
            query: "recent activity",
          }),
        }),
        promptTokens: 10,
        completionTokens: 5,
        resolvedModelId: "proof-model",
      };
    }
    const toolResult = messages.find(
      (message) => message.role === "tool" && message.tool_call_id === "search-1",
    );
    assert.ok(toolResult, "the tool result must be returned to the model");
    const payload = JSON.parse(String(toolResult.content)) as Record<string, unknown>;
    assert.equal(payload.tool_name, "polynet_search");
    assert.equal(payload.success, true);
    assert.equal(payload.output, "Two recent community discussions.");
    return {
      ok: true,
      type: "assistant",
      assistantText: "The community has two recent discussions.",
      promptTokens: 20,
      completionTokens: 8,
      resolvedModelId: "proof-model",
    };
  },
  normalizeToolArguments,
  executeTool: async ({ toolName, normalizedArgs }) => {
    executed.push({ toolName, normalizedArgs });
    return {
      status: "ok",
      exitCode: 0,
      outputText: "Two recent community discussions.",
      errorCode: null,
      errorMessage: null,
    };
  },
});

assert.equal(result.ok, true);
assert.equal(providerRequests.length, 2);
assert.deepEqual(executed, [
  {
    toolName: "polynet_search",
    normalizedArgs: {
      path: "/communities/active/chat",
      query: "recent activity",
    },
  },
]);

console.log("runtime_tool_loop_proof: ok");
