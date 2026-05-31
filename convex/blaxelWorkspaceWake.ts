import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import {
  ensureBlaxelWorkspaceComputer,
  inspectBlaxelWorkspaceComputer,
} from "./blaxelWorkspaceComputerProvider.ts";
import {
  isBlaxelWorkspaceSandboxTerminalState,
  loadBlaxelWorkspaceConfig,
} from "./blaxelWorkspaceClient.ts";
import {
  readBlaxelWorkspaceVolumeQuotaAdmissionArgs,
} from "./blaxelWorkspaceVolumeQuota.ts";
import {
  buildBlaxelProjectWorkspaceNames,
} from "./blaxelWorkspaceProjectNames.ts";
import {
  settleReservedCreditsBestEffort,
  settleReservedCreditsStrict,
} from "./workspaceCreditSettlement";
import {
  creditsToUsd,
  estimateWorkspaceComputeUsd,
  estimateWorkspaceReservationCredits,
  PAID_TOOL_PRICING_VERSION,
  PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
  priceWorkspaceUsageCredits,
  WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS,
  WORKSPACE_FILE_INSPECTION_HOLD_SECONDS,
  WORKSPACE_FILE_INSPECTION_MIN_BILLABLE_SECONDS,
  WORKSPACE_FILE_INSPECTION_MAX_SECONDS,
  WORKSPACE_FILE_INSPECTION_RESERVATION_EXPIRY_MS,
  WORKSPACE_SESSION_HOLD_SECONDS,
  WORKSPACE_SESSION_MAX_SECONDS,
  WORKSPACE_SESSION_RESERVATION_EXPIRY_MS,
} from "../shared/workspaceCredits";
import {
  evaluateWorkspaceSandboxStartAdmission,
  resolveWorkspaceResourceAccountTier,
} from "../shared/workspaceResourceAdmission";
import {
  compareWorkspaceComputerLifecycleIntents,
  type WorkspaceComputerLifecycleIntent,
} from "../shared/workspaceComputerProvider";

type BlaxelWorkspaceWakeFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type BillableBlaxelWorkspaceWakeResult =
  | {
      ok: true;
      providerId: "blaxel";
      projectId: string;
      projectVolumeId: string;
      providerSandboxId: string;
      workspaceRoot: string;
      startedAt: number;
      creditReservationKey: string;
      creditBudgetCredits: number;
      creditBudgetExpiresAt: number;
      sandboxCpu: number;
      sandboxMemoryGiB: number;
      sandboxDiskGiB: number;
      lifecycleMode: "provider_standby";
      reusedExistingLease?: boolean;
    }
  | BlaxelWorkspaceWakeFailure;

type BillableBlaxelWorkspaceWakeParams = {
  ctx: any;
  projectId: any;
  ownerId: any;
  runId?: string | null;
  lifecycleIntent: WorkspaceComputerLifecycleIntent;
  reservationAction: string;
  labels: Record<string, string>;
  clearSandboxAccounting?: boolean;
  reuseExistingLease?: boolean;
};

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function hasPersistedWorkspaceCardOnFile(stripeCustomer: any): boolean {
  return Boolean(
    stripeCustomer?.paymentMethodStatus === "active" &&
      String(stripeCustomer.providerDefaultPaymentMethodId ?? "").trim().startsWith("pm_") &&
      !(Number(stripeCustomer.cardRemovedAt ?? 0) > 0),
  );
}

