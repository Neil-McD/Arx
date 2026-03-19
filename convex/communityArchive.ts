import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  normalizeIdValue,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  backfillCommunityArchive,
  normalizeOptionalText,
  truncateText,
} from "./communityArchiveDocuments";
import type { ArchiveDocLike } from "./communityArchiveDocuments";
import {
  processPendingArchiveDocuments,
} from "./communityArchiveEmbeddingPipeline";
import {
  ARCHIVE_EMBED_BATCH_LIMIT,
  ARCHIVE_EMBEDDING_DIMENSIONS,
} from "./communityArchiveShared";
import { searchCommunityKnowledge } from "./communityArchiveRetrieval";

async function resolveActionUser(args: {
  ctx: any;
  authSubject?: string | null;
}): Promise<{ authSubject: string; userId: any }> {
  const actor = (await args.ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
    authSubject: args.authSubject ?? undefined,
  })) as { authSubject?: unknown; dbUserId?: unknown } | null;
  const authSubject = normalizeIdValue(actor?.authSubject);
  if (!authSubject) throw new Error("authenticated_user_required");
  const userId = actor?.dbUserId;
  if (!userId) throw new Error("authenticated_user_required");
  return { authSubject, userId };
}


export const countCommunityArchiveDocumentsInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const rows = (await ctx.db
      .query("communityArchiveDocuments" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as ArchiveDocLike[];
    return rows.length;
  },
});

export const getCommunityArchiveStatusCountsInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const [pendingRows, embeddedRows, failedRows] = (await Promise.all([
      ctx.db
        .query("communityArchiveDocuments" as any)
        .withIndex("by_community_embeddingStatus", (q: any) =>
          q.eq("communityId", args.communityId).eq("embeddingStatus", "pending"),
        )
        .collect(),
      ctx.db
        .query("communityArchiveDocuments" as any)
        .withIndex("by_community_embeddingStatus", (q: any) =>
          q.eq("communityId", args.communityId).eq("embeddingStatus", "embedded"),
        )
        .collect(),
      ctx.db
        .query("communityArchiveDocuments" as any)
        .withIndex("by_community_embeddingStatus", (q: any) =>
          q.eq("communityId", args.communityId).eq("embeddingStatus", "failed"),
        )
        .collect(),
    ])) as [ArchiveDocLike[], ArchiveDocLike[], ArchiveDocLike[]];
    return {
      total: pendingRows.length + embeddedRows.length + failedRows.length,
      pending: pendingRows.length,
      embedded: embeddedRows.length,
      failed: failedRows.length,
    };
  },
});

export const listPendingCommunityArchiveDocumentsInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(ARCHIVE_EMBED_BATCH_LIMIT, Math.floor(args.limit ?? ARCHIVE_EMBED_BATCH_LIMIT)));
    return ((await ctx.db
      .query("communityArchiveDocuments" as any)
      .withIndex("by_community_embeddingStatus", (q: any) =>
        q.eq("communityId", args.communityId).eq("embeddingStatus", "pending"),
      )
      .take(limit)) as ArchiveDocLike[]).map((row) => ({
      id: normalizeIdValue(row._id),
      source_type: row.sourceType,
      source_id: row.sourceId,
      title: row.title ?? null,
      source_text: row.sourceText,
      pdf_text: row.pdfText ?? null,
      text: row.text,
      url: row.url ?? null,
      is_pdf: Boolean(row.isPdf),
    }));
  },
});

export const listFailedCommunityArchiveDocumentIdsInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(256, Math.floor(args.limit ?? 256)));
    return ((await ctx.db
      .query("communityArchiveDocuments" as any)
      .withIndex("by_community_embeddingStatus", (q: any) =>
        q.eq("communityId", args.communityId).eq("embeddingStatus", "failed"),
      )
      .take(limit)) as ArchiveDocLike[]).map((row) => normalizeIdValue(row._id));
  },
});

export const getCommunityArchiveDocumentsByIdsInternal = internalQuery({
  args: {
    ids: v.array(v.id("communityArchiveDocuments")),
  },
  handler: async (ctx, args) => {
    const docs = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return docs.filter(Boolean) as ArchiveDocLike[];
  },
});

export const backfillCommunityArchiveInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    return await backfillCommunityArchive(ctx, args.communityId);
  },
});

export const saveArchiveDocumentEmbeddingInternal = internalMutation({
  args: {
    archiveDocumentId: v.id("communityArchiveDocuments"),
    embedding: v.array(v.float64()),
    embeddingModel: v.string(),
    embeddingDimensions: v.number(),
    embeddingUpdatedAt: v.number(),
    text: v.optional(v.string()),
    pdfText: v.optional(v.union(v.string(), v.null())),
    snippet: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = (await ctx.db.get(args.archiveDocumentId)) as ArchiveDocLike | null;
    if (!existing) return { ok: false };
    await ctx.db.patch(existing._id as any, {
      ...(typeof args.text === "string" ? { text: args.text } : null),
      ...(Object.prototype.hasOwnProperty.call(args, "pdfText")
        ? { pdfText: args.pdfText ?? undefined }
        : null),
      ...(typeof args.snippet === "string" ? { snippet: args.snippet } : null),
      embedding: args.embedding,
      embeddingStatus: "embedded",
      embeddingError: undefined,
      embeddingModel: args.embeddingModel,
      embeddingDimensions: args.embeddingDimensions,
      embeddingUpdatedAt: args.embeddingUpdatedAt,
    });
    return { ok: true };
  },
});

