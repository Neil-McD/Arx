import { describe, expect, test } from "vitest";

import {
  compileCommunityThemeCss,
  communityThemeFontStylesheetUrl,
  communityThemeVariables,
  contrastRatio,
  DEFAULT_COMMUNITY_THEME,
  nearestPassingColor,
  normalizeCommunityTheme,
} from "../shared/communityTheme";

// A course look: paper, ink, green, hand-drawn corners. The green #2D8C3C
// carries white text at 4.3:1; #2B863A is the validator's nearest passing shade.
const PAPER_THEME = {
  version: 1,
  schemes: {
    light: {
      background: "#FAFAFA", surface: "#FFFFFF", text: "#21211E", muted: "#6B6B63", border: "#E2E2DC",
      accent: "#2B863A", on_accent: "#FFFFFF", button: "#21211E", on_button: "#FFFFFF",
    },
  },
  font_body: "Segoe UI",
  font_heading: "Excalifont",
  heading_weight: 400,
  radius: 15,
  corner_style: "sketch",
  button_shape: "sketch",
  border_width: 2,
  shadow: "hard",
};

// A "Stopwatch" look: black, the logo's green, condensed type, timer numerals.
const STOPWATCH_THEME = {
  version: 1,
  schemes: {
    dark: {
      background: "#0B0B0B", surface: "#151515", text: "#F2F2EF", muted: "#9C9C96", border: "#2B2B2B",
      accent: "#3FD15A", on_accent: "#0B0B0B", button: "#3FD15A", on_button: "#0B0B0B",
    },
  },
  font_body: "IBM Plex Sans",
  font_heading: "Barlow Condensed",
  heading_weight: 600,
  heading_case: "upper",
  numerals: "tabular",
  radius: 3,
  button_shape: "square",
  density: "compact",
  media_plate: "light",
};

