import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { syncCommunityResourceMemoryProjection } from "./communityResourceMemoryProjection";

const RESOURCE_MEMORY_BACKFILL_CONFIRMATION = "BACKFILL_CANONICAL_RESOURCE_MEMORY_V1";
const RESOURCE_MEMORY_BACKFILL_MAX_LIMIT = 100;

/** Temporary, bounded migration. Remove after the production corpus is synced. */
export const runCanonicalResourceMemoryBackfillInternal = internalMutation({
  args: {
    confirmation: v.literal(RESOURCE_MEMORY_BACKFILL_CONFIRMATION),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(
      1,
      Math.min(RESOURCE_MEMORY_BACKFILL_MAX_LIMIT, Math.floor(args.limit ?? RESOURCE_MEMORY_BACKFILL_MAX_LIMIT)),
    );
    const page = await ctx.db
      .query("communityResources" as any)
      .order("asc")
      .paginate({ cursor: args.cursor ?? null, numItems: limit });
    let indexed = 0;
    let traced = 0;
    const nowMs = Date.now();
    for (const resource of page.page) {
      const result = await syncCommunityResourceMemoryProjection(ctx, resource as any, nowMs);
      if (result.indexed) indexed += 1;
      if (result.traced) traced += 1;
    }
    return {
      ok: true,
      scanned: page.page.length,
      indexed,
      traced,
      is_done: page.isDone,
      continue_cursor: page.isDone ? null : page.continueCursor,
    };
  },
});
