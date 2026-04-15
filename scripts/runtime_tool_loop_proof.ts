import assert from "node:assert/strict";

import {
  buildAssistantToolCallMessage,
  isComputerUseObservationMessage,
  type NativeToolAwareMessage,
} from "../shared/nativeToolProtocol.ts";
import { runSerialNativeToolLoop } from "../shared/nativeToolLoop.ts";
import { runNativeRuntimeKernel } from "../shared/runtimeKernel.ts";
import { DEFAULT_RUNTIME_KERNEL_BUDGET } from "../shared/runtimeKernelTypes.ts";
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

function expectLatestObservationMessage(params: {
  messages: NativeToolAwareMessage[];
  expectedSummary: string;
  expectedImageUrl: string;
}) {
  const latestUserMessage = [...params.messages]
    .reverse()
    .find((message) => message.role === "user");
  assert.ok(latestUserMessage, "expected a follow-up observation user message");
  assert.equal(latestUserMessage?.role, "user");
  assert.ok(Array.isArray(latestUserMessage?.content), "expected observation content parts");
  const parts = latestUserMessage?.content as Array<Record<string, unknown>>;
  assert.equal(parts[0]?.type, "text");
  assert.equal(parts[0]?.text, params.expectedSummary);
  assert.equal(parts[1]?.type, "image");
  assert.equal(parts[1]?.imageUrl, params.expectedImageUrl);
}

function countObservationMessages(messages: NativeToolAwareMessage[]): number {
  return messages.filter((message) => isComputerUseObservationMessage(message)).length;
}

