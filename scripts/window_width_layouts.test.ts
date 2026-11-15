import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PHONE_VIEWPORT_MEDIA_QUERY, shellVariantAfterResize } from "../shared/browserRuntimeMode";
import { applyShellVariantToKnownPath } from "../shared/webAppRouteState";

// The window's width picks one of three shapes and nothing in between:
// 1024px and wider (left, middle, right), 721 to 1023px (left and middle),
// 720px and narrower (the phone layout).
describe("the window's width picks the layout", () => {
  it("phone width is width alone: a narrowed desktop window counts", () => {
    expect(PHONE_VIEWPORT_MEDIA_QUERY).toBe("(max-width: 720px)");
  });

  it("a window narrowed to phone width gets the phone layout, and the regular one back when widened", () => {
    expect(shellVariantAfterResize({ phoneWidth: true, touch: false, current: "standard" })).toBe("mobile");
    expect(shellVariantAfterResize({ phoneWidth: false, touch: false, current: "mobile" })).toBe("standard");
  });

  it("a phone turned on its side keeps the phone layout", () => {
    expect(shellVariantAfterResize({ phoneWidth: false, touch: true, current: "mobile" })).toBe("mobile");
    expect(shellVariantAfterResize({ phoneWidth: false, touch: true, current: "standard" })).toBe("standard");
  });

  it("the address follows the layout both ways", () => {
    expect(applyShellVariantToKnownPath("/c/polynet/resources", "mobile")).toBe("/m/c/polynet/resources");
    expect(applyShellVariantToKnownPath("/m/c/polynet/resources", "standard")).toBe("/c/polynet/resources");
    expect(applyShellVariantToKnownPath("/m/c/polynet", "standard")).toBe("/c/polynet");
  });

  it("the styles use only those two lines for the shell's shape", () => {
    const css = readFileSync(new URL("../apps/web/src/styles/design-v1.css", import.meta.url), "utf8");
    // The old line at 900px squeezed the middle to about 420px; it is gone.
    expect(css).not.toMatch(/\(max-width:\s*899px\)|\(min-width:\s*900px\)/);
    expect(css).toMatch(/@media \(min-width: 721px\) and \(max-width: 1023px\)/);
    expect(css).toMatch(/@media \(min-width: 1024px\)/);
  });
});
