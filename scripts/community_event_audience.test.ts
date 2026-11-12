import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// A pod's call (communityEvents.podChannelId) is visible only to people who
// can enter that pod. Any Convex file that reads events must go through
// convex/communityEventAudience.ts, which holds that rule. A new reader that
// doesn't fails here, so a pod call can't leak through a forgotten path.
const CONVEX = join(__dirname, "..", "convex");
const READS_EVENTS = /query\(\s*"communityEvents"|db\.get\([^)]*eventId/i;
const USES_RULE = /from "\.\/communityEventAudience"/;

// Files that touch events without showing them to anyone, each with the reason.
const NOT_READERS: Record<string, string> = {
  "communityEventAudience.ts": "the rule itself",
  "stagingSeedBriefLab.ts": "staging seed: deletes and recreates its own events",
  "stagingSeedSunrise.ts": "staging seed: deletes and recreates its own events",
  "stagingSeedPolynetDemo.ts": "staging seed: deletes and recreates its own events",
};

test("every file that reads events applies the pod audience rule", () => {
  const missing = readdirSync(CONVEX)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.startsWith("_") && !NOT_READERS[name])
    .filter((name) => {
      const text = readFileSync(join(CONVEX, name), "utf8");
      return READS_EVENTS.test(text) && !USES_RULE.test(text);
    });
  expect(missing).toEqual([]);
});
