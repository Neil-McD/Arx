import { WORKSPACE_CREDITS_PER_USD } from "./workspaceCredits.ts";
import {
  computeWorkspaceAutoRechargeDecision,
  WORKSPACE_AUTO_RECHARGE_CURRENCY,
  type WorkspaceAutoRechargeDecisionReason,
  type WorkspaceAutoRechargeSettingsValue,
} from "./workspaceAutoRecharge.ts";

export const WORKSPACE_AUTO_RECHARGE_ATTEMPT_ACTIVE_STATUSES = [
  "prepared",
  "processing",
] as const;

export type WorkspaceAutoRechargeAttemptStatus =
  | "prepared"
  | "processing"
  | "succeeded"
  | "failed"
  | "released";

export type WorkspaceAutoRechargeAttemptSkipReason =
  | Exclude<WorkspaceAutoRechargeDecisionReason, "trigger">
  | "skip_active_attempt"
  | "skip_invalid_user"
  | "skip_invalid_sequence";

export type WorkspaceAutoRechargeAttemptPlanInput = {
  userId?: unknown;
  settings?: Partial<WorkspaceAutoRechargeSettingsValue> | null;
  spendableCreditsBalance?: unknown;
  uncollectedCreditsBalance?: unknown;
  pendingCardCollectionCreditsBalance?: unknown;
  monthlySucceededRechargeCredits?: unknown;
  hasActiveAttempt?: unknown;
  hasCardOnFile?: unknown;
  nowMs?: unknown;
  sequence?: unknown;
};

export type WorkspaceAutoRechargeAttemptPlan =
  | {
      shouldPrepare: true;
      attemptKey: string;
      monthKey: string;
      sequence: number;
      status: "prepared";
      rechargeCredits: number;
      amountCents: number;
      currency: typeof WORKSPACE_AUTO_RECHARGE_CURRENCY;
      thresholdCredits: number;
      restoreToCredits: number;
      monthlyLimitCredits: number | null;
      spendableCreditsBalance: number;
      uncollectedCreditsBalance: number;
      pendingCardCollectionCreditsBalance: number;
      monthlySucceededRechargeCredits: number;
    }
  | {
      shouldPrepare: false;
      reason: WorkspaceAutoRechargeAttemptSkipReason;
      rechargeCredits: 0;
      amountCents: 0;
      monthKey: string;
      sequence: number | null;
    };

function normalizeCredits(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(Math.max(0, parsed) * 100) / 100;
}

function normalizeSequence(value: unknown): number | null {
  const parsed = Number(value ?? 1);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

function normalizeNowMs(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function resolveWorkspaceAutoRechargeMonthKey(nowMs: unknown = Date.now()): string {
  const date = new Date(normalizeNowMs(nowMs));
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

export function buildWorkspaceAutoRechargeAttemptKey(
  userId: unknown,
  monthKey: string,
  sequence: unknown = 1,
): string {
  const normalizedUserId = String(userId ?? "").trim();
  const normalizedMonthKey = String(monthKey ?? "").trim();
  const normalizedSequence = normalizeSequence(sequence);
  if (!normalizedUserId) throw new Error("auto_recharge_attempt_user_required");
  if (!/^\d{4}-\d{2}$/.test(normalizedMonthKey)) {
    throw new Error("auto_recharge_attempt_month_key_invalid");
  }
  if (normalizedSequence === null) {
    throw new Error("auto_recharge_attempt_sequence_invalid");
  }
  return `workspace_auto_recharge:${normalizedUserId}:${normalizedMonthKey}:${normalizedSequence}`;
}

export function workspaceAutoRechargeCreditsToAmountCents(credits: unknown): number {
  const normalizedCredits = normalizeCredits(credits);
  return Math.max(0, Math.round((normalizedCredits / WORKSPACE_CREDITS_PER_USD) * 100));
}

export function isWorkspaceAutoRechargeAttemptStatusActive(
  status: unknown,
): status is (typeof WORKSPACE_AUTO_RECHARGE_ATTEMPT_ACTIVE_STATUSES)[number] {
  return WORKSPACE_AUTO_RECHARGE_ATTEMPT_ACTIVE_STATUSES.includes(status as never);
}

export function computeWorkspaceAutoRechargeAttemptPlan(
  input: WorkspaceAutoRechargeAttemptPlanInput,
): WorkspaceAutoRechargeAttemptPlan {
  const monthKey = resolveWorkspaceAutoRechargeMonthKey(input.nowMs);
  const sequence = normalizeSequence(input.sequence);
  const userId = String(input.userId ?? "").trim();
  if (!userId) {
    return {
      shouldPrepare: false,
      reason: "skip_invalid_user",
      rechargeCredits: 0,
      amountCents: 0,
      monthKey,
      sequence,
    };
  }
  if (sequence === null) {
    return {
      shouldPrepare: false,
      reason: "skip_invalid_sequence",
      rechargeCredits: 0,
      amountCents: 0,
      monthKey,
      sequence: null,
    };
  }
  if (input.hasActiveAttempt === true) {
    return {
      shouldPrepare: false,
      reason: "skip_active_attempt",
      rechargeCredits: 0,
      amountCents: 0,
      monthKey,
      sequence,
    };
  }

  const spendableCreditsBalance = normalizeCredits(input.spendableCreditsBalance);
  const uncollectedCreditsBalance = normalizeCredits(input.uncollectedCreditsBalance);
  const pendingCardCollectionCreditsBalance = normalizeCredits(
    input.pendingCardCollectionCreditsBalance,
  );
  const monthlySucceededRechargeCredits = normalizeCredits(input.monthlySucceededRechargeCredits);
  const decision = computeWorkspaceAutoRechargeDecision({
    settings: input.settings,
    spendableCreditsBalance,
    uncollectedCreditsBalance,
    pendingCardCollectionCreditsBalance,
    monthlyRechargedCredits: monthlySucceededRechargeCredits,
    hasCardOnFile: input.hasCardOnFile,
  });
  if (!decision.shouldTrigger) {
    return {
      shouldPrepare: false,
      reason: decision.reason,
      rechargeCredits: 0,
      amountCents: 0,
      monthKey,
      sequence,
    };
  }

  return {
    shouldPrepare: true,
    attemptKey: buildWorkspaceAutoRechargeAttemptKey(userId, monthKey, sequence),
    monthKey,
    sequence,
    status: "prepared",
    rechargeCredits: decision.rechargeCredits,
    amountCents: workspaceAutoRechargeCreditsToAmountCents(decision.rechargeCredits),
    currency: WORKSPACE_AUTO_RECHARGE_CURRENCY,
    thresholdCredits: decision.thresholdCredits,
    restoreToCredits: decision.restoreToCredits,
    monthlyLimitCredits: decision.monthlyLimitCredits,
    spendableCreditsBalance,
    uncollectedCreditsBalance,
    pendingCardCollectionCreditsBalance,
    monthlySucceededRechargeCredits,
  };
}
