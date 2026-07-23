import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

const MAX_RESIDUE_ROWS = 20;

function readDeploymentKind(): string {
  try {
    return String((globalThis as any)?.process?.env?.POLYNET_DEPLOYMENT_KIND ?? "").trim();
  } catch {
    return "";
  }
}

function requireStaging(): void {
  if (readDeploymentKind() !== "staging") {
    throw new Error("community_interaction_residue_cleanup_staging_only");
  }
}

function sortedIds(rows: Array<{ _id: any }>): string[] {
  return rows.map((row) => String(row._id)).sort((left, right) => left.localeCompare(right));
}

function exactIdsMatch(actual: string[], expected: any[]): boolean {
  const normalizedExpected = expected
    .map((id) => String(id))
    .sort((left, right) => left.localeCompare(right));
  return actual.length === normalizedExpected.length &&
    actual.every((id, index) => id === normalizedExpected[index]);
}

function hasLegacyAttachment(message: any): boolean {
  return Array.isArray(message?.contentJson?.attachments) &&
    message.contentJson.attachments.length > 0;
}

async function inspectResidue(ctx: any) {
  const featuredRows = await ctx.db
    .query("communityFeaturedMessages")
    .order("asc")
    .take(MAX_RESIDUE_ROWS + 1);
  const reactionRows = await ctx.db
    .query("communityMessageReactions")
    .order("asc")
    .take(MAX_RESIDUE_ROWS + 1);
  if (featuredRows.length > MAX_RESIDUE_ROWS || reactionRows.length > MAX_RESIDUE_ROWS) {
    throw new Error("community_interaction_residue_cleanup_scan_limit_exceeded");
  }

  let brokenReferenceCount = 0;
  let featuredAttachmentMessageCount = 0;
  let reactionAttachmentMessageCount = 0;
  for (const [kind, rows] of [
    ["featured", featuredRows],
    ["reaction", reactionRows],
  ] as const) {
    for (const row of rows) {
      const message = await ctx.db.get(row.messageId);
      const thread = message ? await ctx.db.get(message.threadId) : null;
      const link = await ctx.db
        .query("communityInteractionLegacyChatLinks")
        .withIndex("by_message", (q: any) => q.eq("messageId", row.messageId))
        .first();
      const target = link?.rootId
        ? await ctx.db.get(link.rootId)
        : link?.replyId
          ? await ctx.db.get(link.replyId)
          : null;
      if (
        !message ||
        !thread ||
        !link ||
        !target ||
        String(thread.communityId) !== String(link.communityId) ||
        (kind === "featured" && String(row.communityId) !== String(link.communityId))
      ) {
        brokenReferenceCount += 1;
      }
      if (hasLegacyAttachment(message)) {
        if (kind === "featured") featuredAttachmentMessageCount += 1;
        else reactionAttachmentMessageCount += 1;
      }
    }
  }

  return {
    featuredRows,
    reactionRows,
    summary: {
      featuredIds: sortedIds(featuredRows),
      reactionIds: sortedIds(reactionRows),
      featuredCount: featuredRows.length,
      reactionCount: reactionRows.length,
      brokenReferenceCount,
      featuredAttachmentMessageCount,
      reactionAttachmentMessageCount,
    },
  };
}

export const auditLegacyFeaturedReactionResidueInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    requireStaging();
    return (await inspectResidue(ctx)).summary;
  },
});

export const deleteLegacyFeaturedReactionResidueInternal = internalMutation({
  args: {
    dryRun: v.boolean(),
    expectedFeaturedIds: v.array(v.id("communityFeaturedMessages")),
    expectedReactionIds: v.array(v.id("communityMessageReactions")),
    expectedFeaturedAttachmentMessageCount: v.number(),
    expectedReactionAttachmentMessageCount: v.number(),
  },
  handler: async (ctx, args) => {
    requireStaging();
    const inspection = await inspectResidue(ctx);
    const summary = inspection.summary;
    if (
      !exactIdsMatch(summary.featuredIds, args.expectedFeaturedIds) ||
      !exactIdsMatch(summary.reactionIds, args.expectedReactionIds) ||
      summary.featuredAttachmentMessageCount !== args.expectedFeaturedAttachmentMessageCount ||
      summary.reactionAttachmentMessageCount !== args.expectedReactionAttachmentMessageCount
    ) {
      throw new Error("community_interaction_residue_cleanup_expectation_changed");
    }
    if (summary.brokenReferenceCount !== 0) {
      throw new Error("community_interaction_residue_cleanup_reference_blocked");
    }
    if (args.dryRun) return { ...summary, dryRun: true, deletedCount: 0 };

    for (const row of inspection.featuredRows) await ctx.db.delete(row._id);
    for (const row of inspection.reactionRows) await ctx.db.delete(row._id);
    return {
      ...summary,
      dryRun: false,
      deletedCount: inspection.featuredRows.length + inspection.reactionRows.length,
    };
  },
});
