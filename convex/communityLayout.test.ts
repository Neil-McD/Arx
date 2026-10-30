import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  COMMUNITY_LAYOUT_ABOUT_MEDIA_LIMIT,
  DEFAULT_COMMUNITY_LAYOUT,
  communityLayoutTabLabel,
  isCommunityLayoutVideoUrl,
  layoutForMemberChoice,
  normalizeCommunityLayout,
  visibleCommunityLayoutTabs,
} from "../shared/communityLayout";

const CLASSROOM_LAYOUT = JSON.parse(
  readFileSync(join(__dirname, "..", "packages", "polynet-cli", "templates", "classroom", "layout.json"), "utf8"),
);

function problemsOf(raw: unknown) {
  const result = normalizeCommunityLayout(raw);
  return result.ok ? [] : result.problems;
}

describe("community layout v1", () => {
  test("Polynet's default layout is valid and keeps the side column", () => {
    const result = normalizeCommunityLayout(DEFAULT_COMMUNITY_LAYOUT);
    expect(result).toEqual({ ok: true, layout: DEFAULT_COMMUNITY_LAYOUT });
    expect(DEFAULT_COMMUNITY_LAYOUT.navigation.position).toBe("side");
  });

  test("the classroom template's layout is valid: top tabs, posts feed, centred", () => {
    const result = normalizeCommunityLayout(CLASSROOM_LAYOUT);
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    expect(result.layout.navigation.position).toBe("top");
    expect(result.layout.width).toBe("centered");
    expect(result.layout.pages.chat).toEqual({ presentation: "posts", aside: ["community_card", "upcoming_events"] });
    expect(result.layout.pages.about).toEqual({ presentation: "funnel", media: [], text: "", show_members: true });
    expect(visibleCommunityLayoutTabs(result.layout).map((t) => communityLayoutTabLabel(result.layout, t.tab)))
      .toEqual(["Community", "Classroom", "Calendar", "Members", "Ask AI", "About"]);
  });

  test("the About page is Polynet's own unless a layout makes it the funnel", () => {
    expect(DEFAULT_COMMUNITY_LAYOUT.pages.about.presentation).toBe("page");
    const funnel = normalizeCommunityLayout({ pages: { about: { presentation: "funnel" } } });
    expect(funnel.ok && funnel.layout.pages.about.presentation).toBe("funnel");
    expect(problemsOf({ pages: { about: { presentation: "landing" } } }).map((p) => p.path)).toEqual(["pages.about.presentation"]);
    expect(problemsOf({ pages: { about: { video: true } } }).map((p) => p.path)).toEqual(["pages.about.video"]);
  });

  test("the sales page holds a gallery of pictures and videos and its own text", () => {
    const result = normalizeCommunityLayout({
      pages: {
        about: {
          presentation: "funnel",
          media: [
            { kind: "video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", caption: " Intro " },
            { kind: "image", url: "https://example.com/members.png" },
          ],
          text: "  ## What you get\n- Weekly calls  ",
        },
      },
    });
    expect(result.ok && result.layout.pages.about).toEqual({
      presentation: "funnel",
      media: [
        { kind: "video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", caption: "Intro" },
        { kind: "image", url: "https://example.com/members.png", caption: "" },
      ],
      text: "## What you get\n- Weekly calls",
      show_members: true,
    });
    const hidden = normalizeCommunityLayout({ pages: { about: { show_members: false } } });
    expect(hidden.ok && hidden.layout.pages.about.show_members).toBe(false);
    const paths = (about: unknown) => problemsOf({ pages: { about } }).map((p) => p.path);
    expect(paths({ media: [{ kind: "video", url: "https://example.com/clip" }] })).toEqual(["pages.about.media.0.url"]);
    expect(paths({ media: [{ kind: "image", url: "javascript:alert(1)" }] })).toEqual(["pages.about.media.0.url"]);
    expect(paths({ media: [{ kind: "gif", url: "https://example.com/a.gif" }] })).toEqual(["pages.about.media.0.kind"]);
    expect(paths({ media: [{ kind: "image", url: "https://example.com/a.png", caption: "x".repeat(141) }] })).toEqual(["pages.about.media.0.caption"]);
    expect(paths({ media: Array.from({ length: COMMUNITY_LAYOUT_ABOUT_MEDIA_LIMIT + 1 }, () => ({ kind: "image", url: "https://example.com/a.png" })) })).toEqual(["pages.about.media"]);
    expect(paths({ text: 5 })).toEqual(["pages.about.text"]);
    expect(paths({ show_members: "yes" })).toEqual(["pages.about.show_members"]);
  });

  test("the gallery plays YouTube, Vimeo, Loom and Wistia links over https", () => {
    for (const [url, ok] of [
      ["https://youtu.be/dQw4w9WgXcQ", true],
      ["https://www.youtube.com/shorts/abc123", true],
      ["https://vimeo.com/123456789", true],
      ["https://www.loom.com/share/abcdef123456", true],
      ["https://fast.wistia.net/embed/iframe/abc123", true],
      ["https://example.com/video.mp4", false],
      ["http://youtu.be/dQw4w9WgXcQ", false],
      ["https://vimeo.com/channels/staff", false],
    ] as const) {
      expect(isCommunityLayoutVideoUrl(url), url).toBe(ok);
    }
    // Plus Descript share links, which the gallery plays through the same embed.
    expect(isCommunityLayoutVideoUrl("https://share.descript.com/view/AbC123xyz")).toBe(true);
    expect(isCommunityLayoutVideoUrl("https://share.descript.com/embed/AbC123xyz")).toBe(true);
    expect(isCommunityLayoutVideoUrl("https://share.descript.com/AbC123xyz")).toBe(false);
  });

  test("members may pick Classroom or Channels where the owner offers it", () => {
    const template = normalizeCommunityLayout(CLASSROOM_LAYOUT);
    if (!template.ok) throw new Error("template");
    expect(template.layout.navigation.member_choice).toEqual(["top", "side"]);
    expect(DEFAULT_COMMUNITY_LAYOUT.navigation.member_choice).toEqual([]);

    const channels = layoutForMemberChoice(template.layout, "side");
    expect(channels.navigation.position).toBe("side");
    expect(channels.pages.chat).toEqual({ presentation: "messages", aside: [] });
    expect(channels.navigation.tabs).toEqual(template.layout.navigation.tabs);
    expect(channels.pages.about).toEqual(template.layout.pages.about);
    expect(layoutForMemberChoice(template.layout, null)).toBe(template.layout);
    // Not offered: the owner's layout.
    expect(layoutForMemberChoice(DEFAULT_COMMUNITY_LAYOUT, "top")).toBe(DEFAULT_COMMUNITY_LAYOUT);

    const offered = normalizeCommunityLayout({ navigation: { position: "side", member_choice: ["side", "top"] } });
    if (!offered.ok) throw new Error("offered");
    const classroom = layoutForMemberChoice(offered.layout, "top");
    expect(classroom.navigation.position).toBe("top");
    expect(classroom.pages.chat.presentation).toBe("posts");

    expect(problemsOf({ navigation: { position: "side", member_choice: ["top"] } }).map((p) => p.path)).toEqual(["navigation.member_choice"]);
    expect(problemsOf({ navigation: { member_choice: ["grid"] } }).map((p) => p.path)).toEqual(["navigation.member_choice.0"]);
  });

  test("an empty object means Polynet's layout", () => {
    expect(normalizeCommunityLayout({})).toEqual({ ok: true, layout: DEFAULT_COMMUNITY_LAYOUT });
  });

  test("tabs left out stay reachable but hidden", () => {
    const result = normalizeCommunityLayout({ navigation: { tabs: [{ tab: "resources" }], home: "resources" } });
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    expect(visibleCommunityLayoutTabs(result.layout).map((t) => t.tab)).toEqual(["resources"]);
    expect(result.layout.navigation.tabs).toHaveLength(6);
  });

  test("unknown settings, tabs and blocks are errors, never dropped", () => {
    expect(problemsOf({ colour: "red" })).toEqual([{ path: "colour", message: "\"colour\" isn't a layout setting here." }]);
    expect(problemsOf({ navigation: { tabs: [{ tab: "leaderboard" }, { tab: "chat" }] } })[0]?.path).toBe("navigation.tabs.0.tab");
    expect(problemsOf({ pages: { chat: { aside: ["leaderboard"] } } })[0]?.path).toBe("pages.chat.aside.0");
    expect(problemsOf({ pages: { map: {} } })[0]?.path).toBe("pages.map");
  });

  test("the home tab must be visible, and tabs can't repeat", () => {
    expect(problemsOf({ navigation: { tabs: [{ tab: "chat", hidden: true }, { tab: "resources" }], home: "chat" } })
      .map((p) => p.path)).toContain("navigation.home");
    expect(problemsOf({ navigation: { tabs: [{ tab: "chat" }, { tab: "chat" }] } })[0]?.message).toContain("twice");
  });

  test("labels are short text", () => {
    expect(problemsOf({ navigation: { tabs: [{ tab: "chat", label: "x".repeat(25) }] } })[0]?.path).toBe("navigation.tabs.0.label");
  });
});
