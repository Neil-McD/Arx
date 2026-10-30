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

// The AI Employee Builders course look (paper, ink, green, hand-drawn corners).
// The portal's green #2D8C3C carries white text at 4.3:1; #2B863A is the
// validator's nearest passing shade.
const CLO_THEME = {
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

// The 2-Hour Club's "Stopwatch" look: black, the logo's green, condensed type, timer numerals.
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
  course_cover_ratio: "16:9",
  course_card_size: "medium",
};

describe("community theme validation", () => {
  test("the CLO and Stopwatch themes are valid", () => {
    expect(normalizeCommunityTheme(CLO_THEME)).toMatchObject({ ok: true });
    expect(normalizeCommunityTheme(STOPWATCH_THEME)).toMatchObject({ ok: true });
  });

  test("a banner that already shows the name can hide the side column's name", () => {
    expect(DEFAULT_COMMUNITY_THEME.banner_name).toBe("show");
    expect(communityThemeVariables(DEFAULT_COMMUNITY_THEME, "dark")["--pn-banner-name"]).toBe("visible");
    const result = normalizeCommunityTheme({ banner_name: "hide" });
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    expect(communityThemeVariables(result.theme, "dark")).toMatchObject({ "--pn-banner-name": "hidden", "--pn-banner-scrim": "0.45" });
    expect(normalizeCommunityTheme({ banner_name: "maybe" }).ok).toBe(false);
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
      schemes: { light: { ...CLO_THEME.schemes.light, accent: "#2D8C3C" } },
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
    const css = compileCommunityThemeCss(result.theme, '[data-community-theme="the-2-hour-club"]');
    expect(css).toContain('[data-community-theme="the-2-hour-club"] {\n  color-scheme: dark;');
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
    const result = normalizeCommunityTheme(CLO_THEME);
    if (!result.ok) throw new Error("invalid");
    const vars = communityThemeVariables(result.theme, "light");
    expect(contrastRatio(vars["--pn-link"], "#FAFAFA")).toBeGreaterThanOrEqual(4.5);
    expect(vars["--accent-brand"]).toBe("#2B863A");
    expect(vars["--pn-radius-card"]).toBe("15px 4px 15px 4px");
    expect(vars["--pn-radius-button"]).toContain("255px");
  });

  test("course cards: Classroom's medium cards by default, the page style's own columns on request, and a cover ratio", () => {
    const defaults = communityThemeVariables(DEFAULT_COMMUNITY_THEME, "light");
    expect(defaults["--pn-course-columns"]).toBe("repeat(auto-fill, minmax(min(100%, 260px), 1fr))");
    expect(defaults["--pn-course-cover-ratio"]).toBe("16 / 9");
    const own = normalizeCommunityTheme({ version: 1, course_card_size: "default", course_cover_ratio: "auto" });
    if (!own.ok) throw new Error("invalid");
    const ownVars = communityThemeVariables(own.theme, "light");
    expect(ownVars["--pn-course-columns"]).toBe("repeat(2, minmax(0, 1fr))");
    expect(ownVars["--pn-course-cover-ratio"]).toBe("auto");
    const stopwatch = normalizeCommunityTheme(STOPWATCH_THEME);
    if (!stopwatch.ok) throw new Error("invalid");
    const vars = communityThemeVariables(stopwatch.theme, "dark");
    expect(vars["--pn-course-columns"]).toBe("repeat(auto-fill, minmax(min(100%, 260px), 1fr))");
    // A picked size beats the page style's columns and lets the catalog fill the screen.
    expect(vars["--pn-course-columns-owner"]).toBe(vars["--pn-course-columns"]);
    expect(vars["--pn-course-catalog-max-owner"]).toBe("90rem");
    expect(ownVars["--pn-course-columns-owner"]).toBe("initial");
    expect(ownVars["--pn-course-catalog-max-owner"]).toBe("initial");
    expect(vars["--pn-course-cover-ratio"]).toBe("16 / 9");
    expect(vars["--pn-course-cover-height"]).toBe("auto");
    expect(normalizeCommunityTheme({ course_cover_ratio: "2:1" }).ok).toBe(false);
  });

  test("a cover tint prints covers onto a wash of the accent, in light schemes only", () => {
    const defaults = communityThemeVariables(DEFAULT_COMMUNITY_THEME, "light");
    expect(defaults["--pn-cover-blend"]).toBe("normal");
    const tinted = normalizeCommunityTheme({ ...CLO_THEME, course_cover_plate: "tint" });
    if (!tinted.ok) throw new Error("invalid");
    expect(communityThemeVariables(tinted.theme, "light")["--pn-cover-plate"]).toBe("color-mix(in srgb, #2B863A 9%, #FFFFFF)");
    expect(communityThemeVariables(tinted.theme, "light")["--pn-cover-blend"]).toBe("multiply");
    const dark = normalizeCommunityTheme({ ...STOPWATCH_THEME, course_cover_plate: "tint" });
    if (!dark.ok) throw new Error("invalid");
    expect(communityThemeVariables(dark.theme, "dark")["--pn-cover-blend"]).toBe("normal");
    expect(normalizeCommunityTheme({ course_cover_plate: "photo" }).ok).toBe(false);
  });

  test("the course card text panel is shaded by default, and a custom colour keeps its text readable", () => {
    expect(DEFAULT_COMMUNITY_THEME.course_card_panel).toBe("shade");
    expect(communityThemeVariables(DEFAULT_COMMUNITY_THEME, "light")["--pn-course-panel"]).toContain("color-mix");
    const darkPanel = normalizeCommunityTheme({ ...CLO_THEME, course_card_panel: "custom", course_card_panel_color: "#222222" });
    if (!darkPanel.ok) throw new Error("invalid");
    const vars = communityThemeVariables(darkPanel.theme, "light");
    expect(vars["--pn-course-panel"]).toBe("#222222");
    expect(vars["--pn-course-panel-text"]).toBe("#FFFFFF");
    expect(normalizeCommunityTheme({ course_card_panel: "custom" }).ok).toBe(false);
    expect(normalizeCommunityTheme({ course_card_panel: "custom", course_card_panel_color: "red" }).ok).toBe(false);
    expect(normalizeCommunityTheme({ course_card_panel: "neon" }).ok).toBe(false);
  });

  test("a whole cover fit shows each cover in full, over its inline framing", () => {
    expect(compileCommunityThemeCss(DEFAULT_COMMUNITY_THEME, ".c")).not.toContain("object-fit: contain");
    const whole = normalizeCommunityTheme({ ...STOPWATCH_THEME, course_cover_fit: "whole" });
    if (!whole.ok) throw new Error("invalid");
    expect(compileCommunityThemeCss(whole.theme, ".c")).toContain(".c .resource-course-card-cover-image {\n  inset: 0 !important;");
    expect(normalizeCommunityTheme({ course_cover_fit: "stretch" }).ok).toBe(false);
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
    const clo = normalizeCommunityTheme(CLO_THEME);
    if (!stopwatch.ok || !clo.ok) throw new Error("invalid");
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
    const light = communityThemeVariables(clo.theme, "light");
    expect(light["--text-muted"]).toBe("#6B6B63");
    expect(contrastRatio(light["--text-faint"], "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });
});