describe("community theme validation", () => {
  test("the paper and Stopwatch themes are valid", () => {
    expect(normalizeCommunityTheme(PAPER_THEME)).toMatchObject({ ok: true });
    expect(normalizeCommunityTheme(STOPWATCH_THEME)).toMatchObject({ ok: true });
  });

  test("an empty theme is Polynet's own look", () => {
    expect(normalizeCommunityTheme({})).toEqual({ ok: true, theme: DEFAULT_COMMUNITY_THEME });
  });

  test("Polynet's default schemes pass their own contrast rules", () => {
    expect(normalizeCommunityTheme({ schemes: DEFAULT_COMMUNITY_THEME.schemes }).ok).toBe(true);
  });

  test("unreadable text is rejected with a colour that would pass", () => {
    const result = normalizeCommunityTheme({
      schemes: { dark: { ...STOPWATCH_THEME.schemes.dark, muted: "#3A3A3A" } },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const problem = result.problems.find((p) => p.path === "schemes.dark.muted");
    expect(problem?.message).toMatch(/needs 4.5:1/);
    expect(contrastRatio(problem?.suggestion ?? "", "#151515")).toBeGreaterThanOrEqual(4.5);
  });

  test("a brand fill too light for its label gets a nearby passing fill", () => {
    const result = normalizeCommunityTheme({
      schemes: { light: { ...PAPER_THEME.schemes.light, accent: "#2D8C3C" } },
    });
    expect(result).toEqual({
      ok: false,
      problems: [{
        path: "schemes.light.accent",
        message: "on_accent #FFFFFF on accent #2D8C3C is 4.3:1; it needs 4.5:1 to be readable.",
        suggestion: "#2B863A",
      }],
    });
  });

  test("every problem comes back at once", () => {
    const result = normalizeCommunityTheme({
      font_body: "Barlow Condensed",
      font_heading: "Comic Sans",
      radius: 40,
      shadow: "glow",
      sparkle: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((p) => p.path).sort()).toEqual(["font_body", "font_heading", "radius", "shadow", "sparkle"]);
    expect(result.problems.find((p) => p.path === "font_body")?.message).toMatch(/display face/);
  });

  test("colours must be hex and complete", () => {
    const result = normalizeCommunityTheme({ schemes: { light: { background: "white" } } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.some((p) => p.path === "schemes.light.background")).toBe(true);
    expect(result.problems.some((p) => p.path === "schemes.light.accent")).toBe(true);
  });
});

describe("community theme compilation", () => {
  test("a one-scheme theme is scoped to the community area only", () => {
    const result = normalizeCommunityTheme(STOPWATCH_THEME);
    if (!result.ok) throw new Error("invalid");
    const css = compileCommunityThemeCss(result.theme, '[data-community-theme="stopwatch-club"]');
    expect(css).toContain('[data-community-theme="stopwatch-club"] {\n  color-scheme: dark;');
    expect(css).not.toMatch(/(^|\n):root\b/);
    expect(css).not.toContain("--surface-rail");
    expect(css).toContain("--pn-heading-case: uppercase;");
    expect(css).toContain("--pn-numerals: tabular-nums;");
    expect(css).toContain("--pn-media-plate: #F4F4F0;");
  });

  test("a two-scheme theme follows the member's Light/Dark choice", () => {
    const css = compileCommunityThemeCss(DEFAULT_COMMUNITY_THEME, ".community");
    expect(css).toContain(".community {\n  color-scheme: dark;");
    expect(css).toContain(':root[data-theme="light"] .community {\n  color-scheme: light;');
  });

  test("links are always readable, even when the accent alone is not", () => {
    const result = normalizeCommunityTheme(PAPER_THEME);
    if (!result.ok) throw new Error("invalid");
    const vars = communityThemeVariables(result.theme, "light");
    expect(contrastRatio(vars["--pn-link"], "#FAFAFA")).toBeGreaterThanOrEqual(4.5);
    expect(vars["--accent-brand"]).toBe("#2B863A");
    expect(vars["--pn-radius-card"]).toBe("15px 4px 15px 4px");
    expect(vars["--pn-radius-button"]).toContain("255px");
  });

  test("text roles all follow the one text-size setting, a reading step above Polynet's CSS", () => {
    const defaults = communityThemeVariables(DEFAULT_COMMUNITY_THEME, "light");
    expect(defaults["--pn-type-body"]).toBe("16px");
    expect(defaults["--pn-type-ui"]).toBe("16px");
    expect(defaults["--pn-type-small"]).toBe("15px");
    expect(defaults["--pn-type-meta"]).toBe("13px");
    expect(defaults["--pn-type-display"]).toBe("clamp(26px, 3vw, 34px)");
    const larger = normalizeCommunityTheme({ ...DEFAULT_COMMUNITY_THEME, type_scale: 1.2 });
    if (!larger.ok) throw new Error("invalid");
    const vars = communityThemeVariables(larger.theme, "light");
    expect(vars["--pn-type-body"]).toBe("19.2px");
    expect(vars["--pn-type-title"]).toBe("31.2px");
    expect(vars["--pn-type-display"]).toBe("clamp(31.2px, 3.6vw, 40.8px)");
  });

  test("only Google faces add a stylesheet", () => {
    const stopwatch = normalizeCommunityTheme(STOPWATCH_THEME);
    if (!stopwatch.ok) throw new Error("invalid");
    expect(communityThemeFontStylesheetUrl(stopwatch.theme)).toBe(
      "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&display=swap",
    );
    expect(communityThemeFontStylesheetUrl(DEFAULT_COMMUNITY_THEME)).toBeNull();
  });

  test("nearestPassingColor keeps a passing colour and moves a failing one", () => {
    expect(nearestPassingColor("#000000", "#FFFFFF", 4.5)).toBe("#000000");
    const fixed = nearestPassingColor("#9BE59B", "#FFFFFF", 4.5);
    expect(contrastRatio(fixed ?? "", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  test("grey text on a dark scheme reads near-white, and light schemes keep their greys", () => {
    const stopwatch = normalizeCommunityTheme(STOPWATCH_THEME);
    const paper = normalizeCommunityTheme(PAPER_THEME);
    if (!stopwatch.ok || !paper.ok) throw new Error("invalid");
    const dark = communityThemeVariables(stopwatch.theme, "dark");
    const surface = stopwatch.theme.schemes.dark!.surface;
    expect(contrastRatio(dark["--text-secondary"], surface)).toBeGreaterThanOrEqual(15);
    expect(contrastRatio(dark["--text-muted"], surface)).toBeGreaterThanOrEqual(12);
    expect(contrastRatio(dark["--text-faint"], surface)).toBeGreaterThanOrEqual(9);
    // Chat colours come from the community, not from Polynet's own :root.
    expect(dark["--chat-body-text"]).toBe(stopwatch.theme.schemes.dark!.text);
    expect(dark["--text-on-accent"]).toBe(stopwatch.theme.schemes.dark!.on_accent);
    expect(contrastRatio(dark["--text-link"], surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark["--chat-meta-text"], surface)).toBeGreaterThanOrEqual(12);
    const light = communityThemeVariables(paper.theme, "light");
    expect(light["--text-muted"]).toBe("#6B6B63");
    expect(contrastRatio(light["--text-faint"], "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });
});
