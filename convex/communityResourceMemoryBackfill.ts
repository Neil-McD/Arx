import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { syncCommunityResourceMemoryProjection } from "./communityResourceMemoryProjection";
import { recordTrustedCommunitySourceTraceCore } from "./communityIntelligenceDirectory";

const RESOURCE_MEMORY_BACKFILL_CONFIRMATION = "BACKFILL_CANONICAL_RESOURCE_MEMORY_V1";
const RESOURCE_MEMORY_BACKFILL_MAX_LIMIT = 100;
const RESOURCE_MEMORY_CLEANUP_AGENT_KEY = "community_resource_memory_projection_cleanup";

function canonicalResourceIdFromProjectionSourceId(sourceId: unknown): string {
  const value = String(sourceId ?? "").trim();
  return value.startsWith("resource:") ? value.slice("resource:".length) : value;
}

async function resourceProjectionSourceExists(ctx: any, sourceId: unknown): Promise<boolean> {
  const normalizedId = ctx.db.normalizeId(
    "communityResources",
    canonicalResourceIdFromProjectionSourceId(sourceId),
  );
  return Boolean(normalizedId && await ctx.db.get(normalizedId));
}

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

/** Temporary, bounded deletion/redaction of projections with no source truth. */
export const cleanupOrphanedResourceMemoryProjectionsInternal = internalMutation({
  args: {
    confirmation: v.literal(RESOURCE_MEMORY_BACKFILL_CONFIRMATION),
    target: v.union(v.literal("archive"), v.literal("trace")),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(
      1,
      Math.min(RESOURCE_MEMORY_BACKFILL_MAX_LIMIT, Math.floor(args.limit ?? RESOURCE_MEMORY_BACKFILL_MAX_LIMIT)),
    );
    const page = args.target === "archive"
      ? await ctx.db
        .query("communityArchiveDocuments")
        .order("asc")
        .paginate({ cursor: args.cursor ?? null, numItems: limit })
      : await ctx.db
        .query("communitySourceTraces")
        .order("asc")
        .paginate({ cursor: args.cursor ?? null, numItems: limit });
    let archivesDeleted = 0;
    let tracesRedacted = 0;
    const nowMs = Date.now();

    for (const row of page.page as any[]) {
      if (args.target === "archive") {
        if (
          row.sourceType === "resource" &&
          !(await resourceProjectionSourceExists(ctx, row.sourceId))
        ) {
          await ctx.db.delete(row._id);
          archivesDeleted += 1;
        }
      } else if (
        row.sourceType === "resource" &&
        row.sourceVisibility !== "redacted" &&
        !(await resourceProjectionSourceExists(ctx, row.sourceId))
      ) {
        await recordTrustedCommunitySourceTraceCore({
          ctx,
          communityId: row.communityId,
          sourceType: "resource",
          sourceId: row.sourceId ?? `orphan:${String(row._id)}`,
          title: null,
          summary: "Resource is no longer available.",
          visibilityScope: "admin",
          sourceVisibility: "redacted",
          actorType: "system",
          actorAgentKey: RESOURCE_MEMORY_CLEANUP_AGENT_KEY,
          nowMs,
        });
        tracesRedacted += 1;
      }
    }

    return {
      ok: true,
      target: args.target,
      scanned: page.page.length,
      archives_deleted: archivesDeleted,
      traces_redacted: tracesRedacted,
      is_done: page.isDone,
      continue_cursor: page.isDone ? null : page.continueCursor,
    };
  },
});
