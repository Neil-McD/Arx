import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityChatMessageLike,
  type CommunityChatThreadLike,
  type CommunityLike,
  type CommunityMembershipLike,
  type CommunityMemoryCandidateLike,
  type CommunityMessageReactionLike,
  type CommunityResourceLike,
  parseIsoMs,
  requireCommunityChatAccess,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";

function normalizeEmoji(raw: unknown): string {
  const emoji = String(raw ?? "").trim();
  if (!emoji) throw new Error("emoji_required");
  return emoji.slice(0, 32);
}

async function mapCommunityChatMessageRow(
  ctx: any,
  row: CommunityChatMessageLike,
  userIdCache?: Map<string, string | null>,
) {
  return {
    id: String(row._id),
    thread_id: String(row.threadId),
    seq: Math.max(0, Math.floor(row.seq)),
    role: row.role,
    content_json: row.contentJson,
    sender_id: await resolvePublicUserId(ctx, row.senderUserId, userIdCache),
    reply_to_id: row.replyToMessageId ? String(row.replyToMessageId) : null,
    created_at: toIsoString(row.createdAt),
  };
}

async function mapCommunityMessageReactionRow(
  ctx: any,
  row: CommunityMessageReactionLike,
  userIdCache?: Map<string, string | null>,
) {
  return {
    id: String(row._id),
    message_id: String(row.messageId),
    user_id: (await resolvePublicUserId(ctx, row.userId, userIdCache)) ?? String(row.userId),
    emoji: row.emoji,
    created_at: toIsoString(row.createdAt),
  };
}

function normalizeResearchText(raw: unknown, maxLen: number): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  return value.slice(0, maxLen);
}

function tokenizeResearchQuery(raw: string): string[] {
  const tokens = raw
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    deduped.push(token);
    if (deduped.length >= 16) break;
  }
  return deduped;
}

function scoreResearchSnippet(snippet: string, tokens: string[]): number {
  const normalizedSnippet = snippet.toLowerCase();
  if (tokens.length === 0) return 0.5;
  let matches = 0;
  for (const token of tokens) {
    if (normalizedSnippet.includes(token)) matches += 1;
  }
  if (matches <= 0) return 0;
  return Number((matches / tokens.length).toFixed(4));
}

function extractMessageText(contentJson: unknown): string {
  if (typeof contentJson === "string") return contentJson.trim();
  if (contentJson && typeof contentJson === "object" && !Array.isArray(contentJson)) {
    const text = String((contentJson as Record<string, unknown>).text ?? "").trim();
    if (text) return text;
  }
  return "";
}

