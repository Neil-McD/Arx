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
];

// Deliberate literals: theme preview swatches, the internal operator
// warning, and light-theme-only adapters (owned by the light-mode slice).
const ALLOWED = new Set([
  "settings-runtime-and-theme-overrides.css|#2f55ff",
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

const violations: string[] = [];
for (const file of files) {
  const css = readFileSync(file, "utf8");
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim();
    if (selector.includes('data-theme="light"')) continue;
    for (const declaration of rule[2].split(";")) {
      if (declaration.trim().startsWith("--")) continue;
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
