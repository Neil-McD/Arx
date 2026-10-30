import { v } from "convex/values";

// Stored shape of shared/communityLessonContract.ts CommunityLessonFields.
export const communityLessonFieldsValidator = v.object({
  kind: v.optional(
    v.union(
      v.literal("lesson"),
      v.literal("build"),
      v.literal("checkpoint"),
      v.literal("prompt"),
      v.literal("skill"),
      v.literal("video"),
      v.literal("doc"),
    ),
  ),
  stage: v.optional(v.string()),
  stage_order: v.optional(v.number()),
  order: v.optional(v.number()),
  minutes: v.optional(v.number()),
  video_url: v.optional(v.string()),
  gate: v.optional(v.boolean()),
  summary: v.optional(v.string()),
});
