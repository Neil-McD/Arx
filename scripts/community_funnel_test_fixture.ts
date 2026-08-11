import type { CommunityFunnelDocumentV1 } from "../shared/communityTypes";

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
