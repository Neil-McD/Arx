import { beforeEach, expect, test, vi } from "vitest";
import { snapshotFounderRunPricing } from "./founderPlanPricing";
import { startFundedInferenceRun } from "./fundedInferenceGateway";
import {
  claimCommunityInferenceFundingSession,
  failCommunityInferenceFundingSession,
  markCommunityInferenceFundingSessionProviderStarted,
  settleCommunityInferenceFundingSession,
} from "./founderInferenceRuntime";
import { runOpenAiNativeToolCompletion } from "./openAiNativeToolCompletion";

vi.mock("./founderInferenceRuntime", () => ({
  claimCommunityInferenceFundingSession: vi.fn(),
  failCommunityInferenceFundingSession: vi.fn(),
  markCommunityInferenceFundingSessionProviderStarted: vi.fn(),
  providerFailureIsKnownPreSpend: (code: string) => code === "invalid_openai_request",
  settleCommunityInferenceFundingSession: vi.fn(),
}));
vi.mock("./openAiNativeToolCompletion", () => ({ runOpenAiNativeToolCompletion: vi.fn() }));

const pricingSnapshot = snapshotFounderRunPricing("gpt-6-luna", {
  pricingVersion: "founder_plan_luna_v1",
  inputCostMicrosPerMillionTokens: 1_000_000,
  outputCostMicrosPerMillionTokens: 2_000_000,
});
const session = {
  receiptKey: "community_setup_generation:wiki_architect:test",
  claimToken: "test-claim",
  fundingMode: "platform_subscription" as const,
  modelId: "gpt-6-luna",
  reservedCostMicros: 1_000_000,
  pricingSnapshot,
};
const claim = {
  ctx: {}, communityId: "community", actorUserId: "owner",
  surface: "community_setup_generation" as const,
  receiptKey: session.receiptKey, sourceRunId: "wiki:test",
  admission: { ok: true, mode: "platform_subscription" as const,
    payerUserId: "owner", subscriptionId: "subscription", transitional: false,
    modelId: "gpt-5.6-luna" as const },
};
const request = { messages: [{ role: "user" as const, content: "Propose a structure" }],
  maxTokens: 3600, tools: [] };
const providerRequestUsage = { requestId: "resp_setup", modelId: "gpt-6-luna",
  serviceTier: "default", promptTokens: 1200, completionTokens: 80,
  cachedInputTokens: 0, cacheWriteTokens: 600 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(claimCommunityInferenceFundingSession).mockResolvedValue(session);
  vi.mocked(markCommunityInferenceFundingSessionProviderStarted).mockResolvedValue();
  vi.mocked(settleCommunityInferenceFundingSession).mockResolvedValue();
  vi.mocked(failCommunityInferenceFundingSession).mockResolvedValue();
});

test("setup sends the receipt model and settles its exact provider request", async () => {
  vi.mocked(runOpenAiNativeToolCompletion).mockResolvedValue({
    ok: true, type: "assistant", assistantText: "{}", resolvedModelId: "gpt-6-luna",
    promptTokens: 1200, completionTokens: 80, providerRequestUsage,
  });
  const run = await startFundedInferenceRun(claim as any);
  expect(await run.request(request)).toMatchObject({ ok: true, type: "assistant" });
  expect(await run.settle("provider_completed")).toBe(true);
  expect(runOpenAiNativeToolCompletion).toHaveBeenCalledWith(expect.objectContaining({ modelId: "gpt-6-luna" }));
  expect(settleCommunityInferenceFundingSession).toHaveBeenCalledWith(expect.objectContaining({
    promptTokens: 1200, completionTokens: 80, providerRequests: [providerRequestUsage],
  }));
  expect(markCommunityInferenceFundingSessionProviderStarted).toHaveBeenCalledTimes(1);
  await expect(run.request(request)).rejects.toThrow("founder_inference_run_finalized");
});

test("missing Luna 6 request breakdown cannot settle a paid setup run", async () => {
  vi.mocked(runOpenAiNativeToolCompletion).mockResolvedValue({
    ok: true, type: "assistant", assistantText: "{}", resolvedModelId: "gpt-6-luna",
    promptTokens: 1200, completionTokens: 80,
  });
  const run = await startFundedInferenceRun(claim as any);
  await run.request(request);
  expect(await run.settle("provider_completed")).toBe(false);
  expect(settleCommunityInferenceFundingSession).not.toHaveBeenCalled();
  expect(failCommunityInferenceFundingSession).toHaveBeenCalledWith(expect.objectContaining({
    usageComplete: false, failureCode: "provider_token_usage_missing", disposition: "indeterminate",
  }));
});

