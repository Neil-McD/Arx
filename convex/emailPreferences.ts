import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ensureAuthenticatedActor } from "./authActor";

const DEFAULT_EMAIL_PREFERENCES = {
  weeklyDigestEnabled: true,
  founderDigestEnabled: true,
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
    weekly_digest_enabled: Boolean(row?.weeklyDigestEnabled ?? DEFAULT_EMAIL_PREFERENCES.weeklyDigestEnabled),
    founder_digest_enabled: Boolean(row?.founderDigestEnabled ?? DEFAULT_EMAIL_PREFERENCES.founderDigestEnabled),
    event_reminder_enabled: Boolean(row?.eventReminderEnabled ?? DEFAULT_EMAIL_PREFERENCES.eventReminderEnabled),
    founder_admin_emails_enabled: Boolean(
      row?.founderAdminEmailsEnabled ?? DEFAULT_EMAIL_PREFERENCES.founderAdminEmailsEnabled,
    ),
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
    founderDigestEnabled: v.optional(v.boolean()),
    eventReminderEnabled: v.optional(v.boolean()),
    founderAdminEmailsEnabled: v.optional(v.boolean()),
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
    if (typeof args.founderDigestEnabled === "boolean") patch.founderDigestEnabled = args.founderDigestEnabled;
    if (typeof args.eventReminderEnabled === "boolean") patch.eventReminderEnabled = args.eventReminderEnabled;
    if (typeof args.founderAdminEmailsEnabled === "boolean") {
      patch.founderAdminEmailsEnabled = args.founderAdminEmailsEnabled;
    }
    if (Object.keys(patch).length === 0) return toPublicPreferences(existing);
    patch.updatedAt = nowMs;
    await ctx.db.patch(existing._id, patch);
    return toPublicPreferences({ ...existing, ...patch });
  },
});

export const getEmailPreferencesByUserIdInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const row = await getEmailPreferencesRowByUserId(ctx, args.userId);
    return row
      ? {
          weeklyDigestEnabled: Boolean(row.weeklyDigestEnabled),
          founderDigestEnabled: Boolean(row.founderDigestEnabled),
          eventReminderEnabled: Boolean(row.eventReminderEnabled),
          founderAdminEmailsEnabled: Boolean(row.founderAdminEmailsEnabled),
        }
      : { ...DEFAULT_EMAIL_PREFERENCES };
  },
});

export const ensureEmailPreferencesForUserInternal = internalMutation({
  args: {
    userId: v.id("users"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ensureEmailPreferencesRow(ctx, args.userId, args.nowMs ?? Date.now());
    return toPublicPreferences(row);
  },
});