async function proveSuccessfulToolLoop() {
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
        expectLatestObservationMessage({
          messages,
          expectedSummary: "The workspace tree is visible in the sandbox file browser.",
          expectedImageUrl: "data:image/jpeg;base64,list123",
        });
        assert.equal(countObservationMessages(messages), 1);
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
        assert.equal(countObservationMessages(messages), 1);
        expectLatestObservationMessage({
          messages,
          expectedSummary: "Current file contents are visible in the editor.",
          expectedImageUrl: "data:image/jpeg;base64,abc123",
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
          observationContent: [
            {
              type: "text",
              text: "The workspace tree is visible in the sandbox file browser.",
              source: "computer_use_observation",
            },
            {
              type: "image",
              imageUrl: "data:image/jpeg;base64,list123",
              source: "computer_use_observation",
            },
          ],
        };
      }
      return {
        status: "ok",
        exitCode: 0,
        outputText: "hello from alpha",
        errorCode: null,
        errorMessage: null,
        observationContent: [
          {
            type: "text",
            text: "Current file contents are visible in the editor.",
            source: "computer_use_observation",
          },
          {
            type: "image",
            imageUrl: "data:image/jpeg;base64,abc123",
            source: "computer_use_observation",
          },
        ],
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
  assert.equal(
    providerRequests[1]?.length,
    5,
    "expected second request to include the first tool call, output, and latest observation",
  );
  assert.equal(
    providerRequests[2]?.length,
    7,
    "expected third request to replace the earlier observation instead of accumulating screenshots",
  );
  assert.ok(result.ok, "expected final assistant result");
  if (result.ok) {
    assert.equal(result.assistantText, "alpha.txt says hello from alpha");
    assert.equal(result.promptTokens, 27);
    assert.equal(result.completionTokens, 9);
  }

  console.log("PASS: runtime tool loop success proof");
}

async function proveRepeatedCallBudget() {
  let providerInvocation = 0;
  const result = await runSerialNativeToolLoop<RetrievalToolName>({
    messages: [
      { role: "system", content: "You are in a workspace." },
      { role: "user", content: "Keep reading alpha.txt until you are done." },
    ],
    maxIterations: 6,
    runCompletion: async () => {
      providerInvocation += 1;
      return {
        ok: true,
        type: "tool_call",
        providerCallId: `repeat-call-${providerInvocation}`,
        toolName: "read",
        arguments: { path: "alpha.txt" },
        assistantToolCallMessage: buildAssistantToolCallMessage({
          content: null,
          providerCallId: `repeat-call-${providerInvocation}`,
          toolName: "read",
          rawArguments: JSON.stringify({ path: "alpha.txt" }),
        }),
        promptTokens: 10 + providerInvocation,
        completionTokens: 5,
        resolvedModelId: "mock-model",
      };
    },
    normalizeToolArguments,
    executeTool: async () => ({
      status: "ok",
      exitCode: 0,
      outputText: "alpha stays the same",
      errorCode: null,
      errorMessage: null,
    }),
  });

  assert.equal(result.ok, false, "expected repeated-call budget failure");
  if (!result.ok) {
    assert.equal(result.code, "repeated_call_blocked");
    assert.equal(result.stopReason, "repeated_call_blocked");
    assert.equal(result.stepCount, 2);
    assert.equal(result.steps.length, 3);
    assert.equal(result.steps[2]?.blocked, true);
    assert.equal(result.steps[2]?.repeatedCallCount, 3);
  }

  console.log("PASS: runtime tool loop repeated-call proof");
}

async function proveFailureBudget() {
  const result = await runSerialNativeToolLoop<RetrievalToolName>({
    messages: [
      { role: "system", content: "You are in a workspace." },
      { role: "user", content: "Read alpha.txt." },
    ],
    maxIterations: 6,
    runCompletion: async (messages) => {
      const callNumber =
        messages.filter((message) => message.role === "tool").length + 1;
      return {
        ok: true,
        type: "tool_call",
        providerCallId: `failure-call-${callNumber}`,
        toolName: "read",
        arguments: { path: `missing-${callNumber}.txt` },
        assistantToolCallMessage: buildAssistantToolCallMessage({
          content: null,
          providerCallId: `failure-call-${callNumber}`,
          toolName: "read",
          rawArguments: JSON.stringify({ path: `missing-${callNumber}.txt` }),
        }),
        promptTokens: 20 + callNumber,
        completionTokens: 6,
        resolvedModelId: "mock-model",
      };
    },
    normalizeToolArguments,
    executeTool: async ({ normalizedArgs }) => ({
      status: "error",
      exitCode: 1,
      outputText: `ENOENT ${String(normalizedArgs.path ?? "")}`,
      errorCode: "file_not_found",
      errorMessage: "File not found.",
    }),
  });

  assert.equal(result.ok, false, "expected consecutive-failure budget failure");
  if (!result.ok) {
    assert.equal(result.code, "consecutive_failures_exhausted");
    assert.equal(result.stopReason, "consecutive_failures_exhausted");
    assert.equal(result.stepCount, 2);
    assert.equal(result.steps.length, 2);
    assert.equal(result.steps[1]?.consecutiveFailureCount, 2);
  }

  console.log("PASS: runtime tool loop failure-budget proof");
}

async function proveToolBudgetExhaustion() {
  let providerInvocation = 0;
  const result = await runSerialNativeToolLoop<RetrievalToolName>({
    messages: [
      { role: "system", content: "You are in a workspace." },
      { role: "user", content: "Keep listing the workspace." },
    ],
    maxIterations: 1,
    runCompletion: async () => {
      providerInvocation += 1;
      return {
        ok: true,
        type: "tool_call",
        providerCallId: `budget-call-${providerInvocation}`,
        toolName: "list_dir",
        arguments: { path: "." },
        assistantToolCallMessage: buildAssistantToolCallMessage({
          content: null,
          providerCallId: `budget-call-${providerInvocation}`,
          toolName: "list_dir",
          rawArguments: JSON.stringify({ path: "." }),
        }),
        promptTokens: 30 + providerInvocation,
        completionTokens: 4,
        resolvedModelId: "mock-model",
      };
    },
    normalizeToolArguments,
    executeTool: async () => ({
      status: "ok",
      exitCode: 0,
      outputText: "file\talpha.txt",
      errorCode: null,
      errorMessage: null,
    }),
  });

  assert.equal(result.ok, false, "expected tool budget exhaustion");
  if (!result.ok) {
    assert.equal(result.code, "tool_budget_exhausted");
    assert.equal(result.stopReason, "tool_budget_exhausted");
    assert.equal(result.stepCount, 1);
    assert.equal(result.steps.length, 2);
    assert.equal(result.steps[1]?.blocked, true);
    assert.equal(result.steps[1]?.providerCallId, "budget-call-2");
  }

  console.log("PASS: runtime tool loop tool-budget proof");
}

async function proveNoProgressBudget() {
  let providerInvocation = 0;
  const result = await runNativeRuntimeKernel<RetrievalToolName>({
    messages: [
      { role: "system", content: "You are in a workspace." },
      { role: "user", content: "Try a few commands until you make progress." },
    ],
    budget: {
      ...DEFAULT_RUNTIME_KERNEL_BUDGET,
      maxRepeatedIdenticalCalls: 6,
      maxConsecutiveFailures: 6,
      maxNoProgressSteps: 3,
    },
    runCompletion: async () => {
      providerInvocation += 1;
      return {
        ok: true,
        type: "tool_call",
        providerCallId: `no-progress-${providerInvocation}`,
        toolName: "read",
        arguments: { path: `missing-${providerInvocation}.txt` },
        assistantToolCallMessage: buildAssistantToolCallMessage({
          content: null,
          providerCallId: `no-progress-${providerInvocation}`,
          toolName: "read",
          rawArguments: JSON.stringify({ path: `missing-${providerInvocation}.txt` }),
        }),
        promptTokens: 40 + providerInvocation,
        completionTokens: 5,
        resolvedModelId: "mock-model",
      };
    },
    normalizeToolArguments,
    executeTool: async ({ normalizedArgs }) => ({
      status: "error",
      exitCode: 1,
      outputText: `ENOENT ${String(normalizedArgs.path ?? "")}`,
      errorCode: "file_not_found",
      errorMessage: "File not found.",
    }),
  });

  assert.equal(result.ok, false, "expected no-progress exhaustion");
  if (!result.ok) {
    assert.equal(result.code, "no_progress_exhausted");
    assert.equal(result.stopReason, "no_progress_exhausted");
    assert.equal(result.stepCount, 3);
    assert.equal(result.steps.length, 3);
    assert.equal(result.steps[2]?.consecutiveNoProgressCount, 3);
    assert.equal(result.steps[2]?.madeProgress, false);
  }

  console.log("PASS: runtime tool loop no-progress proof");
}

await proveSuccessfulToolLoop();
await proveRepeatedCallBudget();
await proveFailureBudget();
await proveToolBudgetExhaustion();
await proveNoProgressBudget();
