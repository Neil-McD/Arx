import { expect, test } from "vitest";
import {
  calculateFounderRunCostMicros,
  snapshotFounderRunPricing,
} from "./founderPlanPricing";
const legacy = {
  pricingVersion: "founder_plan_luna_v1",
  inputCostMicrosPerMillionTokens: 200_000,
  outputCostMicrosPerMillionTokens: 1_200_000,
};
const pricing = snapshotFounderRunPricing("gpt-6-luna", legacy);
test("Luna 6 standard cost distinguishes ordinary, cached, and cache-write input", () => {
  expect(
    calculateFounderRunCostMicros({
      pricing,
      promptTokens: 100_000,
      completionTokens: 10_000,
      cachedInputTokens: 20_000,
      cacheWriteTokens: 10_000,
    }),
  ).toBe(13_450);
});
test("long context reprices the full request only above 272K", () => {
  const cost = (promptTokens: number) =>
    calculateFounderRunCostMicros({
      pricing,
      promptTokens,
      completionTokens: 1000,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
    });
  expect(cost(272_000)).toBe(27_700);
  expect(cost(272_001)).toBe(55_151);
});
test("missing usage, inconsistent counts, and altered price profiles fail closed", () => {
  expect(() =>
    calculateFounderRunCostMicros({
      pricing,
      promptTokens: 100,
      completionTokens: 1,
    }),
  ).toThrow("usage_breakdown_missing");
  expect(() =>
    calculateFounderRunCostMicros({
      pricing,
      promptTokens: 100,
      completionTokens: 1,
      cachedInputTokens: 101,
      cacheWriteTokens: 0,
    }),
  ).toThrow("usage_invalid");
  expect(() =>
    calculateFounderRunCostMicros({
      pricing: { ...pricing, longContextThresholdTokens: undefined },
      promptTokens: 100,
      completionTokens: 1,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
    }),
  ).toThrow("pricing_misconfigured");
});
test("legacy Luna pricing retains its original arithmetic", () => {
  expect(
    calculateFounderRunCostMicros({
      pricing: snapshotFounderRunPricing("gpt-5.6-luna", legacy),
      promptTokens: 1000,
      completionTokens: 500,
    }),
  ).toBe(800);
});

test("long-context thresholds apply to each provider request, never accumulated run input", async () => {
  const { calculateFounderRequestCosts } = await import("./founderPlanPricing");
  const requests = ["resp_a", "resp_b"].map(requestId => ({ requestId, modelId: "gpt-6-luna", serviceTier: "default",
    promptTokens: 150_000, completionTokens: 1000, cachedInputTokens: 0, cacheWriteTokens: 0 }));
  expect(calculateFounderRequestCosts({ requests, pricing, promptTokens: 300_000, completionTokens: 2000 })).toBe(31_000);
  for (const bad of [
    [requests[0], requests[0]],
    [{ ...requests[0], serviceTier: "priority" }, requests[1]],
    [{ ...requests[0], modelId: "gpt-5.6-luna" }, requests[1]],
  ]) expect(() => calculateFounderRequestCosts({ requests: bad, pricing, promptTokens: 300_000, completionTokens: 2000 })).toThrow("request_usage_invalid");
});
