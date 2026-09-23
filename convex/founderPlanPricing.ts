import { v } from "convex/values";
import type { FounderProviderRequestUsage } from "../shared/founderInference";
import {
  POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS,
  POLYNET_FOUNDER_PLAN_PRICING_VERSION,
} from "../shared/founderPlan";

export type FounderInferencePricing = {
  pricingVersion: typeof POLYNET_FOUNDER_PLAN_PRICING_VERSION;
  includedCostMicros: number;
  inputCostMicrosPerMillionTokens: number;
  outputCostMicrosPerMillionTokens: number;
  maxRunReservationCostMicros: number;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

export function requireFounderStripePriceIdFromEnv(): string {
  const priceId = readEnv("POLYNET_FOUNDER_STRIPE_PRICE_ID");
  if (!priceId) throw new Error("founder_stripe_price_id_missing");
  return priceId;
}

function positiveSafeInteger(raw: unknown): number | null {
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function resolveFounderInferencePricing(
  values: Record<string, unknown>,
): FounderInferencePricing | null {
  const inputCostMicrosPerMillionTokens = positiveSafeInteger(
    values.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS,
  );
  const outputCostMicrosPerMillionTokens = positiveSafeInteger(
    values.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
  );
  const maxRunReservationCostMicros = positiveSafeInteger(
    values.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS,
  );
  if (
    inputCostMicrosPerMillionTokens === null ||
    outputCostMicrosPerMillionTokens === null ||
    maxRunReservationCostMicros === null ||
    maxRunReservationCostMicros > POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS
  ) {
    return null;
  }
  return {
    pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
    includedCostMicros: POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS,
    inputCostMicrosPerMillionTokens,
    outputCostMicrosPerMillionTokens,
    maxRunReservationCostMicros,
  };
}

export function readFounderInferencePricingFromEnv(): FounderInferencePricing | null {
  return resolveFounderInferencePricing({
    POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS: readEnv(
      "POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS",
    ),
    POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: readEnv(
      "POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS",
    ),
    POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS: readEnv(
      "POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS",
    ),
  });
}

export function requireFounderInferencePricingFromEnv(): FounderInferencePricing {
  const pricing = readFounderInferencePricingFromEnv();
  if (!pricing) throw new Error("founder_inference_pricing_misconfigured");
  return pricing;
}

export function calculateFounderInferenceCostMicros(args: {
  promptTokens: number;
  completionTokens: number;
  pricing: FounderInferencePricing;
}): number {
  const promptTokens = Math.max(0, Math.floor(args.promptTokens));
  const completionTokens = Math.max(0, Math.floor(args.completionTokens));
  const numerator =
    promptTokens * args.pricing.inputCostMicrosPerMillionTokens +
    completionTokens * args.pricing.outputCostMicrosPerMillionTokens;
  if (!Number.isSafeInteger(numerator)) {
    throw new Error("founder_inference_cost_overflow");
  }
  return Math.ceil(numerator / 1_000_000);
}

// Receipt-local prices are immutable execution evidence. Monthly cycles remain
// allowance buckets; their legacy prices only settle pre-snapshot receipts.
export type FounderRunPricing = {
  modelId: string;
  pricingVersion: string;
  inputCostMicrosPerMillionTokens: number;
  outputCostMicrosPerMillionTokens: number;
  cachedInputCostMicrosPerMillionTokens?: number;
  cacheWriteCostMicrosPerMillionTokens?: number;
  longContextThresholdTokens?: number;
};

export function snapshotFounderRunPricing(
  modelId: string,
  legacyPricing: Pick<
    FounderRunPricing,
    | "pricingVersion"
    | "inputCostMicrosPerMillionTokens"
    | "outputCostMicrosPerMillionTokens"
  >,
): FounderRunPricing {
  if (modelId === "gpt-6-luna") {
    // Standard processing; other service tiers are not admitted by this profile.
    return {
      modelId,
      pricingVersion: "gpt_6_luna_standard_v1",
      inputCostMicrosPerMillionTokens: 100_000,
      outputCostMicrosPerMillionTokens: 500_000,
      cachedInputCostMicrosPerMillionTokens: 10_000,
      cacheWriteCostMicrosPerMillionTokens: 125_000,
      longContextThresholdTokens: 272_000,
    };
  }
  if (modelId !== "gpt-5.6-luna")
    throw new Error("founder_inference_model_unsupported");
  const snapshot = {
    modelId,
    pricingVersion: legacyPricing.pricingVersion,
    inputCostMicrosPerMillionTokens:
      legacyPricing.inputCostMicrosPerMillionTokens,
    outputCostMicrosPerMillionTokens:
      legacyPricing.outputCostMicrosPerMillionTokens,
  };
  validateFounderRunPricing(snapshot, modelId, snapshot.pricingVersion);
  return snapshot;
}

export function validateFounderRunPricing(
  pricing: FounderRunPricing,
  modelId: string,
  version: string | undefined,
): void {
  const expectedVersion =
    modelId === "gpt-5.6-luna"
      ? "founder_plan_luna_v1"
      : modelId === "gpt-6-luna"
        ? "gpt_6_luna_standard_v1"
        : null;
  if (
    !expectedVersion ||
    pricing.modelId !== modelId ||
    pricing.pricingVersion !== version ||
    version !== expectedVersion
  ) {
    throw new Error("founder_inference_pricing_version_mismatch");
  }
  if (modelId === "gpt-6-luna") {
    const expected = snapshotFounderRunPricing(modelId, pricing);
    for (const key of Object.keys(expected) as Array<keyof FounderRunPricing>) {
      if (pricing[key] !== expected[key])
        throw new Error("founder_inference_pricing_misconfigured");
    }
  }
  if (
    !positiveSafeInteger(pricing.inputCostMicrosPerMillionTokens) ||
    !positiveSafeInteger(pricing.outputCostMicrosPerMillionTokens)
  ) {
    throw new Error("founder_inference_pricing_misconfigured");
  }
}

export function calculateFounderRunCostMicros(args: {
  promptTokens: number;
  completionTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  pricing: FounderRunPricing;
}): number {
  const { pricing } = args;
  validateFounderRunPricing(pricing, pricing.modelId, pricing.pricingVersion);
  const cached = args.cachedInputTokens ?? 0;
  const writes = args.cacheWriteTokens ?? 0;
  if (
    ![args.promptTokens, args.completionTokens, cached, writes].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    cached + writes > args.promptTokens
  )
    throw new Error("founder_inference_usage_invalid");
  if (
    pricing.modelId === "gpt-6-luna" &&
    (args.cachedInputTokens === undefined ||
      args.cacheWriteTokens === undefined)
  ) {
    throw new Error("founder_inference_usage_breakdown_missing");
  }
  const long =
    pricing.longContextThresholdTokens !== undefined &&
    args.promptTokens > pricing.longContextThresholdTokens;
  const input =
    (args.promptTokens - cached - writes) *
      pricing.inputCostMicrosPerMillionTokens +
    cached *
      (pricing.cachedInputCostMicrosPerMillionTokens ??
        pricing.inputCostMicrosPerMillionTokens) +
    writes *
      (pricing.cacheWriteCostMicrosPerMillionTokens ??
        pricing.inputCostMicrosPerMillionTokens);
  // Doubled numerator keeps the long-context output multiplier exact.
  const numerator =
    input * (long ? 4 : 2) +
    args.completionTokens *
      pricing.outputCostMicrosPerMillionTokens *
      (long ? 3 : 2);
  if (!Number.isSafeInteger(numerator))
    throw new Error("founder_inference_cost_overflow");
  return Math.ceil(numerator / 2_000_000);
}

export const founderProviderRequestUsageValidator = v.object({
  requestId: v.string(), modelId: v.string(), serviceTier: v.string(),
  promptTokens: v.number(), completionTokens: v.number(),
  cachedInputTokens: v.number(), cacheWriteTokens: v.number(),
});

export function calculateFounderRequestCosts(args: {
  requests: FounderProviderRequestUsage[];
  pricing: FounderRunPricing;
  promptTokens: number;
  completionTokens: number;
}): number {
  if (args.requests.length === 0 || args.requests.length > 64) throw new Error("founder_inference_request_usage_invalid");
  const ids = new Set<string>();
  let prompt = 0, completion = 0, cost = 0;
  for (const request of args.requests) {
    if (!request.requestId || ids.has(request.requestId) || request.serviceTier !== "default"
        || (request.modelId !== args.pricing.modelId && !request.modelId.startsWith(`${args.pricing.modelId}-`))) {
      throw new Error("founder_inference_request_usage_invalid");
    }
    ids.add(request.requestId);
    cost += calculateFounderRunCostMicros({ ...request, pricing: args.pricing });
    prompt += request.promptTokens;
    completion += request.completionTokens;
  }
  if (prompt !== args.promptTokens || completion !== args.completionTokens || !Number.isSafeInteger(cost)) {
    throw new Error("founder_inference_request_usage_invalid");
  }
  return cost;
}