test("insufficient paid headroom prevents provider start", async () => {
  vi.mocked(claimCommunityInferenceFundingSession).mockResolvedValue({ ...session, reservedCostMicros: 1 });
  const run = await startFundedInferenceRun(claim as any);
  await expect(run.request(request)).rejects.toThrow("founder_inference_run_budget_exhausted");
  expect(markCommunityInferenceFundingSessionProviderStarted).not.toHaveBeenCalled();
  expect(runOpenAiNativeToolCompletion).not.toHaveBeenCalled();
});

test("legacy 5.6 setup still settles from aggregate usage", async () => {
  vi.mocked(claimCommunityInferenceFundingSession).mockResolvedValue({
    ...session, modelId: "gpt-5.6-luna", pricingSnapshot: undefined,
  });
  vi.mocked(runOpenAiNativeToolCompletion).mockResolvedValue({
    ok: true, type: "assistant", assistantText: "{}", resolvedModelId: "gpt-5.6-luna",
    promptTokens: 1200, completionTokens: 80,
  });
  const run = await startFundedInferenceRun(claim as any);
  await run.request(request);
  expect(await run.settle("provider_completed")).toBe(true);
  expect(settleCommunityInferenceFundingSession).toHaveBeenCalledWith(expect.objectContaining({
    promptTokens: 1200, completionTokens: 80, providerRequests: undefined,
  }));
});

test("a multi-step run settles each provider request exactly once", async () => {
  vi.mocked(runOpenAiNativeToolCompletion)
    .mockResolvedValueOnce({
      ok: true, type: "assistant", assistantText: "first", resolvedModelId: "gpt-6-luna",
      promptTokens: 1200, completionTokens: 80, providerRequestUsage,
    })
    .mockResolvedValueOnce({
      ok: true, type: "assistant", assistantText: "second", resolvedModelId: "gpt-6-luna",
      promptTokens: 800, completionTokens: 40,
      providerRequestUsage: { ...providerRequestUsage, requestId: "resp_second",
        promptTokens: 800, completionTokens: 40 },
    });
  const run = await startFundedInferenceRun(claim as any);
  await run.request(request);
  await run.request(request);
  expect(run.usage()).toMatchObject({
    promptTokens: 2000, completionTokens: 120, providerRequestCount: 2, complete: true,
  });
  expect(await run.settle("provider_completed")).toBe(true);
  expect(markCommunityInferenceFundingSessionProviderStarted).toHaveBeenCalledTimes(1);
  expect(settleCommunityInferenceFundingSession).toHaveBeenCalledWith(expect.objectContaining({
    promptTokens: 2000, completionTokens: 120,
    providerRequests: [providerRequestUsage,
      expect.objectContaining({ requestId: "resp_second" })],
  }));
});

test("a later unmetered response makes the whole multi-step run indeterminate", async () => {
  vi.mocked(runOpenAiNativeToolCompletion)
    .mockResolvedValueOnce({
      ok: true, type: "assistant", assistantText: "first", resolvedModelId: "gpt-6-luna",
      promptTokens: 1200, completionTokens: 80, providerRequestUsage,
    })
    .mockResolvedValueOnce({
      ok: true, type: "assistant", assistantText: "second", resolvedModelId: "gpt-6-luna",
      promptTokens: 800, completionTokens: 40,
    });
  const run = await startFundedInferenceRun(claim as any);
  await run.request(request);
  await run.request(request);
  expect(run.usage().complete).toBe(false);
  await expect(run.request(request)).rejects.toThrow("founder_inference_usage_incomplete");
  expect(runOpenAiNativeToolCompletion).toHaveBeenCalledTimes(2);
  expect(await run.settle("provider_completed")).toBe(false);
  expect(settleCommunityInferenceFundingSession).not.toHaveBeenCalled();
  expect(failCommunityInferenceFundingSession).toHaveBeenCalledWith(expect.objectContaining({
    usageComplete: false, disposition: "indeterminate",
  }));
});
