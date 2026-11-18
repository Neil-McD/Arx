// Design system v1 is switched on by one build-time setting, VITE_DESIGN_V1
// (docs/specs/design-system-v1-implementation-plan.md). Staging and, since
// 2026-11-17, production both set it; unsetting it and releasing steps back
// to the previous design.

export const DESIGN_V1_ENV_KEY = "VITE_DESIGN_V1";

export function isDesignV1Enabled(value: string | undefined | null): boolean {
  return String(value ?? "").trim() === "1";
}

// The attribute is written into the HTML at build time, so the first paint
// already uses the right tokens and the theme bootstrap stays untouched.
export function applyDesignAttribute(html: string, enabled: boolean): string {
  if (!enabled) return html;
  const stamped = html.replace(/<html(\s[^>]*)?>/, (tag) =>
    tag.includes("data-design=") ? tag : tag.replace(/>$/, ' data-design="v1">'),
  );
  return applyDesignIcons(stamped);
}

// The colour logo (chosen 2026-11-10) replaces the white mark in the browser
// tab and on home screens, only where the switch is on.
const DESIGN_ICON_FILES = [
  "favicon.ico",
  "favicon.svg",
  "favicon-32x32.png",
  "favicon-16x16.png",
  "favicon.png",
  "apple-touch-icon.png",
  "manifest.webmanifest",
];

// Browsers keep favicons for a long time; change this when the files change.
const DESIGN_ICON_VERSION = "20261110c";

export function applyDesignIcons(html: string): string {
  return html.replace(/<link\b[^>]*>/g, (tag) => {
    if (!/\brel="(icon|apple-touch-icon|manifest)"/.test(tag)) return tag;
    return tag.replace(/href="([^"]*?)([A-Za-z0-9._-]+)(\?[^"]*)?"/, (match, prefix: string, file: string) =>
      DESIGN_ICON_FILES.includes(file) && !prefix.endsWith("brand/v1/")
        ? `href="${prefix}brand/v1/${file}?v=${DESIGN_ICON_VERSION}"`
        : match,
    );
  });
}
