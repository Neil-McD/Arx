import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const ARCHIVE_SCAN_LIMIT = 67;
const POPULATED_CONFIRMATION =
  "delete_exactly_66_dormant_archive_rows_from_dev_quick_porcupine_949";
const EMPTY_CONFIRMATION =
  "confirm_dormant_archive_rows_are_zero_on_dev_quick_porcupine_949";

type ArchiveRow = {
  _id: any;
  communityId: any;
  sourceType: "chat" | "interaction" | "ai_feed" | "resource";
  pdfText?: string;
  url?: string;
  isPdf: boolean;
  embeddingStatus: "pending" | "embedded" | "failed";
  embedding?: number[];
};

function summarize(rows: ArchiveRow[]) {
  const communities = new Set(rows.map((row) => String(row.communityId)));
  return {
    total: rows.length,
    communities: communities.size,
    source_types: {
      chat: rows.filter((row) => row.sourceType === "chat").length,
      interaction: rows.filter((row) => row.sourceType === "interaction").length,
      ai_feed: rows.filter((row) => row.sourceType === "ai_feed").length,
      resource: rows.filter((row) => row.sourceType === "resource").length,
    },
    embedding_statuses: {
      pending: rows.filter((row) => row.embeddingStatus === "pending").length,
      embedded: rows.filter((row) => row.embeddingStatus === "embedded").length,
      failed: rows.filter((row) => row.embeddingStatus === "failed").length,
    },
    inline_embeddings: rows.filter(
      (row) => Array.isArray(row.embedding) && row.embedding.length > 0,
    ).length,
    pdf_rows: rows.filter((row) => row.isPdf || Boolean(row.pdfText)).length,
    url_rows: rows.filter((row) => Boolean(row.url)).length,
    scan_complete: rows.length < ARCHIVE_SCAN_LIMIT,
  };
}

function assertPopulatedFingerprint(summary: ReturnType<typeof summarize>) {
  if (
    !summary.scan_complete ||
    summary.total !== 66 ||
    summary.communities !== 1 ||
    summary.source_types.chat !== 63 ||
    summary.source_types.interaction !== 0 ||
    summary.source_types.ai_feed !== 3 ||
    summary.source_types.resource !== 0 ||
    summary.embedding_statuses.pending !== 60 ||
    summary.embedding_statuses.embedded !== 6 ||
    summary.embedding_statuses.failed !== 0 ||
    summary.inline_embeddings !== 6 ||
    summary.pdf_rows !== 0 ||
    summary.url_rows !== 0
  ) {
    throw new Error("dormant_community_archive_populated_fingerprint_mismatch");
  }
}

function assertEmptyFingerprint(summary: ReturnType<typeof summarize>) {
  if (!summary.scan_complete || summary.total !== 0) {
    throw new Error("dormant_community_archive_empty_fingerprint_mismatch");
  }
}

export const drainDormantCommunityArchiveDocumentsInternal = internalMutation({
  args: {
    expectedState: v.union(v.literal("populated"), v.literal("empty")),
    commit: v.boolean(),
    confirmation: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = (await ctx.db
      .query("communityArchiveDocuments")
      .take(ARCHIVE_SCAN_LIMIT)) as ArchiveRow[];
    const before = summarize(rows);

    if (args.expectedState === "populated") {
      if (args.confirmation !== POPULATED_CONFIRMATION) {
        throw new Error("dormant_community_archive_populated_confirmation_invalid");
      }
      assertPopulatedFingerprint(before);
    } else {
      if (args.confirmation !== EMPTY_CONFIRMATION) {
        throw new Error("dormant_community_archive_empty_confirmation_invalid");
      }
      assertEmptyFingerprint(before);
    }

    if (!args.commit) {
      return {
        ok: true,
        committed: false,
        deleted: 0,
        before,
      };
    }

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }

    const remainingRows = (await ctx.db
      .query("communityArchiveDocuments")
      .take(ARCHIVE_SCAN_LIMIT)) as ArchiveRow[];
    const after = summarize(remainingRows);
    assertEmptyFingerprint(after);

    return {
      ok: true,
      committed: true,
      deleted: rows.length,
      before,
      after,
    };
  },
});
