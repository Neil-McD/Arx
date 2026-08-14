import { v } from "convex/values";

export const communityWeeklyDigestSnapshotItemValidator = v.object({
  title: v.string(),
  summary: v.optional(v.string()),
  meta: v.optional(v.string()),
  tab: v.union(v.literal("chat"), v.literal("resources")),
});

export const communityWeeklyDigestSnapshotValidator = v.object({
  communityName: v.string(),
  communitySlug: v.string(),
  dateLabel: v.string(),
  intro: v.string(),
  items: v.array(communityWeeklyDigestSnapshotItemValidator),
});
