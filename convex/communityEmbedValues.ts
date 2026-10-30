import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireCommunityChatAccess, resolveUserIdForAuthenticatedRequest } from "./communityCore";
import { COMMUNITY_EMBED_MAX_KEY_LENGTH, COMMUNITY_EMBED_MAX_VALUE_LENGTH } from "../shared/communityEmbed";

// A member's widget answers, the server side of the embed storage the page
// hands a widget. Only the member reads or writes their own values.
export const COMMUNITY_EMBED_VALUES_PER_MEMBER = 200;

const args = { communityId: v.id("communities"), authSubject: v.optional(v.string()), key: v.string() };

async function member(ctx: any, input: { communityId: any; authSubject?: string; key: string }) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: input.authSubject ?? null });
  await requireCommunityChatAccess({ ctx, communityId: input.communityId, userId });
  if (!input.key || input.key.length > COMMUNITY_EMBED_MAX_KEY_LENGTH) throw new Error("embed_key_invalid");
  return userId;
}

function find(ctx: any, communityId: any, userId: any, key: string) {
  return ctx.db.query("communityEmbedValues")
    .withIndex("by_community_user_key", (q: any) => q.eq("communityId", communityId).eq("userId", userId).eq("key", key))
    .unique();
}

export const getOwnEmbedValue = query({
  args,
  handler: async (ctx, input) => {
    const userId = await member(ctx, input);
    return (await find(ctx, input.communityId, userId, input.key))?.value ?? null;
  },
});

export const saveOwnEmbedValue = mutation({
  args: { ...args, value: v.string() },
  handler: async (ctx, input) => {
    const userId = await member(ctx, input);
    if (input.value.length > COMMUNITY_EMBED_MAX_VALUE_LENGTH) throw new Error("embed_value_too_large");
    const existing = await find(ctx, input.communityId, userId, input.key);
    if (existing) {
      if (existing.value !== input.value) await ctx.db.patch(existing._id, { value: input.value, updatedAt: Date.now() });
      return { saved: true };
    }
    const count = (await ctx.db.query("communityEmbedValues")
      .withIndex("by_community_user_key", (q: any) => q.eq("communityId", input.communityId).eq("userId", userId))
      .take(COMMUNITY_EMBED_VALUES_PER_MEMBER)).length;
    if (count >= COMMUNITY_EMBED_VALUES_PER_MEMBER) throw new Error("embed_value_limit_reached");
    await ctx.db.insert("communityEmbedValues", { communityId: input.communityId, userId, key: input.key, value: input.value, updatedAt: Date.now() });
    return { saved: true };
  },
});
