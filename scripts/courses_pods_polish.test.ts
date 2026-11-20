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
