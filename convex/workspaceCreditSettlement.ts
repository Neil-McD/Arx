import { internal } from "./_generated/api";

type CreditSettlementStatus = "succeeded" | "refunded";

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function settleReservedCreditsBestEffort(params: {
  ctx: any;
  creditKey?: string | null;
  status: CreditSettlementStatus;
  creditsSettled?: number;
  failureReason?: string | null;
  rawVendorCostUsd?: number;
  metadata?: Record<string, unknown>;
  nowMs?: number;
}): Promise<void> {
  const creditKey = normalizeOptionalString(params.creditKey);
  if (!creditKey) return;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await params.ctx.runMutation(internal.workspaceCredits.settleCreditsInternal as any, {
        creditKey,
        status: params.status,
        creditsSettled: params.creditsSettled,
        failureReason: params.failureReason ?? undefined,
        rawVendorCostUsd: params.rawVendorCostUsd,
        metadata: params.metadata,
        nowMs: params.nowMs ?? Date.now(),
      });
      return;
    } catch (error) {
      lastError = error;
      await sleep(attempt * 100);
    }
  }
  console.warn("credits_settle_failed", {
    credit_key: creditKey,
    status: params.status,
    error: lastError instanceof Error ? lastError.message : String(lastError ?? ""),
  });
}

export async function settleReservedCreditsStrict(params: {
  ctx: any;
  creditKey: string;
  status: CreditSettlementStatus;
  creditsSettled?: number;
  failureReason?: string | null;
  rawVendorCostUsd?: number;
  metadata?: Record<string, unknown>;
  nowMs?: number;
}): Promise<void> {
  const creditKey = normalizeOptionalString(params.creditKey);
  if (!creditKey) throw new Error("credits_key_required");
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await params.ctx.runMutation(internal.workspaceCredits.settleCreditsInternal as any, {
        creditKey,
        status: params.status,
        creditsSettled: params.creditsSettled,
        failureReason: params.failureReason ?? undefined,
        rawVendorCostUsd: params.rawVendorCostUsd,
        metadata: params.metadata,
        nowMs: params.nowMs ?? Date.now(),
      });
      return;
    } catch (error) {
      lastError = error;
      await sleep(attempt * 100);
    }
  }
  if (params.status === "succeeded") {
    try {
      await params.ctx.runMutation(internal.workspaceCredits.queueCreditSettlementRetryInternal as any, {
        creditKey,
        status: "succeeded",
        creditsSettled: params.creditsSettled,
        rawVendorCostUsd: params.rawVendorCostUsd,
        metadata: params.metadata,
        error: lastError instanceof Error ? lastError.message : String(lastError ?? ""),
        nowMs: params.nowMs ?? Date.now(),
      });
    } catch (queueError) {
      console.warn("credits_settlement_retry_queue_failed", {
        credit_key: creditKey,
        error: queueError instanceof Error ? queueError.message : String(queueError ?? ""),
      });
    }
  }
  throw new Error(
    lastError instanceof Error
      ? lastError.message || "credits_settlement_failed"
      : "credits_settlement_failed",
  );
}
