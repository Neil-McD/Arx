import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appLayoutForShell, PHONE_VIEWPORT_MEDIA_QUERY } from "../shared/browserRuntimeMode";

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const v1 = strip(readFileSync(new URL("../apps/web/src/styles/design-v1.css", import.meta.url), "utf8"));
const kit = strip(readFileSync(new URL("../apps/web/src/v1/kit.module.css", import.meta.url), "utf8"));

// Two layouts, kept apart (Neil, Nov 14: "mobile and desktop should be
// separate and we shouldn't ever have this problem"). A phone gets the phone
// layout because it is a phone. A desktop window gets the desktop layout at
// every width: dragging it narrow never turns it into the phone's.
describe("phone and desktop are separate layouts", () => {
  it("a phone is a narrow screen worked by touch, never a narrow desktop window", () => {
    expect(PHONE_VIEWPORT_MEDIA_QUERY).toBe("(max-width: 720px) and (pointer: coarse)");
  });

  it("the shell the app chose says which layout the styles draw", () => {
    expect(appLayoutForShell("mobile")).toBe("phone");
    expect(appLayoutForShell("standard")).toBe("desktop");
  });

  it("no style picks phone or desktop from the window's width", () => {
    for (const css of [v1, kit]) {
      expect(css).not.toMatch(/@media[^{]*\(max-width:\s*720px\)/);
      expect(css).not.toMatch(/@media[^{]*\(min-width:\s*721px\)/);
    }
    expect(v1).toContain(':root[data-design="v1"]:where([data-layout="phone"])');
    expect(v1).toContain(':root[data-design="v1"]:where(:not([data-layout="phone"]))');
    expect(kit).toContain(':where(:root[data-layout="phone"])');
  });

  it("the right column arrives at 1024px, and below it is never drawn under the page", () => {
    // The old line at 900px squeezed the middle to about 420px.
    expect(v1).not.toMatch(/\(max-width:\s*899px\)|\(min-width:\s*900px\)/);
    expect(v1).toMatch(/@media \(min-width: 1024px\)/);
    expect(v1).toMatch(/@media \(max-width: 1023px\) \{\s*:root\[data-design="v1"\] \.community-page-body > \.community-page-rail \{ display: none; \}/);
  });
});
