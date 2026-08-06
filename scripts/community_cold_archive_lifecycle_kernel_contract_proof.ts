import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const lifecycle = read("shared/communityLifecycle.ts");
const schema = read("convex/schema.ts");
const core = read("convex/communityCore.ts");
const communityLifecycle = read("convex/communityLifecycle.ts");

assert.match(
  lifecycle,
  /COMMUNITY_LIFECYCLE_STATUSES = \["active", "archived"\] as const/,
);
assert.match(lifecycle, /if \(value === undefined\) return "active"/);
assert.match(lifecycle, /if \(value === undefined\) return 0/);
assert.match(lifecycle, /export function communityIsActive/);
assert.match(lifecycle, /export function archiveCommunityLifecycle/);
assert.match(lifecycle, /export function restoreCommunityLifecycle/);

assert.match(
  schema,
  /communities: defineTable\(\{[\s\S]*lifecycleStatus: v\.optional\([\s\S]*v\.literal\("active"\)[\s\S]*v\.literal\("archived"\)[\s\S]*lifecycleGeneration: v\.optional\(v\.number\(\)\)/,
);
assert.match(
  core,
  /import type \{ CommunityLifecycleStatus \} from "\.\.\/shared\/communityLifecycle"/,
);
assert.match(core, /lifecycleStatus\?: CommunityLifecycleStatus/);
assert.match(core, /lifecycleGeneration\?: number/);
assert.match(
  communityLifecycle,
  /ctx\.db\.insert\("communities", \{[\s\S]*lifecycleStatus: "active",[\s\S]*lifecycleGeneration: 0/,
);

for (const forbidden of [
  "archive_scheduled",
  "archiveAt",
  "archiveRequestedAt",
  "archiveEffectiveAt",
  "communityLifecycleOperations",
  "readOnly",
  "Stripe",
]) {
  assert.equal(
    lifecycle.includes(forbidden),
    false,
    `lifecycle kernel must not contain ${forbidden}`,
  );
}

console.log("community cold archive lifecycle kernel contract proof passed");
