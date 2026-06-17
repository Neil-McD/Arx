import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { resolveAuthenticatedActor } from "./authActor";
import { getStripeClient } from "./stripeCore";
import {
  buildDefaultWorkspaceAutoRechargeSettings,
  WORKSPACE_AUTO_RECHARGE_CURRENCY,
  validateWorkspaceAutoRechargeSettingsInput,
  type WorkspaceAutoRechargeStatus,
} from "../shared/workspaceAutoRecharge";
import {
  computeWorkspaceAutoRechargeAttemptPlan,
  isWorkspaceAutoRechargeAttemptStatusActive,
  resolveWorkspaceAutoRechargeMonthKey,
  type WorkspaceAutoRechargeAttemptStatus,
} from "../shared/workspaceAutoRechargeAttempts";
import {
  getPendingCardCollectionWorkspaceToolBalanceCredits,
  getSpendableWorkspaceToolBalanceCredits,
  getUncollectedWorkspaceToolBalanceCredits,
} from "../shared/workspaceCredits";

type WorkspaceAutoRechargeSettingsRow = {
  _id?: any;
  userId: Id<"users">;
  enabled: boolean;
  status: WorkspaceAutoRechargeStatus;
  thresholdCredits: number;
  restoreToCredits: number;
  monthlyLimitCredits?: number;
  currency: "usd";
  lastTriggeredAt?: number;
  lastSucceededAt?: number;
  lastFailureAt?: number;
  failureReason?: string;
  createdAt: number;
  updatedAt: number;
};

type WorkspaceCreditBalanceRow = {
  _id?: any;
  userId: Id<"users">;
  includedCreditsBalance: number;
  purchasedCreditsBalance: number;
  uncollectedCreditsBalance?: number;
  pendingCardCollectionCreditsBalance?: number;
  includedCycleCredits: number;
  includedCycleStartedAt: number;
  includedCycleEndsAt: number;
  createdAt: number;
  updatedAt: number;
};

type WorkspaceAutoRechargeAttemptRow = {
  _id?: any;
  attemptKey: string;
  userId: Id<"users">;
  status: WorkspaceAutoRechargeAttemptStatus;
  monthKey: string;
  sequence: number;
  rechargeCredits: number;
  amountCents: number;
  currency: "usd";
  thresholdCredits: number;
  restoreToCredits: number;
  monthlyLimitCredits?: number;
  spendableCreditsBalance: number;
  uncollectedCreditsBalance: number;
  pendingCardCollectionCreditsBalance: number;
  provider?: string;
  providerPaymentId?: string;
  providerIdempotencyKey?: string;
  failureReason?: string;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
};

type WorkspaceAutoRechargePaymentMethod = {
  providerCustomerId: string;
  providerPaymentMethodId: string;
};

const DUPLICATE_WORKSPACE_AUTO_RECHARGE_SETTINGS_ERROR =
  "duplicate_auto_recharge_settings";
const DUPLICATE_WORKSPACE_CREDIT_BALANCE_ERROR = "duplicate_workspace_credit_balance";
const WORKSPACE_AUTO_RECHARGE_MONTH_ATTEMPT_SCAN_LIMIT = 200;

