import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);

const { KitChannelRail } = await import("../apps/web/src/v1/KitChannelRail");

describe("Chat message edit sizing and pinned post markdown rendering", () => {
  it("renders pinned posts in the channel rail as formatted markdown without raw # or ** syntax", () => {
    const html = renderToStaticMarkup(
      React.createElement(KitChannelRail, {
        communityId: "c1",
        session: null,
        channelId: "ch1",
        pinned: {
          author: "Rashid",
          at: new Date().toISOString(),
          title: null,
          excerpt: [
            "## Quick Setup",
            "Setting up takes 10 minutes:",
            "- **Install the plugin** in Claude Code",
            "- **Start setup.** Type `/setup`",
          ].join("\n"),
          onOpen: () => {},
        },
      }),
    );

    // Headings, bold, bullet list, and inline code render as real HTML.
    expect(html).toContain("<h3");
    expect(html).toContain("Quick Setup");
    expect(html).toContain("<strong>Install the plugin</strong>");
    expect(html).toContain("<ul");
    expect(html).toContain("<code");
    expect(html).toContain("/setup");
    // Raw markdown markers are not exposed as text.
    expect(html).not.toContain("## Quick Setup");
    expect(html).not.toContain("**Install the plugin**");
    // Accessible hit button is a sibling, never wrapping block/interactive elements.
    expect(html).toMatch(/<button[^>]*aria-label="Open the pinned post by Rashid"[^>]*><\/button>/);
  });

  it("auto-sizes the inline message EditForm textarea with a roomy minimum height", () => {
    const feedSrc = readFileSync(
      new URL("../apps/web/src/components/communityInteractionFeed.tsx", import.meta.url),
      "utf8",
    );
    const cssSrc = readFileSync(
      new URL("../apps/web/src/styles/community-and-content.css", import.meta.url),
      "utf8",
    );

    expect(feedSrc).toContain("useLayoutEffect");
    expect(feedSrc).toContain("el.scrollHeight");
    expect(feedSrc).toContain("el.setSelectionRange(end, end)");
    expect(cssSrc).toMatch(/\.community-interaction-edit-input\s*\{[\s\S]*min-height:\s*88px;/);
  });
});
