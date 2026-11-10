// Design system v1 ships behind one build-time switch while it is checked on
// staging (docs/specs/design-system-v1-implementation-plan.md). Only the
// `polynet-staging` Vercel project sets VITE_DESIGN_V1; production releases
// refuse to run while the `polynet` project has it.

export const DESIGN_V1_ENV_KEY = "VITE_DESIGN_V1";

export function isDesignV1Enabled(value: string | undefined | null): boolean {
  return String(value ?? "").trim() === "1";
}

// The attribute is written into the HTML at build time, so the first paint
// already uses the right tokens and the theme bootstrap stays untouched.
export function applyDesignAttribute(html: string, enabled: boolean): string {
  if (!enabled) return html;
  return html.replace(/<html(\s[^>]*)?>/, (tag) =>
    tag.includes("data-design=") ? tag : tag.replace(/>$/, ' data-design="v1">'),
  );
}