function roundCredits(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizeStripeCustomerId(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized?.startsWith("cus_") ? normalized : undefined;
}

function normalizeStripePaymentMethodId(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized?.startsWith("pm_") ? normalized : undefined;
}

function buildWorkspaceAutoRechargeSettingsProjection(
  row: WorkspaceAutoRechargeSettingsRow | null,
  options: {
    blocked?: boolean;
    blockedReason?: string | null;
  } = {},
) {
  const settings = buildDefaultWorkspaceAutoRechargeSettings(
    row
      ? {
          enabled: row.enabled,
          status: row.status,
          thresholdCredits: row.thresholdCredits,
          restoreToCredits: row.restoreToCredits,
          monthlyLimitCredits: row.monthlyLimitCredits ?? null,
        }
      : {},
  );
  return {
    configured: Boolean(row),
    blocked: options.blocked === true,
    blockedReason: options.blockedReason ?? null,
    enabled: settings.enabled,
    status: settings.status,
    thresholdCredits: settings.thresholdCredits,
    restoreToCredits: settings.restoreToCredits,
    monthlyLimitCredits: settings.monthlyLimitCredits,
    currency: settings.currency,
    lastTriggeredAt: row?.lastTriggeredAt ?? null,
    lastSucceededAt: row?.lastSucceededAt ?? null,
    lastFailureAt: row?.lastFailureAt ?? null,
    failureReason: row?.failureReason ?? null,
    createdAt: row?.createdAt ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

function buildDuplicateWorkspaceAutoRechargeSettingsProjection() {
  const defaults = buildDefaultWorkspaceAutoRechargeSettings({
    enabled: false,
    status: "disabled",
  });
  return {
    configured: true,
    blocked: true,
    blockedReason: DUPLICATE_WORKSPACE_AUTO_RECHARGE_SETTINGS_ERROR,
    enabled: false,
    status: "disabled" as const,
    thresholdCredits: defaults.thresholdCredits,
    restoreToCredits: defaults.restoreToCredits,
    monthlyLimitCredits: defaults.monthlyLimitCredits,
    currency: defaults.currency,
    lastTriggeredAt: null,
    lastSucceededAt: null,
    lastFailureAt: null,
    failureReason: DUPLICATE_WORKSPACE_AUTO_RECHARGE_SETTINGS_ERROR,
    createdAt: null,
    updatedAt: null,
  };
}

async function readWorkspaceAutoRechargeSettingsRows(
  ctx: any,
  userId: unknown,
  limit = 2,
): Promise<WorkspaceAutoRechargeSettingsRow[]> {
  return (await ctx.db
    .query("workspaceAutoRechargeSettings")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .take(limit)) as WorkspaceAutoRechargeSettingsRow[];
}

async function readCanonicalWorkspaceAutoRechargeSettingsRow(ctx: any, userId: unknown) {
  const rows = await readWorkspaceAutoRechargeSettingsRows(ctx, userId, 2);
  if (rows.length > 1) {
    return {
      row: null,
      duplicate: true,
    };
  }
  return {
    row: rows[0] ?? null,
    duplicate: false,
  };
}

async function readActiveWorkspaceAutoRechargePaymentMethod(
  ctx: any,
  userId: unknown,
): Promise<WorkspaceAutoRechargePaymentMethod | null> {
  const stripeCustomer = await ctx.db
    .query("userStripeCustomers")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  const status = stripeCustomer?.paymentMethodStatus ?? "missing";
  const providerCustomerId = normalizeStripeCustomerId(stripeCustomer?.providerCustomerId);
  const providerPaymentMethodId = normalizeStripePaymentMethodId(
    stripeCustomer?.providerDefaultPaymentMethodId,
  );
  const active =
    status === "active" &&
    Boolean(providerCustomerId) &&
    Boolean(providerPaymentMethodId) &&
    !(Number(stripeCustomer?.cardRemovedAt ?? 0) > 0);
  return active && providerCustomerId && providerPaymentMethodId
    ? { providerCustomerId, providerPaymentMethodId }
    : null;
}

async function hasActiveWorkspaceAutoRechargePaymentMethod(ctx: any, userId: unknown): Promise<boolean> {
  return Boolean(await readActiveWorkspaceAutoRechargePaymentMethod(ctx, userId));
}

async function readWorkspaceCreditBalanceRowsByUser(
  ctx: any,
  userId: unknown,
  limit = 2,
): Promise<WorkspaceCreditBalanceRow[]> {
  return await ctx.db
    .query("workspaceCreditBalances")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .take(Math.max(1, Math.floor(limit)));
}

async function readCanonicalWorkspaceCreditBalance(
  ctx: any,
  userId: unknown,
): Promise<WorkspaceCreditBalanceRow | null> {
  const rows = await readWorkspaceCreditBalanceRowsByUser(ctx, userId, 2);
  if (rows.length > 1) throw new Error(DUPLICATE_WORKSPACE_CREDIT_BALANCE_ERROR);
  return rows[0] ?? null;
}

async function readWorkspaceAutoRechargeAttemptByKey(
  ctx: any,
  attemptKey: unknown,
): Promise<WorkspaceAutoRechargeAttemptRow | null> {
  const normalized = normalizeOptionalString(attemptKey);
  if (!normalized) return null;
  return await ctx.db
    .query("workspaceAutoRechargeAttempts")
    .withIndex("by_attemptKey", (q: any) => q.eq("attemptKey", normalized))
    .first();
}

async function readActiveWorkspaceAutoRechargeAttempts(
  ctx: any,
  userId: unknown,
): Promise<WorkspaceAutoRechargeAttemptRow[]> {
  const prepared = await ctx.db
    .query("workspaceAutoRechargeAttempts")
    .withIndex("by_user_status", (q: any) => q.eq("userId", userId).eq("status", "prepared"))
    .take(2);
  const processing = await ctx.db
    .query("workspaceAutoRechargeAttempts")
    .withIndex("by_user_status", (q: any) => q.eq("userId", userId).eq("status", "processing"))
    .take(2);
  return [...prepared, ...processing] as WorkspaceAutoRechargeAttemptRow[];
}

async function readWorkspaceAutoRechargeMonthAttempts(
  ctx: any,
  userId: unknown,
  monthKey: string,
): Promise<WorkspaceAutoRechargeAttemptRow[]> {
  const rows = await ctx.db
    .query("workspaceAutoRechargeAttempts")
    .withIndex("by_user_monthKey", (q: any) => q.eq("userId", userId).eq("monthKey", monthKey))
    .take(WORKSPACE_AUTO_RECHARGE_MONTH_ATTEMPT_SCAN_LIMIT);
  if (rows.length >= WORKSPACE_AUTO_RECHARGE_MONTH_ATTEMPT_SCAN_LIMIT) {
    throw new Error("auto_recharge_month_attempt_scan_truncated");
  }
  return rows as WorkspaceAutoRechargeAttemptRow[];
}

function sumSucceededWorkspaceAutoRechargeCredits(rows: WorkspaceAutoRechargeAttemptRow[]): number {
  return roundCredits(
    rows.reduce(
      (sum, row) => sum + (row.status === "succeeded" ? Math.max(0, Number(row.rechargeCredits) || 0) : 0),
      0,
    ),
  );
}

function nextWorkspaceAutoRechargeSequence(rows: WorkspaceAutoRechargeAttemptRow[]): number {
  return (
    rows.reduce((max, row) => Math.max(max, Math.floor(Number(row.sequence ?? 0) || 0)), 0) + 1
  );
}

function buildWorkspaceAutoRechargePaymentIntentMetadata(params: {
  attemptKey: string;
  userId: unknown;
  rechargeCredits: number;
}) {
  return {
    polynet_attempt_key: params.attemptKey,
    polynet_user_id: String(params.userId),
    workspace_auto_recharge_credits: String(roundCredits(params.rechargeCredits)),
    purpose: "workspace_auto_recharge",
  };
}

function normalizeStripePaymentIntentId(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized?.startsWith("pi_") ? normalized : undefined;
}

function readStripeErrorPaymentIntent(error: unknown): any | null {
  const candidate = error as { payment_intent?: unknown; paymentIntent?: unknown; raw?: unknown };
  const direct = candidate?.payment_intent ?? candidate?.paymentIntent;
  if (direct && typeof direct === "object") return direct;
  const raw = candidate?.raw;
  if (raw && typeof raw === "object") {
    const rawIntent =
      (raw as { payment_intent?: unknown; paymentIntent?: unknown }).payment_intent ??
      (raw as { paymentIntent?: unknown }).paymentIntent;
    if (rawIntent && typeof rawIntent === "object") return rawIntent;
  }
  return null;
}

function readStripeErrorCode(error: unknown): string {
  const candidate = error as { code?: unknown; type?: unknown; message?: unknown };
  return (
    normalizeOptionalString(candidate?.code) ??
    normalizeOptionalString(candidate?.type) ??
    normalizeOptionalString(candidate?.message) ??
    "stripe_payment_failed"
  );
}

function paymentIntentIsSucceeded(status: unknown): boolean {
  return String(status ?? "").trim() === "succeeded";
}

function paymentIntentIsProcessing(status: unknown): boolean {
  return String(status ?? "").trim() === "processing";
}

function paymentIntentIsTerminalFailure(status: unknown): boolean {
  return [
    "canceled",
    "requires_action",
    "requires_capture",
    "requires_confirmation",
    "requires_payment_method",
  ].includes(String(status ?? "").trim());
}

function normalizePaymentIntentFailureReason(intent: any, fallback: string): string {
  return (
    normalizeOptionalString(intent?.last_payment_error?.code) ??
    normalizeOptionalString(intent?.last_payment_error?.message) ??
    normalizeOptionalString(intent?.cancellation_reason) ??
    fallback
  );
}

export const getWorkspaceAutoRechargeSettings = query({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const { row, duplicate } = await readCanonicalWorkspaceAutoRechargeSettingsRow(ctx, actor.dbUserId);
    if (duplicate) return buildDuplicateWorkspaceAutoRechargeSettingsProjection();
    return buildWorkspaceAutoRechargeSettingsProjection(row);
  },
});

export const getWorkspaceAutoRechargeSettingsForUserInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { row, duplicate } = await readCanonicalWorkspaceAutoRechargeSettingsRow(ctx, args.userId);
    if (duplicate) return buildDuplicateWorkspaceAutoRechargeSettingsProjection();
    return buildWorkspaceAutoRechargeSettingsProjection(row);
  },
});

