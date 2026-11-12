import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// Pod knowledge stays in the pod. Pod notes live in their own table, and only
// convex/communityPodNotes.ts may touch it: its readers check the viewer can
// enter the pod, and its one way out is a builder publishing a copy. Any
// other Convex file reaching into the table (search, Home, the handbook, the
// agent's file system, a summary) fails here, so the wall can't be opened by
// accident.
const CONVEX = join(__dirname, "..", "convex");
const ALLOWED = new Set(["communityPodNotes.ts", "schema.ts"]);

test("only the pod notes module touches pod knowledge", () => {
  const reaching = readdirSync(CONVEX)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.startsWith("_") && !ALLOWED.has(name))
    .filter((name) => /communityPodNotes/.test(readFileSync(join(CONVEX, name), "utf8")));
  expect(reaching).toEqual([]);
});

test("every pod notes function checks the viewer can enter the pod", () => {
  const source = readFileSync(join(CONVEX, "communityPodNotes.ts"), "utf8");
  const handlers = source.split(/export const /).slice(1);
  expect(handlers.length).toBeGreaterThan(0);
  for (const handler of handlers) expect(handler).toMatch(/await podReader\(ctx, args\)/);
});
