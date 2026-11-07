// Tags on people were never used and were deleted Nov 7. These four stand in
// for the cached production client only: it reads no tags and can't make one.
// Delete this module once the compatibility contract is re-pinned past this release.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const viewerArgs = { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), communityId: v.id("communities") };

export const listCommunityTags = query({
  args: viewerArgs,
  handler: async () => ({ can_manage: false, tags: [] as never[] }),
});

export const listCommunityMemberTags = query({
  args: { ...viewerArgs, targetUserIds: v.array(v.id("users")) },
  handler: async () => ({}),
});

export const createCommunityTag = mutation({
  args: { ...viewerArgs, name: v.string() },
  handler: async (): Promise<never> => {
    throw new Error("community_tags_retired");
  },
});

export const setCommunityMemberTags = mutation({
  args: { ...viewerArgs, tag: v.string(), targetUserIds: v.array(v.id("users")), on: v.boolean() },
  handler: async (): Promise<never> => {
    throw new Error("community_tags_retired");
  },
});
