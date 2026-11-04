// Legacy, removed with the old memory tables (POL-39 slice 3): the one-time
// copy of old community memory into community notes, and the old memory
// reader's check that decides what members could read. Hand-run, dry run first:
//   npx convex run communityMemoryMigration:migrateMemoryNodesToNotesInternal '{"dryRun":true}'
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { normalizeIdValue } from "./communityCore";
import { checkCommunityEvidenceCitationCore, COMMUNITY_EVIDENCE_POLICY_VERSION } from "./communityEvidenceCitations";
import {
  buildCommunityNoteSearchText,
  communityNoteSlug,
  normalizeCommunityNoteBody,
  normalizeCommunityNoteTitle,
} from "../shared/communityNotes";

const MEMBER_READABLE_STATUSES = new Set(["canonical", "validated", "promising", "contested", "stale"]);

function memberCanSee(scope: unknown): boolean {
  return scope === "public" || scope === "community";
}

// What the old memory reader showed a member: a readable status and scope, and
// for compiler memory, every source trace and citation still readable.
export async function memberCouldReadMemoryNode(ctx: any, node: any): Promise<boolean> {
  if (!MEMBER_READABLE_STATUSES.has(node.status) || !memberCanSee(node.visibilityScope)) return false;
  if (!memberCanSee(node.sourceVisibility ?? node.visibilityScope)) return false;
  if (!(node.tags ?? []).includes("compiler_memory")) return true;
  if ((node.sourceTraceIds ?? []).length === 0) return false;
  for (const traceId of node.sourceTraceIds) {
    const trace = await ctx.db.get(traceId);
    if (!trace || normalizeIdValue(trace.communityId) !== normalizeIdValue(node.communityId)) return false;
    if (trace.sourceVisibility === "redacted" || !memberCanSee(trace.visibilityScope) || !memberCanSee(trace.sourceVisibility)) return false;
  }
  if (node.evidencePolicyVersion !== COMMUNITY_EVIDENCE_POLICY_VERSION || (node.evidenceCitationIds ?? []).length === 0) return false;
  for (const citationId of node.evidenceCitationIds) {
    if (await checkCommunityEvidenceCitationCore({ ctx, communityId: node.communityId, citationId }) !== "active") return false;
  }
  return true;
}

// Paged and safe to repeat: a node already copied is skipped.
export const migrateMemoryNodesToNotesInternal = internalMutation({
  args: { dryRun: v.boolean(), cursor: v.optional(v.union(v.string(), v.null())), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("communityIntelligenceNodes")
      .paginate({ cursor: args.cursor ?? null, numItems: Math.max(1, Math.min(200, Math.floor(args.limit ?? 100))) });
    let copied = 0;
    let skipped = 0;
    for (const node of page.page as any[]) {
      const title = normalizeCommunityNoteTitle(node.title);
      const bodyMd = normalizeCommunityNoteBody(node.bodyMd);
      const already = await ctx.db.query("communityNotes").withIndex("by_migrated_node", (q) => q.eq("migratedFromNodeId", node._id)).first();
      if (!title || !bodyMd || already || !(await memberCouldReadMemoryNode(ctx, node))) { skipped += 1; continue; }
      let slug = communityNoteSlug(title);
      for (let n = 2; await ctx.db.query("communityNotes")
        .withIndex("by_community_slug", (q) => q.eq("communityId", node.communityId).eq("slug", slug)).first(); n += 1) {
        slug = `${communityNoteSlug(title).slice(0, 60)}-${n}`;
      }
      copied += 1;
      if (args.dryRun) continue;
      await ctx.db.insert("communityNotes", {
        communityId: node.communityId, slug, title, bodyMd, source: "migrated",
        searchText: buildCommunityNoteSearchText({ title, bodyMd }), migratedFromNodeId: node._id,
        createdAt: node.createdAt ?? node._creationTime, updatedAt: node.updatedAt ?? node.createdAt ?? node._creationTime,
      });
    }
    return { dryRun: args.dryRun, copied, skipped, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});