export const researchCommunityContext = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    communityName: v.optional(v.union(v.string(), v.null())),
    query: v.string(),
    sourceTypes: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const startedAt = Date.now();
    const nowMs = args.nowMs ?? startedAt;
    void nowMs;
    void args.communityName;

    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) {
      return {
        ok: false,
        reason_code: "community_not_found",
        message: "community_not_found",
      };
    }

    const membership = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", args.userId))
      .first()) as CommunityMembershipLike | null;
    if (!membership) {
      return {
        ok: false,
        reason_code: "not_entitled",
        message: "community_entitlement_required",
      };
    }

    const sourceTypes = new Set(
      (Array.isArray(args.sourceTypes) ? args.sourceTypes : ["chat", "resource", "memory"])
        .map((value) => String(value ?? "").trim().toLowerCase())
        .filter(Boolean),
    );
    const includeChat = sourceTypes.has("chat");
    const includeResource = sourceTypes.has("resource");
    const includeMemory = sourceTypes.has("memory");
    const normalizedQuery = normalizeResearchText(args.query, 240);
    const queryTokens = tokenizeResearchQuery(normalizedQuery);
    const limit = Math.max(1, Math.min(24, Math.floor(args.limit ?? 12)));

    const profileNameCache = new Map<string, string>();
    const resolveSenderDisplay = async (userIdRaw: unknown): Promise<string> => {
      const userIdText = String(userIdRaw ?? "").trim();
      if (!userIdText) return "member";
      const cached = profileNameCache.get(userIdText);
      if (cached) return cached;
      const user = await ctx.db.get(userIdText as any);
      const display = String((user as any)?.displayName ?? "").trim() || "member";
      profileNameCache.set(userIdText, display);
      return display;
    };

    const chatRows: Array<{
      source_type: "chat";
      source_id: string;
      internal_source_id: string;
      sender_display: string;
      created_at: string;
      snippet: string;
      score: number;
      _created_at_ms: number;
    }> = [];
    if (includeChat) {
      const threads = (await ctx.db
        .query("communityChatThreads")
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect()) as CommunityChatThreadLike[];
      threads.sort((a, b) => b.updatedAt - a.updatedAt);
      for (const thread of threads.slice(0, 8)) {
        const messages = (await ctx.db
          .query("communityChatMessages")
          .withIndex("by_thread", (q: any) => q.eq("threadId", thread._id))
          .collect()) as CommunityChatMessageLike[];
        for (const message of messages) {
          const snippet = normalizeResearchText(extractMessageText(message.contentJson), 260);
          if (!snippet) continue;
          const score = scoreResearchSnippet(snippet, queryTokens);
          if (queryTokens.length > 0 && score <= 0) continue;
          chatRows.push({
            source_type: "chat",
            source_id: String(message._id),
            internal_source_id: String(message._id),
            sender_display: await resolveSenderDisplay(message.senderUserId),
            created_at: toIsoString(message.createdAt),
            snippet,
            score,
            _created_at_ms: message.createdAt,
          });
        }
      }
    }
    chatRows.sort((a, b) => b.score - a.score || b._created_at_ms - a._created_at_ms);

    const resourceRows: Array<{
      source_type: "resource";
      source_id: string;
      internal_source_id: string;
      title: string;
      created_at: string;
      snippet: string;
      url: string | null;
      score: number;
      _created_at_ms: number;
    }> = [];
    if (includeResource) {
      const resources = (await ctx.db
        .query("communityResources")
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect()) as CommunityResourceLike[];
      for (const resource of resources) {
        const title = normalizeResearchText(resource.title, 100) || "Community resource";
        const snippet = normalizeResearchText(resource.bodyMd ?? resource.title ?? "", 220) || title;
        const score = scoreResearchSnippet(`${title}\n${snippet}`, queryTokens);
        if (queryTokens.length > 0 && score <= 0) continue;
        resourceRows.push({
          source_type: "resource",
          source_id: String(resource._id),
          internal_source_id: String(resource._id),
          title,
          created_at: toIsoString(resource.createdAt),
          snippet,
          url: resource.url ?? null,
          score,
          _created_at_ms: resource.createdAt,
        });
      }
    }
    resourceRows.sort((a, b) => b.score - a.score || b._created_at_ms - a._created_at_ms);

    const memoryRows: Array<{
      source_type: "memory";
      source_id: string;
      internal_source_id: string;
      title: string;
      created_at: string;
      updated_at: string;
      snippet: string;
      score: number;
      _created_at_ms: number;
    }> = [];
    if (includeMemory) {
      const candidates = (await ctx.db
        .query("communityMemoryCandidates")
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect()) as CommunityMemoryCandidateLike[];
      for (const candidate of candidates) {
        const status = String(candidate.routerState ?? "")
          .trim()
          .toLowerCase();
        if (status && status !== "promoted" && status !== "accepted") continue;
        const title = normalizeResearchText(candidate.title ?? "Community memory", 100) || "Community memory";
        const snippet = normalizeResearchText(candidate.memoryText, 220);
        if (!snippet) continue;
        const score = scoreResearchSnippet(`${title}\n${snippet}`, queryTokens);
        if (queryTokens.length > 0 && score <= 0) continue;
        memoryRows.push({
          source_type: "memory",
          source_id: String(candidate._id),
          internal_source_id: String(candidate._id),
          title,
          created_at: toIsoString(candidate.createdAt),
          updated_at: toIsoString(candidate.updatedAt),
          snippet,
          score,
          _created_at_ms: candidate.createdAt,
        });
      }
    }
    memoryRows.sort((a, b) => b.score - a.score || b._created_at_ms - a._created_at_ms);

    const chatLimited = chatRows.slice(0, Math.max(1, Math.min(limit, 6))).map(({ _created_at_ms, ...row }) => row);
    const resourceLimited = resourceRows
      .slice(0, Math.max(1, Math.min(limit, 5)))
      .map(({ _created_at_ms, ...row }) => row);
    const memoryLimited = memoryRows
      .slice(0, Math.max(1, Math.min(limit, 5)))
      .map(({ _created_at_ms, ...row }) => row);
    const compiledItemsUsed = chatLimited.length + resourceLimited.length + memoryLimited.length;

    return {
      ok: true,
      diagnostics: {
        attempted: true,
        compiled_fetch_ok: true,
        compiled_items_used: compiledItemsUsed,
        compile_version: 1,
        fallback_used: false,
        chat_fetch_ok: includeChat,
        resource_fetch_ok: includeResource || includeMemory,
        retrieval_latency_ms: Math.max(0, Date.now() - startedAt),
        failure_class: "none",
      },
      meta_recent_fallback_used: false,
      rows: {
        chat: chatLimited,
        resources: resourceLimited,
        memory: memoryLimited,
      },
    };
  },
});

