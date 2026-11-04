// Tags: an owner's labels on people ("beginner", "coach", "cohort 3"). Owners
// and admins create, rename and delete them and tag people; moderators read
// them; members and the community agent never see them. Studio and a person's
// own AI (the MCP) use the same functions here.
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireCommunityManager, requireCommunityModerator } from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";

export const COMMUNITY_TAGS_MAX = 100;
export const COMMUNITY_TAG_NAME_MAX = 40;
// A tag on more people than this is untagged in pieces before it can be deleted.
const TAG_DELETE_MAX_PEOPLE = 4_000;
const TAG_MEMBERS_PAGE_MAX = 100;

export function communityTagSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, COMMUNITY_TAG_NAME_MAX);
}

function tagName(raw: unknown): string | null {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  return name && name.length <= COMMUNITY_TAG_NAME_MAX && communityTagSlug(name) ? name : null;
}

async function findTag(ctx: any, communityId: any, slug: string) {
  return await ctx.db.query("communityTags")
    .withIndex("by_community_slug", (q: any) => q.eq("communityId", communityId).eq("slug", String(slug ?? "").trim()))
    .first();
}

async function requireTag(ctx: any, communityId: any, slug: string) {
  const tag = await findTag(ctx, communityId, slug);
  if (!tag) throw new Error("community_tag_not_found");
  return tag;
}

async function activeMembership(ctx: any, communityId: any, userId: any) {
  const row = await ctx.db.query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).first();
  return row && row.active === true ? row : null;
}

// One read per tag: each tag keeps its own count of people.
async function listTags(ctx: any, communityId: any) {
  const tags = await ctx.db.query("communityTags")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId)).take(COMMUNITY_TAGS_MAX);
  return tags.map((tag: any) => ({ slug: tag.slug, name: tag.name, people: Math.max(0, tag.peopleCount ?? 0) }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name));
}

async function tagsForUsers(ctx: any, communityId: any, userIds: any[]) {
  const names = new Map<string, { slug: string; name: string }>();
  const out: Record<string, Array<{ slug: string; name: string }>> = {};
  for (const userId of userIds.slice(0, TAG_MEMBERS_PAGE_MAX)) {
    const rows = await ctx.db.query("communityMemberTags")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).take(COMMUNITY_TAGS_MAX);
    const tags = [];
    for (const row of rows) {
      const key = String(row.tagId);
      if (!names.has(key)) {
        const tag = await ctx.db.get(row.tagId);
        if (tag) names.set(key, { slug: tag.slug, name: tag.name });
      }
      const tag = names.get(key);
      if (tag) tags.push(tag);
    }
    out[String(userId)] = tags.sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}

async function createTag(ctx: any, userId: any, communityId: any, rawName: unknown) {
  const name = tagName(rawName);
  if (!name) throw new Error("community_tag_name_invalid");
  const slug = communityTagSlug(name);
  const existing = await findTag(ctx, communityId, slug);
  if (existing) return { slug: existing.slug, name: existing.name, created: false };
  const count = (await ctx.db.query("communityTags")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId)).take(COMMUNITY_TAGS_MAX)).length;
  if (count >= COMMUNITY_TAGS_MAX) throw new Error("community_tags_full");
  const nowMs = Date.now();
  await ctx.db.insert("communityTags", { communityId, slug, name, peopleCount: 0, createdByUserId: userId, createdAt: nowMs, updatedAt: nowMs });
  return { slug, name, created: true };
}

async function renameTag(ctx: any, communityId: any, slug: string, rawName: unknown) {
  const tag = await requireTag(ctx, communityId, slug);
  const name = tagName(rawName);
  if (!name) throw new Error("community_tag_name_invalid");
  const nextSlug = communityTagSlug(name);
  const clash = nextSlug !== tag.slug ? await findTag(ctx, communityId, nextSlug) : null;
  if (clash) throw new Error("community_tag_exists");
  await ctx.db.patch(tag._id, { name, slug: nextSlug, updatedAt: Date.now() });
  return { slug: nextSlug, name };
}

