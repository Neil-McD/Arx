import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { applyDesignAttribute } from "../apps/web/designSystemFlag";

const html = readFileSync(new URL("../apps/web/index.html", import.meta.url), "utf8");

test("with the switch on, every tab and home-screen icon is the colour logo", () => {
  const out = applyDesignAttribute(html, true);
  const hrefs = [...out.matchAll(/<link\b[^>]*rel="(?:icon|apple-touch-icon|manifest)"[^>]*>/g)]
    .map((match) => match[0].match(/href="([^"]+)"/)![1]);
  expect(hrefs.length).toBeGreaterThanOrEqual(7);
  for (const href of hrefs) expect(href).toMatch(/^%BASE_URL%brand\/v1\//);
  // Every rewritten file exists.
  for (const href of hrefs) {
    const file = href.replace("%BASE_URL%", "").split("?")[0];
    expect(() => readFileSync(new URL(`../apps/web/public/${file}`, import.meta.url))).not.toThrow();
  }
  // Other links are untouched.
  expect(out.match(/<link\b[^>]*rel="preconnect"[^>]*>/g) ?? []).toEqual(html.match(/<link\b[^>]*rel="preconnect"[^>]*>/g) ?? []);
});

test("with the switch off, production keeps the white mark", () => {
  expect(applyDesignAttribute(html, false)).toBe(html);
});

test("the colour manifest points only at colour icons that exist", () => {
  const manifest = JSON.parse(readFileSync(new URL("../apps/web/public/brand/v1/manifest.webmanifest", import.meta.url), "utf8"));
  for (const icon of manifest.icons) {
    expect(icon.src).toMatch(/^\/brand\/v1\//);
    expect(() => readFileSync(new URL(`../apps/web/public${icon.src}`, import.meta.url))).not.toThrow();
  }
});
