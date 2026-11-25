import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  registerMobilePageBack,
  runActiveMobilePageBack,
} from "../apps/web/src/components/CommunityPageHeader";

const ROOT = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), "utf8");

describe("Mobile community page scroll, bottom bar, and one-step back contracts", () => {
  it("bounds CommunityPageFrame (.community-page-body) as a flex column on phone so Knowledge and other tabs scroll", () => {
    const designV1 = read("apps/web/src/styles/design-v1.css");

    expect(designV1).toMatch(
      /:root\[data-design="v1"\]:where\(\[data-layout="phone"\]\) \.app-root\.mobile-shell \.app-shell\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\);/,
    );
    expect(designV1).toMatch(
      /:root\[data-design="v1"\]:where\(\[data-layout="phone"\]\) \.app-root\.mobile-shell \.workspace\.community-mode\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/,
    );
    expect(designV1).toMatch(
      /:root\[data-design="v1"\]:where\(\[data-layout="phone"\]\) \.community-page-body\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(designV1).toMatch(
      /:root\[data-design="v1"\]:where\(\[data-layout="phone"\]\) \.community-page-body > \.community-tab-scroll\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;/,
    );
    expect(designV1).toMatch(
      /:root\[data-design="v1"\]:where\(\[data-layout="phone"\]\) \.app-root\.mobile-shell \.community-page-body > \.community-tab-scroll\s*\{[\s\S]*?padding-bottom:\s*calc\(env\(safe-area-inset-bottom, 0px\) \+ var\(--mobile-bottom-rail-height, 0px\) \+ 16px\);/,
    );
  });

  it("bounds mobile-global-shell and Settings panels so both personal and community Settings scroll on phones", () => {
    const indexCss = read("apps/web/src/index.css");
    const designV1 = read("apps/web/src/styles/design-v1.css");

    expect(indexCss).toMatch(
      /\.mobile-global-shell\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\);/,
    );
    expect(indexCss).toMatch(
      /\.mobile-global-shell-surface\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/,
    );
    expect(indexCss).toMatch(
      /\.mobile-global-shell-surface\s*>\s*\.workspace\.community-mode\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\) auto;/,
    );
    expect(designV1).toMatch(
      /:root\[data-design="v1"\]:where\(\[data-layout="phone"\]\) \.app-root\.mobile-shell \.workspace\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\) auto;/,
    );
    expect(designV1).toMatch(
      /:root\[data-design="v1"\]:where\(\[data-layout="phone"\]\) \.app-root\.mobile-settings-shell \.settings-panel\s*\{[\s\S]*?overflow-y:\s*auto;/,
    );
    expect(designV1).toMatch(
      /:root\[data-design="v1"\]:where\(\[data-layout="phone"\]\) \.app-root\.mobile-shell \.community-settings-panel\s*\{[\s\S]*?overflow:\s*visible;/,
    );
  });

  it("clears the bottom bar for Members list and Member record panels on phone", () => {
    const designV1 = read("apps/web/src/styles/design-v1.css");

    expect(designV1).toMatch(
      /:root\[data-design="v1"\]:where\(\[data-layout="phone"\]\) \.app-root\.mobile-shell \.members-page\s*\{[\s\S]*?inset:\s*env\(safe-area-inset-top, 0px\) 0 calc\(env\(safe-area-inset-bottom, 0px\) \+ var\(--mobile-bottom-rail-height, 0px\)\) 0;/,
    );
    expect(designV1).toMatch(
      /:root\[data-design="v1"\]:where\(\[data-layout="phone"\]\) \.app-root\.mobile-shell:has\(\.members-page\.has-picked\) \.members-page-record\s*\{[\s\S]*?inset:\s*env\(safe-area-inset-top, 0px\) 0 calc\(env\(safe-area-inset-bottom, 0px\) \+ var\(--mobile-bottom-rail-height, 0px\)\) 0;/,
    );
  });

  it("keeps bottom tabs on Pod preview pages while hiding them in channels, DMs, and active Home guide chat", () => {
    const bottomRail = read("apps/web/src/components/WebMobileBottomRail.tsx");
    const agentDock = read("apps/web/src/components/WebCommunityAgentDock.tsx");
    const designV1 = read("apps/web/src/styles/design-v1.css");

    expect(bottomRail).toContain('destination.kind === "community_chat"');
    expect(bottomRail).not.toContain('destination.kind === "community_pods"');
    expect(agentDock).toContain("is-guide-talking");
    expect(designV1).toContain(".community-agent-dock-panel.is-guide-talking");
    const phoneTabsHeightIndex = designV1.indexOf(
      ':root[data-design="v1"] .app-root.mobile-shell:has(.mobile-bottom-rail.is-phone-tabs) {\n  --mobile-bottom-rail-height: 64px;',
    );
    const guideTalkingZeroHeightIndex = designV1.indexOf(
      ':root[data-design="v1"] .app-root.mobile-shell:has(.community-agent-dock-panel.is-guide-talking) {\n  --mobile-bottom-rail-height: 0px;',
    );
    expect(phoneTabsHeightIndex).toBeGreaterThan(-1);
    expect(guideTalkingZeroHeightIndex).toBeGreaterThan(phoneTabsHeightIndex);
  });

  it("steps back one level via registered mobile page back handlers before returning to community home", () => {
    const chromeHost = read("apps/web/src/controllers/buildWebShellChromeHostProps.ts");
    const podsSection = read("apps/web/src/components/WebCommunityPodsSection.tsx");
    const eventsList = read("apps/web/src/v1/KitEventsList.tsx");

    expect(chromeHost).toContain("if (runActiveMobilePageBack()) return;");
    expect(podsSection).toContain('label: "Back to Pods"');
    expect(eventsList).toContain("registerMobilePageBack");

    expect(runActiveMobilePageBack()).toBe(false);
    const handler = vi.fn();
    const unregister = registerMobilePageBack(handler);
    expect(runActiveMobilePageBack()).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    unregister();
    expect(runActiveMobilePageBack()).toBe(false);
  });

  it("fits the host course editor inside phone width and relies on the single canonical back button", () => {
    const classroom = read("apps/web/src/v1/KitClassroom.tsx");
    const kitCss = read("apps/web/src/v1/kit.module.css");
    const designV1 = read("apps/web/src/styles/design-v1.css");

    expect(classroom).not.toContain("knowledge-course-crumb");
    expect(designV1).not.toContain(".knowledge-course-crumb");
    expect(kitCss).toMatch(/\.app \.kedit-video\.zone\{[^}]*width:100%;max-width:100%;min-width:0;box-sizing:border-box/);
    expect(kitCss).toMatch(/@media \(max-width:760px\)\{[^\n]*\.app \.kedit-video\.zone\{aspect-ratio:auto;min-height:132px;padding:16px\}/);
    expect(kitCss).toContain(':where(:root[data-layout="phone"]) .app .kedit-video.zone{aspect-ratio:auto;min-height:132px;padding:16px}');
    expect(designV1).toMatch(
      /:root\[data-design="v1"\]:where\(\[data-layout="phone"\]\) \.community-page-body > \.community-tab-scroll\s*\{[\s\S]*?overflow-x:\s*hidden;/,
    );
    expect(designV1).toMatch(
      /:root\[data-design="v1"\]:where\(\[data-layout="phone"\]\) :is\(\.kit-lesson, \.kit-lesson-video, \.kit-lesson-editor, \.kit-lesson-after\)\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?box-sizing:\s*border-box;/,
    );
  });
});
