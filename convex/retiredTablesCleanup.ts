// One-off table-drop release (POL-31). Run a page at a time until isDone,
// dry run first, after a full backup and an export of each table:
//   npx convex run retiredTablesCleanup:rewriteRetiredPersonalAgentInternal '{"table":"roots","dryRun":true}'
//   npx convex run retiredTablesCleanup:emptyRetiredTableInternal '{"table":"communityFunnels","dryRun":true}'
// When every table is empty and no retired agent name is left, the next
// release removes the tables and the literal from the schema, and this file.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { RETIRED_PERSONAL_AGENT_ACTOR_TYPE } from "../shared/communityAgentIdentity";
import { CANONICAL_COMMUNITY_AGENT_KEY } from "../shared/communityAgentToolProtocol";

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

// A real run deletes from the front, so it never needs a cursor; a dry run
// deletes nothing, so it pages with one to count the whole table.
export const emptyRetiredTableInternal = internalMutation({
  args: { table: retiredTable, cursor: v.optional(v.union(v.string(), v.null())), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query(args.table as any)
      .paginate({ cursor: args.dryRun ? args.cursor ?? null : null, numItems: PAGE });
    if (!args.dryRun) for (const row of page.page) await ctx.db.delete(row._id);
    return {
      table: args.table,
      dryRun: Boolean(args.dryRun),
      rows: page.page.length,
      continueCursor: args.dryRun ? page.continueCursor : null,
      isDone: page.isDone,
    };
  },
});

// The one agent is the community agent: old posts, replies and receipts that
// still carry the retired agent name are renamed in place (receipts to
// community_agent_for_member: the agent acted for that member). Posts and
// replies also get the canonical agent key, as the community agent writes them.
const PERSONAL_AGENT_TABLES = {
  roots: { table: "communityInteractionRoots", field: "actorType", to: "community_agent", setsAgentKey: true },
  replies: { table: "communityInteractionReplies", field: "actorType", to: "community_agent", setsAgentKey: true },
  receipts: { table: "polynetCanonicalOperationReceipts", field: "principalKind", to: "community_agent_for_member", setsAgentKey: false },
} as const;

export const rewriteRetiredPersonalAgentInternal = internalMutation({
  args: {
    table: v.union(v.literal("roots"), v.literal("replies"), v.literal("receipts")),
    cursor: v.optional(v.union(v.string(), v.null())),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { table, field, to, setsAgentKey } = PERSONAL_AGENT_TABLES[args.table];
    const page = await ctx.db.query(table as any).paginate({ cursor: args.cursor ?? null, numItems: PAGE });
    let matched = 0;
    for (const row of page.page as Array<Record<string, any>>) {
      if (row[field] !== RETIRED_PERSONAL_AGENT_ACTOR_TYPE) continue;
      matched += 1;
      if (args.dryRun) continue;
      await ctx.db.patch(row._id, (setsAgentKey ? { [field]: to, actorAgentKey: CANONICAL_COMMUNITY_AGENT_KEY } : { [field]: to }) as any);
    }
    return { table, dryRun: Boolean(args.dryRun), matched, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});
