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
const { WebAccountMenu } = await import("../apps/web/src/components/WebAccountMenu");
const { MentionAutocompleteMenu } = await import("../apps/web/src/components/communityMentionAutocomplete");
const { PanelPeople } = await import("../apps/web/src/v1/KitPanel");
const { CourseCover } = await import("../apps/web/src/v1/KitClassroom");
const { KitCourseInline, courseEditPatch } = await import("../apps/web/src/v1/KitCourseEdit");
const { WebCommunityBannerEditorModal } = await import("../apps/web/src/components/WebCommunityBannerEditorModal");
import { clampCoverFocus, clampCoverZoom, computeCoverFrameLayout, measureFramedMediaViewport } from "../shared/coverFrameUi";
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
  host: {
    name: "Maya Chen",
    avatar_url: "https://cdn.example.com/maya.png",
    avatar_focus_x: 0.4,
    avatar_focus_y: 0.25,
    avatar_zoom: 1.35,
  },
  visibility: "published",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  member_count: 42,
};

describe("canonical community logos, banners, and user avatars", () => {
  it("measures the inner padding-box on bordered media holders so framed images stay centered", () => {
    const measured = measureFramedMediaViewport({
      clientWidth: 50,
      clientHeight: 50,
      getBoundingClientRect: () => ({ width: 56, height: 56 }),
    });
    expect(measured).toEqual({ width: 50, height: 50 });

    const layout = computeCoverFrameLayout({
      viewportWidth: measured.width,
      viewportHeight: measured.height,
      naturalWidth: 256,
      naturalHeight: 256,
      focusX: 0.5,
      focusY: 0.5,
      zoom: 1,
    });
    expect(layout).toMatchObject({ renderWidth: 50, renderHeight: 50, left: 0, top: 0 });
  });

  it("treats null, undefined, and blank focus or zoom metadata as centered defaults instead of top-left 0", () => {
    expect(clampCoverFocus(null)).toBe(0.5);
    expect(clampCoverFocus(undefined)).toBe(0.5);
    expect(clampCoverFocus("")).toBe(0.5);
    expect(clampCoverFocus(0)).toBe(0);
    expect(clampCoverZoom(null)).toBe(1);
    expect(clampCoverZoom(undefined)).toBe(1);
    expect(clampCoverZoom("")).toBe(1);

    // Wide cover inside a 16:9 box with null focus stays centered horizontally, not pinned at left: 0.
    const layout = computeCoverFrameLayout({
      viewportWidth: 160,
      viewportHeight: 90,
      naturalWidth: 320,
      naturalHeight: 90,
      focusX: null,
      focusY: null,
      zoom: null,
    });
    expect(layout).toMatchObject({ renderWidth: 320, renderHeight: 90, left: -80, top: 0 });
  });

  it("renders DiscoverCard banner, community logo, and host avatar through canonical framed media", () => {
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
    expect(html).not.toContain('src="https://cdn.example.com/maya.png"');

    const fallbackHtml = renderToStaticMarkup(
      React.createElement(DiscoverCard, {
        community: {
          ...sampleCommunity,
          avatar_url: null,
          banner_url: null,
          host: { name: "Maya Chen", avatar_url: null },
        },
        now: Date.now(),
      }),
    );
    expect(fallbackHtml).toContain("community-avatar-frame-fallback");
    expect(fallbackHtml).toContain("SC");
    expect(fallbackHtml).toContain("MC");
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

  it("renders WebAccountMenu trigger avatar through UserAvatar instead of raw img", () => {
    const html = renderToStaticMarkup(
      React.createElement(WebAccountMenu, {
        name: "Maya Chen",
        avatarUrl: "https://cdn.example.com/maya.png",
        avatarFocusX: 0.4,
        avatarFocusY: 0.25,
        avatarZoom: 1.5,
        roleLabel: "Host",
        appTheme: "dark",
        onSetAppTheme: () => {},
        onOpenSettings: () => {},
        onSignOut: async () => {},
      }),
    );

    expect(html).toContain("stable-framed-media account-menu-avatar");
    expect(html).not.toContain('src="https://cdn.example.com/maya.png"');

    const fallbackHtml = renderToStaticMarkup(
      React.createElement(WebAccountMenu, {
        name: "Maya Chen",
        avatarUrl: null,
        roleLabel: "Host",
        appTheme: "dark",
        onSetAppTheme: () => {},
        onOpenSettings: () => {},
        onSignOut: async () => {},
      }),
    );
    expect(fallbackHtml).toContain("stable-framed-media account-menu-avatar");
    expect(fallbackHtml).toContain(">M<");
  });

  it("renders MentionAutocompleteMenu user candidates through UserAvatar while keeping agent and role tiles", () => {
    const html = renderToStaticMarkup(
      React.createElement(MentionAutocompleteMenu, {
        autocomplete: {
          isOpen: true,
          query: "",
          highlightedIndex: 0,
          results: [
            {
              userId: "community_agent",
              displayName: "Sunrise Club",
              handle: null,
              avatarUrl: null,
              kind: "community_agent",
            },
            {
              userId: "role:everybody",
              displayName: "Everybody",
              handle: "everybody",
              avatarUrl: null,
              kind: "role",
              roleKey: "everybody",
            },
            {
              userId: "user_maya",
              displayName: "Maya Chen",
              handle: "maya",
              avatarUrl: "https://cdn.example.com/maya.png",
              avatarFocusX: 0.35,
              avatarFocusY: 0.2,
              avatarZoom: 1.4,
              kind: "user",
            },
          ],
          syncFromTextarea: () => {},
          begin: () => {},
          close: () => {},
          handleKeyDown: () => false,
          pick: () => {},
          setHighlightedIndex: () => {},
        },
        getAvatarColor: () => "#5b6cf9",
        getInitials: () => "MC",
      }),
    );

    expect(html).toContain("stable-framed-media mention-autocomplete-avatar");
    expect(html).not.toContain("background-image");
    expect(html).toContain("is-agent");
    expect(html).toContain("is-role");
  });

  it("renders PanelPeople faces through UserAvatar with framing support", () => {
    const html = renderToStaticMarkup(
      React.createElement(PanelPeople, {
        people: [
          {
            id: "u1",
            name: "Maya Chen",
            avatarUrl: "https://cdn.example.com/maya.png",
            avatarFocusX: 0.4,
            avatarFocusY: 0.2,
            avatarZoom: 1.5,
          },
        ],
      }),
    );
    expect(html).toContain("stable-framed-media community-dm-kit-avatar");
  });

  it("renders CourseCover and KitCourseInline through StableFramedMedia instead of CSS background-image", () => {
    const course = {
      id: "mod_1",
      community_id: "comm_sunrise",
      name: "Foundations",
      description_md: "Start here.",
      banner_url: "https://cdn.example.com/course-cover.png",
      banner_focus_x: 0.3,
      banner_focus_y: 0.7,
      banner_zoom: 1.6,
      sort_order: 0,
      module_status: "published" as const,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };

    const coverHtml = renderToStaticMarkup(
      React.createElement(CourseCover, { course }),
    );
    expect(coverHtml).toContain("stable-framed-media");
    expect(coverHtml).not.toContain("background-image");
    expect(coverHtml).not.toContain('src="https://cdn.example.com/course-cover.png"');

    const emptyCoverHtml = renderToStaticMarkup(
      React.createElement(CourseCover, { course: { ...course, banner_url: null } }),
    );
    expect(emptyCoverHtml).not.toContain("stable-framed-media");
    expect(emptyCoverHtml).toContain("<svg");

    const inlineHtml = renderToStaticMarkup(
      React.createElement(KitCourseInline, {
        course,
        coverClassName: "kcover klist-cover",
        stats: "2 of 4 done",
        onSave: async () => ({ ok: true as const }),
      }),
    );
    expect(inlineHtml).toContain("stable-framed-media");
    expect(inlineHtml).not.toContain("background-image");
    expect(inlineHtml).toContain("Reframe cover");

    const inlineNoCoverHtml = renderToStaticMarkup(
      React.createElement(KitCourseInline, {
        course: { ...course, banner_url: null },
        coverClassName: "kcover klist-cover knocover",
        stats: "2 of 4 done",
        onSave: async () => ({ ok: true as const }),
      }),
    );
    expect(inlineNoCoverHtml).not.toContain("Reframe cover");

    expect(
      courseEditPatch({
        name: "  Foundations  ",
        description: "Start here.",
        cover: { kind: "frame", focusX: 0.25, focusY: 0.75, zoom: 1.8 },
      }),
    ).toEqual({
      name: "Foundations",
      description: "Start here.",
      cover: { kind: "frame", focusX: 0.25, focusY: 0.75, zoom: 1.8 },
    });
  });

  it("supports custom title, hint, and aspectRatio in WebCommunityBannerEditorModal for pod and course covers", () => {
    const podModalHtml = renderToStaticMarkup(
      React.createElement(WebCommunityBannerEditorModal, {
        isOpen: true,
        bannerUrl: "https://cdn.example.com/pod-cover.png",
        focusX: 0.4,
        focusY: 0.6,
        zoom: 1.5,
        title: "Adjust pod cover framing",
        imageAlt: "Pod cover preview",
        hint: "Drag the image to frame it inside the pod cover.",
        aspectRatio: "16 / 7",
        onChangeFocusX: () => {},
        onChangeFocusY: () => {},
        onChangeZoom: () => {},
        onDirty: () => {},
        onClose: () => {},
      }),
    );
    expect(podModalHtml).toContain("Adjust pod cover framing");
    expect(podModalHtml).toContain("Drag the image to frame it inside the pod cover.");
    expect(podModalHtml).toContain("aspect-ratio:16 / 7");
    expect(podModalHtml).toContain('value="150"');
  });
});
