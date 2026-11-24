import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);

const { DiscoverCard } = await import("../apps/web/src/v1/KitDiscover");
const { WebCommunitySwitcher } = await import("../apps/web/src/components/WebCommunitySwitcher");
const { WebMobileBottomRail } = await import("../apps/web/src/components/WebMobileBottomRail");
import type { DiscoverCommunitySnapshot } from "../shared/communityTypes";
import type { WebCommunityShellProps } from "../apps/web/src/components/webShellChromeShared";

const sampleCommunity: DiscoverCommunitySnapshot = {
  id: "comm_sunrise",
  slug: "sunrise-club",
  name: "Sunrise Club",
  one_liner: "Early sessions.",
  avatar_url: "https://cdn.example.com/logo.png",
  avatar_focus_x: 0.3,
  avatar_focus_y: 0.7,
  avatar_zoom: 1.5,
  banner_url: "https://cdn.example.com/banner.png",
  banner_focus_x: 0.2,
  banner_focus_y: 0.8,
  banner_zoom: 1.6,
  visibility: "published",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  member_count: 42,
};

describe("canonical community logos and banners", () => {
  it("renders DiscoverCard banner and logo through StableFramedMedia and CommunityAvatar", () => {
    const html = renderToStaticMarkup(
      React.createElement(DiscoverCard, {
        community: sampleCommunity,
        now: Date.now(),
      }),
    );

    expect(html).toContain("stable-framed-media");
    expect(html).toContain("community-avatar-frame");
    expect(html).not.toContain('src="https://cdn.example.com/banner.png"');
    expect(html).not.toContain('src="https://cdn.example.com/logo.png"');

    const fallbackHtml = renderToStaticMarkup(
      React.createElement(DiscoverCard, {
        community: { ...sampleCommunity, avatar_url: null, banner_url: null },
        now: Date.now(),
      }),
    );
    expect(fallbackHtml).toContain("community-avatar-frame-fallback");
    expect(fallbackHtml).toContain("SC");
  });

  it("renders WebCommunitySwitcher cover banner through StableFramedMedia instead of CSS background", () => {
    const html = renderToStaticMarkup(
      React.createElement(WebCommunitySwitcher, {
        activeCommunityName: "Sunrise Club",
        communities: [],
        selectedCommunitySlug: "sunrise-club",
        attentionById: {},
        onSelectCommunity: () => {},
        onOpenDiscover: () => {},
        onCreateCommunity: () => {},
        cover: {
          communityId: "comm_sunrise",
          bannerUrl: "https://cdn.example.com/banner.png",
          focusX: 0.25,
          focusY: 0.75,
          zoom: 1.8,
        },
      }),
    );

    expect(html).toContain("stable-framed-media");
    expect(html).not.toContain("--banner:url(");
    expect(html).not.toContain("background-image");

    const bareHtml = renderToStaticMarkup(
      React.createElement(WebCommunitySwitcher, {
        activeCommunityName: "Sunrise Club",
        communities: [],
        selectedCommunitySlug: "sunrise-club",
        attentionById: {},
        onSelectCommunity: () => {},
        onOpenDiscover: () => {},
        onCreateCommunity: () => {},
        cover: {
          communityId: "comm_sunrise",
          bannerUrl: null,
        },
      }),
    );
    expect(bareHtml).not.toContain("stable-framed-media");
  });

  it("renders WebMobileBottomRail community tab logo through CommunityAvatar", () => {
    const shell = {
      showMobileShell: true,
      mobileRootPage: "agent",
      destination: { kind: "community_home" },
      activeCommunity: {
        id: "comm_sunrise",
        slug: "sunrise-club",
        name: "Sunrise Club",
        avatar_url: "https://cdn.example.com/logo.png",
        avatar_focus_x: 0.3,
        avatar_focus_y: 0.6,
        avatar_zoom: 1.4,
      },
      directMessagesUnreadCount: 0,
      communityRailAttentionById: {},
      canOpenDirectMessages: true,
      onSelectMobileRootPage: () => {},
    } as unknown as WebCommunityShellProps;

    const html = renderToStaticMarkup(
      React.createElement(WebMobileBottomRail, { communityShell: shell }),
    );
    expect(html).toContain("community-avatar-frame mobile-phone-tab-logo");
    expect(html).not.toContain('<img class="mobile-phone-tab-logo"');

    const fallbackHtml = renderToStaticMarkup(
      React.createElement(WebMobileBottomRail, {
        communityShell: {
          ...shell,
          activeCommunity: { ...shell.activeCommunity!, avatar_url: null },
        },
      }),
    );
    expect(fallbackHtml).toContain("community-avatar-frame-fallback is-letter");
    expect(fallbackHtml).toContain("SC");
  });
});
