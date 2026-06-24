import { reservePaidToolCredits } from "./paidToolCreditReservation";
import {
  settleReservedCreditsBestEffort,
  settleReservedCreditsStrict,
} from "./workspaceCreditSettlement";
import {
  creditsToUsd,
  DAYTONA_WORKSPACE_COMPUTE_USD_PER_SECOND,
  estimateDaytonaWorkspaceComputeVendorCostUsd,
  PAID_TOOL_PRICING_VERSION,
  PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
  priceDaytonaWorkspaceComputeCredits,
  WORKSPACE_SESSION_HOLD_SECONDS,
  WORKSPACE_SESSION_MAX_SECONDS,
  WORKSPACE_SESSION_RESERVATION_EXPIRY_MS,
} from "../shared/workspaceCredits";

type JsonRecord = Record<string, unknown>;

export type PolynetCodexRuntimeWorkspaceComputeReservation = {
  creditKey: string;
  hasCardOnFile: boolean;
  reservedCredits: number;
  rawVendorCostUsd: number;
  polynetPriceUsd: number;
  reservedAt: number;
  expiresAt: number;
  reserveDurationSeconds: number;
  metadata: JsonRecord;
};

export type PolynetCodexRuntimeWorkspaceComputeReservationResult =
  | {
      ok: true;
      reservation: PolynetCodexRuntimeWorkspaceComputeReservation;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details: JsonRecord;
    };

export type PolynetCodexRuntimeWorkspaceComputeSettlementResult =
  | {
      ok: true;
      outcome: "succeeded" | "refunded_not_started";
      durationSeconds: number;
      creditsSettled: number;
      rawVendorCostUsd: number;
    }
  | {
      ok: false;
      outcome: "settlement_failed";
      durationSeconds: number;
      creditsSettled: number;
      rawVendorCostUsd: number;
      message: string;
    };

