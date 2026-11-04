// Community notes: short markdown notes the community agent writes when it
// learns something worth sharing with everyone (shared/communityNotes.ts).
// Members and the agent read them under memory/; the founder can edit or
// delete them. Callers establish who may read or write before calling these.
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  buildCommunityNoteSearchText,
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
      ...(args.actorUserId ? { createdByUserId: args.actorUserId, updatedByUserId: args.actorUserId } : {}),
      createdAt: nowMs, updatedAt: nowMs,
    });
    return { ok: true, slug, title, created: true };
  }

  const slug = String(args.slug ?? "").trim();
  const existing = COMMUNITY_NOTE_SLUG_PATTERN.test(slug) ? await bySlug(slug) : null;
  if (!existing) return { ok: false, code: "semantic_not_found", message: "No note at that path. List memory/ for notes, or create one." };
  const title = args.mode === "update" ? normalizeCommunityNoteTitle(args.title) ?? existing.title : existing.title;
  const bodyMd = args.mode === "append" ? `${existing.bodyMd}\n\n${text}` : text;
  if (bodyMd.length > COMMUNITY_NOTE_BODY_MAX_CHARS) {
    return { ok: false, code: "note_full", slug,
      message: `That would make the note longer than ${COMMUNITY_NOTE_BODY_MAX_CHARS} characters. Shorten it with mode update, or start a new note.` };
  }
  await ctx.db.patch(existing._id, {
    title, bodyMd, searchText: buildCommunityNoteSearchText({ title, bodyMd }),
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
  },
  handler: async (ctx, args) => await writeCommunityNote(ctx, args),
});

// One-time copy of the old memory nodes members could read into notes, so
// nothing already learned is lost when the old memory pipeline goes. Paged and
// safe to repeat: a node already copied is skipped. Hand-run, dry run first:
//   npx convex run communityNotes:migrateMemoryNodesToNotesInternal '{"dryRun":true}'
const MIGRATABLE_STATUSES = new Set(["promising", "validated", "canonical", "contested", "stale"]);

export const migrateMemoryNodesToNotesInternal = internalMutation({
  args: { dryRun: v.boolean(), cursor: v.optional(v.union(v.string(), v.null())), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("communityIntelligenceNodes")
      .paginate({ cursor: args.cursor ?? null, numItems: Math.max(1, Math.min(200, Math.floor(args.limit ?? 100))) });
    let copied = 0;
    let skipped = 0;
    for (const node of page.page as any[]) {
      const readable = MIGRATABLE_STATUSES.has(node.status) && node.visibilityScope === "community"
        && (node.sourceVisibility ?? "community") === "community";
      const title = normalizeCommunityNoteTitle(node.title);
      const bodyMd = normalizeCommunityNoteBody(node.bodyMd);
      const already = await ctx.db.query("communityNotes").withIndex("by_migrated_node", (q) => q.eq("migratedFromNodeId", node._id)).first();
      if (!readable || !title || !bodyMd || already) { skipped += 1; continue; }
      let slug = communityNoteSlug(title);
      for (let n = 2; await ctx.db.query("communityNotes")
        .withIndex("by_community_slug", (q) => q.eq("communityId", node.communityId).eq("slug", slug)).first(); n += 1) {
        slug = `${communityNoteSlug(title).slice(0, 60)}-${n}`;
      }
      copied += 1;
      if (args.dryRun) continue;
      await ctx.db.insert("communityNotes", {
        communityId: node.communityId, slug, title, bodyMd, source: "migrated",
        searchText: buildCommunityNoteSearchText({ title, bodyMd }), migratedFromNodeId: node._id,
        createdAt: node.createdAt ?? node._creationTime, updatedAt: node.updatedAt ?? node.createdAt ?? node._creationTime,
      });
    }
    return { dryRun: args.dryRun, copied, skipped, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});
