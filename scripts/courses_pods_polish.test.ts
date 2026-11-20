import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import * as React from "react";

const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);

const { isProtectedInlineImageAttachment } = await import("../apps/web/src/components/communityInteractionFeed");

describe("protected pod chat inline image classification", () => {
  it("classifies protected raster images for automatic inline loading", () => {
    expect(isProtectedInlineImageAttachment({ protected_download: true, type: "image", mime: "image/png", name: "Screenshot 2026-11-20.png" })).toBe(true);
    expect(isProtectedInlineImageAttachment({ protected_download: true, type: "file", mime: "image/jpeg", name: "photo.jpg" })).toBe(true);
    expect(isProtectedInlineImageAttachment({ protected_download: true, type: "file", mime: null, name: "capture.webp" })).toBe(true);
    expect(isProtectedInlineImageAttachment({ protected_download: true, type: "image", mime: null, name: "unnamed" })).toBe(true);
  });

  it("keeps non-images, SVGs, and non-protected attachments out of the protected inline image loader", () => {
    expect(isProtectedInlineImageAttachment({ protected_download: false, type: "image", mime: "image/png", name: "public.png" })).toBe(false);
    expect(isProtectedInlineImageAttachment({ protected_download: true, type: "image", mime: "image/svg+xml", name: "vector.svg" })).toBe(false);
    expect(isProtectedInlineImageAttachment({ protected_download: true, type: "file", mime: null, name: "diagram.svg" })).toBe(false);
    expect(isProtectedInlineImageAttachment({ protected_download: true, type: "file", mime: "application/pdf", name: "deck.pdf" })).toBe(false);
    expect(isProtectedInlineImageAttachment({ protected_download: true, type: "file", mime: "video/mp4", name: "clip.mp4" })).toBe(false);
  });
});

