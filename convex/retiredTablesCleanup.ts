// One-off table-drop release (POL-31). Run a page at a time until isDone,
// dry run first, after a full backup and an export of each table:
//   npx convex run retiredTablesCleanup:rewriteRetiredPersonalAgentInternal '{"table":"roots","dryRun":true}'
//   npx convex run retiredTablesCleanup:emptyRetiredTableInternal '{"table":"communityFunnels","dryRun":true}'
// When every table is empty and no personal_agent row is left, the next
// release removes the tables and the literal from the schema, and this file.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const PAGE = 200;

// Code that read or wrote these is gone: old thread chat (POL-26), the funnel
// editor, skills and integrations (Oct 27 decisions).
export const RETIRED_TABLES = [
  "communityChatThreads",
  "communityChatMessages",
  "communityMessageReactions",
  "communityFeaturedMessages",
  "communityInteractionLegacyChatLinks",
  "communityFunnels",
  "skillPackages",
  "skillPackageRevisions",
  "userPlatformSkillInstalls",
  "communitySkillAttachments",
  "communityIntegrationConnections",
] as const;

const retiredTable = v.union(...RETIRED_TABLES.map((table) => v.literal(table)));

export const emptyRetiredTableInternal = internalMutation({
  args: { table: retiredTable, dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query(args.table as any).take(PAGE);
    if (!args.dryRun) for (const row of rows) await ctx.db.delete(row._id);
    return { table: args.table, dryRun: Boolean(args.dryRun), rows: rows.length, isDone: rows.length < PAGE };
  },
});

// The one agent is the community agent: old posts, replies and receipts that
// still carry the retired personal_agent name are renamed in place (receipts
// to community_agent_for_member: the agent acted for that member).
const PERSONAL_AGENT_TABLES = {
  roots: { table: "communityInteractionRoots", field: "actorType", to: "community_agent" },
  replies: { table: "communityInteractionReplies", field: "actorType", to: "community_agent" },
  receipts: { table: "polynetCanonicalOperationReceipts", field: "principalKind", to: "community_agent_for_member" },
} as const;

export const rewriteRetiredPersonalAgentInternal = internalMutation({
  args: {
    table: v.union(v.literal("roots"), v.literal("replies"), v.literal("receipts")),
    cursor: v.optional(v.union(v.string(), v.null())),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { table, field, to } = PERSONAL_AGENT_TABLES[args.table];
    const page = await ctx.db.query(table as any).paginate({ cursor: args.cursor ?? null, numItems: PAGE });
    let matched = 0;
    for (const row of page.page as Array<Record<string, any>>) {
      if (row[field] !== "personal_agent") continue;
      matched += 1;
      if (!args.dryRun) await ctx.db.patch(row._id, { [field]: to } as any);
    }
    return { table, dryRun: Boolean(args.dryRun), matched, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});
