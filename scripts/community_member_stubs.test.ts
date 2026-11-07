import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
test("member avatars reuse the feed holder without local sizing", () => {
  for (const file of ["WebCommunityProfilePanel.tsx"]) {
    const source = readFileSync(new URL(`../apps/web/src/components/${file}`, import.meta.url), "utf8");
    expect(source).toContain('className="community-interaction-avatar"');
  }
  const communityCss = readFileSync(new URL("../apps/web/src/styles/community-and-content.css", import.meta.url), "utf8");
  expect(communityCss).not.toContain(".community-profile-panel-avatar");
  const profileScale = communityCss.match(/\.community-profile-panel-top \.community-interaction-avatar\s*\{([^}]+)\}/)?.[1];
  expect(profileScale).toContain("width: 64px");
  expect(profileScale).toContain("height: 64px");
  expect(profileScale).not.toMatch(/border|background|overflow|object-fit/);
});
