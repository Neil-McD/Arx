// Community notes: short markdown notes every member and the community agent
// read under memory/. Only the founder (owners and admins, in Studio) edits or
// deletes them; no agent, member or connected AI writes them (Nov 5: closed
// both a private-room leak path and a shared-memory injection path).
import { communityScopeKey, insertNote, noteBySlug, notesByUpdated, podScopeKey, searchNotes } from "./communityNotesStore";
import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireCommunityChatAccess, requireCommunityManager } from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import {
  buildCommunityNoteSearchText,
  communityNoteSlug,
  communityNoteSourceWords,
  COMMUNITY_NOTES_MAX_PER_COMMUNITY,
  normalizeCommunityNoteBody,
  normalizeCommunityNoteTitle,
} from "../shared/communityNotes";
import { buildCommunitySearchQuery } from "../shared/communitySearchText";
import { noteAuthorKind } from "../shared/communityMemory";
import { removeGuideNote } from "./communityMemory";

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

// The scope a reader names: the community's notes, or one of its pods' (its
// room, checked to be this community's; the caller checked the reader may
// see inside it).
async function noteScope(ctx: any, communityId: any, podRoomId?: string) {
  if (!podRoomId) return communityScopeKey(communityId);
  const id = ctx.db.normalizeId("communityChannels", podRoomId);
  const room = id ? await ctx.db.get(id) : null;
  return room && String(room.communityId) === String(communityId) && room.accessMode === "restricted" ? podScopeKey(room._id) : null;
}

export const listCommunityNotesInternal = internalQuery({
  args: { communityId: v.id("communities"), limit: v.optional(v.number()), podRoomId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(LIST_LIMIT_MAX, Math.floor(args.limit ?? 20)));
    const scope = await noteScope(ctx, args.communityId, args.podRoomId);
    if (!scope) return { notes: [], hasMore: false };
    const rows = await notesByUpdated(ctx, scope).order("desc").take(limit + 1);
    return { notes: rows.slice(0, limit).map(noteSummary), hasMore: rows.length > limit };
  },
});

export const readCommunityNoteInternal = internalQuery({
  args: { communityId: v.id("communities"), slug: v.string(), podRoomId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const scope = await noteScope(ctx, args.communityId, args.podRoomId);
    if (!scope) return null;
    const row = await noteBySlug(ctx, scope, args.slug);
    return row ? { ...noteSummary(row), bodyMd: row.bodyMd } : null;
  },
});

export const searchCommunityNotesInternal = internalQuery({
  args: { communityId: v.id("communities"), query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(SEARCH_LIMIT_MAX, Math.floor(args.limit ?? 8)));
    const searchQuery = buildCommunitySearchQuery(args.query);
    if (!searchQuery) return { notes: [] };
    const rows = await searchNotes(ctx, communityScopeKey(args.communityId), searchQuery).take(limit);
    return { notes: rows.map((row: any) => ({ ...noteSummary(row), snippet: noteSnippet(row.bodyMd, args.query) })) };
  },
});

// Notes are the guide's memory (Neil, Nov 14): owners and admins read, edit and
// delete them. A member asks the guide; they are never handed the list.
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
    if (!canManage) return { can_manage: false, has_more: false, notes: [] };
    const limit = Math.max(1, Math.min(COMMUNITY_NOTES_MAX_PER_COMMUNITY, Math.floor(args.limit ?? 100)));
    const rows = await notesByUpdated(ctx, communityScopeKey(args.communityId)).order("desc").take(limit + 1);
    // Knowledge says who wrote a note only when a host wrote it; a note saved
    // from someone's conversation never names them.
    const names = new Map<string, string | null>();
    const writer = async (row: any) => {
      if (row.source !== "founder" || !row.createdByUserId) return null;
      const key = String(row.createdByUserId);
      if (!names.has(key)) {
        const profile = await resolveUserProfileDisplayProjection(ctx, row.createdByUserId);
        const user = await ctx.db.get(row.createdByUserId) as { displayName?: string } | null;
        names.set(key, profile.display_name ?? user?.displayName ?? null);
      }
      return names.get(key) ?? null;
    };
    const notes = [];
    for (const row of rows.slice(0, limit)) {
      notes.push({
        slug: row.slug, title: row.title, body_md: row.bodyMd, source: communityNoteSourceWords(row.source),
        kind: row.source, written_by: await writer(row), from_pod: row.fromPodName ?? null,
        author_kind: noteAuthorKind(row), evidence_count: row.evidenceRefs?.length ?? 0,
        created_at: new Date(row.createdAt).toISOString(),
        updated_at: new Date(row.updatedAt).toISOString(),
      });
    }
    return { can_manage: canManage, has_more: rows.length > limit, notes };
  },
});

export const updateCommunityNote = mutation({
  args: { ...viewerArgs, slug: v.string(), title: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const { userId, canManage } = await viewer(ctx, args);
    if (!canManage) throw new Error("community_forbidden");
    const text = normalizeCommunityNoteBody(args.text);
    if (!text) throw new Error("invalid_tool_args");
    const row = await noteBySlug(ctx, communityScopeKey(args.communityId), args.slug);
    if (!row) throw new Error("semantic_not_found");
    const title = normalizeCommunityNoteTitle(args.title) ?? row.title;
    // A builder's correction makes the note theirs: the guide won't change it again.
    await ctx.db.patch(row._id, {
      title, bodyMd: text, searchText: buildCommunityNoteSearchText({ title, bodyMd: text }), updatedByUserId: userId, updatedAt: Date.now(),
      authorKind: "builder",
    });
    return { slug: row.slug, title };
  },
});

// A host writes a note in Studio (Knowledge's New note).
export const createCommunityNote = mutation({
  args: { ...viewerArgs, title: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const { userId, canManage } = await viewer(ctx, args);
    if (!canManage) throw new Error("community_forbidden");
    const title = normalizeCommunityNoteTitle(args.title);
    const text = normalizeCommunityNoteBody(args.text);
    if (!title || !text) throw new Error("invalid_tool_args");
    const scope = communityScopeKey(args.communityId);
    const existing = await notesByUpdated(ctx, scope).take(COMMUNITY_NOTES_MAX_PER_COMMUNITY + 1);
    if (existing.length >= COMMUNITY_NOTES_MAX_PER_COMMUNITY) throw new Error("community_notes_full");
    const base = communityNoteSlug(title) || "note";
    const taken = new Set<string>(existing.map((row: any) => row.slug));
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base.slice(0, 60)}-${n}`;
    const nowMs = Date.now();
    await insertNote(ctx, scope, {
      communityId: args.communityId, slug, title, bodyMd: text, source: "founder",
      searchText: buildCommunityNoteSearchText({ title, bodyMd: text }),
      createdByUserId: userId, updatedByUserId: userId, createdAt: nowMs, updatedAt: nowMs,
    });
    return { slug, title };
  },
});

export const deleteCommunityNote = mutation({
  args: { ...viewerArgs, slug: v.string() },
  handler: async (ctx, args) => {
    const { userId, canManage } = await viewer(ctx, args);
    if (!canManage) throw new Error("community_forbidden");
    const row = await noteBySlug(ctx, communityScopeKey(args.communityId), args.slug);
    // A guide note's posts are remembered, so they don't bring it back.
    if (row && noteAuthorKind(row) === "guide") await removeGuideNote(ctx, row, userId, Date.now());
    else if (row) await ctx.db.delete(row._id);
    return { deleted: Boolean(row) };
  },
});
