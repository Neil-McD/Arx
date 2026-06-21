import { internal } from "./_generated/api";
import { normalizeIdValue, toIsoString } from "./communityCore";
import type { ArchiveDocLike } from "./communityArchiveDocuments";
import { normalizeOptionalText, truncateText } from "./communityArchiveDocuments";
import { embedGeminiQuery, resolveGeminiEmbeddingConfig } from "./communityArchiveEmbeddingPipeline";
import { ARCHIVE_VECTOR_LIMIT } from "./communityArchiveShared";

async function resolveTrustedSearchUserId(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
}): Promise<any> {
  const authSubject = String(args.authSubject ?? "").trim();
  if (!authSubject) {
    if (args.userId) return args.userId;
    throw new Error("auth_subject_required");
  }
  const actor = (await args.ctx.runQuery(
    (internal as any).authActor.resolveAuthenticatedActorByTrustedSubjectInternal,
    {
      authSubject,
      ...(args.userId ? { userId: args.userId } : null),
    },
  )) as { dbUserId?: unknown } | null;
  const resolvedUserId = actor?.dbUserId;
  if (!resolvedUserId) throw new Error("authenticated_user_required");
  return resolvedUserId;
}

function mapArchiveDocToItem(doc: ArchiveDocLike, score: number | null) {
  return {
    source_type: doc.sourceType,
    source_id: doc.sourceId,
    title: normalizeOptionalText(doc.title, 180),
    snippet: doc.snippet,
    created_at: toIsoString(doc.createdAt),
    score,
    ...(doc.authorLabel ? { author_label: doc.authorLabel } : null),
    ...(doc.url ? { url: doc.url } : null),
    ...(doc.postType ? { post_type: doc.postType } : null),
    ...(doc.resourceType ? { resource_type: doc.resourceType } : null),
    ...(doc.resourceRole ? { resource_role: doc.resourceRole } : null),
    ...(doc.resourceStatus ? { resource_status: doc.resourceStatus } : null),
  };
}

export async function searchCommunityKnowledge(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
  communityId: any;
  query: string;
}): Promise<unknown> {
  const userId = await resolveTrustedSearchUserId({
    ctx: args.ctx,
    userId: args.userId,
    authSubject: args.authSubject ?? null,
  });
  const recent: any = await args.ctx.runQuery(
    (internal as any).communityRecentContext.readCommunityRecentContextInternal,
    {
      userId,
      communityId: args.communityId,
      query: args.query,
    },
  );
  const queryText = truncateText(args.query, 240);
  const config = resolveGeminiEmbeddingConfig();
  const diagnostics = {
    ...(recent as any).diagnostics,
    retrieval_version: "recent_context_plus_archive_v1",
    archive_fetch_ok: false,
    archive_items_used: 0,
    archive_documents_available: 0,
    archive_pending_documents: 0,
    archive_embedded_documents: 0,
    archive_failed_documents: 0,
    archive_ready: false,
    archive_embedding_model: config.ok ? config.model : null,
    archive_error: config.ok ? null : config.reason,
  };
  if (!queryText || !config.ok) {
    return {
      ...(recent as any),
      archive_context: [],
      archive_source_counts: { chat: 0, ai_feed: 0, resource: 0 },
      diagnostics,
    };
  }

  try {
    const archiveStatusCounts = (await args.ctx.runQuery(
      internal.communityArchive.getCommunityArchiveStatusCountsInternal as any,
      { communityId: args.communityId },
    )) as {
      total: number;
      pending: number;
      embedded: number;
      failed: number;
    };
    diagnostics.archive_documents_available = archiveStatusCounts.total;
    diagnostics.archive_pending_documents = archiveStatusCounts.pending;
    diagnostics.archive_embedded_documents = archiveStatusCounts.embedded;
    diagnostics.archive_failed_documents = archiveStatusCounts.failed;
    diagnostics.archive_ready = archiveStatusCounts.embedded > 0;

    const queryEmbedding = await embedGeminiQuery({
      apiKey: config.apiKey,
      model: config.model,
      text: queryText,
    });
    const vectorHits = await args.ctx.vectorSearch("communityArchiveDocuments" as any, "by_embedding" as any, {
      vector: queryEmbedding,
      limit: ARCHIVE_VECTOR_LIMIT,
      filter: (q: any) => q.eq("communityId", args.communityId),
    });
    diagnostics.archive_fetch_ok = true;
    if (vectorHits.length === 0) {
      return {
        ...(recent as any),
        archive_context: [],
        archive_source_counts: { chat: 0, ai_feed: 0, resource: 0 },
        diagnostics,
      };
    }

    const scoreById = new Map<string, number>();
    for (const hit of vectorHits) {
      scoreById.set(normalizeIdValue(hit._id), Number(hit._score ?? 0));
    }
    const docs = (await args.ctx.runQuery(internal.communityArchive.getCommunityArchiveDocumentsByIdsInternal as any, {
      ids: vectorHits.map((hit: any) => hit._id),
    })) as ArchiveDocLike[];

    const seenRecent = new Set<string>(
      Array.isArray((recent as any).recent_context)
        ? (recent as any).recent_context.map((item: any) => `${item.source_type}:${item.source_id}`)
        : [],
    );
    const archiveItems = docs
      .slice()
      .sort(
        (a, b) =>
          Number(scoreById.get(normalizeIdValue(b._id)) ?? 0) -
            Number(scoreById.get(normalizeIdValue(a._id)) ?? 0) ||
          b.createdAt - a.createdAt,
      )
      .map((doc) => ({
        key: `${doc.sourceType}:${doc.sourceId}`,
        item: mapArchiveDocToItem(doc, Number(scoreById.get(normalizeIdValue(doc._id)) ?? 0)),
      }))
      .filter(({ key }) => !seenRecent.has(key));

    const archive_context = archiveItems.map((entry) => entry.item);
    diagnostics.archive_items_used = archive_context.length;
    return {
      ...(recent as any),
      archive_context,
      archive_source_counts: {
        chat: archive_context.filter((item) => item.source_type === "chat").length,
        ai_feed: archive_context.filter((item) => item.source_type === "ai_feed").length,
        resource: archive_context.filter((item) => item.source_type === "resource").length,
      },
      diagnostics,
    };
  } catch (error) {
    diagnostics.archive_fetch_ok = false;
    diagnostics.archive_error = truncateText(
      error instanceof Error ? error.message : "archive_retrieval_failed",
      500,
    );
    diagnostics.archive_items_used = 0;
  }

  return {
    ...(recent as any),
    archive_context: [],
    archive_source_counts: { chat: 0, ai_feed: 0, resource: 0 },
    diagnostics,
  };
}