describe("courses pager and pod rail button affordance", () => {
  const kitCss = readFileSync(new URL("../apps/web/src/v1/kit.module.css", import.meta.url), "utf8");
  const podRail = readFileSync(new URL("../apps/web/src/v1/KitPodRail.tsx", import.meta.url), "utf8");
  const podKnowledge = readFileSync(new URL("../apps/web/src/v1/KitPodKnowledge.tsx", import.meta.url), "utf8");
  const classroom = readFileSync(new URL("../apps/web/src/v1/KitClassroom.tsx", import.meta.url), "utf8");

  it("styles right-rail panel actions and footer toggles as visible bordered buttons", () => {
    expect(kitCss).toMatch(/\.app button\.la,\.app a\.la\{[^}]*border:1px solid var\(--line2\);background:var\(--s1\)/);
    expect(kitCss).toMatch(/\.app \.railfoot button\{[^}]*border:1px solid var\(--line2\);background:var\(--s1\)/);
  });

  it("renders Pod host actions as bordered buttons and shows About this pod inline by default", () => {
    expect(podRail).not.toMatch(/<Btn small txt[^>]*>Edit<\/Btn>/);
    expect(podRail).not.toMatch(/<Btn small txt[^>]*>\{copied \? "Copied" : "Copy link"\}<\/Btn>/);
    expect(podRail).not.toMatch(/<Btn small txt[^>]*>See it as members do<\/Btn>/);
    expect(podRail).not.toMatch(/<Btn small txt[^>]*>Leave pod<\/Btn>/);
    expect(podRail).not.toMatch(/aria-expanded=\{foot === "about"\}/);
    expect(podKnowledge).not.toMatch(/<Btn small txt[^>]*>Edit<\/Btn>/);
    expect(podKnowledge).not.toMatch(/<Btn small txt[^>]*>Delete<\/Btn>/);
  });

  it("uses responsive shelf sizing, container-responsive hero stacking, and styled Previous / Next buttons on the Courses page", () => {
    expect(classroom).toContain("shelfPageSize(");
    expect(classroom).toContain("kpager-btn");
    expect(classroom).toContain("khero-wrap");
    expect(kitCss).toMatch(/\.app \.kpager \.btn\.kpager-btn\{[^}]*background:var\(--s2\)/);
    expect(kitCss).toContain("@container (max-width:680px){.app .khero{grid-template-columns:minmax(0,1fr)");
  });

  it("shows outside-member pods view and lets hosts click straight inside as a member without a redundant switcher", () => {
    const podsSection = readFileSync(new URL("../apps/web/src/components/WebCommunityPodsSection.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
    const navSurface = readFileSync(new URL("../apps/web/src/components/WebCommunityNavSurface.tsx", import.meta.url), "utf8");
    expect(podsSection).not.toContain("Outside member");
    expect(podsSection).not.toContain("Enrolled member");
    expect(podsSection).toContain("Preview inside as a member");
    expect(podRail).toContain("scope?.memberPreview");
    expect(podKnowledge).toContain("props.asMember");
    expect(app).toContain("activeCommunityChannel?.access_mode === \"restricted\" && !isDesignV1Active()");
    expect(navSurface).toContain("communityShell.isInPodRoom");
  });
});

describe("next slice: pods dropdown, pod knowledge cleanup, real avatars, clickable Home event, Home ghost join request", () => {
  it("caps the Linear-style left-nav pods list at 3 and rolls overflow unread dots up cleanly", async () => {
    const { selectNavPods, NAV_PODS_MAX } = await import("../shared/podsAttentionDot");
    expect(NAV_PODS_MAX).toBe(3);
    const channels = [
      { id: "g", slug: "general", name: "General", is_general: true, position: 0, access_mode: "all_members" as const },
      { id: "p1", slug: "pod-1", name: "Pod 1", is_general: false, position: 1, access_mode: "restricted" as const },
      { id: "p2", slug: "pod-2", name: "Pod 2", is_general: false, position: 2, access_mode: "restricted" as const },
      { id: "p3", slug: "pod-3", name: "Pod 3", is_general: false, position: 3, access_mode: "restricted" as const },
      { id: "p4", slug: "pod-4", name: "Pod 4", is_general: false, position: 4, access_mode: "restricted" as const },
    ];
    const picked = selectNavPods({
      channels,
      indicators: {
        "pod-1": { chat: true, mentions: false },
        "pod-4": { chat: false, mentions: true },
      },
      openSlug: null,
    });
    expect(picked.shown.map((p) => p.slug)).toEqual(["pod-1", "pod-2", "pod-3"]);
    expect(picked.overflowDot).toBe("mention");
    expect(picked.allDot).toBe("mention");

    const openFourth = selectNavPods({
      channels,
      indicators: {
        "pod-1": { chat: true, mentions: false },
        "pod-4": { chat: false, mentions: true },
      },
      openSlug: "pod-4",
    });
    expect(openFourth.overflowDot).toBe("none");
    expect(openFourth.allDot).toBe("quiet");

    const none = selectNavPods({
      channels: [channels[0]],
      indicators: {},
      openSlug: null,
    });
    expect(none.shown).toEqual([]);
    expect(none.allDot).toBe("none");
  });

  it("renders real profile photos in PanelPeople at 28px (.av.s) and makes PanelNext clickable without nesting action links", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { PanelNext, PanelPeople } = await import("../apps/web/src/v1/KitPanel");

    const peopleHtml = renderToStaticMarkup(React.createElement(PanelPeople, {
      people: [
        { id: "u1", name: "Rashid Ali", avatarUrl: "https://cdn.example.com/rashid.png" },
        { id: "u2", name: "Neil McDevitt", avatarUrl: null },
      ],
    }));
    expect(peopleHtml).toContain('title="Rashid Ali"');
    expect(peopleHtml).toContain('data-image-state="loading"');
    expect(peopleHtml).toContain('title="Neil McDevitt"');
    expect(peopleHtml).toContain('data-image-state="empty"');
    expect(peopleHtml).toContain("Rashid, Neil");
    expect(peopleHtml).toContain("_s_");

    const nextHtml = renderToStaticMarkup(React.createElement(PanelNext, {
      title: "Group Call",
      sub: "5:00 PM · Weekly",
      onClick: () => {},
      ariaLabel: "Open Group Call in Events",
      action: React.createElement("a", { href: "https://meet.example.com" }, "Join"),
    }));
    expect(nextHtml).toContain("Open Group Call in Events");
    expect(nextHtml).toContain("https://meet.example.com");
    // Join link must remain a sibling outside the <button>, never nested inside it.
    expect(nextHtml).toMatch(/<\/button><a href="https:\/\/meet\.example\.com"/);
  });

  it("keeps Pod knowledge notes collapsed behind View notes by default, hides hidden-pod right panels in Member View, and trusts empty live joinReview on Home", () => {
    const podKnowledge = readFileSync(new URL("../apps/web/src/v1/KitPodKnowledge.tsx", import.meta.url), "utf8");
    const podLanding = readFileSync(new URL("../apps/web/src/v1/KitPodLanding.tsx", import.meta.url), "utf8");
    const podsSection = readFileSync(new URL("../apps/web/src/components/WebCommunityPodsSection.tsx", import.meta.url), "utf8");
    const homeSection = readFileSync(new URL("../apps/web/src/components/WebCommunityHomeSection.tsx", import.meta.url), "utf8");
    const nextEvent = readFileSync(new URL("../apps/web/src/v1/KitNextEvent.tsx", import.meta.url), "utf8");
    const homeRail = readFileSync(new URL("../apps/web/src/v1/KitHomeRail.tsx", import.meta.url), "utf8");
    const channelRail = readFileSync(new URL("../apps/web/src/v1/KitChannelRail.tsx", import.meta.url), "utf8");

    expect(podKnowledge).toContain("useState(false)");
    expect(podKnowledge).toContain("View notes");
    expect(podLanding).not.toContain("PanelLearned");
    expect(podsSection).toContain("isHiddenPodInAddress");
    expect(podsSection).toContain("page.host_people");
    expect(homeSection).toContain("hasLiveJoinReview");
    expect(nextEvent).toContain("onClick={props.onOpenEvents}");
    expect(homeRail).toContain('cx("av s")');
    expect(channelRail).toContain('cx("av s")');
  });
});
