import { v } from "convex/values";
export const communityFormQuestionValidator = v.object({
  key: v.string(), title: v.string(), description: v.string(), required: v.boolean(),
  type: v.union(v.literal("short_text"), v.literal("long_text"), v.literal("single_choice"), v.literal("multiple_choice")),
  options: v.array(v.string()),
  /** The client property a submitted answer fills, when the builder maps one. */
  clientPropertyKey: v.optional(v.string()),
});
