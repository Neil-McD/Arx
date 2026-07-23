import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityTypingPresenceLike,
  normalizeIdValue,
  requireCommunityChatAccess,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { requireProfileSetupCompleteForUser } from "./accountSetupCore";

const COMMUNITY_TYPING_DISPLAY_WINDOW_MS = 5000;
const MAX_TYPING_PRESENCE_SCAN_ROWS = 25;
const MAX_TYPING_PRESENCE_VISIBLE_ROWS = 12;

async function resolveTypingProfileFields(ctx: any, userId: any) {
  return await resolveUserProfileDisplayProjection(ctx, userId);
}

export function extractMessageText(contentJson: unknown): string {
  if (typeof contentJson === "string") return contentJson.trim();
  if (contentJson && typeof contentJson === "object" && !Array.isArray(contentJson)) {
    const text = String((contentJson as Record<string, unknown>).text ?? "").trim();
    if (text) return text;
  }
  return "";
}

export const generateCommunityChatAttachmentUploadUrl = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    await requireProfileSetupCompleteForUser(ctx, userId);
    return {
      uploadUrl: await ctx.storage.generateUploadUrl(),
    };
  },
});

export const setCommunityTyping = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    rootId: v.optional(v.id("communityInteractionRoots")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });

    const nowMs = Date.now();
    const displayUntil = nowMs + COMMUNITY_TYPING_DISPLAY_WINDOW_MS;
    const existing = (await ctx.db
      .query("communityTypingPresence" as any)
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.communityId).eq("userId", args.userId),
      )
      .unique()) as CommunityTypingPresenceLike | null;

    if (existing) {
      await ctx.db.patch(existing._id as any, {
        displayUntil,
        updatedAt: nowMs,
        // Always set rootId so switching between channel and a thread updates the scope
        // (undefined clears it back to channel-level).
        rootId: args.rootId,
      });
      return { ok: true, display_until_ms: displayUntil };
    }

    await ctx.db.insert("communityTypingPresence" as any, {
      communityId: args.communityId,
      userId: args.userId,
      rootId: args.rootId,
      displayUntil,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true, display_until_ms: displayUntil };
  },
});

export const listCommunityTyping = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });

    const nowMs = Date.now();
    const rows = (await ctx.db
      .query("communityTypingPresence" as any)
      .withIndex("by_community_displayUntil", (q: any) =>
        q.eq("communityId", args.communityId).gt("displayUntil", nowMs),
      )
      .order("desc")
      .take(MAX_TYPING_PRESENCE_SCAN_ROWS)) as CommunityTypingPresenceLike[];
    const publicUserIdCache = new Map<string, string | null>();
    const activeRows = rows
      .filter((row) => normalizeIdValue(row.userId) !== normalizeIdValue(args.userId));
    const mapped = await Promise.all(
      activeRows
        .slice(0, MAX_TYPING_PRESENCE_VISIBLE_ROWS)
        .map(async (row) => {
          const publicUserId = await resolvePublicUserId(ctx, row.userId, publicUserIdCache);
          const profile = await resolveTypingProfileFields(ctx, row.userId);
          return {
            user_id: publicUserId ?? normalizeIdValue(row.userId),
            ...profile,
            root_id: row.rootId ? normalizeIdValue(row.rootId) : null,
            display_until_ms: row.displayUntil,
            updated_at: toIsoString(row.updatedAt),
          };
        }),
    );
    return {
      users: mapped,
      total_count: activeRows.length,
    };
  },
});