export const saveWorkspaceAutoRechargeSettings = mutation({
  args: {
    authSubject: v.optional(v.string()),
    enabled: v.boolean(),
    thresholdCredits: v.optional(v.number()),
    restoreToCredits: v.optional(v.number()),
    monthlyLimitCredits: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const validation = validateWorkspaceAutoRechargeSettingsInput({
      enabled: args.enabled,
      thresholdCredits: args.thresholdCredits,
      restoreToCredits: args.restoreToCredits,
      monthlyLimitCredits: args.monthlyLimitCredits ?? null,
    });
    if (!validation.ok) throw new Error(validation.error);
    const { row: existing, duplicate } = await readCanonicalWorkspaceAutoRechargeSettingsRow(
      ctx,
      actor.dbUserId,
    );
    if (duplicate) throw new Error(DUPLICATE_WORKSPACE_AUTO_RECHARGE_SETTINGS_ERROR);
    if (
      validation.value.enabled &&
      !(await hasActiveWorkspaceAutoRechargePaymentMethod(ctx, actor.dbUserId))
    ) {
      throw new Error("auto_recharge_card_required");
    }
    const nowMs = Date.now();
    const patch = {
      enabled: validation.value.enabled,
      status: validation.value.enabled ? "active" as const : "disabled" as const,
      thresholdCredits: validation.value.thresholdCredits,
      restoreToCredits: validation.value.restoreToCredits,
      monthlyLimitCredits: validation.value.monthlyLimitCredits ?? undefined,
      currency: WORKSPACE_AUTO_RECHARGE_CURRENCY,
      failureReason: undefined,
      updatedAt: nowMs,
    };
    if (existing?._id) {
      await ctx.db.patch(existing._id, patch);
      return buildWorkspaceAutoRechargeSettingsProjection({
        ...existing,
        ...patch,
      });
    }
    const row = {
      userId: actor.dbUserId,
      ...patch,
      createdAt: nowMs,
    };
    await ctx.db.insert("workspaceAutoRechargeSettings", row);
    return buildWorkspaceAutoRechargeSettingsProjection(row);
  },
});

