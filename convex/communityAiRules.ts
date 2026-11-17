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

const sameWords = (ctx: any, args: { userId: any; communityId: any; fingerprint: string }) => ctx.db.query("aiPostFingerprints")
  .withIndex("by_user_community_fingerprint", (q: any) => q.eq("userId", args.userId).eq("communityId", args.communityId).eq("fingerprint", args.fingerprint))
  .collect();

// Claims these words for one post, before it is made: refused if this
// person's AI posted them in this community in the last day. Checking and
// recording are one step, so two requests at once cannot both pass. Not
// counted against itself: the same request sent again (`key`), or an edit of
// the post that already says them (`ref`).
export const claimAiPostWordsInternal = internalMutation({
  args: {
    userId: v.id("users"), communityId: v.id("communities"), fingerprint: v.string(),
    key: v.string(), ref: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const rows = await sameWords(ctx, args);
    const mine = (row: any) => row.key === args.key || (args.ref !== undefined && row.ref === args.ref);
    if (rows.some((row: any) => row.createdAt >= nowMs - AI_DUPLICATE_WINDOW_MS && !mine(row))) return { ok: false as const };
    const kept = rows.find(mine);
    // One row per person, community and wording: stale ones go.
    for (const row of rows) if (row !== kept) await ctx.db.delete(row._id);
    if (kept) await ctx.db.patch(kept._id, { key: args.key, ...(args.ref !== undefined ? { ref: args.ref } : {}), createdAt: nowMs });
    else await ctx.db.insert("aiPostFingerprints", { userId: args.userId, communityId: args.communityId, fingerprint: args.fingerprint,
      key: args.key, ...(args.ref !== undefined ? { ref: args.ref } : {}), createdAt: nowMs });
    return { ok: true as const };
  },
});

// The post was made: its claim remembers which post it is, so editing that
// post without changing its words is not a repeat.
export const attachAiPostRefInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), fingerprint: v.string(), key: v.string(), ref: v.string() },
  handler: async (ctx, args) => {
    for (const row of await sameWords(ctx, args)) if (row.key === args.key) await ctx.db.patch(row._id, { ref: args.ref });
    return null;
  },
});

// The post was not made after all: its claim is given back.
export const releaseAiPostWordsInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), fingerprint: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    for (const row of await sameWords(ctx, args)) if (row.key === args.key && row.ref === undefined) await ctx.db.delete(row._id);
    return null;
  },
});