function newCreditKey(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function mbToGiB(value: unknown): number {
  const mb = Math.max(0, Number(value) || 0);
  return mb / 1024;
}

function normalizeOptionalNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOptionalPositiveNumber(value: unknown): number | null {
  const parsed = normalizeOptionalNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function resolveWorkspaceLeaseBillingTiming(action: unknown): {
  holdSeconds: number;
  maxSeconds: number;
  reservationExpiryMs: number;
  minBillableSeconds: number;
} {
  return normalizeOptionalString(action) === "workspace_file_inspection"
    ? {
        holdSeconds: WORKSPACE_FILE_INSPECTION_HOLD_SECONDS,
        maxSeconds: WORKSPACE_FILE_INSPECTION_MAX_SECONDS,
        reservationExpiryMs: WORKSPACE_FILE_INSPECTION_RESERVATION_EXPIRY_MS,
        minBillableSeconds: WORKSPACE_FILE_INSPECTION_MIN_BILLABLE_SECONDS,
      }
    : {
        holdSeconds: WORKSPACE_SESSION_HOLD_SECONDS,
        maxSeconds: WORKSPACE_SESSION_MAX_SECONDS,
        reservationExpiryMs: WORKSPACE_SESSION_RESERVATION_EXPIRY_MS,
        minBillableSeconds: 0,
      };
}

function resolveWorkspaceLeaseLifecycleIntentFromAction(
  action: unknown,
): WorkspaceComputerLifecycleIntent | null {
  const normalized = normalizeOptionalString(action);
  if (normalized === "workspace_file_inspection") return "file_inspection";
  if (
    normalized === "interactive_workspace_computer" ||
    normalized === "project_zip_import"
  ) {
    return "interactive";
  }
  if (normalized === "runtime_workspace_session") return "agent_run";
  return null;
}

function isBlaxelWorkspaceLeaseLedgerEntry(entry: any): boolean {
  return (
    normalizeOptionalString(entry?.toolName) === "workspace_compute" &&
    normalizeOptionalString(entry?.vendor) === "blaxel" &&
    resolveWorkspaceLeaseLifecycleIntentFromAction(entry?.action) !== null
  );
}

function canReuseWorkspaceLeaseForIntent(params: {
  ledgerEntry: any;
  requestedLifecycleIntent: WorkspaceComputerLifecycleIntent;
}): boolean {
  const existingLifecycleIntent = resolveWorkspaceLeaseLifecycleIntentFromAction(
    params.ledgerEntry?.action,
  );
  return (
    existingLifecycleIntent !== null &&
    compareWorkspaceComputerLifecycleIntents(
      existingLifecycleIntent,
      params.requestedLifecycleIntent,
    ) >= 0
  );
}

function statusForWakeFailureCode(code: string): number {
  if (
    code === "workspace_credits_exhausted" ||
    code === "workspace_credits_unavailable" ||
    code === "workspace_uncollected_usage_blocked" ||
    code === "workspace_volume_funding_required" ||
    code === "workspace_card_required_for_additional_volume"
  ) {
    return 402;
  }
  if (
    code === "workspace_provider_transition_required" ||
    code === "workspace_computer_provider_mismatch" ||
    code === "workspace_computer_resource_mismatch" ||
    code.includes("mismatch")
  ) {
    return 409;
  }
  if (code === "project_not_found") return 404;
  return 503;
}

function mapWakeFailure(result: {
  status?: number;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}): BlaxelWorkspaceWakeFailure {
  const code = String(result.code ?? "workspace_computer_unavailable");
  return {
    ok: false,
    status: Number.isFinite(Number(result.status))
      ? Number(result.status)
      : statusForWakeFailureCode(code),
    code,
    message: String(result.message ?? "Workspace computer is unavailable."),
    details: result.details,
  };
}

function workspaceCreditFailure(params: {
  code: string;
  message: string;
  requiredCredits: number;
  paidUsageBillingMode?: "card_required" | "card_preferred" | "prepaid_required";
  details?: Record<string, unknown>;
}): BlaxelWorkspaceWakeFailure {
  return {
    ok: false,
    status: 402,
    code: params.code,
    message: params.message,
    details: {
      ...(params.details ?? {}),
      tool_kind: "workspace_tools",
      required_credits: params.requiredCredits,
      paid_usage_billing_mode: params.paidUsageBillingMode ?? "prepaid_required",
    },
  };
}

async function reserveWorkspaceWakeCredits(params: {
  ctx: any;
  ownerId: any;
  projectId: any;
  runId?: string | null;
  action: string;
  sandboxCpu: number;
  sandboxMemoryGiB: number;
  sandboxDiskGiB: number;
}): Promise<
  | {
      ok: true;
      creditReservationKey: string;
      creditBudgetCredits: number;
      creditBudgetExpiresAt: number;
      reservationMetadata: Record<string, unknown>;
    }
  | BlaxelWorkspaceWakeFailure
> {
  const creditReservationKey = newCreditKey("workspace");
  const billingTiming = resolveWorkspaceLeaseBillingTiming(params.action);
  const creditBudgetCredits = estimateWorkspaceReservationCredits({
    sandboxCpu: params.sandboxCpu,
    sandboxMemoryGiB: params.sandboxMemoryGiB,
    durationSeconds: billingTiming.holdSeconds,
  });
  const creditBudgetVendorCostUsd = estimateWorkspaceComputeUsd({
    durationSeconds: billingTiming.holdSeconds,
    sandboxCpu: params.sandboxCpu,
    sandboxMemoryGiB: params.sandboxMemoryGiB,
  });
  const reservedAt = Date.now();
  const creditBudgetExpiresAt = reservedAt + billingTiming.reservationExpiryMs;
  let workspaceCreditBalance: any = null;
  try {
    workspaceCreditBalance = await params.ctx.runQuery(
      internal.workspaceCredits.getWorkspaceCreditBalanceInternal as any,
      {
        userId: params.ownerId,
      },
    );
  } catch {
    return workspaceCreditFailure({
      code: "workspace_credits_unavailable",
      message: "Tool balance is unavailable for workspace tools.",
      requiredCredits: creditBudgetCredits,
    });
  }
  let stripeCustomer: any = null;
  try {
    stripeCustomer = await params.ctx.runQuery(
      internal.stripeCustomers.getUserStripeCustomerInternal as any,
      {
        userId: params.ownerId,
      },
    );
  } catch {
    stripeCustomer = null;
  }
  const hasCardOnFile = hasPersistedWorkspaceCardOnFile(stripeCustomer);
  const workspaceBillingMode = hasCardOnFile ? "card_backed" : "prepaid_balance";
  const paidUsageBillingMode = hasCardOnFile ? "prepaid_required" : "card_preferred";
  const reservationMetadata = {
    pricing_version: PAID_TOOL_PRICING_VERSION,
    target_gross_margin_bps: PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
    provider: "blaxel",
    pricing_model: "blaxel_memory_gib_seconds_estimate",
    provider_billing_reconciliation: "pending",
    provider_billing_evidence: "delayed_billing_api",
    billing_mode: workspaceBillingMode,
    funding_source: hasCardOnFile ? "card_on_file" : "prepaid_balance",
    card_backed_uncollected_limit_credits: hasCardOnFile
      ? WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS
      : null,
    sandbox_cpu: params.sandboxCpu,
    sandbox_memory_gib: params.sandboxMemoryGiB,
    sandbox_disk_gib: params.sandboxDiskGiB,
    hold_seconds: billingTiming.holdSeconds,
    max_seconds: billingTiming.maxSeconds,
  };

  const sandboxAdmission = evaluateWorkspaceSandboxStartAdmission({
    accountTier: resolveWorkspaceResourceAccountTier({
      hasCardOnFile,
      workspaceCreditBalance,
    }),
    hasCardOnFile,
    workspaceCreditBalance,
    requiredCredits: creditBudgetCredits,
  });
  if (!sandboxAdmission.ok) {
    return workspaceCreditFailure({
      code: sandboxAdmission.code,
      message: sandboxAdmission.message,
      requiredCredits: creditBudgetCredits,
      paidUsageBillingMode,
      details: {
        account_tier: sandboxAdmission.accountTier,
        current_count: sandboxAdmission.currentCount,
        requested_count: sandboxAdmission.requestedCount,
        limit: sandboxAdmission.limit,
      },
    });
  }

  try {
    await params.ctx.runMutation(internal.workspaceCredits.reserveCreditsInternal as any, {
      creditKey: creditReservationKey,
      userId: params.ownerId,
      projectId: params.projectId,
      runId: params.runId ?? null,
      toolName: "workspace_compute",
      action: params.action,
      vendor: "blaxel",
      credits: creditBudgetCredits,
      rawVendorCostUsd: creditBudgetVendorCostUsd,
      polynetPriceUsd: creditsToUsd(creditBudgetCredits),
      metadata: reservationMetadata,
      allowUncollectedReservation: hasCardOnFile,
      uncollectedReservationLimitCredits: hasCardOnFile
        ? WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS
        : undefined,
      expiresAt: creditBudgetExpiresAt,
      nowMs: reservedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    const exhausted = message === "credits_exhausted";
    return workspaceCreditFailure({
      code: exhausted ? "workspace_credits_exhausted" : "workspace_credits_unavailable",
      message: exhausted
        ? "Workspace tools use paid computer time, so they need tool balance before they run."
        : "Tool balance is unavailable for workspace tools.",
      requiredCredits: creditBudgetCredits,
      paidUsageBillingMode: exhausted ? paidUsageBillingMode : undefined,
    });
  }

  return {
    ok: true,
    creditReservationKey,
    creditBudgetCredits,
    creditBudgetExpiresAt,
    reservationMetadata,
  };
}

async function releaseWorkspaceWakeReservationBestEffort(params: {
  ctx: any;
  creditReservationKey: string;
  failureReason: string;
  metadata?: Record<string, unknown>;
}) {
  // Legacy ledger status name: this releases an unused internal credit hold,
  // not a cash refund of purchased tool balance.
  await settleReservedCreditsBestEffort({
    ctx: params.ctx,
    creditKey: params.creditReservationKey,
    status: "refunded",
    failureReason: params.failureReason,
    metadata: params.metadata ?? {},
  });
}

export async function settleBillableBlaxelWorkspaceLeaseBestEffort(params: {
  ctx: any;
  projectId: any;
  ownerId: any;
  providerSandboxId?: string | null;
  settlementReason?: string | null;
  billableDurationSeconds?: number | null;
  providerStandbyGraceSeconds?: number | null;
  providerReleaseReason?: string | null;
  providerReleaseConfirmed?: boolean | null;
  nowMs?: number;
  requireLedgerWrite?: boolean;
}): Promise<{
  ok: boolean;
  creditReservationKey: string | null;
  creditsSettled?: number;
  durationSeconds?: number;
}> {
  const project = await params.ctx.runQuery(
    internal.projects.getCloudProjectByIdInternal as any,
    {
      projectId: params.projectId,
    },
  );
  if (!project || String(project.ownerId ?? "") !== String(params.ownerId ?? "")) {
    return { ok: false, creditReservationKey: null };
  }
  if (normalizeOptionalString(project.providerSandboxProviderId) !== "blaxel") {
    return { ok: false, creditReservationKey: null };
  }
  const providerSandboxId = normalizeOptionalString(project.providerSandboxId);
  const expectedSandboxId = normalizeOptionalString(params.providerSandboxId);
  if (expectedSandboxId && providerSandboxId !== expectedSandboxId) {
    return { ok: false, creditReservationKey: null };
  }
  const creditReservationKey = normalizeOptionalString(
    project.providerSandboxCreditReservationKey,
  );
  if (!creditReservationKey) return { ok: true, creditReservationKey: null };

  const ledgerEntry = await params.ctx.runQuery(
    internal.workspaceCredits.getCreditLedgerEntryByKeyInternal as any,
    {
      creditKey: creditReservationKey,
    },
  );
  if (!ledgerEntry || ledgerEntry.status !== "reserved") {
    return { ok: true, creditReservationKey };
  }
  if (String(ledgerEntry.userId ?? "") !== String(params.ownerId ?? "")) {
    return { ok: false, creditReservationKey };
  }
  if (normalizeOptionalString(ledgerEntry.projectId) !== String(params.projectId)) {
    return { ok: false, creditReservationKey };
  }

  const nowMs = params.nowMs ?? Date.now();
  const billingTiming = resolveWorkspaceLeaseBillingTiming(ledgerEntry.action);
  const startedAt =
    normalizeOptionalNumber(project.providerSandboxStartedAt) ??
    normalizeOptionalNumber(project.providerSandboxLastSeenAt) ??
    nowMs;
  const measuredDurationSeconds =
    typeof params.billableDurationSeconds === "number" &&
      Number.isFinite(params.billableDurationSeconds)
      ? Math.max(0, params.billableDurationSeconds)
      : Math.max(0, (nowMs - startedAt) / 1000);
  const providerStandbyGraceSeconds =
    typeof params.providerStandbyGraceSeconds === "number" &&
      Number.isFinite(params.providerStandbyGraceSeconds)
      ? Math.max(0, params.providerStandbyGraceSeconds)
      : 0;
  const durationSeconds = Math.min(
    billingTiming.maxSeconds,
    Math.max(
      billingTiming.minBillableSeconds,
      measuredDurationSeconds + providerStandbyGraceSeconds,
    ),
  );
  const loadedConfig = loadBlaxelWorkspaceConfig();
  const ledgerMetadata = readRecord(ledgerEntry.metadata);
  const sandboxMemoryGiB =
    normalizeOptionalPositiveNumber(ledgerMetadata.sandbox_memory_gib) ??
    (loadedConfig.ok ? mbToGiB(loadedConfig.config.memoryMb) : 0);
  const sandboxDiskGiB =
    normalizeOptionalPositiveNumber(ledgerMetadata.sandbox_disk_gib) ??
    (loadedConfig.ok ? mbToGiB(loadedConfig.config.volumeSizeMb) : 0);
  const sandboxCpu = normalizeOptionalNumber(ledgerMetadata.sandbox_cpu) ?? 0;
  const computeCostUsd = estimateWorkspaceComputeUsd({
    durationSeconds,
    sandboxCpu,
    sandboxMemoryGiB,
  });
  const creditsSettled = priceWorkspaceUsageCredits({ computeCostUsd });
  const settleCredits = params.requireLedgerWrite
    ? settleReservedCreditsStrict
    : settleReservedCreditsBestEffort;

  await settleCredits({
    ctx: params.ctx,
    creditKey: creditReservationKey,
    status: "succeeded",
    creditsSettled,
    rawVendorCostUsd: computeCostUsd,
    metadata: {
      pricing_version: PAID_TOOL_PRICING_VERSION,
      target_gross_margin_bps: PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
      provider: "blaxel",
      pricing_model: "blaxel_memory_gib_seconds_estimate",
      provider_billing_reconciliation: "pending",
      provider_billing_evidence: "delayed_billing_api",
      provider_sandbox_id: providerSandboxId,
      duration_seconds: durationSeconds,
      measured_duration_seconds: measuredDurationSeconds,
      min_billable_seconds: billingTiming.minBillableSeconds,
      provider_standby_grace_seconds: providerStandbyGraceSeconds,
      provider_release_reason: normalizeOptionalString(params.providerReleaseReason),
      provider_release_confirmed: params.providerReleaseConfirmed === true,
      max_seconds: billingTiming.maxSeconds,
      sandbox_cpu: sandboxCpu,
      sandbox_memory_gib: sandboxMemoryGiB,
      sandbox_disk_gib: sandboxDiskGiB,
      settlement_source: "project_workspace_lease",
      settlement_reason: normalizeOptionalString(params.settlementReason),
    },
    nowMs,
  });

  return {
    ok: true,
    creditReservationKey,
    creditsSettled,
    durationSeconds,
  };
}

async function clearProjectWorkspaceLeaseAccounting(params: {
  ctx: any;
  project: any;
  nowMs: number;
}) {
  const projectId = params.project?._id;
  if (!projectId) return;
  const providerSandboxId = normalizeOptionalString(params.project.providerSandboxId);
  if (providerSandboxId) {
    await params.ctx.runMutation(
      internal.workspaceTerminals.setProjectBackgroundSandboxInternal as any,
      {
        projectId,
        providerSandboxId,
        providerSandboxProviderId: "blaxel",
        providerSandboxState: "standby",
        providerSandboxLastSeenAt: params.nowMs,
        clearSandboxAccounting: true,
      },
    );
    return;
  }
  await params.ctx.runMutation(
    internal.workspaceTerminals.clearProjectBackgroundSandboxInternal as any,
    {
      projectId,
      providerSandboxProviderId: "blaxel",
    },
  );
}

async function recordTrackedBlaxelWorkspaceLeaseProviderCostBestEffort(params: {
  ctx: any;
  project: any;
  ledgerEntry: any;
  creditReservationKey: string;
  providerSandboxId: string | null;
  releaseReason?: string | null;
  metadata?: Record<string, unknown>;
  billableDurationSeconds?: number | null;
  providerStandbyGraceSeconds?: number | null;
  providerReleaseReason?: string | null;
  providerReleaseConfirmed?: boolean | null;
  nowMs: number;
}) {
  try {
    const ledgerMetadata = readRecord(params.ledgerEntry?.metadata);
    const releaseMetadata = readRecord(params.metadata);
    const loadedConfig = loadBlaxelWorkspaceConfig();
    const sandboxMemoryGiB =
      normalizeOptionalPositiveNumber(ledgerMetadata.sandbox_memory_gib) ??
      (loadedConfig.ok ? mbToGiB(loadedConfig.config.memoryMb) : 0);
    const sandboxDiskGiB =
      normalizeOptionalPositiveNumber(ledgerMetadata.sandbox_disk_gib) ??
      (loadedConfig.ok ? mbToGiB(loadedConfig.config.volumeSizeMb) : 0);
    const sandboxCpu = normalizeOptionalNumber(ledgerMetadata.sandbox_cpu) ?? 0;
    const startedAt =
      normalizeOptionalNumber(params.project.providerSandboxStartedAt) ??
      normalizeOptionalNumber(params.project.providerSandboxLastSeenAt) ??
      normalizeOptionalNumber(params.ledgerEntry.createdAt) ??
      params.nowMs;
    const measuredDurationSeconds =
      typeof params.billableDurationSeconds === "number" &&
        Number.isFinite(params.billableDurationSeconds)
        ? Math.max(0, params.billableDurationSeconds)
        : Math.max(0, (params.nowMs - startedAt) / 1000);
    const providerStandbyGraceSeconds =
      typeof params.providerStandbyGraceSeconds === "number" &&
        Number.isFinite(params.providerStandbyGraceSeconds)
        ? Math.max(0, params.providerStandbyGraceSeconds)
        : Math.max(
            0,
            normalizeOptionalNumber(releaseMetadata.provider_standby_grace_seconds) ?? 0,
          );
    const billingTiming = resolveWorkspaceLeaseBillingTiming(params.ledgerEntry.action);
    const durationSeconds = Math.min(
      billingTiming.maxSeconds,
      measuredDurationSeconds + providerStandbyGraceSeconds,
    );
    const computeCostUsd = estimateWorkspaceComputeUsd({
      durationSeconds,
      sandboxCpu,
      sandboxMemoryGiB,
    });
    await params.ctx.runMutation(
      internal.workspaceCredits.recordProviderCostInternal as any,
      {
        costKey: `workspace_lease_release:${params.creditReservationKey}:provider_cost`,
        userId: params.ledgerEntry.userId ?? params.project.ownerId,
        projectId: params.project._id,
        runId: normalizeOptionalString(params.ledgerEntry.runId),
        category: "workspace",
        component: "blaxel_active_runtime",
        provider: "blaxel",
        resourceId: params.providerSandboxId,
        periodStart: startedAt,
        periodEnd: startedAt + durationSeconds * 1000,
        quantityKind: "memory_gib_seconds",
        quantity: durationSeconds * sandboxMemoryGiB,
        rawVendorCostUsd: computeCostUsd,
        evidence: "estimated",
        billingDisposition: "tracked_only",
        linkedCreditKey: params.creditReservationKey,
        metadata: {
          ...releaseMetadata,
          provider_cost_source: "workspace_lease_release_without_user_charge",
          provider_cost_user_charge_disposition: "refunded",
          release_reason: normalizeOptionalString(params.releaseReason),
          duration_seconds: durationSeconds,
          measured_duration_seconds: measuredDurationSeconds,
          provider_standby_grace_seconds: providerStandbyGraceSeconds,
          provider_release_reason:
            normalizeOptionalString(params.providerReleaseReason) ??
            normalizeOptionalString(releaseMetadata.provider_release_reason),
          provider_release_confirmed:
            params.providerReleaseConfirmed === true ||
            releaseMetadata.provider_release_confirmed === true,
          max_seconds: billingTiming.maxSeconds,
          sandbox_cpu: sandboxCpu,
          sandbox_memory_gib: sandboxMemoryGiB,
          sandbox_disk_gib: sandboxDiskGiB,
        },
        nowMs: params.nowMs,
      },
    );
  } catch (error) {
    console.warn("tracked_blaxel_workspace_lease_provider_cost_failed", {
      credit_reservation_key: params.creditReservationKey,
      project_id: String(params.project?._id ?? ""),
      error: error instanceof Error ? error.message : String(error ?? ""),
    });
  }
}

export async function releaseBillableBlaxelProjectWorkspaceLeaseBestEffort(params: {
  ctx: any;
  projectId: any;
  ownerId: any;
  providerSandboxId?: string | null;
  releaseReason?: string | null;
  metadata?: Record<string, unknown>;
  billableDurationSeconds?: number | null;
  providerStandbyGraceSeconds?: number | null;
  providerReleaseReason?: string | null;
  providerReleaseConfirmed?: boolean | null;
  nowMs?: number;
  clearProjectAccounting?: boolean;
}): Promise<{
  ok: boolean;
  creditReservationKey: string | null;
}> {
  const nowMs = params.nowMs ?? Date.now();
  const project = await params.ctx.runQuery(
    internal.projects.getCloudProjectByIdInternal as any,
    {
      projectId: params.projectId,
    },
  );
  if (!project || String(project.ownerId ?? "") !== String(params.ownerId ?? "")) {
    return { ok: false, creditReservationKey: null };
  }
  if (normalizeOptionalString(project.providerSandboxProviderId) !== "blaxel") {
    return { ok: false, creditReservationKey: null };
  }
  const providerSandboxId = normalizeOptionalString(project.providerSandboxId);
  const expectedSandboxId = normalizeOptionalString(params.providerSandboxId);
  if (expectedSandboxId && providerSandboxId !== expectedSandboxId) {
    return { ok: false, creditReservationKey: null };
  }
  const creditReservationKey = normalizeOptionalString(
    project.providerSandboxCreditReservationKey,
  );
  if (!creditReservationKey) {
    if (params.clearProjectAccounting === true) {
      await clearProjectWorkspaceLeaseAccounting({ ctx: params.ctx, project, nowMs });
    }
    return { ok: true, creditReservationKey: null };
  }
  const ledgerEntry = await params.ctx.runQuery(
    internal.workspaceCredits.getCreditLedgerEntryByKeyInternal as any,
    {
      creditKey: creditReservationKey,
    },
  );
  if (!ledgerEntry || ledgerEntry.status !== "reserved") {
    return { ok: true, creditReservationKey };
  }
  if (String(ledgerEntry.userId ?? "") !== String(params.ownerId ?? "")) {
    return { ok: false, creditReservationKey };
  }
  if (normalizeOptionalString(ledgerEntry.projectId) !== String(params.projectId)) {
    return { ok: false, creditReservationKey };
  }

  try {
    await recordTrackedBlaxelWorkspaceLeaseProviderCostBestEffort({
      ctx: params.ctx,
      project,
      ledgerEntry,
      creditReservationKey,
      providerSandboxId,
      releaseReason: params.releaseReason,
      metadata: params.metadata,
      billableDurationSeconds: params.billableDurationSeconds,
      providerStandbyGraceSeconds: params.providerStandbyGraceSeconds,
      providerReleaseReason: params.providerReleaseReason,
      providerReleaseConfirmed: params.providerReleaseConfirmed,
      nowMs,
    });
    await settleReservedCreditsBestEffort({
      ctx: params.ctx,
      creditKey: creditReservationKey,
      status: "refunded",
      failureReason: params.releaseReason ?? "workspace_project_lease_released",
      metadata: {
        provider: "blaxel",
        settlement_source: "project_workspace_lease_releaser",
        settlement_reason: params.releaseReason ?? "workspace_project_lease_released",
        project_id: String(params.projectId),
        provider_sandbox_id: providerSandboxId,
        ...(params.metadata ?? {}),
      },
      nowMs,
    });
    if (params.clearProjectAccounting === true) {
      await clearProjectWorkspaceLeaseAccounting({ ctx: params.ctx, project, nowMs });
    }
    return { ok: true, creditReservationKey };
  } catch {
    return { ok: false, creditReservationKey };
  }
}

export async function finalizeBillableBlaxelProjectWorkspaceLease(params: {
  ctx: any;
  projectId: any;
  ownerId: any;
  providerSandboxId?: string | null;
  settlementReason?: string | null;
  billableDurationSeconds?: number | null;
  providerStandbyGraceSeconds?: number | null;
  providerReleaseReason?: string | null;
  providerReleaseConfirmed?: boolean | null;
  releaseReason?: string | null;
  nowMs?: number;
  requireLedgerWrite?: boolean;
  requireExpiredReservation?: boolean;
  clearProjectAccounting?: boolean;
}): Promise<{
  ok: boolean;
  disposition:
    | "already_finalized"
    | "failed_closed"
    | "no_reservation"
    | "not_expired"
    | "provider_mismatch"
    | "released"
    | "retryable_failure"
    | "settled"
    | "skipped_unsupported_action";
  creditReservationKey: string | null;
  errorMessage?: string;
}> {
  const nowMs = params.nowMs ?? Date.now();
  const project = await params.ctx.runQuery(
    internal.projects.getCloudProjectByIdInternal as any,
    {
      projectId: params.projectId,
    },
  );
  if (!project || String(project.ownerId ?? "") !== String(params.ownerId ?? "")) {
    return {
      ok: false,
      disposition: "failed_closed",
      creditReservationKey: null,
      errorMessage: "project_owner_mismatch",
    };
  }
  if (normalizeOptionalString(project.providerSandboxProviderId) !== "blaxel") {
    return {
      ok: true,
      disposition: "provider_mismatch",
      creditReservationKey: null,
    };
  }

  const providerSandboxId = normalizeOptionalString(project.providerSandboxId);
  const expectedSandboxId = normalizeOptionalString(params.providerSandboxId);
  if (expectedSandboxId && providerSandboxId !== expectedSandboxId) {
    return {
      ok: false,
      disposition: "failed_closed",
      creditReservationKey: null,
      errorMessage: "project_sandbox_mismatch",
    };
  }

  const creditReservationKey = normalizeOptionalString(
    project.providerSandboxCreditReservationKey,
  );
  if (!creditReservationKey) {
    return {
      ok: true,
      disposition: "no_reservation",
      creditReservationKey: null,
    };
  }

  const ledgerEntry = await params.ctx.runQuery(
    internal.workspaceCredits.getCreditLedgerEntryByKeyInternal as any,
    {
      creditKey: creditReservationKey,
    },
  ) as any | null;

  if (!ledgerEntry || ledgerEntry.status !== "reserved") {
    if (params.clearProjectAccounting === true) {
      await clearProjectWorkspaceLeaseAccounting({ ctx: params.ctx, project, nowMs });
    }
    return {
      ok: true,
      disposition: "already_finalized",
      creditReservationKey,
    };
  }

  const ledgerOwnerMatches = String(ledgerEntry.userId ?? "") === String(params.ownerId ?? "");
  const ledgerProjectMatches =
    normalizeOptionalString(ledgerEntry.projectId) === String(params.projectId);
  if (!ledgerOwnerMatches || !ledgerProjectMatches) {
    return {
      ok: false,
      disposition: "failed_closed",
      creditReservationKey,
      errorMessage: "credit_ledger_project_mismatch",
    };
  }

  if (params.requireExpiredReservation === true) {
    const projectExpiresAt = normalizeOptionalNumber(project.providerSandboxCreditBudgetExpiresAt);
    const ledgerExpiresAt = normalizeOptionalNumber(ledgerEntry.expiresAt);
    const projectExpired = projectExpiresAt !== null && projectExpiresAt <= nowMs;
    const ledgerExpired = ledgerExpiresAt !== null && ledgerExpiresAt <= nowMs;
    if (!projectExpired && !ledgerExpired) {
      return {
        ok: true,
        disposition: "not_expired",
        creditReservationKey,
      };
    }
  }

  if (!isBlaxelWorkspaceLeaseLedgerEntry(ledgerEntry)) {
    return {
      ok: true,
      disposition: "skipped_unsupported_action",
      creditReservationKey,
    };
  }

  const startedAt =
    normalizeOptionalNumber(project.providerSandboxStartedAt) ??
    normalizeOptionalNumber(project.providerSandboxLastSeenAt);
  try {
    if (startedAt !== null) {
      const settledLease = await settleBillableBlaxelWorkspaceLeaseBestEffort({
        ctx: params.ctx,
        projectId: params.projectId,
        ownerId: params.ownerId,
        providerSandboxId,
        settlementReason: params.settlementReason ?? "workspace_project_lease_finalized",
        billableDurationSeconds: params.billableDurationSeconds,
        providerStandbyGraceSeconds: params.providerStandbyGraceSeconds,
        providerReleaseReason: params.providerReleaseReason,
        providerReleaseConfirmed: params.providerReleaseConfirmed,
        nowMs,
        requireLedgerWrite: params.requireLedgerWrite === true,
      });
      if (!settledLease.ok) {
        return {
          ok: false,
          disposition: "failed_closed",
          creditReservationKey,
          errorMessage: "workspace_project_lease_settlement_rejected",
        };
      }
      if (params.clearProjectAccounting === true) {
        await clearProjectWorkspaceLeaseAccounting({ ctx: params.ctx, project, nowMs });
      }
      return {
        ok: true,
        disposition: "settled",
        creditReservationKey,
      };
    }

    const settleCredits = params.requireLedgerWrite === true
      ? settleReservedCreditsStrict
      : settleReservedCreditsBestEffort;
    await settleCredits({
      ctx: params.ctx,
      creditKey: creditReservationKey,
      status: "refunded",
      failureReason: params.releaseReason ?? "workspace_project_lease_released_before_start",
      metadata: {
        provider: "blaxel",
        settlement_source: "project_workspace_lease_finalizer",
        settlement_reason: params.releaseReason ?? "workspace_project_lease_released_before_start",
        project_id: String(params.projectId),
      },
      nowMs,
    });
    if (params.clearProjectAccounting === true) {
      await clearProjectWorkspaceLeaseAccounting({ ctx: params.ctx, project, nowMs });
    }
    return {
      ok: true,
      disposition: "released",
      creditReservationKey,
    };
  } catch (error) {
    return {
      ok: false,
      disposition: "retryable_failure",
      creditReservationKey,
      errorMessage: error instanceof Error ? error.message : String(error ?? ""),
    };
  }
}

export const finalizeExpiredBlaxelProjectWorkspaceLeasesInternal = internalAction({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.min(
      100,
      Math.max(1, Math.floor(Number(args.limit ?? 50))),
    );
    const expiredProjects = await ctx.runQuery(
      internal.projects.listExpiredBlaxelProjectWorkspaceLeasesInternal as any,
      {
        nowMs,
        limit,
      },
    ) as any[];
    const missingProjectExpiryProjects = await ctx.runQuery(
      internal.projects.listBlaxelProjectWorkspaceLeasesMissingProjectExpiryInternal as any,
      {
        limit,
      },
    ) as any[];
    const projectsById = new Map<string, any>();
    for (const project of [...expiredProjects, ...missingProjectExpiryProjects]) {
      const projectId = normalizeOptionalString(project?._id);
      if (projectId) projectsById.set(projectId, project);
    }
    const projects = [...projectsById.values()].slice(0, limit);
    let settled = 0;
    let released = 0;
    let cleared = 0;
    let notExpired = 0;
    let skippedUnsupportedActions = 0;
    let failedClosed = 0;
    let retryableFailures = 0;
    const failedSamples: Array<Record<string, unknown>> = [];

    for (const project of projects) {
      const projectId = project?._id;
      const ownerId = project?.ownerId;
      const creditReservationKey = normalizeOptionalString(
        project?.providerSandboxCreditReservationKey,
      );
      if (!projectId || !ownerId || !creditReservationKey) {
        continue;
      }

      const finalized = await finalizeBillableBlaxelProjectWorkspaceLease({
        ctx,
        projectId,
        ownerId,
        providerSandboxId: normalizeOptionalString(project.providerSandboxId),
        settlementReason: "workspace_project_lease_expired",
        releaseReason: "workspace_project_lease_expired_before_start",
        nowMs,
        requireLedgerWrite: true,
        requireExpiredReservation: true,
        clearProjectAccounting: true,
      });
      if (finalized.disposition === "settled") {
        settled += 1;
      } else if (finalized.disposition === "released") {
        released += 1;
      } else if (finalized.disposition === "already_finalized") {
        cleared += 1;
      } else if (finalized.disposition === "not_expired") {
        notExpired += 1;
      } else if (finalized.disposition === "skipped_unsupported_action") {
        skippedUnsupportedActions += 1;
      } else if (finalized.disposition === "retryable_failure") {
        retryableFailures += 1;
        if (failedSamples.length < 5) {
          failedSamples.push({
            project_id: String(projectId),
            credit_reservation_key: creditReservationKey,
            error_message: finalized.errorMessage ?? "workspace_project_lease_finalization_failed",
          });
        }
      } else if (!finalized.ok) {
        failedClosed += 1;
        if (failedSamples.length < 5) {
          failedSamples.push({
            project_id: String(projectId),
            credit_reservation_key: creditReservationKey,
            error_message: finalized.errorMessage ?? "workspace_project_lease_finalization_rejected",
          });
        }
      }
    }

    return {
      scanned: projects.length,
      settled,
      released,
      cleared,
      notExpired,
      skippedUnsupportedActions,
      failedClosed,
      retryableFailures,
      failedSamples,
    };
  },
});

async function resolveReusableProjectWorkspaceLease(params: {
  ctx: any;
  projectId: any;
  ownerId: any;
  providerVolumeId: string;
  providerSandboxId: string;
  sandboxCpu: number;
  sandboxMemoryGiB: number;
  sandboxDiskGiB: number;
  requestedLifecycleIntent: WorkspaceComputerLifecycleIntent;
}): Promise<BillableBlaxelWorkspaceWakeResult | null> {
  const project = await params.ctx.runQuery(
    internal.projects.getCloudProjectByIdInternal as any,
    {
      projectId: params.projectId,
    },
  );
  if (!project || String(project.ownerId ?? "") !== String(params.ownerId ?? "")) {
    return null;
  }
  if (normalizeOptionalString(project.providerSandboxId) !== params.providerSandboxId) {
    return null;
  }
  if (normalizeOptionalString(project.providerSandboxProviderId) !== "blaxel") {
    return null;
  }
  if (normalizeOptionalString(project.providerVolumeId) !== params.providerVolumeId) {
    return null;
  }
  if (normalizeOptionalString(project.providerVolumeProviderId) !== "blaxel") {
    return null;
  }

  const creditReservationKey = normalizeOptionalString(
    project.providerSandboxCreditReservationKey,
  );
  if (!creditReservationKey) return null;
  const creditBudgetCredits = normalizeOptionalNumber(
    project.providerSandboxCreditBudgetCredits,
  );
  const projectCreditBudgetExpiresAt = normalizeOptionalNumber(
    project.providerSandboxCreditBudgetExpiresAt,
  );

  const ledgerEntry = await params.ctx.runQuery(
    internal.workspaceCredits.getCreditLedgerEntryByKeyInternal as any,
    {
      creditKey: creditReservationKey,
    },
  );
  if (!ledgerEntry || ledgerEntry.status !== "reserved") return null;
  if (String(ledgerEntry.userId ?? "") !== String(params.ownerId ?? "")) {
    return null;
  }
  if (normalizeOptionalString(ledgerEntry.projectId) !== String(params.projectId)) {
    return null;
  }
  if (!isBlaxelWorkspaceLeaseLedgerEntry(ledgerEntry)) return null;
  if (
    !canReuseWorkspaceLeaseForIntent({
      ledgerEntry,
      requestedLifecycleIntent: params.requestedLifecycleIntent,
    })
  ) {
    return null;
  }
  const ledgerExpiresAt = normalizeOptionalNumber(ledgerEntry.expiresAt);
  if (
    projectCreditBudgetExpiresAt === null ||
    ledgerExpiresAt === null ||
    projectCreditBudgetExpiresAt <= Date.now() ||
    ledgerExpiresAt <= Date.now()
  ) {
    return null;
  }
  const creditBudgetExpiresAt = Math.min(projectCreditBudgetExpiresAt, ledgerExpiresAt);

  const inspected = await inspectBlaxelWorkspaceComputer({
    sandboxName: params.providerSandboxId,
    volumeName: params.providerVolumeId,
  });
  if (!inspected.ok) return mapWakeFailure(inspected);
  if (!inspected.exists) return null;
  if (isBlaxelWorkspaceSandboxTerminalState(inspected.state)) {
    return null;
  }

  const nowMs = Date.now();
  await params.ctx.runMutation(
    internal.workspaceTerminals.setProjectBackgroundSandboxInternal as any,
    {
      projectId: params.projectId,
      providerSandboxId: params.providerSandboxId,
      providerSandboxProviderId: "blaxel",
      providerSandboxState: "active",
      providerSandboxLastSeenAt: nowMs,
    },
  );

  return {
    ok: true,
    providerId: "blaxel",
    projectId: String(params.projectId),
    projectVolumeId: params.providerVolumeId,
    providerSandboxId: params.providerSandboxId,
    workspaceRoot: inspected.workspaceRoot,
    startedAt:
      normalizeOptionalNumber(project.providerSandboxStartedAt) ??
      normalizeOptionalNumber(project.providerSandboxLastSeenAt) ??
      nowMs,
    creditReservationKey,
    creditBudgetCredits:
      creditBudgetCredits ??
      normalizeOptionalNumber(ledgerEntry.creditsReserved) ??
      estimateWorkspaceReservationCredits({
        sandboxCpu: params.sandboxCpu,
        sandboxMemoryGiB: params.sandboxMemoryGiB,
      }),
    creditBudgetExpiresAt,
    sandboxCpu: params.sandboxCpu,
    sandboxMemoryGiB: params.sandboxMemoryGiB,
    sandboxDiskGiB: params.sandboxDiskGiB,
    lifecycleMode: "provider_standby",
    reusedExistingLease: true,
  };
}

async function finalizeExistingProjectWorkspaceLeaseBeforeReplacement(params: {
  ctx: any;
  projectId: any;
  ownerId: any;
  providerSandboxId: string;
  replacementCreditReservationKey: string;
}): Promise<
  | { ok: true; disposition: string; creditReservationKey: string | null }
  | { ok: false; code: string; message: string; details?: Record<string, unknown> }
> {
  const finalized = await finalizeBillableBlaxelProjectWorkspaceLease({
    ctx: params.ctx,
    projectId: params.projectId,
    ownerId: params.ownerId,
    providerSandboxId: params.providerSandboxId,
    settlementReason: "workspace_project_lease_replaced",
    releaseReason: "workspace_project_lease_replaced_before_start",
    nowMs: Date.now(),
    requireLedgerWrite: true,
    clearProjectAccounting: false,
  });
  if (!finalized.ok) {
    return {
      ok: false,
      code: "workspace_lease_replacement_settlement_failed",
      message: "Workspace computer lease replacement could not be settled.",
      details: {
        disposition: finalized.disposition,
        error_message: finalized.errorMessage ?? null,
        replacement_credit_reservation_key: params.replacementCreditReservationKey,
      },
    };
  }
  return {
    ok: true,
    disposition: finalized.disposition,
    creditReservationKey: finalized.creditReservationKey,
  };
}

export async function ensureBillableBlaxelWorkspaceComputer(
  params: BillableBlaxelWorkspaceWakeParams,
): Promise<BillableBlaxelWorkspaceWakeResult> {
  const loadedConfig = loadBlaxelWorkspaceConfig();
  if (!loadedConfig.ok) return mapWakeFailure(loadedConfig);

  const sandboxCpu = 0;
  const sandboxMemoryGiB = mbToGiB(loadedConfig.config.memoryMb);
  const sandboxDiskGiB = mbToGiB(loadedConfig.config.volumeSizeMb);
  const quotaAdmissionArgs = await readBlaxelWorkspaceVolumeQuotaAdmissionArgs({
    ctx: params.ctx,
    projectId: params.projectId,
  });
  if (!quotaAdmissionArgs.ok) return mapWakeFailure(quotaAdmissionArgs);

  const prepared: any = await params.ctx.runMutation(
    internal.projects.prepareCloudProjectVolumeMaterializationInternal as any,
    {
      projectId: params.projectId,
      nowMs: Date.now(),
      providerVolumeCount: quotaAdmissionArgs.providerVolumeCount,
      providerVolumeLimit: quotaAdmissionArgs.providerVolumeLimit,
      providerVolumeSafetyBuffer: quotaAdmissionArgs.providerVolumeSafetyBuffer,
    },
  );
  if (!prepared?.ok) return mapWakeFailure(prepared);

  const names = buildBlaxelProjectWorkspaceNames(String(params.projectId));
  if (params.reuseExistingLease === true) {
    const reusable = await resolveReusableProjectWorkspaceLease({
      ctx: params.ctx,
      projectId: params.projectId,
      ownerId: params.ownerId,
      providerVolumeId: String(prepared.providerVolumeId),
      providerSandboxId: names.sandboxName,
      sandboxCpu,
      sandboxMemoryGiB,
      sandboxDiskGiB,
      requestedLifecycleIntent: params.lifecycleIntent,
    });
    if (reusable) return reusable;
  }

  const reserved = await reserveWorkspaceWakeCredits({
    ctx: params.ctx,
    ownerId: params.ownerId,
    projectId: params.projectId,
    runId: params.runId ?? null,
    action: params.reservationAction,
    sandboxCpu,
    sandboxMemoryGiB,
    sandboxDiskGiB,
  });
  if (!reserved.ok) return reserved;

  const ensured = await ensureBlaxelWorkspaceComputer({
    sandboxName: names.sandboxName,
    volumeName: prepared.providerVolumeId,
    lifecycleIntent: params.lifecycleIntent,
    labels: params.labels,
  });
  if (!ensured.ok) {
    await releaseWorkspaceWakeReservationBestEffort({
      ctx: params.ctx,
      creditReservationKey: reserved.creditReservationKey,
      failureReason: ensured.code,
      metadata: ensured.details,
    });
    return mapWakeFailure(ensured);
  }

  const nowMs = Date.now();
  try {
    const finalizedDisplacedLease =
      await finalizeExistingProjectWorkspaceLeaseBeforeReplacement({
        ctx: params.ctx,
        projectId: params.projectId,
        ownerId: params.ownerId,
        providerSandboxId: ensured.providerSandboxId,
        replacementCreditReservationKey: reserved.creditReservationKey,
      });
    if (!finalizedDisplacedLease.ok) {
      await releaseWorkspaceWakeReservationBestEffort({
        ctx: params.ctx,
        creditReservationKey: reserved.creditReservationKey,
        failureReason: finalizedDisplacedLease.code,
        metadata: finalizedDisplacedLease.details,
      });
      return mapWakeFailure(finalizedDisplacedLease);
    }
    await params.ctx.runMutation(internal.projects.attachCloudProjectVolumeInternal as any, {
      projectId: params.projectId,
      providerVolumeId: prepared.providerVolumeId,
      providerId: "blaxel",
      nowMs,
    });
    const registered = await params.ctx.runMutation(
      internal.workspaceTerminals.setProjectBackgroundSandboxInternal as any,
      {
        projectId: params.projectId,
        providerSandboxId: ensured.providerSandboxId,
        providerSandboxProviderId: "blaxel",
        providerSandboxState: "active",
        providerSandboxLastSeenAt: nowMs,
        providerSandboxStartedAt: ensured.startedAt,
        providerSandboxCreditReservationKey: reserved.creditReservationKey,
        providerSandboxCreditBudgetCredits: reserved.creditBudgetCredits,
        providerSandboxCreditBudgetExpiresAt: reserved.creditBudgetExpiresAt,
        clearSandboxAccounting: params.clearSandboxAccounting === true,
      },
    );
    void registered;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    await releaseWorkspaceWakeReservationBestEffort({
      ctx: params.ctx,
      creditReservationKey: reserved.creditReservationKey,
      failureReason: "workspace_wake_register_failed",
      metadata: {
        ...reserved.reservationMetadata,
        error_message: message || null,
      },
    });
    return {
      ok: false,
      status: 503,
      code: "workspace_session_register_failed",
      message: "Workspace computer started, but session registration failed.",
      details: {
        error_message: message || null,
      },
    };
  }

  return {
    ok: true,
    providerId: "blaxel",
    projectId: String(params.projectId),
    projectVolumeId: String(prepared.providerVolumeId),
    providerSandboxId: ensured.providerSandboxId,
    workspaceRoot: ensured.workspaceRoot,
    startedAt: ensured.startedAt,
    creditReservationKey: reserved.creditReservationKey,
    creditBudgetCredits: reserved.creditBudgetCredits,
    creditBudgetExpiresAt: reserved.creditBudgetExpiresAt,
    sandboxCpu,
    sandboxMemoryGiB,
    sandboxDiskGiB,
    lifecycleMode: "provider_standby",
  };
}

export async function reensureBlaxelWorkspaceComputerForPaidSession(params: {
  providerSandboxId: string;
  projectVolumeId?: string | null;
  workspaceRoot?: string | null;
  projectId: string;
  lifecycleIntent: WorkspaceComputerLifecycleIntent;
  labels?: Record<string, string>;
}): Promise<{ ok: true } | BlaxelWorkspaceWakeFailure> {
  const ensured = await ensureBlaxelWorkspaceComputer({
    sandboxName: params.providerSandboxId,
    volumeName: normalizeOptionalString(params.projectVolumeId),
    workspaceRoot: normalizeOptionalString(params.workspaceRoot),
    lifecycleIntent: params.lifecycleIntent,
    labels: {
      ...(params.labels ?? {}),
      project_id: String(params.projectId),
    },
  });
  return ensured.ok ? { ok: true } : mapWakeFailure(ensured);
}
