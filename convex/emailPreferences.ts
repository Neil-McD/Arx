import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
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
    return await updateEmailPreferencesForUser(ctx, actor.dbUserId, args);
  },
});

// The one write, for Studio's signed-in user and a community site's private twin.
async function updateEmailPreferencesForUser(
  ctx: any,
  userId: any,
  args: { weeklyDigestEnabled?: boolean; eventReminderEnabled?: boolean },
) {
  const nowMs = Date.now();
  const existing = await ensureEmailPreferencesRow(ctx, userId, nowMs);
  const patch: Record<string, unknown> = {};
  if (typeof args.weeklyDigestEnabled === "boolean") patch.weeklyDigestEnabled = args.weeklyDigestEnabled;
  if (typeof args.eventReminderEnabled === "boolean") patch.eventReminderEnabled = args.eventReminderEnabled;
  if (Object.keys(patch).length === 0) return toPublicPreferences(existing);
  patch.updatedAt = nowMs;
  await ctx.db.patch(existing._id, patch);
  return toPublicPreferences({ ...existing, ...patch });
}

// For a member whose private-twin session the caller already checked: what
// Studio's settings show (the weekly digest), nothing more.
export const getEmailPreferencesForTrustedUserInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => toPublicPreferences(await getEmailPreferencesRowByUserId(ctx, args.userId)),
});

export const updateWeeklyDigestForTrustedUserInternal = internalMutation({
  args: { userId: v.id("users"), weeklyDigestEnabled: v.boolean() },
  handler: async (ctx, args) => await updateEmailPreferencesForUser(ctx, args.userId, { weeklyDigestEnabled: args.weeklyDigestEnabled }),
});

