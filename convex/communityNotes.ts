// Community notes: short markdown notes every member and the community agent
// read under memory/. Only the founder (owners and admins, in Studio) edits or
// deletes them; no agent, member or connected AI writes them (Nov 5: closed
// both a private-room leak path and a shared-memory injection path).
import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireCommunityChatAccess, requireCommunityManager } from "./communityCore";
import {
  buildCommunityNoteSearchText,
  communityNoteSourceWords,
  COMMUNITY_NOTES_MAX_PER_COMMUNITY,
  normalizeCommunityNoteBody,
  normalizeCommunityNoteTitle,
} from "../shared/communityNotes";
import { buildCommunitySearchQuery } from "../shared/communitySearchText";

const LIST_LIMIT_MAX = 50;
const SEARCH_LIMIT_MAX = 20;
const SNIPPET_CHARS = 240;


function noteSummary(row: any) {
  return { slug: row.slug, title: row.title, source: row.source, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export function noteSnippet(bodyMd: string, query: string): string {
  const text = String(bodyMd ?? "").replace(/\s+/g, " ").trim();
  const word = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).find((w) => w.length > 2 && text.toLowerCase().includes(w));
  const at = word ? Math.max(0, text.toLowerCase().indexOf(word) - 60) : 0;
  const slice = text.slice(at, at + SNIPPET_CHARS);
  return `${at > 0 ? "…" : ""}${slice}${at + SNIPPET_CHARS < text.length ? "…" : ""}`;
}

export const listCommunityNotesInternal = internalQuery({
  args: { communityId: v.id("communities"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(LIST_LIMIT_MAX, Math.floor(args.limit ?? 20)));
    const rows = await ctx.db.query("communityNotes")
      .withIndex("by_community_updatedAt", (q) => q.eq("communityId", args.communityId))
      .order("desc").take(limit + 1);
    return { notes: rows.slice(0, limit).map(noteSummary), hasMore: rows.length > limit };
  },
});

export const readCommunityNoteInternal = internalQuery({
  args: { communityId: v.id("communities"), slug: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("communityNotes")
      .withIndex("by_community_slug", (q) => q.eq("communityId", args.communityId).eq("slug", args.slug)).first();
    return row ? { ...noteSummary(row), bodyMd: row.bodyMd } : null;
  },
});

export const searchCommunityNotesInternal = internalQuery({
  args: { communityId: v.id("communities"), query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(SEARCH_LIMIT_MAX, Math.floor(args.limit ?? 8)));
    const searchQuery = buildCommunitySearchQuery(args.query);
    if (!searchQuery) return { notes: [] };
    const rows = await ctx.db.query("communityNotes")
      .withSearchIndex("search_text", (q) => q.search("searchText", searchQuery).eq("communityId", args.communityId))
      .take(limit);
    return { notes: rows.map((row) => ({ ...noteSummary(row), snippet: noteSnippet(row.bodyMd, args.query) })) };
  },
});

// Studio: every member reads the notes; owners and admins edit or delete them.
const viewerArgs = { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), communityId: v.id("communities") };

async function viewer(ctx: any, args: { userId?: any; authSubject?: string; communityId: any }) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
  await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
  const canManage = await requireCommunityManager({ ctx, communityId: args.communityId, userId }).then(() => true, () => false);
  return { userId, canManage };
}

export const listCommunityNotes = query({
  args: { ...viewerArgs, limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { canManage } = await viewer(ctx, args);
    const limit = Math.max(1, Math.min(COMMUNITY_NOTES_MAX_PER_COMMUNITY, Math.floor(args.limit ?? 100)));
    const rows = await ctx.db.query("communityNotes")
      .withIndex("by_community_updatedAt", (q) => q.eq("communityId", args.communityId)).order("desc").take(limit + 1);
    return {
      can_manage: canManage,
      has_more: rows.length > limit,
      notes: rows.slice(0, limit).map((row) => ({
        slug: row.slug, title: row.title, body_md: row.bodyMd, source: communityNoteSourceWords(row.source),
        updated_at: new Date(row.updatedAt).toISOString(),
      })),
    };
  },
});

export const updateCommunityNote = mutation({
  args: { ...viewerArgs, slug: v.string(), title: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const { userId, canManage } = await viewer(ctx, args);
    if (!canManage) throw new Error("community_forbidden");
    const text = normalizeCommunityNoteBody(args.text);
    if (!text) throw new Error("invalid_tool_args");
    const row = await ctx.db.query("communityNotes")
      .withIndex("by_community_slug", (q) => q.eq("communityId", args.communityId).eq("slug", args.slug)).first();
    if (!row) throw new Error("semantic_not_found");
    const title = normalizeCommunityNoteTitle(args.title) ?? row.title;
    await ctx.db.patch(row._id, {
      title, bodyMd: text, searchText: buildCommunityNoteSearchText({ title, bodyMd: text }), updatedByUserId: userId, updatedAt: Date.now(),
    });
    return { slug: row.slug, title };
  },
});

export const deleteCommunityNote = mutation({
  args: { ...viewerArgs, slug: v.string() },
  handler: async (ctx, args) => {
    const { canManage } = await viewer(ctx, args);
    if (!canManage) throw new Error("community_forbidden");
    const row = await ctx.db.query("communityNotes")
      .withIndex("by_community_slug", (q) => q.eq("communityId", args.communityId).eq("slug", args.slug)).first();
    if (row) await ctx.db.delete(row._id);
    return { deleted: Boolean(row) };
  },
});
