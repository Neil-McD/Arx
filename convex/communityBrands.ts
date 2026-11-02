import { internalMutation, internalQuery } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { EMPTY_COMMUNITY_BRAND, normalizeCommunityBrand, type CommunityBrandV1 } from "../shared/communityBrand";
import { requireCommunityManager } from "./communityCore";

// A community's brand (shared/communityBrand.ts): the founder's words, colours
// and fonts that templates and agents start from. It is a reference for
// whoever designs the community, not something members see, so it has no
// publish step: managers save it, guarded by the revision they read.

type CommunityBrandRowLike = { _id: any; brand: unknown; revision: number; updatedAt: number };

async function getBrandRow(ctx: any, communityId: any): Promise<CommunityBrandRowLike | null> {
  return await ctx.db
    .query("communityBrands")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .unique();
}

function readStoredBrand(raw: unknown): CommunityBrandV1 {
  const result = normalizeCommunityBrand(raw ?? EMPTY_COMMUNITY_BRAND);
  return result.ok ? result.brand : EMPTY_COMMUNITY_BRAND;
}

function projection(row: CommunityBrandRowLike | null) {
  return { brand: readStoredBrand(row?.brand), revision: row?.revision ?? 0, updatedAt: row?.updatedAt ?? null };
}

async function saveBrand(ctx: any, args: { userId: any; communityId: any; expectedRevision: number; brand: unknown }) {
  const result = normalizeCommunityBrand(args.brand);
  if (!result.ok) throw new ConvexError({ code: "community_brand_invalid", problems: result.problems });
  const row = await getBrandRow(ctx, args.communityId);
  const current = row?.revision ?? 0;
  if (current !== args.expectedRevision) {
    throw new ConvexError({ code: "community_brand_revision_conflict", currentRevision: current });
  }
  if (row && JSON.stringify(readStoredBrand(row.brand)) === JSON.stringify(result.brand)) return projection(row);
  const now = Date.now();
  if (row) {
    await ctx.db.patch(row._id, { brand: result.brand, revision: current + 1, updatedAt: now, updatedByUserId: args.userId });
  } else {
    await ctx.db.insert("communityBrands", {
      communityId: args.communityId, brand: result.brand, revision: 1,
      updatedByUserId: args.userId, createdAt: now, updatedAt: now,
    });
  }
  return projection(await getBrandRow(ctx, args.communityId));
}

// For the founder's own agent and `polynet pull/dev` through the MCP
// (convex/polynetCanonicalExecutor.ts), in the same shape as the theme and
// layout records so the design folder treats all three alike.

type BuilderBrandResult =
  | { ok: true; brand: ReturnType<typeof builderProjection> }
  | { ok: false; code: string; message: string; problems?: unknown; current_revision?: number };

function builderProjection(row: CommunityBrandRowLike | null) {
  const { brand, revision } = projection(row);
  return { draft: brand, draftRevision: revision, published: null, publishedAt: null, publishedDraftRevision: null, hasUnpublishedChanges: false };
}

export const readBuilderBrandInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    return builderProjection(await getBrandRow(ctx, args.communityId));
  },
});

export const saveBuilderBrandDraftInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), expectedDraftRevision: v.number(), brand: v.any() },
  handler: async (ctx, args): Promise<BuilderBrandResult> => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    try {
      await saveBrand(ctx, { userId: args.userId, communityId: args.communityId, expectedRevision: args.expectedDraftRevision, brand: args.brand });
      return { ok: true, brand: builderProjection(await getBrandRow(ctx, args.communityId)) };
    } catch (error) {
      const data = error instanceof ConvexError ? (error.data as Record<string, unknown>) : null;
      if (data?.code === "community_brand_invalid") {
        return { ok: false, code: "brand_invalid", message: "Some brand fields aren't valid. Fix each problem and save again.", problems: data.problems };
      }
      if (data?.code === "community_brand_revision_conflict") {
        return { ok: false, code: "brand_revision_conflict", message: "The brand changed since you read it. Read it again and redo your change on top.",
          current_revision: data.currentRevision as number };
      }
      throw error;
    }
  },
});