export const markArchiveDocumentEmbeddingFailedInternal = internalMutation({
  args: {
    archiveDocumentId: v.id("communityArchiveDocuments"),
    errorMessage: v.string(),
    embeddingUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = (await ctx.db.get(args.archiveDocumentId)) as ArchiveDocLike | null;
    if (!existing) return { ok: false };
    await ctx.db.patch(existing._id as any, {
      embeddingStatus: "failed",
      embeddingError: truncateText(args.errorMessage, 500),
      embeddingUpdatedAt: args.embeddingUpdatedAt,
    });
    return { ok: true };
  },
});

export const resetArchiveDocumentsToPendingInternal = internalMutation({
  args: {
    archiveDocumentIds: v.array(v.id("communityArchiveDocuments")),
  },
  handler: async (ctx, args) => {
    let resetCount = 0;
    for (const id of args.archiveDocumentIds) {
      const existing = (await ctx.db.get(id)) as ArchiveDocLike | null;
      if (!existing) continue;
      await ctx.db.patch(existing._id as any, {
        embeddingStatus: "pending",
        embeddingError: undefined,
      });
      resetCount += 1;
    }
    return { resetCount };
  },
});

export const processCommunityArchivePendingInternal = internalAction({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    return await processPendingArchiveDocuments({
      ctx,
      communityId: args.communityId,
    });
  },
});

export const searchCommunityKnowledgeInternal = internalAction({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    return await searchCommunityKnowledge({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
      query: args.query,
    });
  },
});

export const getCommunityArchiveHealth = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const rows = (await ctx.db
      .query("communityArchiveDocuments" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as ArchiveDocLike[];
    let lastEmbeddingUpdatedAt = 0;
    let latestFailureMessage: string | null = null;
    let latestFailureUpdatedAt = 0;
    const statusCounts = { pending: 0, embedded: 0, failed: 0 };
    const sourceCounts = { chat: 0, ai_feed: 0, resource: 0 };
    let pdfDocuments = 0;
    for (const row of rows) {
      if (row.embeddingStatus === "pending") statusCounts.pending += 1;
      else if (row.embeddingStatus === "embedded") statusCounts.embedded += 1;
      else if (row.embeddingStatus === "failed") statusCounts.failed += 1;
      if (row.sourceType === "chat") sourceCounts.chat += 1;
      else if (row.sourceType === "ai_feed") sourceCounts.ai_feed += 1;
      else if (row.sourceType === "resource") sourceCounts.resource += 1;
      if (row.isPdf) pdfDocuments += 1;
      if (typeof row.embeddingUpdatedAt === "number" && row.embeddingUpdatedAt > lastEmbeddingUpdatedAt) {
        lastEmbeddingUpdatedAt = row.embeddingUpdatedAt;
      }
      if (
        row.embeddingStatus === "failed" &&
        typeof row.embeddingUpdatedAt === "number" &&
        row.embeddingUpdatedAt >= latestFailureUpdatedAt
      ) {
        latestFailureUpdatedAt = row.embeddingUpdatedAt;
        latestFailureMessage = normalizeOptionalText(row.embeddingError, 500) ?? null;
      }
    }
    return {
      community_id: normalizeIdValue(args.communityId),
      total_documents: rows.length,
      status_counts: statusCounts,
      source_counts: sourceCounts,
      pdf_counts: {
        pdf_documents: pdfDocuments,
      },
      last_embedding_updated_at: lastEmbeddingUpdatedAt ? toIsoString(lastEmbeddingUpdatedAt) : null,
      latest_failure_message: latestFailureMessage,
    };
  },
});

export const requestCommunityArchiveBackfill = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    return await backfillCommunityArchive(ctx, args.communityId);
  },
});

export const processCommunityArchivePending = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await ctx.runQuery(api.community.getCommunityArchiveHealth as any, {
      userId,
      authSubject: args.authSubject ?? undefined,
      communityId: args.communityId,
    });
    return await ctx.runAction(internal.communityArchive.processCommunityArchivePendingInternal as any, {
      communityId: args.communityId,
    });
  },
});

export const retryCommunityArchiveFailures = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await ctx.runQuery(api.community.getCommunityArchiveHealth as any, {
      userId,
      authSubject: args.authSubject ?? undefined,
      communityId: args.communityId,
    });
    const ids = (await ctx.runQuery(internal.communityArchive.listFailedCommunityArchiveDocumentIdsInternal as any, {
      communityId: args.communityId,
      limit: 256,
    })) as string[];
    if (ids.length > 0) {
      await ctx.runMutation(internal.communityArchive.resetArchiveDocumentsToPendingInternal as any, {
        archiveDocumentIds: ids,
      });
    }
    const processed = await ctx.runAction(internal.communityArchive.processCommunityArchivePendingInternal as any, {
      communityId: args.communityId,
    });
    return {
      retried: ids.length,
      ...processed,
    };
  },
});
