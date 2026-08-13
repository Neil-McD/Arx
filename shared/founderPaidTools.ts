export const FOUNDER_PAID_TOOL_PRICING_VERSION = "founder_paid_tools_v1";

export type FounderPaidToolName = "web_research" | "web_crawl";
export type FounderPaidToolAction = "search" | "open_page" | "find_in_page" | "crawl";

// These are reservation ceilings, not prices charged to the founder. The
// settled amount is the provider-reported cost (or the bounded estimate when
// exact evidence is unavailable). Integer micros keep the shared ledger free
// of floating-point currency math.
export const FOUNDER_PAID_TOOL_RESERVATION_MICROS_BY_ACTION = {
  search: 50_000,
  open_page: 10_000,
  find_in_page: 10_000,
  crawl: 100_000,
} as const satisfies Record<FounderPaidToolAction, number>;

export function founderPaidToolReservationCostMicros(
  action: FounderPaidToolAction,
): number {
  return FOUNDER_PAID_TOOL_RESERVATION_MICROS_BY_ACTION[action];
}

export function providerCostUsdToMicros(rawVendorCostUsd: unknown): number {
  const numeric = Number(rawVendorCostUsd);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error("founder_paid_tool_provider_cost_invalid");
  }
  const micros = Math.ceil(numeric * 1_000_000);
  if (!Number.isSafeInteger(micros) || micros < 0) {
    throw new Error("founder_paid_tool_provider_cost_invalid");
  }
  return micros;
}

export function founderPaidToolActionForTool(args: {
  toolName: FounderPaidToolName;
  action?: unknown;
}): FounderPaidToolAction {
  if (args.toolName === "web_crawl") return "crawl";
  const action = String(args.action ?? "").trim();
  if (action === "open_page" || action === "find_in_page") return action;
  return "search";
}
