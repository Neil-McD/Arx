// Community notes: short markdown notes the community agent writes when it
// learns something worth sharing with everyone (shared/communityNotes.ts).
// Members and the agent read them under memory/; the founder can edit or
// delete them. Callers establish who may read or write before calling these.
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireCommunityChatAccess, requireCommunityManager } from "./communityCore";
import {
  buildCommunityNoteSearchText,
  communityNoteSourceWords,
  COMMUNITY_NOTE_BODY_MAX_CHARS,
  COMMUNITY_NOTE_SLUG_PATTERN,
  COMMUNITY_NOTES_MAX_PER_COMMUNITY,
  communityNoteSlug,
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

// Whether a channel is a restricted room, for marking what an agent turn read.
export const isRestrictedChannelInternal = internalQuery({
  args: { communitySlug: v.string(), channelSlug: v.string() },
  handler: async (ctx, args) => {
    const community = await ctx.db.query("communities").withIndex("by_slug", (q: any) => q.eq("slug", args.communitySlug)).first();
    if (!community) return false;
    const channel = await ctx.db.query("communityChannels")
      .withIndex("by_community_slug", (q: any) => q.eq("communityId", community._id).eq("slug", args.channelSlug)).first();
    return channel?.accessMode === "restricted";
  },
});

export type CommunityNoteWriteResult =
  | { ok: true; slug: string; title: string; created: boolean }
  | { ok: false; code: string; message: string; slug?: string };

// One write: start a note, add to one, or replace one's text. The caller has
// already decided this principal may write notes on this turn.
export async function writeCommunityNote(ctx: any, args: {
  communityId: any;
  mode: "create" | "append" | "update";
  slug?: string | null;
  title?: string | null;
  text: string;
  source: "ask" | "tag" | "founder";
  actorUserId?: any;
  // The caller's retry key: a write already applied under it is not applied again.
  operationKey?: string;
  nowMs?: number;
}): Promise<CommunityNoteWriteResult> {
  const nowMs = args.nowMs ?? Date.now();
  const text = normalizeCommunityNoteBody(args.text);
  if (!text) return { ok: false, code: "invalid_tool_args", message: "Give the note's text in content.text." };
  const bySlug = (slug: string) => ctx.db.query("communityNotes")
    .withIndex("by_community_slug", (q: any) => q.eq("communityId", args.communityId).eq("slug", slug)).first();

  if (args.mode === "create") {
    const title = normalizeCommunityNoteTitle(args.title);
    if (!title) return { ok: false, code: "invalid_tool_args", message: "Give the note a short title in content.title." };
    const slug = communityNoteSlug(title);
    const existing = await bySlug(slug);
    if (existing && args.operationKey && existing.lastOperationKey === args.operationKey) {
      return { ok: true, slug, title: existing.title, created: true };
    }
    if (existing) {
      return { ok: false, code: "note_exists", slug,
        message: `A note called "${existing.title}" already exists. Read memory/${slug}.md and append to it instead.` };
    }
    const count = (await ctx.db.query("communityNotes")
      .withIndex("by_community_updatedAt", (q: any) => q.eq("communityId", args.communityId))
      .take(COMMUNITY_NOTES_MAX_PER_COMMUNITY)).length;
    if (count >= COMMUNITY_NOTES_MAX_PER_COMMUNITY) {
      return { ok: false, code: "notes_full", message: "This community has as many notes as it can hold. Add to an existing note instead." };
    }
    await ctx.db.insert("communityNotes", {
      communityId: args.communityId, slug, title, bodyMd: text, source: args.source,
      searchText: buildCommunityNoteSearchText({ title, bodyMd: text }),
      ...(args.operationKey ? { lastOperationKey: args.operationKey } : {}),
      ...(args.actorUserId ? { createdByUserId: args.actorUserId, updatedByUserId: args.actorUserId } : {}),
      createdAt: nowMs, updatedAt: nowMs,
    });
    return { ok: true, slug, title, created: true };
  }

  const slug = String(args.slug ?? "").trim();
  const existing = COMMUNITY_NOTE_SLUG_PATTERN.test(slug) ? await bySlug(slug) : null;
  if (!existing) return { ok: false, code: "semantic_not_found", message: "No note at that path. List memory/ for notes, or create one." };
  if (args.operationKey && existing.lastOperationKey === args.operationKey) {
    return { ok: true, slug, title: existing.title, created: false };
  }
  const title = args.mode === "update" ? normalizeCommunityNoteTitle(args.title) ?? existing.title : existing.title;
  const bodyMd = args.mode === "append" ? `${existing.bodyMd}\n\n${text}` : text;
  if (bodyMd.length > COMMUNITY_NOTE_BODY_MAX_CHARS) {
    return { ok: false, code: "note_full", slug,
      message: `That would make the note longer than ${COMMUNITY_NOTE_BODY_MAX_CHARS} characters. Shorten it with mode update, or start a new note.` };
  }
  await ctx.db.patch(existing._id, {
    title, bodyMd, searchText: buildCommunityNoteSearchText({ title, bodyMd }),
    ...(args.operationKey ? { lastOperationKey: args.operationKey } : {}),
    ...(args.actorUserId ? { updatedByUserId: args.actorUserId } : {}),
    updatedAt: nowMs,
  });
  return { ok: true, slug, title, created: false };
}

export const writeCommunityNoteInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    mode: v.union(v.literal("create"), v.literal("append"), v.literal("update")),
    slug: v.optional(v.string()),
    title: v.optional(v.string()),
    text: v.string(),
    source: v.union(v.literal("ask"), v.literal("tag"), v.literal("founder")),
    actorUserId: v.optional(v.id("users")),
    operationKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => await writeCommunityNote(ctx, args),
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
    const result = await writeCommunityNote(ctx, {
      communityId: args.communityId, mode: "update", slug: args.slug, title: args.title, text: args.text,
      source: "founder", actorUserId: userId,
    });
    if (!result.ok) throw new Error(result.code);
    return { slug: result.slug, title: result.title };
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
