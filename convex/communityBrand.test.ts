import { expect, test } from "vitest";
import { normalizeCommunityBrand, themeDriftsFromBrand, themeFromCommunityBrand } from "../shared/communityBrand";
import { DEFAULT_COMMUNITY_THEME, contrastRatio, normalizeCommunityTheme } from "../shared/communityTheme";

const clo = { version: 1, colours: [{ hex: "#2D8C3C", role: "primary" }, { hex: "#FFFFFF", role: "neutral" }], fonts: [{ name: "Inter", use: "both" }] };

test("a brand fills in over time: every field is optional, unknown keys are errors", () => {
  expect(normalizeCommunityBrand({})).toEqual({ ok: true, brand: { version: 1 } });
  const bad = normalizeCommunityBrand({ colour: "#000000", words: ["a", "b", "c", "d"], colours: [{ hex: "green", role: "primary" }] });
  expect(bad.ok).toBe(false);
  if (!bad.ok) expect(bad.problems.map((problem) => problem.path)).toEqual(expect.arrayContaining(["colour", "words", "colours[0].hex"]));
  expect(normalizeCommunityBrand({ logo: "http://example.com/logo.png" }).ok).toBe(false);
});

test("one brand runs light in one community and dark in another, always readable", () => {
  const brand = normalizeCommunityBrand(clo);
  if (!brand.ok) throw new Error("brand");
  for (const scheme of ["light", "dark"] as const) {
    const theme = themeFromCommunityBrand(brand.brand, DEFAULT_COMMUNITY_THEME, scheme);
    expect(Object.keys(theme.schemes)).toEqual([scheme]);
    expect(normalizeCommunityTheme(theme).ok).toBe(true);
    const colors = theme.schemes[scheme]!;
    expect(contrastRatio(colors.on_button, colors.button)).toBeGreaterThanOrEqual(4.5);
    expect(theme.font_body).toBe("Inter");
    expect(themeDriftsFromBrand(theme, brand.brand)).toEqual([]);
  }
  expect(themeFromCommunityBrand(brand.brand, DEFAULT_COMMUNITY_THEME, "light").schemes.light!.background).not.toBe("#0E100F");
});

test("a theme far from the brand is flagged", () => {
  const brand = normalizeCommunityBrand(clo);
  if (!brand.ok) throw new Error("brand");
  expect(themeDriftsFromBrand(DEFAULT_COMMUNITY_THEME, brand.brand).length).toBeGreaterThan(0);
});
