// The rules a person's own AI reads before it writes in a community
// (rules.md: Polynet's rules, then the host's house rules), and the record
// of what an AI posted lately so the same words are not posted twice
// (shared/aiPostingRules.ts; docs/specs/agent-access-v0.md, slice 2).
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireCommunityManager } from "./communityCore";
import { communityIsActive } from "../shared/communityLifecycle";
import {
  AI_DUPLICATE_WINDOW_MS, DEFAULT_HOUSE_RULES, HOUSE_RULES_MAX_CHARS, POLYNET_AI_RULES, normalizeHouseRules,
} from "../shared/aiPostingRules";

const managerArgs = { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), communityId: v.id("communities") };

async function managerCommunity(ctx: any, args: { userId?: any; authSubject?: string; communityId: any }) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
  await requireCommunityManager({ ctx, communityId: args.communityId, userId });
  const community = await ctx.db.get(args.communityId);
  if (!community || !communityIsActive(community as any)) throw new Error("community_not_found");
  return community as { _id: any; name?: string; aiHouseRules?: string };
}

const managerView = (community: { aiHouseRules?: string }) => ({
  house_rules: community.aiHouseRules ?? "",
  max_chars: HOUSE_RULES_MAX_CHARS,
  polynet_rules: POLYNET_AI_RULES,
  empty_words: DEFAULT_HOUSE_RULES,
});

// The host's box in Settings: owners and admins.
export const getCommunityAiRulesForManager = query({
  args: managerArgs,
  handler: async (ctx, args) => managerView(await managerCommunity(ctx, args)),
});

export const saveCommunityAiRules = mutation({
  args: { ...managerArgs, text: v.string() },
  handler: async (ctx, args) => {
    const community = await managerCommunity(ctx, args);
    const aiHouseRules = normalizeHouseRules(args.text);
    await ctx.db.patch(community._id, { aiHouseRules: aiHouseRules || undefined, updatedAt: Date.now() });
    return managerView({ aiHouseRules });
  },
});

// rules.md, for anyone who may read the community.
export const readCommunityAiRulesInternal = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community || !communityIsActive(community as any)) return null;
    return { communityName: String(community.name ?? "Community"), houseRules: (community as any).aiHouseRules ?? null };
  },
});

// Has this person's AI posted these words in this community in the last day?
// Not counting the request that is asking: sent again after a crash, it is
// the same post, and the composer answers it with the post it already made.
export const hasRecentAiPostInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities"), fingerprint: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    const since = Date.now() - AI_DUPLICATE_WINDOW_MS;
    const rows = await ctx.db.query("aiPostFingerprints")
      .withIndex("by_user_community_fingerprint", (q) => q.eq("userId", args.userId).eq("communityId", args.communityId).eq("fingerprint", args.fingerprint))
      .collect();
    return rows.some((row) => row.createdAt >= since && row.key !== args.key);
  },
});

// Kept once the post is made. Older rows for the same words are cleared, so
// the table holds one row per person, community and wording.
export const recordAiPostInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), fingerprint: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("aiPostFingerprints")
      .withIndex("by_user_community_fingerprint", (q) => q.eq("userId", args.userId).eq("communityId", args.communityId).eq("fingerprint", args.fingerprint))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    await ctx.db.insert("aiPostFingerprints", { ...args, createdAt: Date.now() });
    return null;
  },
});