export const ensureCommunityChatThread = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const existing = (await ctx.db
      .query("communityChatThreads" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .first()) as CommunityChatThreadLike | null;
    if (existing) {
      if (existing.updatedAt < nowMs - 5_000) {
        await ctx.db.patch(existing._id as any, { updatedAt: nowMs });
      }
      return { thread_id: String(existing._id) };
    }

    const threadId = await ctx.db.insert("communityChatThreads" as any, {
      communityId: args.communityId,
      lastSeq: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { thread_id: String(threadId) };
  },
});

export const listThreadMessages = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("communityChatThreads"),
    beforeSeq: v.optional(v.union(v.number(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const thread = (await ctx.db.get(args.threadId)) as CommunityChatThreadLike | null;
    if (!thread) return [];
    await requireCommunityChatAccess({
      ctx,
      communityId: thread.communityId,
      userId: args.userId,
    });

    const safeLimit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 100)));
    const beforeSeq =
      typeof args.beforeSeq === "number" && Number.isFinite(args.beforeSeq)
        ? Math.max(0, Math.floor(args.beforeSeq))
        : null;
    const rows = (await ctx.db
      .query("communityChatMessages" as any)
      .withIndex("by_thread_seq", (q: any) =>
        beforeSeq === null ? q.eq("threadId", args.threadId) : q.eq("threadId", args.threadId).lt("seq", beforeSeq),
      )
      .order("desc")
      .take(safeLimit)) as CommunityChatMessageLike[];
    const userIdCache = new Map<string, string | null>();
    return await Promise.all(rows.map((row) => mapCommunityChatMessageRow(ctx, row, userIdCache)));
  },
});

export const createThreadUserMessage = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("communityChatThreads"),
    text: v.string(),
    attachments: v.optional(v.array(v.any())),
    replyToId: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    const thread = (await ctx.db.get(args.threadId)) as CommunityChatThreadLike | null;
    if (!thread) throw new Error("thread_not_found");
    await requireCommunityChatAccess({
      ctx,
      communityId: thread.communityId,
      userId: args.userId,
    });

    const seq = Math.max(0, Math.floor(thread.lastSeq ?? 0) + 1);
    const text = String(args.text ?? "").trim();
    if (!text) throw new Error("message_text_required");

    let replyToMessageId: any | undefined = undefined;
    const replyToRaw = String(args.replyToId ?? "").trim();
    if (replyToRaw) {
      const reply = (await ctx.db.get(replyToRaw as any)) as CommunityChatMessageLike | null;
      if (reply && reply.threadId === thread._id) {
        replyToMessageId = reply._id;
      }
    }

    const contentJson =
      Array.isArray(args.attachments) && args.attachments.length > 0
        ? { text, attachments: args.attachments }
        : { text };

    const messageId = await ctx.db.insert("communityChatMessages" as any, {
      threadId: thread._id,
      seq,
      role: "user",
      contentJson,
      senderUserId: args.userId,
      ...(replyToMessageId ? { replyToMessageId } : null),
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.patch(thread._id as any, {
      lastSeq: seq,
      updatedAt: nowMs,
    });
    const row = (await ctx.db.get(messageId as any)) as CommunityChatMessageLike | null;
    if (!row) throw new Error("message_create_failed");
    return await mapCommunityChatMessageRow(ctx, row);
  },
});

export const patchOwnMessageContent = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    messageId: v.string(),
    contentJson: v.any(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    const message = (await ctx.db.get(args.messageId as any)) as CommunityChatMessageLike | null;
    if (!message) throw new Error("message_not_found");
    const thread = (await ctx.db.get(message.threadId)) as CommunityChatThreadLike | null;
    if (!thread) throw new Error("thread_not_found");
    await requireCommunityChatAccess({
      ctx,
      communityId: thread.communityId,
      userId: args.userId,
    });
    if (!message.senderUserId || String(message.senderUserId) !== String(args.userId)) {
      throw new Error("message_forbidden");
    }
    await ctx.db.patch(message._id as any, {
      contentJson: args.contentJson,
      updatedAt: nowMs,
    });
    return { ok: true };
  },
});

export const deleteOwnMessage = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    messageId: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    const message = (await ctx.db.get(args.messageId as any)) as CommunityChatMessageLike | null;
    if (!message) return { ok: true, deleted: false };
    const thread = (await ctx.db.get(message.threadId)) as CommunityChatThreadLike | null;
    if (!thread) return { ok: true, deleted: false };
    await requireCommunityChatAccess({
      ctx,
      communityId: thread.communityId,
      userId: args.userId,
    });
    if (!message.senderUserId || String(message.senderUserId) !== String(args.userId)) {
      throw new Error("message_forbidden");
    }

    const reactions = (await ctx.db
      .query("communityMessageReactions" as any)
      .withIndex("by_message", (q: any) => q.eq("messageId", message._id))
      .collect()) as CommunityMessageReactionLike[];
    for (const reaction of reactions) {
      await ctx.db.delete(reaction._id as any);
    }
    await ctx.db.delete(message._id as any);

    const remaining = (await ctx.db
      .query("communityChatMessages" as any)
      .withIndex("by_thread", (q: any) => q.eq("threadId", thread._id))
      .collect()) as CommunityChatMessageLike[];
    const lastSeq = remaining.reduce((max, row) => Math.max(max, Math.floor(row.seq ?? 0)), 0);
    await ctx.db.patch(thread._id as any, {
      lastSeq,
      updatedAt: nowMs,
    });

    return { ok: true, deleted: true };
  },
});

