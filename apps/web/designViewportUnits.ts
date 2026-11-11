// Design system v1 scales the app on wide desktop windows so a window wider
// than the mock's 1440px frame shows the mock's proportions (Neil, Nov 11).
// The scale is CSS zoom on <body> (shared/designScale.ts). Inside a zoomed
// element a viewport unit still means the real window, so 100vh would come
// out taller than the window. In v1 builds only, every viewport unit in the
// CSS is rewritten to a custom property that the scale keeps equal to one
// unit of the scaled window, falling back to the real unit before it runs.
// Production builds never run this, so their CSS is unchanged.

// A number with a viewport unit, standing on its own (not inside a name such
// as --100vh-thing).
const UNIT = /(^|[\s(,*/])(-?\d*\.?\d+)(dvh|svh|lvh|vh|dvw|svw|lvw|vw|vmin|vmax)(?![\w-])/g;

export function rewriteViewportUnits(value: string): string {
  if (!/\d(?:dvh|svh|lvh|vh|dvw|svw|lvw|vw|vmin|vmax)\b/.test(value)) return value;
  // Leave url(...) contents, and units this already rewrote, alone, so
  // running it twice changes nothing.
  return value
    .split(/(url\([^)]*\)|var\(--u-[a-z]+, *-?[\d.]+[a-z]+\))/)
    .map((part) =>
      part.startsWith("url(") || part.startsWith("var(--u-")
        ? part
        : part.replace(UNIT, (_match, lead: string, amount: string, unit: string) =>
            `${lead}calc(${amount} * var(--u-${unit}, 1${unit}))`,
          ),
    )
    .join("");
}

export function designViewportUnitsPostcssPlugin() {
  return {
    postcssPlugin: "polynet-design-viewport-units",
    // Once, after the sheet is built: a per-declaration visitor would see its
    // own output again.
    OnceExit(root: { walkDecls: (visit: (decl: { prop: string; value: string }) => void) => void }) {
      root.walkDecls((decl) => {
        // The scale's own unit properties are set from script, never here.
        if (decl.prop.startsWith("--u-")) return;
        const next = rewriteViewportUnits(decl.value);
        if (next !== decl.value) decl.value = next;
      });
    },
  };
}
