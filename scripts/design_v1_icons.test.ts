import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const html = readFileSync(new URL("../apps/web/index.html", import.meta.url), "utf8");

test("index.html permanently activates design v1 and serves the default colour icons", () => {
  expect(html).toContain('<html lang="en" data-design="v1">');
  const hrefs = [...html.matchAll(/<link\b[^>]*rel="(?:icon|apple-touch-icon|manifest)"[^>]*>/g)]
    .map((match) => match[0].match(/href="([^"]+)"/)![1]);
  expect(hrefs.length).toBeGreaterThanOrEqual(7);
  for (const href of hrefs) {
    expect(href).toMatch(/^%BASE_URL%[^/]+\?v=20261123a$/);
    const file = href.replace("%BASE_URL%", "").split("?")[0];
    expect(() => readFileSync(new URL(`../apps/web/public/${file}`, import.meta.url))).not.toThrow();
  }
  expect(existsSync(new URL("../apps/web/public/brand/v1", import.meta.url))).toBe(false);
  expect(existsSync(new URL("../apps/web/designSystemFlag.ts", import.meta.url))).toBe(false);
});

test("the root manifest points only at colour icons that exist", () => {
  const manifest = JSON.parse(readFileSync(new URL("../apps/web/public/manifest.webmanifest", import.meta.url), "utf8"));
  expect(manifest.icons.length).toBeGreaterThanOrEqual(5);
  for (const icon of manifest.icons) {
    expect(icon.src).toMatch(/^\/[^/]+\?v=20261123a$/);
    const file = icon.src.split("?")[0];
    expect(() => readFileSync(new URL(`../apps/web/public${file}`, import.meta.url))).not.toThrow();
  }
});
