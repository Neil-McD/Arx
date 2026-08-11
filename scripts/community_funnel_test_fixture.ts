import type {
  CommunityFunnelContentV2,
  CommunityFunnelDocumentV1,
} from "../shared/communityTypes";

export function buildCommunityFunnelContentTestFixture(params?: {
  headline?: string;
  subheadline?: string;
  longFormMarkdown?: string;
}): CommunityFunnelContentV2 {
  return {
    version: 2,
    headline: params?.headline ?? "Build together",
    subheadline:
      params?.subheadline ?? "A bounded community funnel test fixture.",
    pillars: [
      { title: "Learn together", body: "Share grounded knowledge." },
      { title: "Remember context", body: "Carry useful context forward." },
      { title: "Act together", body: "Turn insight into coordinated action." },
    ],
    long_form_markdown:
      params?.longFormMarkdown ??
      "## Built for serious collaboration\n\nJoin a focused community with a clear shared outcome.",
  };
}

export function buildCommunityFunnelDocumentTestFixture(params?: {
  headline?: string;
  body?: string;
}): CommunityFunnelDocumentV1 {
  const headline = params?.headline ?? "Build together";
  const body = params?.body ?? "A bounded community funnel test fixture.";
  return {
    version: 1,
    theme: {
      appearance: "inherit",
      character: "editorial",
      accent: "blue",
      density: "balanced",
      radius: "soft",
    },
    sections: [
      {
        id: "hero",
        type: "hero",
        eyebrow: null,
        headline,
        body,
        alignment: "center",
      },
      {
        id: "cta",
        type: "cta",
        headline: "Join the community",
        body: null,
      },
    ],
  };
}