async function deleteTag(ctx: any, communityId: any, slug: string) {
  const tag = await findTag(ctx, communityId, slug);
  if (!tag) return { deleted: false };
  const people = await ctx.db.query("communityMemberTags")
    .withIndex("by_tag_user", (q: any) => q.eq("tagId", tag._id)).take(TAG_DELETE_MAX_PEOPLE + 1);
  if (people.length > TAG_DELETE_MAX_PEOPLE) throw new Error("community_tag_too_large_to_delete");
  for (const row of people) await ctx.db.delete(row._id);
  await ctx.db.delete(tag._id);
  return { deleted: true };
}

// Read fresh each time: one transaction may tag many people.
async function adjustPeopleCount(ctx: any, tagId: any, by: number) {
  const tag = await ctx.db.get(tagId);
  if (tag) await ctx.db.patch(tagId, { peopleCount: Math.max(0, (tag.peopleCount ?? 0) + by) });
}

// Tagging needs a current member; untagging works for anyone (a person who left keeps no stale label).
async function setMemberTag(ctx: any, communityId: any, tag: any, targetUserId: any, on: boolean) {
  const existing = await ctx.db.query("communityMemberTags")
    .withIndex("by_tag_user", (q: any) => q.eq("tagId", tag._id).eq("userId", targetUserId)).first();
  if (on && !existing) {
    if (!(await activeMembership(ctx, communityId, targetUserId))) throw new Error("community_member_not_found");
    await ctx.db.insert("communityMemberTags", { communityId, tagId: tag._id, userId: targetUserId, createdAt: Date.now() });
    await adjustPeopleCount(ctx, tag._id, 1);
  } else if (!on && existing) {
    await ctx.db.delete(existing._id);
    await adjustPeopleCount(ctx, tag._id, -1);
  }
  return { tagged: on };
}

// Trusted variants: the caller (the MCP door) already authenticated userId.
const trusted = { userId: v.id("users"), communityId: v.id("communities") };

export const listCommunityTagsForTrustedReviewerInternal = internalQuery({
  args: trusted,
  handler: async (ctx, args) => {
    await requireCommunityModerator({ ctx, communityId: args.communityId, userId: args.userId });
    return await listTags(ctx, args.communityId);
  },
});

export const listCommunityTagMembersForTrustedReviewerInternal = internalQuery({
  args: { ...trusted, tag: v.string(), cursor: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireCommunityModerator({ ctx, communityId: args.communityId, userId: args.userId });
    const tag = await requireTag(ctx, args.communityId, args.tag);
    const page = await ctx.db.query("communityMemberTags")
      .withIndex("by_tag_user", (q: any) => q.eq("tagId", tag._id))
      .paginate({ cursor: args.cursor ?? null, numItems: Math.max(1, Math.min(TAG_MEMBERS_PAGE_MAX, Math.floor(args.limit ?? 50))) });
    const members = [];
    for (const row of page.page) {
      const user = await ctx.db.get(row.userId);
      const display = await resolveUserProfileDisplayProjection(ctx, row.userId);
      members.push({ ref: `user:${row.userId}`, name: display?.display_name ?? null, handle: (user as any)?.handle ?? null });
    }
    return { tag: { slug: tag.slug, name: tag.name }, members, nextCursor: page.isDone ? null : page.continueCursor };
  },
});

export const communityTagsForUsersForTrustedReviewerInternal = internalQuery({
  args: { ...trusted, userIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    await requireCommunityModerator({ ctx, communityId: args.communityId, userId: args.userId });
    return await tagsForUsers(ctx, args.communityId, args.userIds);
  },
});

export const createCommunityTagForTrustedUserInternal = internalMutation({
  args: { ...trusted, name: v.string() },
  handler: async (ctx, args) => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    return await createTag(ctx, args.userId, args.communityId, args.name);
  },
});

export const renameCommunityTagForTrustedUserInternal = internalMutation({
  args: { ...trusted, tag: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    return await renameTag(ctx, args.communityId, args.tag, args.name);
  },
});

export const deleteCommunityTagForTrustedUserInternal = internalMutation({
  args: { ...trusted, tag: v.string() },
  handler: async (ctx, args) => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    return await deleteTag(ctx, args.communityId, args.tag);
  },
});

export const setCommunityMemberTagForTrustedUserInternal = internalMutation({
  args: { ...trusted, tag: v.string(), targetUserId: v.id("users"), on: v.boolean() },
  handler: async (ctx, args) => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    const tag = await requireTag(ctx, args.communityId, args.tag);
    return await setMemberTag(ctx, args.communityId, tag, args.targetUserId, args.on);
  },
});
