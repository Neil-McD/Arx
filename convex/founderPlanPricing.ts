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
