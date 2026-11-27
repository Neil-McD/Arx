// Global Personal Guide settings (Account Settings -> You -> Guide).
// Applies across every community the signed-in user belongs to:
// - Default Personal Soul (inherited by any community where the user hasn't
//   customized a community-specific Soul; per-community Memory always stays
//   isolated inside each community).
// - Global "without asking" permissions (post / direct message; destructive
//   actions like deleting posts, changing roles, and bans still always ask).
// - Global proactive check-in pause (pauses unsolicited Guide check-ins across
//   all communities).
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import {
  AGENT_SOUL_MAX_CHARS,
  DEFAULT_PERSONAL_SOUL_MD,
  cleanAgentSoulText,
  validateAgentSoulWrite,
} from "../shared/agentSoul";

export type UserGlobalGuideSettingsRow = {
  _id: any;
  userId: any;
  soulMd?: string;
  soulUpdatedAt?: number;
  allowPostWithoutAsking?: boolean;
  allowMessageWithoutAsking?: boolean;
  coachMuted?: boolean;
  createdAt: number;
  updatedAt: number;
};

export async function readUserGlobalGuideSettings(
  ctx: any,
  userId: any,
): Promise<UserGlobalGuideSettingsRow | null> {
  if (!userId) return null;
  return await ctx.db
    .query("userGuideSettings")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
}

async function countLegacyCommunityAlwaysAllowed(ctx: any, userId: any) {
  if (!userId) return { post: 0, message: 0 };
  const [postRows, messageRows] = await Promise.all([
    ctx.db
      .query("communityGuideAlwaysAllowed")
      .withIndex("by_user_kind", (q: any) => q.eq("userId", userId).eq("kind", "post"))
      .take(100),
    ctx.db
      .query("communityGuideAlwaysAllowed")
      .withIndex("by_user_kind", (q: any) => q.eq("userId", userId).eq("kind", "message"))
      .take(100),
  ]);
  return { post: postRows.length, message: messageRows.length };
}

async function clearLegacyCommunityAlwaysAllowed(
  ctx: any,
  userId: any,
  kind: "post" | "message",
) {
  while (true) {
    const batch = await ctx.db
      .query("communityGuideAlwaysAllowed")
      .withIndex("by_user_kind", (q: any) => q.eq("userId", userId).eq("kind", kind))
      .take(100);
    if (batch.length === 0) break;
    await Promise.all(batch.map((row: any) => ctx.db.delete(row._id)));
    if (batch.length < 100) break;
  }
}

function buildGlobalGuideSettingsView(
  row: UserGlobalGuideSettingsRow | null,
  legacyCounts: { post: number; message: number } = { post: 0, message: 0 },
) {
  const customSoul = cleanAgentSoulText(row?.soulMd);
  return {
    soul_md: customSoul || DEFAULT_PERSONAL_SOUL_MD,
    soul_is_default: !customSoul,
    soul_updated_at: row?.soulUpdatedAt ?? null,
    soul_max_chars: AGENT_SOUL_MAX_CHARS,
    allow_post: row?.allowPostWithoutAsking === true,
    allow_message: row?.allowMessageWithoutAsking === true,
    legacy_post_count: legacyCounts.post,
    legacy_message_count: legacyCounts.message,
    coach_muted: row?.coachMuted === true,
  };
}

export const getMyGlobalGuideSettings = query({
  args: { authSubject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const [current, legacyCounts] = await Promise.all([
      readUserGlobalGuideSettings(ctx, userId),
      countLegacyCommunityAlwaysAllowed(ctx, userId),
    ]);
    return buildGlobalGuideSettingsView(current, legacyCounts);
  },
});

export const saveMyGlobalGuideSettings = mutation({
  args: {
    authSubject: v.optional(v.string()),
    // Omit to leave unchanged; null resets back to the starter Soul.
    soulMd: v.optional(v.union(v.string(), v.null())),
    allowPost: v.optional(v.boolean()),
    allowMessage: v.optional(v.boolean()),
    coachMuted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = Date.now();
    const current = await readUserGlobalGuideSettings(ctx, userId);
    const patch: Record<string, unknown> = { updatedAt: nowMs };

    if (args.soulMd !== undefined) {
      if (args.soulMd === null) {
        patch.soulMd = undefined;
        patch.soulUpdatedAt = nowMs;
      } else {
        const validated = validateAgentSoulWrite(args.soulMd);
        if (!validated.ok) throw new Error(validated.code);
        patch.soulMd = validated.soulMd;
        patch.soulUpdatedAt = nowMs;
      }
    }
    if (typeof args.allowPost === "boolean") {
      patch.allowPostWithoutAsking = args.allowPost;
    }
    if (typeof args.allowMessage === "boolean") {
      patch.allowMessageWithoutAsking = args.allowMessage;
    }
    if (typeof args.coachMuted === "boolean") {
      patch.coachMuted = args.coachMuted;
    }

    if (current) {
      await ctx.db.patch(current._id, patch);
    } else {
      await ctx.db.insert("userGuideSettings", {
        userId,
        ...(patch.soulMd !== undefined ? { soulMd: patch.soulMd as string } : {}),
        ...(patch.soulUpdatedAt !== undefined ? { soulUpdatedAt: patch.soulUpdatedAt as number } : {}),
        ...(typeof patch.allowPostWithoutAsking === "boolean"
          ? { allowPostWithoutAsking: patch.allowPostWithoutAsking }
          : {}),
        ...(typeof patch.allowMessageWithoutAsking === "boolean"
          ? { allowMessageWithoutAsking: patch.allowMessageWithoutAsking }
          : {}),
        ...(typeof patch.coachMuted === "boolean" ? { coachMuted: patch.coachMuted } : {}),
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }

    if (args.allowPost === false) {
      await clearLegacyCommunityAlwaysAllowed(ctx, userId, "post");
    }
    if (args.allowMessage === false) {
      await clearLegacyCommunityAlwaysAllowed(ctx, userId, "message");
    }

    const [updated, legacyCounts] = await Promise.all([
      readUserGlobalGuideSettings(ctx, userId),
      countLegacyCommunityAlwaysAllowed(ctx, userId),
    ]);
    return buildGlobalGuideSettingsView(updated, legacyCounts);
  },
});
