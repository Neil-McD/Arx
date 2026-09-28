import { expect, test } from "vitest";
import { assertPaidLuna6ProviderHeadroom, FOUNDER_INFERENCE_RUN_BUDGET_EXHAUSTED, FOUNDER_INFERENCE_USAGE_INCOMPLETE } from "./founderInferenceBudget";
import { snapshotFounderRunPricing } from "./founderPlanPricing";
import { createFounderInferenceUsageTotals, recordFounderProviderSuccess } from "./founderInferenceUsage";
import type { CommunityInferenceFundingSession } from "./founderInferenceRuntime";

const pricingSnapshot = snapshotFounderRunPricing("gpt-6-luna", {
  pricingVersion: "founder_plan_luna_v1",
  inputCostMicrosPerMillionTokens: 1_000_000,
  outputCostMicrosPerMillionTokens: 2_000_000,
});
const session: CommunityInferenceFundingSession = {
  receiptKey: "member_agent_dock:paid", claimToken: "claim", fundingMode: "platform_subscription",
  modelId: "gpt-6-luna", reservedCostMicros: 1_000_000, pricingSnapshot,
};

test("paid Luna 6 stops before a provider call could exceed the immutable reservation", () => {
  const usage = createFounderInferenceUsageTotals("gpt-6-luna");
  const check = () => assertPaidLuna6ProviderHeadroom({ session, usage, maxOutputTokens: 2048 });
  expect(check).not.toThrow();
  for (let index = 0; index < 4; index += 1) {
    const providerRequestUsage = { requestId: `resp_${index}`, modelId: "gpt-6-luna", serviceTier: "default",
      promptTokens: 1_047_952, completionTokens: 2048, cachedInputTokens: 0, cacheWriteTokens: 0 };
    recordFounderProviderSuccess(usage, { promptTokens: providerRequestUsage.promptTokens,
      completionTokens: providerRequestUsage.completionTokens, providerRequestUsage });
    if (index < 3) expect(check).not.toThrow();
  }
  expect(check).toThrow(FOUNDER_INFERENCE_RUN_BUDGET_EXHAUSTED);
  expect(usage.complete).toBe(true);
});

test("unknown prior usage blocks another paid call and keeps the indeterminate path", () => {
  const usage = createFounderInferenceUsageTotals("gpt-6-luna");
  recordFounderProviderSuccess(usage, { promptTokens: 100, completionTokens: 10 });
  expect(() => assertPaidLuna6ProviderHeadroom({ session, usage, maxOutputTokens: 2048 }))
    .toThrow(FOUNDER_INFERENCE_USAGE_INCOMPLETE);
});

test("Luna 6 fails closed on missing reservation for both funding modes; legacy turns keep their path", () => {
  const usage = createFounderInferenceUsageTotals("gpt-6-luna");
  expect(() => assertPaidLuna6ProviderHeadroom({ session: { ...session, reservedCostMicros: undefined }, usage, maxOutputTokens: 2048 }))
    .toThrow("founder_usage_receipt_authority_missing");
  const operator = { ...session, fundingMode: "platform_operator_grant" as const };
  expect(() => assertPaidLuna6ProviderHeadroom({ session: operator, usage, maxOutputTokens: 2048 }))
    .not.toThrow();
  expect(() => assertPaidLuna6ProviderHeadroom({ session: { ...operator, reservedCostMicros: undefined }, usage, maxOutputTokens: 2048 }))
    .toThrow("founder_usage_receipt_authority_missing");
  // An operator run is held to its reservation exactly like a Builder run.
  expect(() => assertPaidLuna6ProviderHeadroom({ session: { ...operator, reservedCostMicros: 1 }, usage, maxOutputTokens: 2048 }))
    .toThrow(FOUNDER_INFERENCE_RUN_BUDGET_EXHAUSTED);
  expect(() => assertPaidLuna6ProviderHeadroom({ session: { ...session, modelId: "gpt-5.6-luna" }, usage, maxOutputTokens: 2048 }))
    .not.toThrow();
});