export const createMessageReaction = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    messageId: v.string(),
    emoji: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    const emoji = normalizeEmoji(args.emoji);
    const message = (await ctx.db.get(args.messageId as any)) as CommunityChatMessageLike | null;
    if (!message) throw new Error("message_not_found");
    const thread = (await ctx.db.get(message.threadId)) as CommunityChatThreadLike | null;
    if (!thread) throw new Error("thread_not_found");
    await requireCommunityChatAccess({
      ctx,
      communityId: thread.communityId,
      userId: args.userId,
    });

    const existing = (await ctx.db
      .query("communityMessageReactions" as any)
      .withIndex("by_message_user_emoji", (q: any) =>
        q.eq("messageId", message._id).eq("userId", args.userId).eq("emoji", emoji),
      )
      .first()) as CommunityMessageReactionLike | null;
    if (existing) return await mapCommunityMessageReactionRow(ctx, existing);

    const reactionId = await ctx.db.insert("communityMessageReactions" as any, {
      messageId: message._id,
      userId: args.userId,
      emoji,
      createdAt: nowMs,
    });
    const created = (await ctx.db.get(reactionId as any)) as CommunityMessageReactionLike | null;
    if (!created) throw new Error("reaction_create_failed");
    return await mapCommunityMessageReactionRow(ctx, created);
  },
});

export const deleteMessageReactionById = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    reactionId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const reaction = (await ctx.db.get(args.reactionId as any)) as CommunityMessageReactionLike | null;
    if (!reaction) return { ok: true, deleted: false };
    if (String(reaction.userId) !== String(args.userId)) throw new Error("reaction_forbidden");
    await ctx.db.delete(reaction._id as any);
    return { ok: true, deleted: true };
  },
});

export const listMessageReactions = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    messageIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const uniqueIds = Array.from(
      new Set(
        args.messageIds
          .map((value) => String(value ?? "").trim())
          .filter((value) => value.length > 0),
      ),
    ).slice(0, 500);
    if (uniqueIds.length === 0) return [];

    const out: CommunityMessageReactionLike[] = [];
    const verifiedThreadIds = new Set<string>();
    for (const messageId of uniqueIds) {
      const message = (await ctx.db.get(messageId as any)) as CommunityChatMessageLike | null;
      if (!message) continue;
      const threadId = String(message.threadId);
      if (!verifiedThreadIds.has(threadId)) {
        const thread = (await ctx.db.get(message.threadId)) as CommunityChatThreadLike | null;
        if (!thread) continue;
        await requireCommunityChatAccess({
          ctx,
          communityId: thread.communityId,
          userId: args.userId,
        });
        verifiedThreadIds.add(threadId);
      }
      const rows = (await ctx.db
        .query("communityMessageReactions" as any)
        .withIndex("by_message", (q: any) => q.eq("messageId", message._id))
        .collect()) as CommunityMessageReactionLike[];
      out.push(...rows);
    }
    const userIdCache = new Map<string, string | null>();
    return await Promise.all(out.map((row) => mapCommunityMessageReactionRow(ctx, row, userIdCache)));
  },
});

export const listThreadUserMessageSenderIds = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("communityChatThreads"),
    sinceIso: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const thread = (await ctx.db.get(args.threadId)) as CommunityChatThreadLike | null;
    if (!thread) return [];
    await requireCommunityChatAccess({
      ctx,
      communityId: thread.communityId,
      userId: args.userId,
    });

    const sinceMs = parseIsoMs(args.sinceIso);
    const safeLimit = Math.max(1, Math.min(5000, Math.floor(args.limit ?? 5000)));
    const rows = (await ctx.db
      .query("communityChatMessages" as any)
      .withIndex("by_thread", (q: any) => q.eq("threadId", args.threadId))
      .collect()) as CommunityChatMessageLike[];
    const userIdCache = new Map<string, string | null>();
    const senderIds = await Promise.all(
      rows
        .filter((row) => row.role === "user")
        .filter((row) => Boolean(row.senderUserId))
        .filter((row) => (typeof sinceMs === "number" ? row.createdAt >= sinceMs : true))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, safeLimit)
        .map(async (row) => ({ sender_id: await resolvePublicUserId(ctx, row.senderUserId, userIdCache) })),
    );
    return senderIds.filter((row) => row.sender_id);
  },
});
