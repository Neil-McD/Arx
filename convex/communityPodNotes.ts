// Pod knowledge (docs/specs/pods-v0.md, slice 3b): markdown notes that belong
// to one pod. The one-way wall is built in: pod notes live in their own table
// (communityPodNotes), so nothing that reads the community's notes, search,
// Home, the handbook or the agent's file system can show them. This module is
// the only reader and writer (scripts/community_pod_notes_wall.test.ts).
//
// Who reads: people who can enter the pod. Who writes: the pod's hosts and the
// builders. The only way out: a builder publishes a note to the community, on
// purpose, as a copy marked with the pod it came from.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";
import { requireCommunityChatAccess, requireCommunityManager } from "./communityCore";
import { requirePodEventManager as requirePodManager } from "./communityEventAudience";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import {
  buildCommunityNoteSearchText,
  communityNoteSlug,
  COMMUNITY_NOTES_MAX_PER_COMMUNITY,
  normalizeCommunityNoteBody,
  normalizeCommunityNoteTitle,
} from "../shared/communityNotes";

const POD_NOTES_MAX = 200;

const podArgs = { authSubject: v.optional(v.string()), communityId: v.id("communities"), channelId: v.id("communityChannels") };

// Someone who can enter this pod (the room's own read check).
async function podReader(ctx: any, args: { authSubject?: string; communityId: any; channelId: any }) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
  await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
  const channel = await ctx.db.get(args.channelId) as any;
  if (!channel || String(channel.communityId) !== String(args.communityId)
    || channel.accessMode !== "restricted" || channel.status !== "active") throw new Error("community_pod_not_found");
  const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
  if (!(await getCommunityChannelCapabilities({ ctx, channel, actor })).canRead) throw new Error("community_pod_not_found");
  return { userId, actor, channel };
}

async function podNotes(ctx: any, channelId: any) {
  return await ctx.db.query("communityPodNotes")
    .withIndex("by_channel_updatedAt", (q: any) => q.eq("channelId", channelId)).order("desc").take(POD_NOTES_MAX + 1);
}

async function podNote(ctx: any, channelId: any, slug: string) {
  return await ctx.db.query("communityPodNotes")
    .withIndex("by_channel_slug", (q: any) => q.eq("channelId", channelId).eq("slug", slug)).first();
}

export const listPodNotes = query({
  args: podArgs,
  handler: async (ctx, args) => {
    const { userId, actor } = await podReader(ctx, args);
    const canWrite = await requirePodManager(ctx, args.communityId, args.channelId, userId).then(() => true, () => false);
    const names = new Map<string, string | null>();
    const writer = async (id: any) => {
      if (!id) return null;
      const key = String(id);
      if (!names.has(key)) {
        const profile = await resolveUserProfileDisplayProjection(ctx, id);
        const user = await ctx.db.get(id) as { displayName?: string } | null;
        names.set(key, profile.display_name ?? user?.displayName ?? null);
      }
      return names.get(key) ?? null;
    };
    const rows = await podNotes(ctx, args.channelId);
    const notes = [];
    for (const row of rows.slice(0, POD_NOTES_MAX)) {
      notes.push({
        slug: row.slug, title: row.title, body_md: row.bodyMd,
        written_by: await writer(row.createdByUserId),
        created_at: new Date(row.createdAt).toISOString(),
        updated_at: new Date(row.updatedAt).toISOString(),
        published: Boolean(row.publishedSlug),
      });
    }
    // Publishing writes the community's own notes, which are the builder's.
    return { can_write: canWrite, can_publish: Boolean(actor.isManager), notes };
  },
});

// Write a pod note, or change one (slug). The pod's hosts and the builders.
export const savePodNote = mutation({
  args: { ...podArgs, slug: v.optional(v.string()), title: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await podReader(ctx, args);
    await requirePodManager(ctx, args.communityId, args.channelId, userId);
    const title = normalizeCommunityNoteTitle(args.title);
    const text = normalizeCommunityNoteBody(args.text);
    if (!title || !text) throw new Error("invalid_tool_args");
    const nowMs = Date.now();
    if (args.slug) {
      const row = await podNote(ctx, args.channelId, args.slug);
      if (!row) throw new Error("semantic_not_found");
      await ctx.db.patch(row._id, { title, bodyMd: text, updatedByUserId: userId, updatedAt: nowMs });
      return { slug: row.slug, title };
    }
    const existing = await podNotes(ctx, args.channelId);
    if (existing.length >= POD_NOTES_MAX) throw new Error("community_notes_full");
    const base = communityNoteSlug(title) || "note";
    const taken = new Set(existing.map((row: any) => row.slug));
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base.slice(0, 60)}-${n}`;
    await ctx.db.insert("communityPodNotes", {
      communityId: args.communityId, channelId: args.channelId, slug, title, bodyMd: text,
      createdByUserId: userId, updatedByUserId: userId, createdAt: nowMs, updatedAt: nowMs,
    });
    return { slug, title };
  },
});

export const deletePodNote = mutation({
  args: { ...podArgs, slug: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await podReader(ctx, args);
    await requirePodManager(ctx, args.communityId, args.channelId, userId);
    const row = await podNote(ctx, args.channelId, args.slug);
    // A copy already published to the community is the community's; it stays.
    if (row) await ctx.db.delete(row._id);
    return { deleted: Boolean(row) };
  },
});

// The only way out of a pod: a builder publishes a note to the community, as
// a copy marked with the pod it came from. Publishing again updates that copy.
export const publishPodNote = mutation({
  args: { ...podArgs, slug: v.string() },
  handler: async (ctx, args) => {
    const { userId, channel } = await podReader(ctx, args);
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const row = await podNote(ctx, args.channelId, args.slug);
    if (!row) throw new Error("semantic_not_found");
    const nowMs = Date.now();
    const fields = {
      title: row.title, bodyMd: row.bodyMd, searchText: buildCommunityNoteSearchText({ title: row.title, bodyMd: row.bodyMd }),
      fromPodName: String(channel.name ?? ""), updatedByUserId: userId, updatedAt: nowMs,
    };
    const published = row.publishedSlug
      ? await ctx.db.query("communityNotes").withIndex("by_community_slug", (q) => q.eq("communityId", args.communityId).eq("slug", row.publishedSlug!)).first()
      : null;
    if (published) {
      await ctx.db.patch(published._id, fields);
      await ctx.db.patch(row._id, { publishedAt: nowMs });
      return { slug: published.slug };
    }
    const existing = await ctx.db.query("communityNotes")
      .withIndex("by_community_updatedAt", (q) => q.eq("communityId", args.communityId)).take(COMMUNITY_NOTES_MAX_PER_COMMUNITY + 1);
    if (existing.length >= COMMUNITY_NOTES_MAX_PER_COMMUNITY) throw new Error("community_notes_full");
    const base = communityNoteSlug(row.title) || "note";
    const taken = new Set(existing.map((note) => note.slug));
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base.slice(0, 60)}-${n}`;
    await ctx.db.insert("communityNotes", { communityId: args.communityId, slug, source: "founder", createdByUserId: userId, createdAt: nowMs, ...fields });
    await ctx.db.patch(row._id, { publishedSlug: slug, publishedAt: nowMs });
    return { slug };
  },
});
