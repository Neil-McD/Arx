import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const MAX_ROWS_PER_TABLE = 100;
const EXPECTED_EVIDENCE_QUERY_FIELDS = 0;
const EXPECTED_INTELLIGENCE_QUERY_FIELDS = 5;

type RetrievalLogRow = {
  _id: any;
  query?: string;
};

function hasStoredQueryField(row: RetrievalLogRow): boolean {
  return Object.prototype.hasOwnProperty.call(row, "query");
}

async function readBoundedRows(ctx: any, table: string): Promise<RetrievalLogRow[]> {
  const rows = (await ctx.db
    .query(table)
    .take(MAX_ROWS_PER_TABLE + 1)) as RetrievalLogRow[];
  if (rows.length > MAX_ROWS_PER_TABLE) {
    throw new Error("community_retrieval_query_privacy_migration_scan_limit_exceeded");
  }
  return rows;
}

export const scrubLegacyRetrievalQueryFields = internalMutation({
  args: {
    mode: v.union(
      v.literal("preflight"),
      v.literal("apply"),
      v.literal("verify_zero"),
    ),
  },
  handler: async (ctx, args) => {
    const [evidenceRows, intelligenceRows] = await Promise.all([
      readBoundedRows(ctx, "communityEvidenceRetrievalLogs"),
      readBoundedRows(ctx, "communityIntelligenceRetrievalLogs"),
    ]);
    const evidenceWithQuery = evidenceRows.filter(hasStoredQueryField);
    const intelligenceWithQuery = intelligenceRows.filter(hasStoredQueryField);
    const expectedEvidence =
      args.mode === "verify_zero" ? 0 : EXPECTED_EVIDENCE_QUERY_FIELDS;
    const expectedIntelligence =
      args.mode === "verify_zero" ? 0 : EXPECTED_INTELLIGENCE_QUERY_FIELDS;

    if (
      evidenceWithQuery.length !== expectedEvidence ||
      intelligenceWithQuery.length !== expectedIntelligence
    ) {
      throw new Error(
        `community_retrieval_query_privacy_migration_expectation_failed:` +
          `evidence=${evidenceWithQuery.length}/${expectedEvidence}:` +
          `intelligence=${intelligenceWithQuery.length}/${expectedIntelligence}`,
      );
    }

    if (args.mode === "apply") {
      for (const row of evidenceWithQuery) {
        await ctx.db.patch(row._id, { query: undefined });
      }
      for (const row of intelligenceWithQuery) {
        await ctx.db.patch(row._id, { query: undefined });
      }
    }

    return {
      ok: true,
      mode: args.mode,
      scanned: {
        evidence: evidenceRows.length,
        intelligence: intelligenceRows.length,
      },
      query_fields_before: {
        evidence: evidenceWithQuery.length,
        intelligence: intelligenceWithQuery.length,
      },
      scrubbed:
        args.mode === "apply"
          ? evidenceWithQuery.length + intelligenceWithQuery.length
          : 0,
    };
  },
});
