import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireCommunityOwner } from "./communityCore";
import {
  type CommunityPublicPage,
  emptyCommunityPublicPage,
  normalizeCommunityPublicPage,
} from "../shared/communityPublicPage";

// A community's public page (its doorstep): the sales sections its owner fills
// in from Studio's Settings. Only the owner reads the editable copy or saves
// it; every save is checked against the shared limits, and a save made from a
// stale copy (another tab saved first) is refused rather than overwriting it.
// The doorstep reads the saved page through communityAppJoinProjection.

function pageOf(row: any): CommunityPublicPage {
  if (!row) return emptyCommunityPublicPage();
  return {
    for_you: row.forYou, not_for: row.notFor, first_steps: row.firstSteps, results: row.results,
    founder_bio: row.founderBio, video: row.video ?? null, guarantee: row.guarantee, objections: row.objections,
  };
}

export async function loadCommunityPublicPage(ctx: any, communityId: any): Promise<CommunityPublicPage> {
  const row = await ctx.db.query("communityPublicPages").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).first();
  return pageOf(row);
}

async function requireOwner(ctx: any, authSubject: string | undefined, communityId: any) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: authSubject ?? null });
  const { community } = await requireCommunityOwner({ ctx, communityId, userId });
  return { userId, community };
}

export const getMyCommunityPublicPage = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const { community } = await requireOwner(ctx, args.authSubject, args.communityId);
    const row = await ctx.db.query("communityPublicPages").withIndex("by_community", (q) => q.eq("communityId", community._id)).first();
    return { page: pageOf(row), revision: row?.revision ?? 0 };
  },
});

const lineList = v.array(v.string());
export const saveMyCommunityPublicPage = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    // The revision the owner edited; a different one now means someone saved meanwhile.
    expectedRevision: v.number(),
    page: v.object({
      for_you: lineList,
      not_for: lineList,
      first_steps: v.array(v.object({ title: v.string(), text: v.string() })),
      results: v.array(v.object({ quote: v.string(), name: v.string(), role: v.string() })),
      founder_bio: v.string(),
      video_url: v.string(),
      guarantee: v.string(),
      objections: v.array(v.object({ question: v.string(), answer: v.string() })),
    }),
  },
  handler: async (ctx, args) => {
    const { userId, community } = await requireOwner(ctx, args.authSubject, args.communityId);
    const normalized = normalizeCommunityPublicPage(args.page);
    if (!normalized.ok) throw new Error(`community_public_page_${normalized.error}`);
    const row = await ctx.db.query("communityPublicPages").withIndex("by_community", (q) => q.eq("communityId", community._id)).first();
    const current = row?.revision ?? 0;
    if (args.expectedRevision !== current) throw new Error("community_public_page_changed");
    const page = normalized.page;
    const nowMs = Date.now();
    const fields = {
      forYou: page.for_you, notFor: page.not_for, firstSteps: page.first_steps, results: page.results,
      founderBio: page.founder_bio, video: page.video ?? undefined, guarantee: page.guarantee, objections: page.objections,
      revision: current + 1, updatedByUserId: userId, updatedAt: nowMs,
    };
    if (row) await ctx.db.replace(row._id, { ...fields, communityId: community._id, createdAt: row.createdAt });
    else await ctx.db.insert("communityPublicPages", { ...fields, communityId: community._id, createdAt: nowMs });
    return { page, revision: current + 1 };
  },
});
