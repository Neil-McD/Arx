import { expect, test } from "vitest";
import { DEFAULT_COMMUNITY_THEME, normalizeCommunityTheme } from "../shared/communityTheme";

// chat_view was retired on 2026-10-27 (every Channels chat is Wide). Themes
// saved before then still carry it, so they must load, without the setting.
test("a saved theme with the retired chat_view still loads, and drops it", () => {
  for (const chat_view of ["centered", "wide"]) {
    const result = normalizeCommunityTheme({ ...DEFAULT_COMMUNITY_THEME, chat_view });
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    expect("chat_view" in result.theme).toBe(false);
  }
});
