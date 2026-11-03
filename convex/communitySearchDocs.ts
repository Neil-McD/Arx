import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { buildCommunitySearchText } from "../shared/communitySearchText";

// Search rows for posts and replies (schema: communitySearchDocs). One row per
// live, community-visible post or reply, rebuilt from its source in the same
// write as every change to it. The row only finds candidates: search re-checks
// each result against the real post, so a stale row can never show more than
// the reader could open.

type SearchObjectType = "root" | "reply";
const THREAD_CLEAR_BATCH = 400;
const BACKFILL_BATCH = 100;
const CHANNEL_RELABEL_BATCH = 200;
const THREAD_OPENING_MAX_CHARS = 160;

// What a reply is indexed under: its thread's title, else its opening words.
function threadOpeningOf(root: any): string {
  return String(root.title ?? root.contentSummary ?? "").replace(/\s+/g, " ").trim().slice(0, THREAD_OPENING_MAX_CHARS);
}

export const SHARED_SEARCH_ACCESS_KEY = "shared";
export function restrictedSearchAccessKey(channelId: unknown): string {
  return `channel:${String(channelId)}`;
}

function communityReadable(row: any): boolean {
  return Boolean(row) && row.status === "live" && (row.visibilityScope === "community" || row.visibilityScope === "public");
}

// The access key for a source's channel, or null when no member reads it.
async function accessKeyFor(ctx: any, communityId: any, channelId: any): Promise<string | null> {
  // Posts from before channels have none and read as General.
  if (!channelId) return SHARED_SEARCH_ACCESS_KEY;
  const channel = await ctx.db.get(channelId);
  if (!channel || String(channel.communityId) !== String(communityId) || channel.status !== "active") return null;
  return channel.accessMode === "restricted" ? restrictedSearchAccessKey(channel._id) : SHARED_SEARCH_ACCESS_KEY;
}

async function bodyText(ctx: any, field: "rootId" | "replyId", id: any, fallback: string): Promise<string> {
  const index = field === "rootId" ? "by_root_order" : "by_reply_order";
  const blocks = await ctx.db.query("communityInteractionContentBlocks")
    .withIndex(index, (q: any) => q.eq(field, id))
    .take(64);
  const parts = blocks
    // A post's own blocks only, never its replies'.
    .filter((block: any) => field === "replyId" || !block.replyId)
    .map((block: any) => block.text ?? (block.blockType === "link" ? block.url : ""))
    .filter((text: unknown) => typeof text === "string" && text.trim());
  return parts.length ? parts.join("\n") : fallback;
}

async function authorName(ctx: any, row: any): Promise<string> {
  if (row.actorType !== "human" || !row.actorUserId) return "the community agent";
  const user = await ctx.db.get(row.actorUserId);
  const detail = await ctx.db.query("userProfileDetails").withIndex("by_user", (q: any) => q.eq("userId", row.actorUserId)).first();
  return String(detail?.displayName ?? user?.displayName ?? user?.handle ?? "").trim();
}

async function existingDoc(ctx: any, objectType: SearchObjectType, objectId: any) {
  return objectType === "root"
    ? ctx.db.query("communitySearchDocs").withIndex("by_root_reply", (q: any) => q.eq("rootId", objectId).eq("replyId", undefined)).first()
    : ctx.db.query("communitySearchDocs").withIndex("by_reply", (q: any) => q.eq("replyId", objectId)).first();
}

async function writeDoc(ctx: any, existing: any, doc: Record<string, unknown>) {
  if (existing) await ctx.db.replace(existing._id, doc);
  else await ctx.db.insert("communitySearchDocs", doc);
}

// Removes a thread's rows: the post's and its replies'. Large threads finish
// in follow-up runs.
async function clearThread(ctx: any, rootId: any): Promise<void> {
  const rows = await ctx.db.query("communitySearchDocs")
    .withIndex("by_root_reply", (q: any) => q.eq("rootId", rootId))
    .take(THREAD_CLEAR_BATCH);
  for (const row of rows) await ctx.db.delete(row._id);
  if (rows.length >= THREAD_CLEAR_BATCH && ctx.scheduler) {
    await ctx.scheduler.runAfter(0, (internal as any).communitySearchDocs.clearCommunitySearchThreadInternal, { rootId });
  }
}

