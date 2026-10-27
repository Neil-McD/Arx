import { describe, expect, it } from "vitest";
import {
  buildAssistantToolCallMessage,
  type NativeToolAwareMessage,
} from "../shared/nativeToolProtocol.ts";
import {
  estimateNativeToolTranscriptTokens,
  projectProviderContextToBudget,
} from "../shared/providerContextWindow.ts";
import { runNativeRuntimeKernel } from "../shared/runtimeKernel.ts";
import { DEFAULT_RUNTIME_KERNEL_BUDGET } from "../shared/runtimeKernelTypes.ts";
import { sha256RuntimeProviderContext } from "../shared/runtimeProviderContextAttestation.ts";

describe("runtime context projection", () => {
  it("is deterministic and never mutates the durable transcript", () => {
    const messages: NativeToolAwareMessage[] = [
      { role: "system", content: "Canonical policy." },
      { role: "user", content: "x".repeat(640_000) },
      { role: "assistant", content: "Old answer." },
      { role: "user", content: "Current request." },
    ];
    const sourceBytes = JSON.stringify(messages);
    const protectedTokens = estimateNativeToolTranscriptTokens([
      messages[0]!,
      messages[3]!,
    ]);

    const first = projectProviderContextToBudget({
      messages,
      targetInputTokens: protectedTokens,
    });
    const second = projectProviderContextToBudget({
      messages,
      targetInputTokens: protectedTokens,
    });

    expect(first).toEqual(second);
    expect(first.messages).toEqual([messages[0], messages[3]]);
    expect(first.includedRanges).toEqual([
      { start: 0, end: 0 },
      { start: 3, end: 3 },
    ]);
    expect(first.omittedRanges).toEqual([{ start: 1, end: 2 }]);
    expect(first.fitsTarget).toBe(true);
    expect(JSON.stringify(messages)).toBe(sourceBytes);
  });

  it("keeps tool calls and results atomic while compacting retained evidence", () => {
    const toolCall = buildAssistantToolCallMessage({
      providerCallId: "read-1",
      toolName: "polynet_read",
      rawArguments: JSON.stringify({ path: "/communities/example/channels/general" }),
    });
    const messages: NativeToolAwareMessage[] = [
      { role: "system", content: "Canonical policy." },
      { role: "user", content: "Inspect the community." },
      toolCall,
      {
        role: "tool",
        tool_call_id: "read-1",
        content: JSON.stringify({ output: "e".repeat(800_000) }),
      },
      { role: "assistant", content: "Evidence inspected." },
      { role: "user", content: "What changed?" },
    ];

    const projection = projectProviderContextToBudget({
      messages,
      targetInputTokens: 20_000,
    });
    const projectedCall = projection.messages.find(
      (message) => message.role === "assistant" && message.tool_calls?.length,
    );
    const projectedResult = projection.messages.find(
      (message) => message.role === "tool" && message.tool_call_id === "read-1",
    );

    expect(projectedCall).toBeDefined();
    expect(projectedResult).toBeDefined();
    expect(projectedResult?.content).toContain("Polynet compacted");
    expect(projection.compactedMessageIndexes).toEqual([3]);
    expect(projection.omittedRanges).toEqual([]);
    expect(projection.fitsTarget).toBe(true);
  });

  it("preserves the current episode exactly while omitting older history", () => {
    const currentToolCall = buildAssistantToolCallMessage({
      providerCallId: "current-read-1",
      toolName: "polynet_read",
      rawArguments: JSON.stringify({ path: "/communities/example/events" }),
    });
    const currentToolResult: NativeToolAwareMessage = {
      role: "tool",
      tool_call_id: "current-read-1",
      content: JSON.stringify({ output: "current evidence ".repeat(32_000) }),
    };
    const messages: NativeToolAwareMessage[] = [
      { role: "system", content: "Canonical policy." },
      { role: "user", content: "x".repeat(640_000) },
      { role: "assistant", content: "Old answer." },
      { role: "user", content: "Inspect the current community events." },
      currentToolCall,
      currentToolResult,
    ];
    const currentEpisode = messages.slice(3);
    const targetInputTokens = estimateNativeToolTranscriptTokens([
      messages[0]!,
      ...currentEpisode,
    ]);

    const projection = projectProviderContextToBudget({
      messages,
      targetInputTokens,
    });

    expect(projection.messages).toEqual([messages[0], ...currentEpisode]);
    expect(projection.messages.slice(1)).toEqual(currentEpisode);
    expect(projection.compactedMessageIndexes).toEqual([]);
    expect(projection.omittedRanges).toEqual([{ start: 1, end: 2 }]);
    expect(projection.fitsTarget).toBe(true);
  });

  it("compacts older media references but preserves the current user image", () => {
    const messages: NativeToolAwareMessage[] = [
      { role: "system", content: "Canonical policy." },
      {
        role: "user",
        content: [
          { type: "text", text: "Old image." },
          { type: "image", imageUrl: "https://example.com/old.png" },
        ],
      },
      { role: "assistant", content: "Old answer." },
      {
        role: "user",
        content: [
          { type: "text", text: "Current image." },
          { type: "image", imageUrl: "https://example.com/current.png" },
        ],
      },
    ];

    const projection = projectProviderContextToBudget({
      messages,
      targetInputTokens: 30_000,
    });
    const older = projection.messages[1];
    const current = projection.messages[3];

    expect(older?.role).toBe("user");
    expect(older?.content).toContainEqual({
      type: "text",
      text: "[Older image omitted from model context]",
    });
    expect(current).toEqual(messages[3]);
    expect(messages[1]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "Old image." },
        { type: "image", imageUrl: "https://example.com/old.png" },
      ],
    });
  });

  it("fails deterministically when the protected current episode cannot fit", () => {
    const currentToolCall = buildAssistantToolCallMessage({
      providerCallId: "current-read-oversized",
      toolName: "polynet_read",
      rawArguments: JSON.stringify({ path: "/communities/example/resources" }),
    });
    const messages: NativeToolAwareMessage[] = [
      { role: "system", content: "Canonical policy." },
      { role: "user", content: "Inspect the current resource." },
      currentToolCall,
      {
        role: "tool",
        tool_call_id: "current-read-oversized",
        content: JSON.stringify({ output: "x".repeat(2_400_000) }),
      },
    ];
    const projection = projectProviderContextToBudget({
      messages,
      targetInputTokens: 10_000,
    });

    expect(projection.changed).toBe(false);
    expect(projection.fitsTarget).toBe(false);
    expect(projection.messages).toEqual(messages);
    expect(projection.compactedMessageIndexes).toEqual([]);
    expect(projection.omittedRanges).toEqual([]);
  });

  it("stops before provider execution when the exact current episode is oversized", async () => {
    const currentToolCall = buildAssistantToolCallMessage({
      providerCallId: "current-read-provider-stop",
      toolName: "polynet_read",
      rawArguments: JSON.stringify({ path: "/communities/example/members" }),
    });
    let providerCalls = 0;
    const result = await runNativeRuntimeKernel({
      messages: [
        { role: "system", content: "Canonical policy." },
        { role: "user", content: "Inspect the current members." },
        currentToolCall,
        {
          role: "tool",
          tool_call_id: "current-read-provider-stop",
          content: JSON.stringify({ output: "x".repeat(2_400_000) }),
        },
      ],
      budget: DEFAULT_RUNTIME_KERNEL_BUDGET,
      inputBudget: {
        transport: "openai_responses",
        modelRef: "openai/gpt-6-luna",
        reservedOutputTokens: 1_600,
        toolSchemas: [],
        recordPlan: () => undefined,
        recordProjection: () => undefined,
      },
      runCompletion: async () => {
        providerCalls += 1;
        return {
          ok: true,
          type: "assistant",
          assistantText: "must not run",
          promptTokens: 1,
          completionTokens: 1,
          resolvedModelId: "gpt-6-luna",
        };
      },
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      executeTool: async () => ({
        status: "ok",
        exitCode: 0,
        outputText: "",
        errorCode: null,
        errorMessage: null,
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.code).toBe("context_window_exceeded");
    expect(providerCalls).toBe(0);
  });

  it("allows one effective provider-overflow retry and no projection loop", async () => {
    const messages: NativeToolAwareMessage[] = [
      { role: "system", content: "Canonical policy." },
      { role: "user", content: "x".repeat(480_000) },
      { role: "assistant", content: "Old answer." },
      { role: "user", content: "Current request." },
    ];
    let providerCalls = 0;
    const triggers: string[] = [];
    const digests: string[] = [];
    const result = await runNativeRuntimeKernel({
      messages,
      budget: DEFAULT_RUNTIME_KERNEL_BUDGET,
      inputBudget: {
        transport: "openai_responses",
        modelRef: "openai/gpt-6-luna",
        reservedOutputTokens: 1_600,
        toolSchemas: [],
        recordPlan: () => undefined,
        recordProjection: ({ trigger, digest }) => {
          triggers.push(trigger);
          digests.push(digest);
        },
      },
      runCompletion: async (providerMessages) => {
        providerCalls += 1;
        if (providerCalls === 1) {
          return {
            ok: false,
            status: 413,
            code: "context_window_exceeded",
            message: "provider rejected context",
          };
        }
        expect(providerMessages).toEqual([messages[0], messages[3]]);
        return {
          ok: true,
          type: "assistant",
          assistantText: "Recovered.",
          promptTokens: 10,
          completionTokens: 2,
          resolvedModelId: "gpt-6-luna",
        };
      },
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      executeTool: async () => ({
        status: "ok",
        exitCode: 0,
        outputText: "",
        errorCode: null,
        errorMessage: null,
      }),
    });

    expect(result.ok).toBe(true);
    expect(providerCalls).toBe(2);
    expect(triggers).toEqual(["provider_overflow"]);
    expect(digests).toEqual([
      await sha256RuntimeProviderContext([messages[0], messages[3]]),
    ]);
    expect(result.transcript.slice(0, messages.length)).toEqual(messages);
  });

  it("fails closed before provider execution when projection evidence cannot persist", async () => {
    let providerCalls = 0;
    const result = await runNativeRuntimeKernel({
      messages: [
        { role: "system", content: "Canonical policy." },
        { role: "user", content: "x".repeat(2_400_000) },
        { role: "assistant", content: "Old answer." },
        { role: "user", content: "Current request." },
      ],
      budget: DEFAULT_RUNTIME_KERNEL_BUDGET,
      inputBudget: {
        transport: "openai_responses",
        modelRef: "openai/gpt-6-luna",
        reservedOutputTokens: 1_600,
        toolSchemas: [],
        recordPlan: () => undefined,
        recordProjection: () => {
          throw new Error("event store unavailable");
        },
      },
      runCompletion: async () => {
        providerCalls += 1;
        return {
          ok: true,
          type: "assistant",
          assistantText: "must not run",
          promptTokens: 1,
          completionTokens: 1,
          resolvedModelId: "gpt-6-luna",
        };
      },
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      executeTool: async () => ({
        status: "ok",
        exitCode: 0,
        outputText: "",
        errorCode: null,
        errorMessage: null,
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.code).toBe(
      "runtime_context_projection_evidence_unavailable",
    );
    expect(providerCalls).toBe(0);
  });

  it("does not retry when provider-overflow projection cannot save tokens", async () => {
    let providerCalls = 0;
    let projectionRecords = 0;
    const result = await runNativeRuntimeKernel({
      messages: [
        { role: "system", content: "Canonical policy." },
        { role: "user", content: "Current request cannot be omitted." },
      ],
      budget: DEFAULT_RUNTIME_KERNEL_BUDGET,
      inputBudget: {
        transport: "openai_responses",
        modelRef: "openai/gpt-6-luna",
        reservedOutputTokens: 1_600,
        toolSchemas: [],
        recordPlan: () => undefined,
        recordProjection: () => {
          projectionRecords += 1;
        },
      },
      runCompletion: async () => {
        providerCalls += 1;
        return {
          ok: false,
          status: 413,
          code: "context_window_exceeded",
          message: "provider rejected context",
        };
      },
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      executeTool: async () => ({
        status: "ok",
        exitCode: 0,
        outputText: "",
        errorCode: null,
        errorMessage: null,
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.code).toBe("context_window_exceeded");
    expect(providerCalls).toBe(1);
    expect(projectionRecords).toBe(0);
  });
});
