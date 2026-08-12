import { v } from "convex/values";

export const communityFunnelContentV2Validator = v.object({
  version: v.literal(2),
  headline: v.string(),
  subheadline: v.string(),
  pillars: v.array(
    v.object({
      title: v.string(),
      body: v.string(),
    }),
  ),
  long_form_markdown: v.string(),
});