export async function syncCommunitySearchDoc(
  ctx: any,
  args: { communityId: any; objectType: SearchObjectType; objectId: any },
): Promise<void> {
  const nowMs = Date.now();
  if (args.objectType === "root") {
    const root = await ctx.db.get(args.objectId);
    const existing = await existingDoc(ctx, "root", args.objectId);
    const accessKey = root && communityReadable(root) && String(root.communityId) === String(args.communityId)
      ? await accessKeyFor(ctx, root.communityId, root.channelId)
      : null;
    if (!root || !accessKey) {
      // A post that can't be read takes its replies' rows with it.
      if (existing || root) await clearThread(ctx, args.objectId);
      return;
    }
    const channel = root.channelId ? await ctx.db.get(root.channelId) : null;
    const threadOpening = threadOpeningOf(root);
    await writeDoc(ctx, existing, {
      communityId: root.communityId,
      kind: "post",
      rootId: root._id,
      ...(root.channelId ? { channelId: root.channelId } : {}),
      accessKey,
      ...(root.actorUserId ? { authorUserId: root.actorUserId } : {}),
      sourceCreatedAt: root.createdAt,
      searchText: buildCommunitySearchText({
        channelName: channel?.name ?? "General",
        threadOpening: root.title ?? null,
        authorName: await authorName(ctx, root),
        body: await bodyText(ctx, "rootId", root._id, String(root.contentSummary ?? "")),
      }),
      threadOpening,
      updatedAt: nowMs,
    });
    // An edit that changes the opening refreshes the replies indexed under it.
    if (existing && existing.threadOpening !== threadOpening && ctx.scheduler) {
      await ctx.scheduler.runAfter(0, (internal as any).communitySearchDocs.resyncCommunitySearchRepliesInternal, { rootId: root._id });
    }
    return;
  }
  const reply = await ctx.db.get(args.objectId);
  const existing = await existingDoc(ctx, "reply", args.objectId);
  const root = reply ? await ctx.db.get(reply.rootId) : null;
  const accessKey = reply && root && communityReadable(reply) && communityReadable(root) &&
    String(reply.communityId) === String(args.communityId)
    ? await accessKeyFor(ctx, reply.communityId, reply.channelId ?? root.channelId)
    : null;
  if (!reply || !root || !accessKey) {
    if (existing) await ctx.db.delete(existing._id);
    return;
  }
  const channelId = reply.channelId ?? root.channelId;
  const channel = channelId ? await ctx.db.get(channelId) : null;
  await writeDoc(ctx, existing, {
    communityId: reply.communityId,
    kind: "reply",
    rootId: root._id,
    replyId: reply._id,
    ...(channelId ? { channelId } : {}),
    accessKey,
    ...(reply.actorUserId ? { authorUserId: reply.actorUserId } : {}),
    sourceCreatedAt: reply.createdAt,
    searchText: buildCommunitySearchText({
      channelName: channel?.name ?? "General",
      // A short reply ("same here") is findable by the thread it answers.
      threadOpening: threadOpeningOf(root),
      authorName: await authorName(ctx, reply),
      body: await bodyText(ctx, "replyId", reply._id, String(reply.contentSummary ?? "")),
    }),
    updatedAt: nowMs,
  });
}

// Rebuilds a thread's reply rows, a page at a time.
export const resyncCommunitySearchRepliesInternal = internalMutation({
  args: { rootId: v.id("communityInteractionRoots"), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("communitySearchDocs")
      .withIndex("by_root_reply", (q) => q.eq("rootId", args.rootId))
      .paginate({ numItems: CHANNEL_RELABEL_BATCH, cursor: args.cursor ?? null });
    for (const row of page.page) {
      if (row.replyId) await syncCommunitySearchDoc(ctx, { communityId: row.communityId, objectType: "reply", objectId: row.replyId });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, (internal as any).communitySearchDocs.resyncCommunitySearchRepliesInternal, {
        rootId: args.rootId, cursor: page.continueCursor,
      });
    }
  },
});

export const clearCommunitySearchThreadInternal = internalMutation({
  args: { rootId: v.id("communityInteractionRoots") },
  handler: async (ctx, args) => {
    await clearThread(ctx, args.rootId);
  },
});

// When a channel changes between everyone and invite-only, its rows take the
// new access key. Until a page is relabelled, a row still keyed "shared" is
// harmless: search re-checks every result against the channel.
export const relabelCommunitySearchChannelInternal = internalMutation({
  args: { channelId: v.id("communityChannels"), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("communitySearchDocs")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .paginate({ numItems: CHANNEL_RELABEL_BATCH, cursor: args.cursor ?? null });
    for (const row of page.page) {
      await syncCommunitySearchDoc(ctx, {
        communityId: row.communityId,
        objectType: row.replyId ? "reply" : "root",
        objectId: row.replyId ?? row.rootId,
      });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, (internal as any).communitySearchDocs.relabelCommunitySearchChannelInternal, {
        channelId: args.channelId, cursor: page.continueCursor,
      });
    }
  },
});

// Operator tool: builds rows for a community's existing posts, then replies.
// Paged and safe to repeat; each page schedules the next.
export const backfillCommunitySearchDocsInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    table: v.optional(v.union(v.literal("roots"), v.literal("replies"))),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const table = args.table ?? "roots";
    const page = await ctx.db.query(table === "roots" ? "communityInteractionRoots" : "communityInteractionReplies")
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
      .paginate({ numItems: BACKFILL_BATCH, cursor: args.cursor ?? null });
    for (const row of page.page) {
      await syncCommunitySearchDoc(ctx, {
        communityId: args.communityId,
        objectType: table === "roots" ? "root" : "reply",
        objectId: row._id,
      });
    }
    const next = !page.isDone
      ? { communityId: args.communityId, table, cursor: page.continueCursor }
      : table === "roots" ? { communityId: args.communityId, table: "replies" as const, cursor: null } : null;
    if (next) await ctx.scheduler.runAfter(0, (internal as any).communitySearchDocs.backfillCommunitySearchDocsInternal, next);
    return { synced: page.page.length, next: next ? `${next.table}` : "done" };
  },
});

// Operator tool: starts the backfill for every community, a page at a time.
export const backfillAllCommunitySearchDocsInternal = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("communities").paginate({ numItems: 50, cursor: args.cursor ?? null });
    for (const community of page.page) {
      await ctx.scheduler.runAfter(0, (internal as any).communitySearchDocs.backfillCommunitySearchDocsInternal, { communityId: community._id });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, (internal as any).communitySearchDocs.backfillAllCommunitySearchDocsInternal, { cursor: page.continueCursor });
    }
    return { communities: page.page.length, done: page.isDone };
  },
});

// A search's author filter, by handle. Results are still re-checked, so a
// handle outside the community simply matches nothing.
export const resolveSearchAuthorInternal = internalQuery({
  args: { handle: v.string() },
  handler: async (ctx, args) => {
    const handle = args.handle.trim().replace(/^@/, "").toLowerCase();
    if (!handle) return null;
    const user = await ctx.db.query("users").withIndex("by_normalizedHandle", (q) => q.eq("normalizedHandle", handle)).first();
    return user?._id ?? null;
  },
});
