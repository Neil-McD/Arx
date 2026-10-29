import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";

// Every fixed size or corner added to the app's CSS must reach the community
// theme too, so the generated map is checked against the CSS it came from.
test("the community theme map matches the app's CSS", () => {
  const output = execFileSync(process.execPath, ["--experimental-strip-types", "scripts/generate_community_theme_map.ts", "--check"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  expect(output).toContain("community_theme_map: ok");
});
