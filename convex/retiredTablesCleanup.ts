// One-off table-drop release (Nov 7 2026). Run a page at a time until isDone,
// dry run first, after an export of each table:
//   npx convex run retiredTablesCleanup:emptyRetiredTableInternal '{"table":"communityAiFeedPosts","dryRun":true}'
// When every table is empty, the next release removes the tables from the
// schema, and this file.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const PAGE = 200;

// No code reads or writes these (checked Nov 7, second pass): the retired AI
// feed, the old memory compiler's tables and its evidence trail (the compiler
// was retired Nov 3), the old archive documents, and the retired link-preview
// embeds. Rows are deleted only with the owner's OK (given Nov 7) and after a
// local export.
export const RETIRED_TABLES = [
  "communityAiFeedPosts",
  "communityAiFeedReactions",
  "communityIntelligenceNodes",
  "communityIntelligenceEdges",
  "communityIntelligenceMutations",
  "communityIntelligenceChangeRequests",
  "communityIntelligenceRetrievalLogs",
  "communityCompilerDigests",
  "communityMemoryMetabolizerRuns",
  "communityOutcomeObservations",
  "communitySourceTraces",
  "communityEvidenceCitations",
  "communityArchiveDocuments",
  "communityInteractionEmbeds",
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
