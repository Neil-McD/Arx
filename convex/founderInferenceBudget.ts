import { resolveRuntimeModelCapacityProfile } from "../shared/runtimeInputBudget";
import {
  calculateFounderRequestCosts,
  calculateFounderRunCostMicros,
} from "./founderPlanPricing";
import type { CommunityInferenceFundingSession } from "./founderInferenceRuntime";
import type { FounderInferenceUsageTotals } from "./founderInferenceUsage";

export const FOUNDER_INFERENCE_RUN_BUDGET_EXHAUSTED = "founder_inference_run_budget_exhausted";
export const FOUNDER_INFERENCE_USAGE_INCOMPLETE = "founder_inference_usage_incomplete";

// Estimate is insufficient here: the next provider call must fit even if it
// consumes the model's entire context and receives no cache discount.
export function assertPaidLuna6ProviderHeadroom(args: {
  session: CommunityInferenceFundingSession;
  usage: FounderInferenceUsageTotals;
  maxOutputTokens: number;
}): void {
  if (args.session.modelId !== "gpt-6-luna") return;
  if (!args.usage.complete) throw new Error(FOUNDER_INFERENCE_USAGE_INCOMPLETE);
  const { reservedCostMicros, pricingSnapshot } = args.session;
  if (!Number.isSafeInteger(reservedCostMicros) || (reservedCostMicros ?? 0) <= 0 || !pricingSnapshot) {
    throw new Error("founder_usage_receipt_authority_missing");
  }
  if (pricingSnapshot.modelId !== args.session.modelId || args.usage.modelId !== args.session.modelId) {
    throw new Error("founder_inference_model_changed_before_start");
  }
  if (!Number.isSafeInteger(args.maxOutputTokens) || args.maxOutputTokens <= 0) {
    throw new Error("founder_inference_output_budget_invalid");
  }
  const profile = resolveRuntimeModelCapacityProfile({
    transport: "openai_responses",
    modelRef: `openai/${args.session.modelId}`,
  });
  if (!profile) throw new Error("runtime_model_capacity_unknown");
  const spent = args.usage.providerRequests.length
    ? calculateFounderRequestCosts({
      requests: args.usage.providerRequests,
      pricing: pricingSnapshot,
      promptTokens: args.usage.promptTokens,
      completionTokens: args.usage.completionTokens,
    })
    : 0;
  const nextRequestMaximum = calculateFounderRunCostMicros({
    promptTokens: profile.contextWindowTokens,
    completionTokens: args.maxOutputTokens,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    pricing: pricingSnapshot,
  });
  if (spent + nextRequestMaximum > reservedCostMicros!) {
    throw new Error(FOUNDER_INFERENCE_RUN_BUDGET_EXHAUSTED);
  }
}

export function founderInferenceBudgetFailureCode(error: unknown): string | null {
  const code = error instanceof Error ? error.message : String(error ?? "");
  return code === FOUNDER_INFERENCE_RUN_BUDGET_EXHAUSTED || code === FOUNDER_INFERENCE_USAGE_INCOMPLETE
    ? code : null;
}
