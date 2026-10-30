import { describe, expect, test } from "vitest";

import {
  clampCommunityEmbedHeight,
  parseCommunityEmbedBlock,
  readCommunityEmbedChildMessage,
} from "../shared/communityEmbed";

describe("polynet-embed blocks", () => {
  test("a widget block names its file, title, height and fallback", () => {
    expect(
      parseCommunityEmbedBlock("src: embeds/xray/business-map.html\ntitle: Business map\nheight: 900\nfallback: media/xray/business-map.png"),
    ).toEqual({
      ok: true,
      block: { src: "embeds/xray/business-map.html", title: "Business map", height: 900, fallback: "media/xray/business-map.png" },
    });
  });

  test("only the file is required", () => {
    expect(parseCommunityEmbedBlock("src: embeds/quiz.html")).toEqual({
      ok: true,
      block: { src: "embeds/quiz.html", title: "quiz.html", height: 600, fallback: null },
    });
  });

  test("widgets must be html files on the community's own site", () => {
    for (const src of ["https://evil.example/x.html", "/embeds/x.html", "embeds/../secrets.html", "embeds//x.html", "embeds/x.js", "javascript:alert(1)"]) {
      expect(parseCommunityEmbedBlock(`src: ${src}`).ok).toBe(false);
    }
    expect(parseCommunityEmbedBlock("src: embeds/x.html\nfallback: media/x.html").ok).toBe(false);
    expect(parseCommunityEmbedBlock("src: embeds/x.html\nheight: 99999").ok).toBe(false);
    expect(parseCommunityEmbedBlock("just some text").ok).toBe(false);
  });
});

describe("widget messages", () => {
  test("well-formed messages are read; anything else is ignored", () => {
    expect(readCommunityEmbedChildMessage({ polynetEmbed: 1, type: "save", id: 3, key: "bxr-scores", value: "{}" })).toEqual({
      polynetEmbed: 1, type: "save", id: 3, key: "bxr-scores", value: "{}",
    });
    expect(readCommunityEmbedChildMessage({ polynetEmbed: 1, type: "save", id: 3, key: "bxr-scores", value: {} })).toBeNull();
    expect(readCommunityEmbedChildMessage({ polynetEmbed: 1, type: "load", id: 1, key: "x".repeat(101) })).toBeNull();
    expect(readCommunityEmbedChildMessage({ type: "resize", height: 10 })).toBeNull();
    expect(readCommunityEmbedChildMessage("resize")).toBeNull();
  });

  test("frames grow to fit tall widgets, within limits", () => {
    expect(clampCommunityEmbedHeight(2400.4)).toBe(2401);
    expect(clampCommunityEmbedHeight(20)).toBe(120);
    expect(clampCommunityEmbedHeight(1e9)).toBe(6000);
  });
});
