export const WORKSPACE_AUTO_RECHARGE_CURRENCY = "usd" as const;
export const WORKSPACE_AUTO_RECHARGE_DEFAULT_THRESHOLD_CREDITS = 500;
export const WORKSPACE_AUTO_RECHARGE_DEFAULT_RESTORE_TO_CREDITS = 2500;
export const WORKSPACE_AUTO_RECHARGE_DEFAULT_MONTHLY_LIMIT_CREDITS = 10000;
export const WORKSPACE_AUTO_RECHARGE_MIN_THRESHOLD_CREDITS = 0;
export const WORKSPACE_AUTO_RECHARGE_MAX_THRESHOLD_CREDITS = 100000;
export const WORKSPACE_AUTO_RECHARGE_MIN_RESTORE_TO_CREDITS = 100;
export const WORKSPACE_AUTO_RECHARGE_MAX_RESTORE_TO_CREDITS = 100000;
export const WORKSPACE_AUTO_RECHARGE_MAX_MONTHLY_LIMIT_CREDITS = 100000;

export type WorkspaceAutoRechargeCurrency = typeof WORKSPACE_AUTO_RECHARGE_CURRENCY;

export type WorkspaceAutoRechargeStatus =
  | "active"
  | "paused_payment_failed"
  | "disabled";

export type WorkspaceAutoRechargeSettingsInput = {
  enabled?: unknown;
  status?: unknown;
  thresholdCredits?: unknown;
  restoreToCredits?: unknown;
  monthlyLimitCredits?: unknown;
};

export type WorkspaceAutoRechargeSettingsValue = {
  enabled: boolean;
  status: WorkspaceAutoRechargeStatus;
  thresholdCredits: number;
  restoreToCredits: number;
  monthlyLimitCredits: number | null;
  currency: WorkspaceAutoRechargeCurrency;
};

export type WorkspaceAutoRechargeValidationResult =
  | {
      ok: true;
      value: WorkspaceAutoRechargeSettingsValue;
    }
  | {
      ok: false;
      error: string;
    };

export type WorkspaceAutoRechargeDecisionReason =
  | "trigger"
  | "skip_disabled"
  | "skip_no_card"
  | "skip_above_threshold"
  | "skip_uncollected_usage"
  | "skip_pending_collection"
  | "skip_monthly_cap"
  | "skip_invalid_settings";

export type WorkspaceAutoRechargeDecision =
  | {
      shouldTrigger: true;
      reason: "trigger";
      rechargeCredits: number;
      restoreToCredits: number;
      thresholdCredits: number;
      monthlyLimitCredits: number | null;
    }
  | {
      shouldTrigger: false;
      reason: Exclude<WorkspaceAutoRechargeDecisionReason, "trigger">;
      rechargeCredits: 0;
      restoreToCredits: number;
      thresholdCredits: number;
      monthlyLimitCredits: number | null;
    };

export type WorkspaceAutoRechargeDecisionInput = {
  settings?: Partial<WorkspaceAutoRechargeSettingsValue> | null;
  spendableCreditsBalance?: unknown;
  uncollectedCreditsBalance?: unknown;
  pendingCardCollectionCreditsBalance?: unknown;
  monthlyRechargedCredits?: unknown;
  hasCardOnFile?: unknown;
};

