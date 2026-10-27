import { describe, expect, it } from "vitest";
import {
  buildAssistantToolCallMessage,
  type NativeToolAwareMessage,
} from "../shared/nativeToolProtocol.ts";
import { runNativeRuntimeKernel } from "../shared/runtimeKernel.ts";
import { DEFAULT_RUNTIME_KERNEL_BUDGET } from "../shared/runtimeKernelTypes.ts";
import {
  listRuntimeModelCapacityProfiles,
  planRuntimeInputBudget,
  resolveRuntimeModelCapacityProfile,
  resolveRuntimeProviderBudgetIdentity,
  RUNTIME_MODEL_CAPACITY_UNKNOWN_CODE,
} from "../shared/runtimeInputBudget.ts";

const baseMessages: NativeToolAwareMessage[] = [
  { role: "system", content: "Inspect the authorized community." },
  { role: "user", content: "What is happening here?" },
];

describe("runtime input budget", () => {
  it("admits every reviewed runtime capacity profile", () => {
    for (const profile of listRuntimeModelCapacityProfiles()) {
      const plan = planRuntimeInputBudget({
        transport: profile.transport,
        modelRef: profile.modelRef,
        messages: baseMessages,
        toolSchemas: [],
        reservedOutputTokens: 1_600,
      });
      expect(plan.fits, plan.profileKey).toBe(true);
      expect(plan.contextWindowTokens).toBe(profile.contextWindowTokens);
    }
  });

  it("proves deterministic fit and overflow boundaries for every profile", () => {
    for (const profile of listRuntimeModelCapacityProfiles()) {
      const emptyPlan = planRuntimeInputBudget({
        transport: profile.transport,
        modelRef: profile.modelRef,
        messages: [{ role: "user", content: "" }],
        toolSchemas: [],
        reservedOutputTokens: 1_600,
      });
      const availableTokens =
        emptyPlan.usableInputTokens - emptyPlan.estimatedInputTokens;
      const nearLimitCharacters = Math.max(0, availableTokens * 2 - 2);
      const fit = planRuntimeInputBudget({
        transport: profile.transport,
        modelRef: profile.modelRef,
        messages: [{ role: "user", content: "x".repeat(nearLimitCharacters) }],
        toolSchemas: [],
        reservedOutputTokens: 1_600,
      });
      const overflow = planRuntimeInputBudget({
        transport: profile.transport,
        modelRef: profile.modelRef,
        messages: [
          { role: "user", content: "x".repeat(nearLimitCharacters + 8) },
        ],
        toolSchemas: [],
        reservedOutputTokens: 1_600,
      });
      expect(fit.fits, `${profile.transport}:${profile.modelRef}`).toBe(true);
      expect(overflow.fits, `${profile.transport}:${profile.modelRef}`).toBe(
        false,
      );
    }
  });

  it("fails closed for an unreviewed resolved model reference", () => {
    const plan = planRuntimeInputBudget({
      transport: "openai_responses",
      modelRef: "openai/unreviewed-override",
      messages: baseMessages,
      toolSchemas: [],
      reservedOutputTokens: 1_600,
    });
    expect(plan.fits).toBe(false);
    expect(plan.failureCode).toBe(RUNTIME_MODEL_CAPACITY_UNKNOWN_CODE);
  });

  it("counts tool schemas, output reserve, and images", () => {
    const withoutExtras = planRuntimeInputBudget({
      transport: "openai_responses",
      modelRef: "openai/gpt-5.6-sol",
      messages: baseMessages,
      toolSchemas: [],
      reservedOutputTokens: 1_600,
    });
    const withExtras = planRuntimeInputBudget({
      transport: "openai_responses",
      modelRef: "openai/gpt-5.6-sol",
      messages: [
        ...baseMessages,
        {
          role: "user",
          content: [
            { type: "text", text: "Inspect this image." },
            { type: "image", imageUrl: "data:image/png;base64,AAAA" },
          ],
        },
      ],
      toolSchemas: [
        {
          type: "function",
          name: "polynet_search",
          parameters: { type: "object", properties: { query: { type: "string" } } },
        },
      ],
      reservedOutputTokens: 3_200,
    });
    expect(withExtras.messageTokens).toBeGreaterThan(withoutExtras.messageTokens);
    expect(withExtras.toolSchemaTokens).toBeGreaterThan(withoutExtras.toolSchemaTokens);
    expect(withExtras.imageCount).toBe(1);
    expect(withExtras.imageTokens).toBeGreaterThan(0);
    expect(withExtras.usableInputTokens).toBeLessThan(
      withoutExtras.usableInputTokens,
    );
  });

  it("is monotonic as transcript content grows", () => {
    const shortPlan = planRuntimeInputBudget({
      transport: "openai_responses",
      modelRef: "openai/gpt-6-luna",
      messages: baseMessages,
      toolSchemas: [],
      reservedOutputTokens: 1_600,
    });
    const longPlan = planRuntimeInputBudget({
      transport: "openai_responses",
      modelRef: "openai/gpt-6-luna",
      messages: [
        ...baseMessages,
        { role: "user", content: "x".repeat(2_400_000) },
      ],
      toolSchemas: [],
      reservedOutputTokens: 1_600,
    });
    expect(longPlan.estimatedInputTokens).toBeGreaterThan(
      shortPlan.estimatedInputTokens,
    );
    expect(longPlan.fits).toBe(false);
    expect(longPlan.failureCode).toBe("context_window_exceeded");
  });

  it("binds admission to the OpenAI transport and the exact effective reference", () => {
    expect(
      resolveRuntimeProviderBudgetIdentity({
        inferenceSource: "platform",
        requestedModelId: "gpt-6-luna",
        modelRef: "openai/gpt-6-luna",
      }),
    ).toEqual({
      transport: "openai_responses",
      modelRef: "openai/gpt-6-luna",
    });
    const unreviewed = resolveRuntimeProviderBudgetIdentity({
      inferenceSource: "platform",
      requestedModelId: "sonnet-4.6",
      modelRef: "anthropic/claude-sonnet-4.6",
    });
    expect(unreviewed).toEqual({
      transport: "openai_responses",
      modelRef: "anthropic/claude-sonnet-4.6",
    });
    expect(resolveRuntimeModelCapacityProfile(unreviewed)).toBeNull();
  });

  it("rejects unknown capacity before provider execution and records the plan", async () => {
    let providerCalls = 0;
    const evidence: Array<{ kind: string; fits: boolean }> = [];
    const result = await runNativeRuntimeKernel({
      messages: baseMessages,
      budget: DEFAULT_RUNTIME_KERNEL_BUDGET,
      inputBudget: {
        transport: "openai_responses",
        modelRef: "openai/unreviewed-override",
        reservedOutputTokens: 1_600,
        toolSchemas: [],
        recordPlan: ({ kind, plan }) => {
          evidence.push({ kind, fits: plan.fits });
        },
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
          resolvedModelId: "unreviewed-override",
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
      RUNTIME_MODEL_CAPACITY_UNKNOWN_CODE,
    );
    expect(providerCalls).toBe(0);
    expect(evidence).toEqual([{ kind: "initial", fits: false }]);
  });

  it("rejects oversized input before provider execution", async () => {
    let providerCalls = 0;
    const result = await runNativeRuntimeKernel({
      messages: [
        { role: "user", content: "x".repeat(2_400_000) },
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

  it("projects an oversized preflight context before the first provider request", async () => {
    let providerCalls = 0;
    const projections: Array<{
      trigger: string;
      omittedRanges: Array<{ start: number; end: number }>;
    }> = [];
    const result = await runNativeRuntimeKernel({
      messages: [
        { role: "system", content: "Inspect only the authorized community." },
        { role: "user", content: "x".repeat(2_400_000) },
        { role: "assistant", content: "Prior answer." },
        { role: "user", content: "What is happening now?" },
      ],
      budget: DEFAULT_RUNTIME_KERNEL_BUDGET,
      inputBudget: {
        transport: "openai_responses",
        modelRef: "openai/gpt-6-luna",
        reservedOutputTokens: 1_600,
        toolSchemas: [],
        recordPlan: () => undefined,
        recordProjection: ({ trigger, projection }) => {
          projections.push({
            trigger,
            omittedRanges: projection.omittedRanges,
          });
        },
      },
      runCompletion: async (messages) => {
        providerCalls += 1;
        expect(messages).toEqual([
          { role: "system", content: "Inspect only the authorized community." },
          { role: "user", content: "What is happening now?" },
        ]);
        return {
          ok: true,
          type: "assistant",
          assistantText: "Current answer.",
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
    expect(result.ok).toBe(true);
    expect(providerCalls).toBe(1);
    expect(projections).toEqual([
      {
        trigger: "preflight_overflow",
        omittedRanges: [{ start: 1, end: 2 }],
      },
    ]);
    expect(result.transcript.slice(0, 4)).toEqual([
      { role: "system", content: "Inspect only the authorized community." },
      { role: "user", content: "x".repeat(2_400_000) },
      { role: "assistant", content: "Prior answer." },
      { role: "user", content: "What is happening now?" },
    ]);
  });

  it("records changed follow-up plans as deltas", async () => {
    let providerCalls = 0;
    const evidenceKinds: string[] = [];
    const result = await runNativeRuntimeKernel<"polynet_search">({
      messages: baseMessages,
      budget: DEFAULT_RUNTIME_KERNEL_BUDGET,
      inputBudget: {
        transport: "openai_responses",
        modelRef: "openai/gpt-5.6-sol",
        reservedOutputTokens: 1_600,
        toolSchemas: [
          { type: "function", name: "polynet_search" },
        ],
        recordPlan: ({ kind }) => {
          evidenceKinds.push(kind);
        },
        recordProjection: () => undefined,
      },
      runCompletion: async () => {
        providerCalls += 1;
        if (providerCalls === 1) {
          return {
            ok: true,
            type: "tool_call",
            providerCallId: "search-1",
            toolName: "polynet_search",
            arguments: { query: "recent activity" },
            assistantToolCallMessage: buildAssistantToolCallMessage({
              providerCallId: "search-1",
              toolName: "polynet_search",
              rawArguments: JSON.stringify({ query: "recent activity" }),
            }),
            promptTokens: 10,
            completionTokens: 5,
            resolvedModelId: "gpt-5.6-sol",
          };
        }
        return {
          ok: true,
          type: "assistant",
          assistantText: "The community is active.",
          promptTokens: 20,
          completionTokens: 8,
          resolvedModelId: "gpt-5.6-sol",
        };
      },
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      executeTool: async () => ({
        status: "ok",
        exitCode: 0,
        outputText: "Two recent discussions.",
        errorCode: null,
        errorMessage: null,
      }),
    });
    expect(result.ok).toBe(true);
    expect(providerCalls).toBe(2);
    expect(evidenceKinds).toEqual(["initial", "delta"]);
  });
});
