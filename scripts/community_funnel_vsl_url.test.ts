import { describe, expect, it } from "vitest";

import {
  isSupportedCommunityFunnelVideoUrl,
  normalizeCommunityFunnelVslUrl,
} from "../shared/communityFunnel";

describe("community funnel VSL URL contract", () => {
  it.each([
    "https://www.youtube.com/watch?v=abcdefghijk",
    "https://youtu.be/abcdefghijk",
    "https://www.youtube-nocookie.com/embed/abcdefghijk",
    "https://vimeo.com/123456789",
    "https://www.loom.com/share/abcdefghijk",
    "https://fast.wistia.net/embed/iframe/abcdefghijk",
  ])("accepts supported HTTPS video URLs: %s", (url) => {
    expect(isSupportedCommunityFunnelVideoUrl(url)).toBe(true);
    expect(normalizeCommunityFunnelVslUrl(url)).toBe(url);
  });

  it.each([
    "youtube.com/watch?v=abcdefghijk",
    "http://youtube.com/watch?v=abcdefghijk",
    "https://youtube.com/",
    "https://vimeo.com/channels/staffpicks",
    "https://example.com/video",
    "not a URL",
  ])("rejects unsupported or ambiguous URLs: %s", (url) => {
    expect(isSupportedCommunityFunnelVideoUrl(url)).toBe(false);
    expect(() => normalizeCommunityFunnelVslUrl(url)).toThrow(
      "community_funnel_vsl_url_unsupported",
    );
  });

  it("treats an empty field as removal", () => {
    expect(normalizeCommunityFunnelVslUrl("  ")).toBeNull();
    expect(normalizeCommunityFunnelVslUrl(null)).toBeNull();
  });
});
