import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedActor } from "./authActor";
import {
  buildDefaultWorkspaceAutoRechargeSettings,
  WORKSPACE_AUTO_RECHARGE_CURRENCY,
  validateWorkspaceAutoRechargeSettingsInput,
  type WorkspaceAutoRechargeStatus,
} from "../shared/workspaceAutoRecharge";

type WorkspaceAutoRechargeSettingsRow = {
  _id?: any;
  userId: unknown;
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

const DUPLICATE_WORKSPACE_AUTO_RECHARGE_SETTINGS_ERROR =
  "duplicate_auto_recharge_settings";

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

async function hasActiveWorkspaceAutoRechargePaymentMethod(ctx: any, userId: unknown): Promise<boolean> {
  const stripeCustomer = await ctx.db
    .query("userStripeCustomers")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  const status = stripeCustomer?.paymentMethodStatus ?? "missing";
  const paymentMethodId = String(stripeCustomer?.providerDefaultPaymentMethodId ?? "").trim();
  return (
    status === "active" &&
    paymentMethodId.startsWith("pm_") &&
    !(Number(stripeCustomer?.cardRemovedAt ?? 0) > 0)
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
