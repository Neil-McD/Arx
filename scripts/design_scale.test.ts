import { expect, test } from "vitest";
import { cssZoomOf, designScaleFor } from "../shared/designScale";
import { rewriteViewportUnits } from "../apps/web/designViewportUnits";

test("wide windows show the mock's 1440 frame, enlarged and capped; others are untouched", () => {
  expect(designScaleFor(1909)).toBeCloseTo(1909 / 1440, 5);
  expect(designScaleFor(1440)).toBe(1);
  expect(designScaleFor(1280)).toBe(1);
  expect(designScaleFor(390)).toBe(1);
  expect(designScaleFor(3840)).toBe(1.5);
  expect(designScaleFor(Number.NaN)).toBe(1);
});

test("viewport units follow the scale, with the real unit as the fallback", () => {
  expect(rewriteViewportUnits("100vh")).toBe("calc(100 * var(--u-vh, 1vh))");
  expect(rewriteViewportUnits("clamp(328px, 23vw, 440px)")).toBe("clamp(328px, calc(23 * var(--u-vw, 1vw)), 440px)");
  expect(rewriteViewportUnits("calc(100dvh - 16px)")).toBe("calc(calc(100 * var(--u-dvh, 1dvh)) - 16px)");
  expect(rewriteViewportUnits("min(60vh,420px)")).toBe("min(calc(60 * var(--u-vh, 1vh)),420px)");
  expect(rewriteViewportUnits("-5vw")).toBe("calc(-5 * var(--u-vw, 1vw))");
  expect(rewriteViewportUnits(".5vmin")).toBe("calc(.5 * var(--u-vmin, 1vmin))");
  // Running it again changes nothing.
  for (const value of ["100vh", "clamp(328px, 23vw, 440px)", "calc(100dvh - 16px)"]) {
    expect(rewriteViewportUnits(rewriteViewportUnits(value))).toBe(rewriteViewportUnits(value));
  }
  // Nothing else changes: pixels, ids, urls.
  expect(rewriteViewportUnits("12px 24px")).toBe("12px 24px");
  expect(rewriteViewportUnits('url("/img/100vh.png")')).toBe('url("/img/100vh.png")');
  expect(rewriteViewportUnits("var(--100vh-thing)")).toBe("var(--100vh-thing)");
});

test("an element's zoom reads as 1 when the browser reports none", () => {
  expect(cssZoomOf(null)).toBe(1);
  expect(cssZoomOf({ currentCSSZoom: 1.25 } as unknown as Element)).toBe(1.25);
  expect(cssZoomOf({ currentCSSZoom: 0 } as unknown as Element)).toBe(1);
});
