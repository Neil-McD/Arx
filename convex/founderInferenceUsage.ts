import type { FounderProviderRequestUsage } from "../shared/founderInference";

export type FounderInferenceUsageTotals = {
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  providerRequests: FounderProviderRequestUsage[];
  complete: boolean;
};

export function createFounderInferenceUsageTotals(modelId: string): FounderInferenceUsageTotals {
  return { modelId, promptTokens: 0, completionTokens: 0, providerRequests: [], complete: true };
}

export function recordFounderProviderSuccess(
  totals: FounderInferenceUsageTotals,
  result: { promptTokens: number | null; completionTokens: number | null; providerRequestUsage?: FounderProviderRequestUsage },
): void {
  if (result.promptTokens === null || result.completionTokens === null) {
    totals.complete = false;
    return;
  }
  if (totals.modelId === "gpt-6-luna") {
    if (result.providerRequestUsage) totals.providerRequests.push(result.providerRequestUsage);
    else totals.complete = false;
  }
  totals.promptTokens += Math.max(0, Math.floor(Number(result.promptTokens)));
  totals.completionTokens += Math.max(0, Math.floor(Number(result.completionTokens)));
}

export function founderProviderRequests(totals: FounderInferenceUsageTotals): FounderProviderRequestUsage[] | undefined {
  return totals.providerRequests.length ? totals.providerRequests : undefined;
}
