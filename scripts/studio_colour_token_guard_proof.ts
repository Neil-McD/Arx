import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Studio stylesheets take colour from theme tokens (apps/web/src/base.css).
// A tinted literal (red, green, pink, gold, ...) outside the token file
// silently escapes both themes, so new ones must go through a token.
// Greys, black/white overlays and shadows are allowed.
const EXCLUDED = [
  "apps/web/src/base.css",
  "apps/web/src/components/polynetLanding/ConversionLanding.css",
  "apps/web/src/styles/pdf-text-layer.css",
  // Design v1 kit: generated verbatim from the hi-fi mock's stylesheet, which
  // carries its own dark and light palettes (scripts/design_v1_kit.test.ts
  // proves it is the mock, untouched).
  "apps/web/src/v1/kit.module.css",
];

// Deliberate literals: the internal operator warning.
const ALLOWED = new Set([
  "settings-runtime-and-theme-overrides.css|#f0b84d",
]);

const files = execFileSync("git", ["ls-files", "apps/web/src"], { encoding: "utf8" })
  .split("\n")
  .filter((file) => file.endsWith(".css") && !EXCLUDED.includes(file));

const colourPattern =
  /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/g;

function channels(literal: string): [number, number, number] {
  if (literal.startsWith("#")) {
    const hex = literal.length === 4
      ? literal.slice(1).split("").map((c) => c + c).join("")
      : literal.slice(1);
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  }
  const [r, g, b] = literal.match(/[\d.]+/g)!.map(Number);
  return [r, g, b];
}

function isTinted([r, g, b]: [number, number, number]): boolean {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const lightness = (max + min) / 2;
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
  return saturation >= 0.25 && max * 255 - min * 255 >= 30;
}

// White tints vanish on the light theme's white surfaces. Below 50% opacity
// they must use a token (--hover-overlay, --surface-subtle, --border-*),
// except where they sit on photos or dark overlays in both themes.
const WHITE_TINT = /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*(0?\.\d+)\s*\)/g;
const WHITE_ON_MEDIA =
  /lightbox|chat-media-remove|public-funnel-media-play|avatar|stripe-setup-button|discover-card-banner|community-nav-banner|runtime-trace-tool/;

const violations: string[] = [];
for (const file of files) {
  const css = readFileSync(file, "utf8");
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim();
    if (selector.includes('data-theme="light"')) continue;
    for (const declaration of rule[2].split(";")) {
      if (declaration.trim().startsWith("--")) continue;
      const property = declaration.split(":")[0]?.trim() ?? "";
      if (!property.includes("shadow") && !WHITE_ON_MEDIA.test(selector)) {
        for (const tint of declaration.matchAll(WHITE_TINT)) {
          if (Number(tint[1]) < 0.5) {
            violations.push(`${file}: ${selector.split("\n").pop()} -> ${tint[0]} (white tint)`);
          }
        }
      }
      for (const literal of declaration.match(colourPattern) ?? []) {
        if (!isTinted(channels(literal))) continue;
        const key = `${file.split("/").pop()}|${literal.toLowerCase()}`;
        if (ALLOWED.has(key)) continue;
        violations.push(`${file}: ${selector.split("\n").pop()} -> ${literal}`);
      }
    }
  }
}

assert.deepEqual(
  violations,
  [],
  `tinted colour literals must use theme tokens (base.css):\n${violations.join("\n")}`,
);
console.log("studio_colour_token_guard_proof: ok");
