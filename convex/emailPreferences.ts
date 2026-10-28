import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ensureAuthenticatedActor } from "./authActor";

const DEFAULT_EMAIL_PREFERENCES = {
  weeklyDigestEnabled: true,
  eventReminderEnabled: true,
  founderAdminEmailsEnabled: true,
} as const;

async function getEmailPreferencesRowByUserId(ctx: any, userId: any) {
  return await ctx.db
    .query("emailPreferences")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
}

async function ensureEmailPreferencesRow(ctx: any, userId: any, nowMs: number) {
  const existing = await getEmailPreferencesRowByUserId(ctx, userId);
  if (existing) return existing;
  const insertedId = await ctx.db.insert("emailPreferences", {
    userId,
    ...DEFAULT_EMAIL_PREFERENCES,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  return await ctx.db.get(insertedId);
}

function toPublicPreferences(row: any) {
  return {
    weekly_digest_enabled: Boolean(
      row?.weeklyDigestEnabled ?? DEFAULT_EMAIL_PREFERENCES.weeklyDigestEnabled,
    ),
    event_reminder_enabled: Boolean(row?.eventReminderEnabled ?? DEFAULT_EMAIL_PREFERENCES.eventReminderEnabled),
    updated_at: typeof row?.updatedAt === "number" ? row.updatedAt : null,
  };
}

export const getMyEmailPreferences = query({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await ensureAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const row = await getEmailPreferencesRowByUserId(ctx, actor.dbUserId);
    return toPublicPreferences(row);
  },
});

export const updateMyEmailPreferences = mutation({
  args: {
    authSubject: v.optional(v.string()),
    weeklyDigestEnabled: v.optional(v.boolean()),
    eventReminderEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await ensureAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = Date.now();
    const existing = await ensureEmailPreferencesRow(ctx, actor.dbUserId, nowMs);
    const patch: Record<string, unknown> = {};
    if (typeof args.weeklyDigestEnabled === "boolean") patch.weeklyDigestEnabled = args.weeklyDigestEnabled;
    if (typeof args.eventReminderEnabled === "boolean") patch.eventReminderEnabled = args.eventReminderEnabled;
    if (Object.keys(patch).length === 0) return toPublicPreferences(existing);
    patch.updatedAt = nowMs;
    await ctx.db.patch(existing._id, patch);
    return toPublicPreferences({ ...existing, ...patch });
  },
});