function newCreditKey(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function readPositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function reservationFailureStatus(code: string): number {
  return code === "workspace_credits_exhausted" ||
    code === "workspace_uncollected_usage_blocked"
    ? 402
    : 503;
}

function buildBaseMetadata(params: {
  reserveDurationSeconds: number;
  targetId?: string | null;
  sandboxId?: string | null;
  workerMachineId?: string | null;
  terminalReason?: string | null;
  durationSeconds?: number | null;
  durationSource?: string | null;
}): JsonRecord {
  return {
    pricing_version: PAID_TOOL_PRICING_VERSION,
    target_gross_margin_bps: PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
    billing_product: "workspace_compute",
    harness: "codex",
    provider: "daytona",
    action: "codex_runtime_turn",
    pricing_model: "daytona_runtime_seconds_estimate",
    provider_billing_reconciliation: "pending",
    provider_billing_evidence: "estimated_from_runtime_duration",
    daytona_workspace_compute_usd_per_second:
      DAYTONA_WORKSPACE_COMPUTE_USD_PER_SECOND,
    reserve_duration_seconds: params.reserveDurationSeconds,
    max_duration_seconds: WORKSPACE_SESSION_MAX_SECONDS,
    target_id: params.targetId ?? null,
    sandbox_id: params.sandboxId ?? null,
    worker_machine_id: params.workerMachineId ?? params.sandboxId ?? null,
    terminal_reason: params.terminalReason ?? null,
    duration_seconds: params.durationSeconds ?? null,
    duration_source: params.durationSource ?? null,
  };
}

function resolveTimingDurationMs(params: {
  timing?: JsonRecord | null;
  fallbackDurationMs?: number | null;
}): { durationMs: number; source: string | null } {
  const timing = asRecord(params.timing);
  const directTotalMs = readPositiveNumber(timing?.total_ms);
  if (directTotalMs) {
    return { durationMs: directTotalMs, source: "worker_timing_total_ms" };
  }
  const buckets = asRecord(timing?.buckets);
  const codexTurnTotalMs = readPositiveNumber(buckets?.codex_turn_total_ms);
  if (codexTurnTotalMs) {
    return {
      durationMs: codexTurnTotalMs,
      source: "worker_timing_buckets_codex_turn_total_ms",
    };
  }
  const fallbackDurationMs = readPositiveNumber(params.fallbackDurationMs);
  if (fallbackDurationMs) {
    return { durationMs: fallbackDurationMs, source: "runtime_stream_elapsed_ms" };
  }
  return { durationMs: 0, source: null };
}

export async function reservePolynetCodexRuntimeWorkspaceCompute(params: {
  ctx: any;
  userId: any;
  communityId?: any;
  projectId?: any;
  runId: string;
  nowMs?: number;
}): Promise<PolynetCodexRuntimeWorkspaceComputeReservationResult> {
  const nowMs = params.nowMs ?? Date.now();
  const reserveDurationSeconds = WORKSPACE_SESSION_HOLD_SECONDS;
  const rawVendorCostUsd = estimateDaytonaWorkspaceComputeVendorCostUsd({
    durationSeconds: reserveDurationSeconds,
  });
  const reservedCredits = priceDaytonaWorkspaceComputeCredits({
    durationSeconds: reserveDurationSeconds,
  });
  const polynetPriceUsd = creditsToUsd(reservedCredits);
  const expiresAt = nowMs + WORKSPACE_SESSION_RESERVATION_EXPIRY_MS;
  const metadata = buildBaseMetadata({ reserveDurationSeconds });
  const creditKey = newCreditKey("codex");

  const reservation = await reservePaidToolCredits({
    ctx: params.ctx,
    creditKey,
    userId: params.userId,
    communityId: params.communityId,
    projectId: params.projectId,
    runId: params.runId,
    toolKind: "workspace_tools",
    toolName: "workspace_compute",
    action: "codex_runtime_turn",
    vendor: "daytona",
    credits: reservedCredits,
    rawVendorCostUsd,
    polynetPriceUsd,
    metadata,
    expiresAt,
    nowMs,
  });

  if (!reservation.ok) {
    return {
      ok: false,
      status: reservationFailureStatus(reservation.code),
      code: reservation.code,
      message: reservation.message,
      details: reservation.details,
    };
  }

  return {
    ok: true,
    reservation: {
      creditKey: reservation.creditKey,
      hasCardOnFile: reservation.hasCardOnFile,
      reservedCredits,
      rawVendorCostUsd,
      polynetPriceUsd,
      reservedAt: nowMs,
      expiresAt,
      reserveDurationSeconds,
      metadata: reservation.metadata,
    },
  };
}

export function buildPolynetCodexRuntimeWorkspaceComputeBillingContext(
  reservation: PolynetCodexRuntimeWorkspaceComputeReservation,
): JsonRecord {
  return {
    billing_product: "workspace_compute",
    harness: "codex",
    provider: "daytona",
    action: "codex_runtime_turn",
    credit_key: reservation.creditKey,
    reserved_credits: reservation.reservedCredits,
    reserved_at: reservation.reservedAt,
    expires_at: reservation.expiresAt,
    reserve_duration_seconds: reservation.reserveDurationSeconds,
    reserve_vendor_cost_usd: reservation.rawVendorCostUsd,
    reserve_polynet_price_usd: reservation.polynetPriceUsd,
    pricing_version: PAID_TOOL_PRICING_VERSION,
    pricing_model: "daytona_runtime_seconds_estimate",
    reservation_metadata: reservation.metadata,
  };
}

export async function settlePolynetCodexRuntimeWorkspaceComputeBestEffort(params: {
  ctx: any;
  reservation?: PolynetCodexRuntimeWorkspaceComputeReservation | null;
  timing?: JsonRecord | null;
  fallbackDurationMs?: number | null;
  terminalReason: string;
  targetId?: string | null;
  sandboxId?: string | null;
  workerMachineId?: string | null;
}): Promise<PolynetCodexRuntimeWorkspaceComputeSettlementResult | null> {
  if (!params.reservation?.creditKey) return null;
  const duration = resolveTimingDurationMs({
    timing: params.timing,
    fallbackDurationMs: params.fallbackDurationMs,
  });
  const durationSeconds = Math.max(0, duration.durationMs / 1000);
  if (durationSeconds > 0) {
    const rawVendorCostUsd = estimateDaytonaWorkspaceComputeVendorCostUsd({
      durationSeconds,
    });
    const creditsSettled = priceDaytonaWorkspaceComputeCredits({ durationSeconds });
    try {
      await settleReservedCreditsStrict({
        ctx: params.ctx,
        creditKey: params.reservation.creditKey,
        status: "succeeded",
        creditsSettled,
        rawVendorCostUsd,
        metadata: buildBaseMetadata({
          reserveDurationSeconds: params.reservation.reserveDurationSeconds,
          targetId: params.targetId,
          sandboxId: params.sandboxId,
          workerMachineId: params.workerMachineId,
          terminalReason: params.terminalReason,
          durationSeconds,
          durationSource: duration.source,
        }),
      });
      return {
        ok: true,
        outcome: "succeeded",
        durationSeconds,
        creditsSettled,
        rawVendorCostUsd,
      };
    } catch (error) {
      return {
        ok: false,
        outcome: "settlement_failed",
        durationSeconds,
        creditsSettled,
        rawVendorCostUsd,
        message: error instanceof Error ? error.message : String(error ?? ""),
      };
    }
  }

  await settleReservedCreditsBestEffort({
    ctx: params.ctx,
    creditKey: params.reservation.creditKey,
    status: "refunded",
    failureReason: params.terminalReason || "workspace_compute_not_started",
    metadata: {
      ...buildBaseMetadata({
        reserveDurationSeconds: params.reservation.reserveDurationSeconds,
        targetId: params.targetId,
        sandboxId: params.sandboxId,
        workerMachineId: params.workerMachineId,
        terminalReason: params.terminalReason || "workspace_compute_not_started",
        durationSeconds: 0,
        durationSource: "not_started",
      }),
      worker_started: false,
    },
  });
  return {
    ok: true,
    outcome: "refunded_not_started",
    durationSeconds: 0,
    creditsSettled: 0,
    rawVendorCostUsd: 0,
  };
}

export async function refundPolynetCodexRuntimeWorkspaceComputeBestEffort(params: {
  ctx: any;
  reservation?: PolynetCodexRuntimeWorkspaceComputeReservation | null;
  failureReason: string;
  targetId?: string | null;
  sandboxId?: string | null;
  workerMachineId?: string | null;
}): Promise<void> {
  if (!params.reservation?.creditKey) return;
  await settleReservedCreditsBestEffort({
    ctx: params.ctx,
    creditKey: params.reservation.creditKey,
    status: "refunded",
    failureReason: params.failureReason || "workspace_compute_not_started",
    metadata: {
      ...buildBaseMetadata({
        reserveDurationSeconds: params.reservation.reserveDurationSeconds,
        targetId: params.targetId,
        sandboxId: params.sandboxId,
        workerMachineId: params.workerMachineId,
        terminalReason: params.failureReason || "workspace_compute_not_started",
        durationSeconds: 0,
        durationSource: "pre_worker_failure",
      }),
      worker_started: false,
    },
  });
}
