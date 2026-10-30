import { describe, expect, it } from "vitest";
import { normalizeCommunityTheme } from "../shared/communityTheme";
import { COMMUNITY_THEME_PRESETS } from "../shared/communityThemePresets";
import { parseCommunitySettingsPane } from "../shared/appShellNavigation";

describe("appearance starting points", () => {
  it("are whole, valid themes with unique ids", () => {
    expect(new Set(COMMUNITY_THEME_PRESETS.map((preset) => preset.id)).size).toBe(COMMUNITY_THEME_PRESETS.length);
    for (const preset of COMMUNITY_THEME_PRESETS) {
      const result = normalizeCommunityTheme(preset.theme);
      expect(result.ok, preset.id).toBe(true);
      if (result.ok) expect(result.theme).toEqual(preset.theme);
    }
  });

  it("old Look links open the Appearance pane", () => {
    expect(parseCommunitySettingsPane("look")).toBe("appearance");
    expect(parseCommunitySettingsPane("appearance")).toBe("appearance");
  });
});