export const disableWorkspaceAutoRechargeSettings = mutation({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = Date.now();
    const rows = await readWorkspaceAutoRechargeSettingsRows(ctx, actor.dbUserId, 100);
    const existing = rows[0] ?? null;
    const defaults = buildDefaultWorkspaceAutoRechargeSettings({
      enabled: false,
      status: "disabled",
    });
    const patch = {
      enabled: false,
      status: "disabled" as const,
      thresholdCredits: existing?.thresholdCredits ?? defaults.thresholdCredits,
      restoreToCredits: existing?.restoreToCredits ?? defaults.restoreToCredits,
      monthlyLimitCredits: existing?.monthlyLimitCredits ?? defaults.monthlyLimitCredits ?? undefined,
      currency: WORKSPACE_AUTO_RECHARGE_CURRENCY,
      failureReason: undefined,
      updatedAt: nowMs,
    };
    if (rows.length) {
      await Promise.all(rows.map((row) => ctx.db.patch(row._id, patch)));
      if (rows.length > 1) return buildDuplicateWorkspaceAutoRechargeSettingsProjection();
      return buildWorkspaceAutoRechargeSettingsProjection({
        ...existing,
        ...patch,
      } as WorkspaceAutoRechargeSettingsRow);
    }
    const row = {
      userId: actor.dbUserId,
      ...patch,
      createdAt: nowMs,
    };
    await ctx.db.insert("workspaceAutoRechargeSettings", row);
    return buildWorkspaceAutoRechargeSettingsProjection(row);
  },
});

