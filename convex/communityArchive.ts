import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  type CommunityChatMessageLike,
  type CommunityChatThreadLike,
  type CommunityJoinRequestLike,
  type CommunityLike,
  type CommunityMemberSettingsLike,
  type CommunityMembershipLike,
  type CommunityMessageReactionLike,
  type CommunityResourceLike,
  type CommunitySubscriptionLike,
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

function normalizeMaintenanceSlug(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

function uniqueSortedStrings(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

async function maintenanceUserExists(ctx: any, userId: any, cache: Map<string, boolean>): Promise<boolean> {
  const key = String(userId ?? "").trim();
  if (!key) return false;
  const cached = cache.get(key);
  if (typeof cached === "boolean") return cached;
  const row = await ctx.db.get(userId);
  const exists = Boolean(row);
  cache.set(key, exists);
  return exists;
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

export const purgeOrphanedCommunityUserArtifactsInternal = internalMutation({
  args: {
    communitySlug: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const slug = normalizeMaintenanceSlug(args.communitySlug);
    if (!slug) throw new Error("community_slug_required");
    const dryRun = args.dryRun !== false;

    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");

    const userExistenceCache = new Map<string, boolean>();
    if (!(await maintenanceUserExists(ctx, community.ownerId, userExistenceCache))) {
      throw new Error("community_owner_missing");
    }

    const memberships = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
      .collect()) as CommunityMembershipLike[];
    const orphanMemberships: CommunityMembershipLike[] = [];
    for (const row of memberships) {
      if (!(await maintenanceUserExists(ctx, row.userId, userExistenceCache))) {
        orphanMemberships.push(row);
      }
    }
    const orphanMembershipIds = new Set(orphanMemberships.map((row) => String(row._id)));

    const presenceRows = (await ctx.db
      .query("communityPresence" as any)
      .withIndex("by_community_lastSeenAt", (q: any) => q.eq("communityId", community._id))
      .collect()) as Array<{ _id: any; userId: any }>;
    const orphanPresenceRows = [];
    for (const row of presenceRows) {
      if (!(await maintenanceUserExists(ctx, row.userId, userExistenceCache))) {
        orphanPresenceRows.push(row);
      }
    }

    const joinRequests = (await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
      .collect()) as CommunityJoinRequestLike[];
    const orphanJoinRequests: CommunityJoinRequestLike[] = [];
    for (const row of joinRequests) {
      if (!(await maintenanceUserExists(ctx, row.userId, userExistenceCache))) {
        orphanJoinRequests.push(row);
      }
    }

    const memberSettings = (await ctx.db
      .query("communityMemberSettings" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
      .collect()) as CommunityMemberSettingsLike[];
    const orphanMemberSettings: CommunityMemberSettingsLike[] = [];
    for (const row of memberSettings) {
      if (!(await maintenanceUserExists(ctx, row.userId, userExistenceCache))) {
        orphanMemberSettings.push(row);
      }
    }

    const resources = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
      .collect()) as CommunityResourceLike[];
    const orphanResources: CommunityResourceLike[] = [];
    for (const row of resources) {
      if (!(await maintenanceUserExists(ctx, row.createdByUserId, userExistenceCache))) {
        orphanResources.push(row);
      }
    }

    const threads = (await ctx.db
      .query("communityChatThreads" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
      .collect()) as CommunityChatThreadLike[];
    const communityMessages: CommunityChatMessageLike[] = [];
    const orphanMessages: CommunityChatMessageLike[] = [];
    for (const thread of threads) {
      const messages = (await ctx.db
        .query("communityChatMessages" as any)
        .withIndex("by_thread", (q: any) => q.eq("threadId", thread._id))
        .collect()) as CommunityChatMessageLike[];
      for (const row of messages) {
        communityMessages.push(row);
        if (!row.senderUserId) continue;
        if (!(await maintenanceUserExists(ctx, row.senderUserId, userExistenceCache))) {
          orphanMessages.push(row);
        }
      }
    }
    const orphanMessageIds = new Set(orphanMessages.map((row) => String(row._id)));

    const orphanReactions: CommunityMessageReactionLike[] = [];
    for (const message of communityMessages) {
      const reactions = (await ctx.db
        .query("communityMessageReactions" as any)
        .withIndex("by_message", (q: any) => q.eq("messageId", message._id))
        .collect()) as CommunityMessageReactionLike[];
      for (const reaction of reactions) {
        if (
          orphanMessageIds.has(String(reaction.messageId)) ||
          !(await maintenanceUserExists(ctx, reaction.userId, userExistenceCache))
        ) {
          orphanReactions.push(reaction);
        }
      }
    }
    const dedupedReactionIds = new Set<string>();
    const dedupedOrphanReactions = orphanReactions.filter((row) => {
      const key = String(row._id);
      if (dedupedReactionIds.has(key)) return false;
      dedupedReactionIds.add(key);
      return true;
    });

    const subscriptions = (await ctx.db
      .query("communitySubscriptions" as any)
      .collect()) as CommunitySubscriptionLike[];
    const orphanSubscriptions: CommunitySubscriptionLike[] = [];
    for (const row of subscriptions) {
      if (String(row.communityId ?? "") !== String(community._id)) continue;
      if (orphanMembershipIds.has(String(row.membershipId))) {
        orphanSubscriptions.push(row);
        continue;
      }
      if (!(await maintenanceUserExists(ctx, row.userId, userExistenceCache))) {
        orphanSubscriptions.push(row);
      }
    }

    const orphanUserIds = uniqueSortedStrings([
      ...orphanMemberships.map((row) => String(row.userId)),
      ...orphanPresenceRows.map((row) => String(row.userId)),
      ...orphanJoinRequests.map((row) => String(row.userId)),
      ...orphanMemberSettings.map((row) => String(row.userId)),
      ...orphanResources.map((row) => String(row.createdByUserId)),
      ...orphanMessages.map((row) => String(row.senderUserId ?? "")),
      ...dedupedOrphanReactions.map((row) => String(row.userId)),
      ...orphanSubscriptions.map((row) => String(row.userId)),
    ].filter(Boolean));

    const summary = {
      community_id: String(community._id),
      community_slug: community.slug,
      dry_run: dryRun,
      orphan_user_ids: orphanUserIds,
      deleted: {
        memberships: orphanMemberships.length,
        presence: orphanPresenceRows.length,
        join_requests: orphanJoinRequests.length,
        member_settings: orphanMemberSettings.length,
        resources: orphanResources.length,
        messages: orphanMessages.length,
        message_reactions: dedupedOrphanReactions.length,
        subscriptions: orphanSubscriptions.length,
      },
    };

    if (dryRun) return { ok: true, ...summary };

    for (const row of dedupedOrphanReactions) await ctx.db.delete(row._id as any);
    for (const row of orphanMessages) await ctx.db.delete(row._id as any);
    for (const row of orphanResources) await ctx.db.delete(row._id as any);
    for (const row of orphanSubscriptions) await ctx.db.delete(row._id as any);
    for (const row of orphanMemberSettings) await ctx.db.delete(row._id as any);
    for (const row of orphanJoinRequests) await ctx.db.delete(row._id as any);
    for (const row of orphanPresenceRows) await ctx.db.delete(row._id as any);
    for (const row of orphanMemberships) await ctx.db.delete(row._id as any);

    return { ok: true, ...summary };
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
  handler: async (ctx, args): Promise<unknown> => {
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
  handler: async (ctx, args): Promise<unknown> => {
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
  handler: async (ctx, args): Promise<unknown> => {
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
    const processed: Record<string, unknown> = await ctx.runAction(internal.communityArchive.processCommunityArchivePendingInternal as any, {
      communityId: args.communityId,
    });
    return {
      retried: ids.length,
      ...processed,
    };
  },
});
