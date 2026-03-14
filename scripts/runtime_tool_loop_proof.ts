import assert from "node:assert/strict";

import {
  buildAssistantToolCallMessage,
  type NativeToolAwareMessage,
} from "../shared/nativeToolProtocol.ts";
import { runSerialNativeToolLoop } from "../shared/nativeToolLoop.ts";
import { normalizeToolArguments } from "../shared/toolRegistry.ts";
import type { RetrievalToolName } from "../shared/retrievalTools.ts";

function deepCloneMessages(messages: NativeToolAwareMessage[]): NativeToolAwareMessage[] {
  return JSON.parse(JSON.stringify(messages)) as NativeToolAwareMessage[];
}

function expectToolFollowUpMessage(params: {
  messages: NativeToolAwareMessage[];
  callId: string;
  toolName: RetrievalToolName;
  expectedOutput: string;
}) {
  const assistantToolCall = params.messages.find(
    (message) =>
      message.role === "assistant" &&
      Array.isArray(message.tool_calls) &&
      message.tool_calls.some((toolCall) => toolCall.id === params.callId),
  );
  assert.ok(
    assistantToolCall,
    `expected assistant tool call message for ${params.callId}`,
  );

  const toolResult = params.messages.find(
    (message) =>
      message.role === "tool" && message.tool_call_id === params.callId,
  );
  assert.ok(toolResult, `expected tool result message for ${params.callId}`);
  assert.equal(toolResult.role, "tool");
  const parsed = JSON.parse(toolResult.content) as Record<string, unknown>;
  assert.equal(parsed.tool_name, params.toolName);
  assert.equal(parsed.success, true);
  assert.equal(parsed.output, params.expectedOutput);
}

async function main() {
  const providerRequests: NativeToolAwareMessage[][] = [];
  const executedTools: Array<{
    iteration: number;
    providerCallId: string;
    toolName: RetrievalToolName;
    normalizedArgs: Record<string, unknown>;
  }> = [];
  const observedFollowUps: Array<{
    iteration: number;
    providerCallId: string;
    toolName: RetrievalToolName;
  }> = [];
  let providerInvocation = 0;

  const result = await runSerialNativeToolLoop<RetrievalToolName>({
    messages: [
      { role: "system", content: "You are in a workspace." },
      { role: "user", content: "Inspect the workspace, then read alpha.txt." },
    ],
    maxIterations: 4,
    runCompletion: async (messages) => {
      providerRequests.push(deepCloneMessages(messages));
      providerInvocation += 1;

      if (providerInvocation === 1) {
        return {
          ok: true,
          type: "tool_call",
          providerCallId: "call-list-1",
          toolName: "list_dir",
          arguments: { path: "." },
          assistantToolCallMessage: buildAssistantToolCallMessage({
            content: null,
            providerCallId: "call-list-1",
            toolName: "list_dir",
            rawArguments: JSON.stringify({ path: "." }),
          }),
          promptTokens: 11,
          completionTokens: 7,
          resolvedModelId: "mock-model",
        };
      }

      if (providerInvocation === 2) {
        expectToolFollowUpMessage({
          messages,
          callId: "call-list-1",
          toolName: "list_dir",
          expectedOutput: "file\talpha.txt",
        });
        return {
          ok: true,
          type: "tool_call",
          providerCallId: "call-read-2",
          toolName: "read",
          arguments: { path: "alpha.txt" },
          assistantToolCallMessage: buildAssistantToolCallMessage({
            content: null,
            providerCallId: "call-read-2",
            toolName: "read",
            rawArguments: JSON.stringify({ path: "alpha.txt" }),
          }),
          promptTokens: 19,
          completionTokens: 8,
          resolvedModelId: "mock-model",
        };
      }

      if (providerInvocation === 3) {
        expectToolFollowUpMessage({
          messages,
          callId: "call-list-1",
          toolName: "list_dir",
          expectedOutput: "file\talpha.txt",
        });
        expectToolFollowUpMessage({
          messages,
          callId: "call-read-2",
          toolName: "read",
          expectedOutput: "hello from alpha",
        });
        return {
          ok: true,
          type: "assistant",
          assistantText: "alpha.txt says hello from alpha",
          promptTokens: 27,
          completionTokens: 9,
          resolvedModelId: "mock-model",
        };
      }

      throw new Error(`unexpected provider invocation ${providerInvocation}`);
    },
    normalizeToolArguments,
    executeTool: async ({ iteration, providerCallId, toolName, normalizedArgs }) => {
      executedTools.push({
        iteration,
        providerCallId,
        toolName,
        normalizedArgs,
      });
      if (toolName === "list_dir") {
        return {
          status: "ok",
          exitCode: 0,
          outputText: "file\talpha.txt",
          errorCode: null,
          errorMessage: null,
        };
      }
      return {
        status: "ok",
        exitCode: 0,
        outputText: "hello from alpha",
        errorCode: null,
        errorMessage: null,
      };
    },
    onToolStepStart: ({ iteration, step }) => {
      observedFollowUps.push({
        iteration,
        providerCallId: step.providerCallId,
        toolName: step.toolName,
      });
    },
  });

  assert.equal(providerRequests.length, 3, "expected exactly three provider requests");
  assert.equal(executedTools.length, 2, "expected exactly two tool executions");
  assert.deepEqual(
    executedTools.map((tool) => ({
      iteration: tool.iteration,
      providerCallId: tool.providerCallId,
      toolName: tool.toolName,
      path: tool.normalizedArgs.path,
    })),
    [
      {
        iteration: 1,
        providerCallId: "call-list-1",
        toolName: "list_dir",
        path: ".",
      },
      {
        iteration: 2,
        providerCallId: "call-read-2",
        toolName: "read",
        path: "alpha.txt",
      },
    ],
  );
  assert.deepEqual(observedFollowUps, [
    {
      iteration: 1,
      providerCallId: "call-list-1",
      toolName: "list_dir",
    },
    {
      iteration: 2,
      providerCallId: "call-read-2",
      toolName: "read",
    },
  ]);
  assert.equal(providerRequests[1]?.length, 4, "expected second request to include first tool call and output");
  assert.equal(providerRequests[2]?.length, 6, "expected third request to include second tool call and output");
  assert.ok(result.ok, "expected final assistant result");
  if (result.ok) {
    assert.equal(result.assistantText, "alpha.txt says hello from alpha");
    assert.equal(result.promptTokens, 27);
    assert.equal(result.completionTokens, 9);
  }

  console.log("PASS: runtime tool loop proof");
}

await main();
