import { describe, expect, it } from "vitest";
import { contrastRatio, normalizeCommunityTheme, type CommunityThemeV1 } from "../shared/communityTheme";
import { communityThemeTwinColors } from "../shared/communityThemePalettes";
import { COMMUNITY_THEME_PRESETS } from "../shared/communityThemePresets";

function preset(id: string): CommunityThemeV1 {
  return COMMUNITY_THEME_PRESETS.find((entry) => entry.id === id)!.theme;
}

// Turning a one-version look into "Member chooses" in Customize starts the
// missing version from its twin.
describe("a one-version look's other version", () => {
  it("uses the starting design's twin when the colours match one", () => {
    const darkOnly: CommunityThemeV1 = { ...preset("night-workshop"), schemes: { dark: preset("night-workshop").schemes.dark } };
    expect(communityThemeTwinColors(darkOnly, "light")).toEqual(preset("clean-white").schemes.light);
  });

  it("builds a readable version around the look's own accent otherwise", () => {
    const result = normalizeCommunityTheme({
      version: 1,
      schemes: { dark: {
        background: "#0A0A12", surface: "#14141F", text: "#F5F5FA", muted: "#A0A0B4", border: "#2A2A3A",
        accent: "#FFD84D", on_accent: "#0A0A12", button: "#FFD84D", on_button: "#0A0A12",
      } },
    });
    if (!result.ok) throw new Error("invalid");
    const light = communityThemeTwinColors(result.theme, "light");
    expect(contrastRatio(light.accent, light.surface)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(light.on_button, light.button)).toBeGreaterThanOrEqual(3);
    expect(normalizeCommunityTheme({ ...result.theme, schemes: { light } }).ok).toBe(true);
  });
});