export const prepareWorkspaceAutoRechargeAttemptInternal = internalMutation({
  args: {
    userId: v.id("users"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const activeAttempts = await readActiveWorkspaceAutoRechargeAttempts(ctx, args.userId);
    if (activeAttempts.length > 1) throw new Error("duplicate_active_auto_recharge_attempts");
    const activeAttempt = activeAttempts[0] ?? null;
    const paymentMethod = await readActiveWorkspaceAutoRechargePaymentMethod(ctx, args.userId);
    if (activeAttempt) {
      return {
        ok: true,
        disposition: "active_attempt",
        attempt: activeAttempt,
        attemptKey: activeAttempt.attemptKey,
        providerCustomerId: paymentMethod?.providerCustomerId ?? null,
        providerPaymentMethodId: paymentMethod?.providerPaymentMethodId ?? null,
        providerIdempotencyKey: activeAttempt.providerIdempotencyKey ?? activeAttempt.attemptKey,
      };
    }

    const { row: settings, duplicate } = await readCanonicalWorkspaceAutoRechargeSettingsRow(
      ctx,
      args.userId,
    );
    if (duplicate) {
      return {
        ok: true,
        disposition: "skipped",
        reason: DUPLICATE_WORKSPACE_AUTO_RECHARGE_SETTINGS_ERROR,
      };
    }

    const balance = await readCanonicalWorkspaceCreditBalance(ctx, args.userId);
    const balanceProjection = balance ?? {
      includedCreditsBalance: 0,
      purchasedCreditsBalance: 0,
      uncollectedCreditsBalance: 0,
      pendingCardCollectionCreditsBalance: 0,
    };
    const monthKey = resolveWorkspaceAutoRechargeMonthKey(nowMs);
    const monthAttempts = await readWorkspaceAutoRechargeMonthAttempts(ctx, args.userId, monthKey);
    const plan = computeWorkspaceAutoRechargeAttemptPlan({
      userId: args.userId,
      settings: settings
        ? {
            enabled: settings.enabled,
            status: settings.status,
            thresholdCredits: settings.thresholdCredits,
            restoreToCredits: settings.restoreToCredits,
            monthlyLimitCredits: settings.monthlyLimitCredits ?? null,
          }
        : null,
      spendableCreditsBalance: getSpendableWorkspaceToolBalanceCredits(balanceProjection),
      uncollectedCreditsBalance: getUncollectedWorkspaceToolBalanceCredits(balanceProjection),
      pendingCardCollectionCreditsBalance:
        getPendingCardCollectionWorkspaceToolBalanceCredits(balanceProjection),
      monthlySucceededRechargeCredits: sumSucceededWorkspaceAutoRechargeCredits(monthAttempts),
      hasActiveAttempt: false,
      hasCardOnFile: Boolean(paymentMethod),
      nowMs,
      sequence: nextWorkspaceAutoRechargeSequence(monthAttempts),
    });

    if (!plan.shouldPrepare) {
      return {
        ok: true,
        disposition: "skipped",
        reason: plan.reason,
        monthKey: plan.monthKey,
        sequence: plan.sequence,
      };
    }

    const existing = await readWorkspaceAutoRechargeAttemptByKey(ctx, plan.attemptKey);
    if (existing) {
      return {
        ok: true,
        disposition: isWorkspaceAutoRechargeAttemptStatusActive(existing.status)
          ? "active_attempt"
          : "completed_attempt",
        attempt: existing,
        attemptKey: existing.attemptKey,
        providerCustomerId: paymentMethod?.providerCustomerId ?? null,
        providerPaymentMethodId: paymentMethod?.providerPaymentMethodId ?? null,
        providerIdempotencyKey: existing.providerIdempotencyKey ?? existing.attemptKey,
      };
    }

    const attempt = {
      attemptKey: plan.attemptKey,
      userId: args.userId,
      status: "prepared" as const,
      monthKey: plan.monthKey,
      sequence: plan.sequence,
      rechargeCredits: plan.rechargeCredits,
      amountCents: plan.amountCents,
      currency: plan.currency,
      thresholdCredits: plan.thresholdCredits,
      restoreToCredits: plan.restoreToCredits,
      monthlyLimitCredits: plan.monthlyLimitCredits ?? undefined,
      spendableCreditsBalance: plan.spendableCreditsBalance,
      uncollectedCreditsBalance: plan.uncollectedCreditsBalance,
      pendingCardCollectionCreditsBalance: plan.pendingCardCollectionCreditsBalance,
      provider: "stripe",
      providerIdempotencyKey: plan.attemptKey,
      createdAt: nowMs,
      updatedAt: nowMs,
    };
    const attemptId = await ctx.db.insert("workspaceAutoRechargeAttempts", attempt);
    if (settings?._id) {
      await ctx.db.patch(settings._id, {
        lastTriggeredAt: nowMs,
        updatedAt: nowMs,
      });
    }
    return {
      ok: true,
      disposition: "prepared",
      attempt: await ctx.db.get(attemptId),
      attemptKey: plan.attemptKey,
      providerCustomerId: paymentMethod?.providerCustomerId ?? null,
      providerPaymentMethodId: paymentMethod?.providerPaymentMethodId ?? null,
      providerIdempotencyKey: plan.attemptKey,
    };
  },
});

export const markWorkspaceAutoRechargeAttemptProcessingInternal = internalMutation({
  args: {
    attemptKey: v.string(),
    providerPaymentId: v.optional(v.union(v.string(), v.null())),
    providerIdempotencyKey: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const attempt = await readWorkspaceAutoRechargeAttemptByKey(ctx, args.attemptKey);
    if (!attempt) throw new Error("auto_recharge_attempt_not_found");
    if (!isWorkspaceAutoRechargeAttemptStatusActive(attempt.status)) {
      return {
        ok: true,
        alreadyCompleted: true,
        attempt,
        status: attempt.status,
      };
    }
    await ctx.db.patch(attempt._id, {
      status: "processing",
      provider: "stripe",
      providerPaymentId:
        normalizeStripePaymentIntentId(args.providerPaymentId) ?? attempt.providerPaymentId,
      providerIdempotencyKey:
        normalizeOptionalString(args.providerIdempotencyKey) ??
        attempt.providerIdempotencyKey ??
        attempt.attemptKey,
      updatedAt: nowMs,
    });
    return {
      ok: true,
      alreadyCompleted: false,
      attempt: await ctx.db.get(attempt._id),
      status: "processing",
    };
  },
});

export const finalizeWorkspaceAutoRechargeAttemptSucceededInternal = internalMutation({
  args: {
    attemptKey: v.string(),
    providerPaymentId: v.optional(v.union(v.string(), v.null())),
    providerIdempotencyKey: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const attempt = await readWorkspaceAutoRechargeAttemptByKey(ctx, args.attemptKey);
    if (!attempt) throw new Error("auto_recharge_attempt_not_found");
    if (!isWorkspaceAutoRechargeAttemptStatusActive(attempt.status)) {
      return {
        ok: true,
        alreadyCompleted: true,
        attempt,
        status: attempt.status,
      };
    }
    const rechargeCredits = roundCredits(Math.max(0, Number(attempt.rechargeCredits ?? 0)));
    if (!(rechargeCredits > 0)) throw new Error("auto_recharge_attempt_amount_invalid");
    const balance = await readCanonicalWorkspaceCreditBalance(ctx, attempt.userId);
    if (!balance) {
      await ctx.db.insert("workspaceCreditBalances", {
        userId: attempt.userId,
        includedCreditsBalance: 0,
        purchasedCreditsBalance: rechargeCredits,
        uncollectedCreditsBalance: 0,
        pendingCardCollectionCreditsBalance: 0,
        includedCycleCredits: 0,
        includedCycleStartedAt: nowMs,
        includedCycleEndsAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    } else {
      await ctx.db.patch(balance._id, {
        purchasedCreditsBalance: roundCredits(balance.purchasedCreditsBalance + rechargeCredits),
        updatedAt: nowMs,
      });
    }
    await ctx.db.patch(attempt._id, {
      status: "succeeded",
      provider: "stripe",
      providerPaymentId:
        normalizeStripePaymentIntentId(args.providerPaymentId) ?? attempt.providerPaymentId,
      providerIdempotencyKey:
        normalizeOptionalString(args.providerIdempotencyKey) ??
        attempt.providerIdempotencyKey ??
        attempt.attemptKey,
      failureReason: undefined,
      completedAt: nowMs,
      updatedAt: nowMs,
    });
    const { row: settings, duplicate } = await readCanonicalWorkspaceAutoRechargeSettingsRow(
      ctx,
      attempt.userId,
    );
    if (!duplicate && settings?._id) {
      await ctx.db.patch(settings._id, {
        ...(settings.enabled ? { status: "active" as const } : {}),
        lastSucceededAt: nowMs,
        failureReason: undefined,
        updatedAt: nowMs,
      });
    }
    return {
      ok: true,
      alreadyCompleted: false,
      attempt: await ctx.db.get(attempt._id),
      status: "succeeded",
      rechargeCredits,
    };
  },
});

export const finalizeWorkspaceAutoRechargeAttemptFailedInternal = internalMutation({
  args: {
    attemptKey: v.string(),
    providerPaymentId: v.optional(v.union(v.string(), v.null())),
    providerIdempotencyKey: v.optional(v.union(v.string(), v.null())),
    failureReason: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const attempt = await readWorkspaceAutoRechargeAttemptByKey(ctx, args.attemptKey);
    if (!attempt) throw new Error("auto_recharge_attempt_not_found");
    if (!isWorkspaceAutoRechargeAttemptStatusActive(attempt.status)) {
      return {
        ok: true,
        alreadyCompleted: true,
        attempt,
        status: attempt.status,
      };
    }
    const failureReason = normalizeOptionalString(args.failureReason) ?? "stripe_payment_failed";
    await ctx.db.patch(attempt._id, {
      status: "failed",
      provider: "stripe",
      providerPaymentId:
        normalizeStripePaymentIntentId(args.providerPaymentId) ?? attempt.providerPaymentId,
      providerIdempotencyKey:
        normalizeOptionalString(args.providerIdempotencyKey) ??
        attempt.providerIdempotencyKey ??
        attempt.attemptKey,
      failureReason,
      completedAt: nowMs,
      updatedAt: nowMs,
    });
    const { row: settings, duplicate } = await readCanonicalWorkspaceAutoRechargeSettingsRow(
      ctx,
      attempt.userId,
    );
    if (!duplicate && settings?._id) {
      await ctx.db.patch(settings._id, {
        ...(settings.enabled ? { status: "paused_payment_failed" as const } : {}),
        lastFailureAt: nowMs,
        failureReason,
        updatedAt: nowMs,
      });
    }
    return {
      ok: true,
      alreadyCompleted: false,
      attempt: await ctx.db.get(attempt._id),
      status: "failed",
      failureReason,
    };
  },
});

async function finalizeWorkspaceAutoRechargePaymentIntent(params: {
  ctx: any;
  attempt: WorkspaceAutoRechargeAttemptRow;
  paymentIntent: any;
  providerIdempotencyKey: string;
  nowMs: number;
}): Promise<any> {
  const attemptKey = String(params.attempt?.attemptKey ?? "").trim();
  if (!attemptKey) return { disposition: "skipped", reason: "attempt_key_missing" };
  const paymentIntentId = normalizeStripePaymentIntentId(params.paymentIntent?.id);
  const status = String(params.paymentIntent?.status ?? "").trim();
  if (paymentIntentIsSucceeded(status)) {
    const finalized: any = await params.ctx.runMutation(
      (internal as any).workspaceAutoRecharge.finalizeWorkspaceAutoRechargeAttemptSucceededInternal,
      {
        attemptKey,
        providerPaymentId: paymentIntentId,
        providerIdempotencyKey: params.providerIdempotencyKey,
        nowMs: params.nowMs,
      },
    );
    return { disposition: "succeeded", providerPaymentId: paymentIntentId, finalized };
  }
  if (paymentIntentIsProcessing(status)) {
    await params.ctx.runMutation(
      (internal as any).workspaceAutoRecharge.markWorkspaceAutoRechargeAttemptProcessingInternal,
      {
        attemptKey,
        providerPaymentId: paymentIntentId,
        providerIdempotencyKey: params.providerIdempotencyKey,
        nowMs: params.nowMs,
      },
    );
    return { disposition: "processing", providerPaymentId: paymentIntentId };
  }
  if (paymentIntentIsTerminalFailure(status) || status) {
    const finalized: any = await params.ctx.runMutation(
      (internal as any).workspaceAutoRecharge.finalizeWorkspaceAutoRechargeAttemptFailedInternal,
      {
        attemptKey,
        providerPaymentId: paymentIntentId,
        providerIdempotencyKey: params.providerIdempotencyKey,
        failureReason: normalizePaymentIntentFailureReason(
          params.paymentIntent,
          status || "stripe_payment_failed",
        ),
        nowMs: params.nowMs,
      },
    );
    return { disposition: "failed", providerPaymentId: paymentIntentId, finalized };
  }
  return { disposition: "skipped", reason: "payment_intent_status_missing" };
}

export const executeWorkspaceAutoRechargeForUserInternal = internalAction({
  args: {
    userId: v.id("users"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    const nowMs = args.nowMs ?? Date.now();
    const prepared = await ctx.runMutation(
      (internal as any).workspaceAutoRecharge.prepareWorkspaceAutoRechargeAttemptInternal,
      {
        userId: args.userId,
        nowMs,
      },
    ) as any;
    if (prepared?.disposition === "skipped" || prepared?.disposition === "completed_attempt") {
      return prepared;
    }

    const attempt = prepared?.attempt as WorkspaceAutoRechargeAttemptRow | null;
    const attemptKey = normalizeOptionalString(prepared?.attemptKey ?? attempt?.attemptKey);
    const providerCustomerId = normalizeStripeCustomerId(prepared?.providerCustomerId);
    const providerPaymentMethodId = normalizeStripePaymentMethodId(prepared?.providerPaymentMethodId);
    const providerIdempotencyKey =
      normalizeOptionalString(prepared?.providerIdempotencyKey) ?? attemptKey;
    if (!attempt || !attemptKey || !providerIdempotencyKey) {
      return { ok: false, disposition: "skipped", reason: "auto_recharge_attempt_missing" };
    }
    if (!providerCustomerId || !providerPaymentMethodId) {
      return await ctx.runMutation(
        (internal as any).workspaceAutoRecharge.finalizeWorkspaceAutoRechargeAttemptFailedInternal,
        {
          attemptKey,
          providerIdempotencyKey,
          failureReason: "auto_recharge_card_required",
          nowMs,
        },
      );
    }

    const stripe = getStripeClient();
    const existingPaymentIntentId = normalizeStripePaymentIntentId(attempt.providerPaymentId);
    if (existingPaymentIntentId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(existingPaymentIntentId);
      return await finalizeWorkspaceAutoRechargePaymentIntent({
        ctx,
        attempt,
        paymentIntent,
        providerIdempotencyKey,
        nowMs,
      });
    }

    const amountCents = Math.max(0, Math.floor(Number(attempt.amountCents ?? 0)));
    if (!(amountCents > 0)) {
      return await ctx.runMutation(
        (internal as any).workspaceAutoRecharge.finalizeWorkspaceAutoRechargeAttemptFailedInternal,
        {
          attemptKey,
          providerIdempotencyKey,
          failureReason: "auto_recharge_attempt_amount_invalid",
          nowMs,
        },
      );
    }

    await ctx.runMutation(
      (internal as any).workspaceAutoRecharge.markWorkspaceAutoRechargeAttemptProcessingInternal,
      {
        attemptKey,
        providerIdempotencyKey,
        nowMs,
      },
    );
    try {
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: WORKSPACE_AUTO_RECHARGE_CURRENCY,
          customer: providerCustomerId,
          payment_method: providerPaymentMethodId,
          confirm: true,
          off_session: true,
          description: "Polynet workspace auto recharge",
          metadata: buildWorkspaceAutoRechargePaymentIntentMetadata({
            attemptKey,
            userId: attempt.userId,
            rechargeCredits: attempt.rechargeCredits,
          }),
        },
        {
          idempotencyKey: providerIdempotencyKey,
        },
      );
      return await finalizeWorkspaceAutoRechargePaymentIntent({
        ctx,
        attempt,
        paymentIntent,
        providerIdempotencyKey,
        nowMs,
      });
    } catch (error) {
      const paymentIntent = readStripeErrorPaymentIntent(error);
      if (paymentIntent) {
        return await finalizeWorkspaceAutoRechargePaymentIntent({
          ctx,
          attempt,
          paymentIntent,
          providerIdempotencyKey,
          nowMs,
        });
      }
      const failureReason = readStripeErrorCode(error);
      if (
        [
          "authentication_required",
          "card_declined",
          "expired_card",
          "incorrect_cvc",
          "processing_error",
        ].includes(failureReason)
      ) {
        return await ctx.runMutation(
          (internal as any).workspaceAutoRecharge.finalizeWorkspaceAutoRechargeAttemptFailedInternal,
          {
            attemptKey,
            providerIdempotencyKey,
            failureReason,
            nowMs,
          },
        );
      }
      return {
        ok: true,
        disposition: "retry_later",
        attemptKey,
        failureReason,
      };
    }
  },
});