function roundCredits(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeCredits(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return roundCredits(parsed);
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function normalizeStatus(value: unknown, enabled: boolean): WorkspaceAutoRechargeStatus {
  if (value === "active" || value === "paused_payment_failed" || value === "disabled") {
    return value;
  }
  return enabled ? "active" : "disabled";
}

export function buildDefaultWorkspaceAutoRechargeSettings(
  overrides: Partial<WorkspaceAutoRechargeSettingsValue> = {},
): WorkspaceAutoRechargeSettingsValue {
  const enabled = normalizeBoolean(overrides.enabled, false);
  return {
    enabled,
    status: normalizeStatus(overrides.status, enabled),
    thresholdCredits:
      normalizeCredits(overrides.thresholdCredits) ??
      WORKSPACE_AUTO_RECHARGE_DEFAULT_THRESHOLD_CREDITS,
    restoreToCredits:
      normalizeCredits(overrides.restoreToCredits) ??
      WORKSPACE_AUTO_RECHARGE_DEFAULT_RESTORE_TO_CREDITS,
    monthlyLimitCredits:
      overrides.monthlyLimitCredits === null
        ? null
        : normalizeCredits(overrides.monthlyLimitCredits) ??
          WORKSPACE_AUTO_RECHARGE_DEFAULT_MONTHLY_LIMIT_CREDITS,
    currency: WORKSPACE_AUTO_RECHARGE_CURRENCY,
  };
}

export function validateWorkspaceAutoRechargeSettingsInput(
  input: WorkspaceAutoRechargeSettingsInput,
): WorkspaceAutoRechargeValidationResult {
  const enabled = normalizeBoolean(input.enabled, true);
  const thresholdCredits =
    normalizeCredits(input.thresholdCredits) ??
    WORKSPACE_AUTO_RECHARGE_DEFAULT_THRESHOLD_CREDITS;
  const restoreToCredits =
    normalizeCredits(input.restoreToCredits) ??
    WORKSPACE_AUTO_RECHARGE_DEFAULT_RESTORE_TO_CREDITS;
  const monthlyLimitCredits =
    input.monthlyLimitCredits === null || input.monthlyLimitCredits === undefined
      ? null
      : normalizeCredits(input.monthlyLimitCredits);

  if (
    thresholdCredits < WORKSPACE_AUTO_RECHARGE_MIN_THRESHOLD_CREDITS ||
    thresholdCredits > WORKSPACE_AUTO_RECHARGE_MAX_THRESHOLD_CREDITS
  ) {
    return { ok: false, error: "auto_recharge_threshold_out_of_range" };
  }
  if (
    restoreToCredits < WORKSPACE_AUTO_RECHARGE_MIN_RESTORE_TO_CREDITS ||
    restoreToCredits > WORKSPACE_AUTO_RECHARGE_MAX_RESTORE_TO_CREDITS
  ) {
    return { ok: false, error: "auto_recharge_restore_to_out_of_range" };
  }
  if (restoreToCredits <= thresholdCredits) {
    return { ok: false, error: "auto_recharge_restore_to_must_exceed_threshold" };
  }
  const minimumRechargeCredits = restoreToCredits - thresholdCredits;
  if (monthlyLimitCredits !== null) {
    if (
      monthlyLimitCredits < minimumRechargeCredits ||
      monthlyLimitCredits > WORKSPACE_AUTO_RECHARGE_MAX_MONTHLY_LIMIT_CREDITS
    ) {
      return { ok: false, error: "auto_recharge_monthly_limit_out_of_range" };
    }
  }

  return {
    ok: true,
    value: {
      enabled,
      status: enabled ? normalizeStatus(input.status, enabled) : "disabled",
      thresholdCredits,
      restoreToCredits,
      monthlyLimitCredits,
      currency: WORKSPACE_AUTO_RECHARGE_CURRENCY,
    },
  };
}

function invalidDecision(
  reason: Exclude<WorkspaceAutoRechargeDecisionReason, "trigger">,
  settings: WorkspaceAutoRechargeSettingsValue,
): WorkspaceAutoRechargeDecision {
  return {
    shouldTrigger: false,
    reason,
    rechargeCredits: 0,
    restoreToCredits: settings.restoreToCredits,
    thresholdCredits: settings.thresholdCredits,
    monthlyLimitCredits: settings.monthlyLimitCredits,
  };
}

export function computeWorkspaceAutoRechargeDecision(
  input: WorkspaceAutoRechargeDecisionInput,
): WorkspaceAutoRechargeDecision {
  const settings = buildDefaultWorkspaceAutoRechargeSettings(input.settings ?? {});
  const validation = validateWorkspaceAutoRechargeSettingsInput(settings);
  if (!validation.ok) return invalidDecision("skip_invalid_settings", settings);
  const normalized = validation.value;
  if (!normalized.enabled || normalized.status !== "active") {
    return invalidDecision("skip_disabled", normalized);
  }
  if (input.hasCardOnFile !== true) {
    return invalidDecision("skip_no_card", normalized);
  }

  const spendableCreditsBalance = normalizeCredits(input.spendableCreditsBalance) ?? 0;
  const uncollectedCreditsBalance = normalizeCredits(input.uncollectedCreditsBalance) ?? 0;
  const pendingCardCollectionCreditsBalance =
    normalizeCredits(input.pendingCardCollectionCreditsBalance) ?? 0;
  const monthlyRechargedCredits = normalizeCredits(input.monthlyRechargedCredits) ?? 0;

  if (uncollectedCreditsBalance > 0) {
    return invalidDecision("skip_uncollected_usage", normalized);
  }
  if (pendingCardCollectionCreditsBalance > 0) {
    return invalidDecision("skip_pending_collection", normalized);
  }
  if (spendableCreditsBalance > normalized.thresholdCredits) {
    return invalidDecision("skip_above_threshold", normalized);
  }

  const rechargeCredits = roundCredits(normalized.restoreToCredits - spendableCreditsBalance);
  if (rechargeCredits <= 0) {
    return invalidDecision("skip_invalid_settings", normalized);
  }
  if (
    normalized.monthlyLimitCredits !== null &&
    monthlyRechargedCredits + rechargeCredits > normalized.monthlyLimitCredits
  ) {
    return invalidDecision("skip_monthly_cap", normalized);
  }

  return {
    shouldTrigger: true,
    reason: "trigger",
    rechargeCredits,
    restoreToCredits: normalized.restoreToCredits,
    thresholdCredits: normalized.thresholdCredits,
    monthlyLimitCredits: normalized.monthlyLimitCredits,
  };
}
