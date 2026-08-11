import { v } from "convex/values";

export const communityFunnelThemeV1Validator = v.object({
  // Legacy light/dark snapshots remain schema-readable until their next
  // validated write canonicalizes them to inherit.
  appearance: v.union(
    v.literal("inherit"),
    v.literal("light"),
    v.literal("dark"),
  ),
  character: v.union(
    v.literal("minimal"),
    v.literal("editorial"),
    v.literal("cinematic"),
  ),
  accent: v.union(
    v.literal("blue"),
    v.literal("violet"),
    v.literal("rose"),
    v.literal("amber"),
    v.literal("emerald"),
  ),
  density: v.union(
    v.literal("compact"),
    v.literal("balanced"),
    v.literal("airy"),
  ),
  radius: v.union(v.literal("subtle"), v.literal("soft")),
});

export const communityFunnelSectionV1Validator = v.union(
  v.object({
    id: v.string(),
    type: v.literal("hero"),
    eyebrow: v.union(v.string(), v.null()),
    headline: v.string(),
    body: v.string(),
    alignment: v.union(v.literal("left"), v.literal("center")),
  }),
  v.object({
    id: v.string(),
    type: v.literal("media"),
    media_url: v.union(v.string(), v.null()),
    caption: v.union(v.string(), v.null()),
  }),
  v.object({
    id: v.string(),
    type: v.literal("benefits"),
    heading: v.union(v.string(), v.null()),
    items: v.array(v.object({ title: v.string(), body: v.string() })),
  }),
  v.object({
    id: v.string(),
    type: v.literal("social_proof"),
    headline: v.union(v.string(), v.null()),
    body: v.union(v.string(), v.null()),
  }),
  v.object({
    id: v.string(),
    type: v.literal("testimonial"),
    quote: v.string(),
    attribution: v.string(),
  }),
  v.object({
    id: v.string(),
    type: v.literal("faq"),
    heading: v.union(v.string(), v.null()),
    items: v.array(v.object({ question: v.string(), answer: v.string() })),
  }),
  v.object({
    id: v.string(),
    type: v.literal("cta"),
    headline: v.string(),
    body: v.union(v.string(), v.null()),
  }),
);

export const communityFunnelDocumentV1Validator = v.object({
  version: v.literal(1),
  theme: communityFunnelThemeV1Validator,
  sections: v.array(communityFunnelSectionV1Validator),
});

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
