import assert from "node:assert/strict";

import {
  computePolynetLayout,
  type PolynetLayoutNodeInput,
} from "../shared/communityPolynetGraphLayout.ts";

const ROOT_ID = "community:test";

function makeNodes(count: number): PolynetLayoutNodeInput[] {
  const nodes: PolynetLayoutNodeInput[] = [
    { id: ROOT_ID, kind: "community" },
  ];
  for (let index = 0; index < count; index += 1) {
    nodes.push({ id: `node:${index}`, kind: "directory_node" });
  }
  return nodes;
}

// Root anchors the seed neuron at the world origin.
const empty = computePolynetLayout(makeNodes(0), ROOT_ID);
assert.equal(empty.size, 1, "empty directory should yield only the root position");
const rootPos = empty.get(ROOT_ID);
assert.ok(rootPos, "root must be placed");
assert.equal(rootPos?.x, 0, "root x should be origin");
assert.equal(rootPos?.y, 0, "root y should be origin");

// Every directory node is placed, plus the root.
const populated = computePolynetLayout(makeNodes(40), ROOT_ID);
assert.equal(populated.size, 41, "root + 40 directory nodes should all be placed");

// Determinism: same input → identical positions across calls (no random/Date).
const again = computePolynetLayout(makeNodes(40), ROOT_ID);
for (const [id, pos] of populated) {
  const other = again.get(id);
  assert.ok(other, `node ${id} should be placed in both runs`);
  assert.equal(other?.x, pos.x, `node ${id} x should be deterministic`);
  assert.equal(other?.y, pos.y, `node ${id} y should be deterministic`);
}

// No two nodes share an exact position (would render as a single dot).
const seen = new Set<string>();
for (const [, pos] of populated) {
  const key = `${pos.x.toFixed(4)},${pos.y.toFixed(4)}`;
  assert.ok(!seen.has(key), `position ${key} should be unique`);
  seen.add(key);
}

// Directory nodes sit away from the origin (they orbit the seed).
for (const [id, pos] of populated) {
  if (id === ROOT_ID) continue;
  const distance = Math.hypot(pos.x, pos.y);
  assert.ok(distance > 50, `directory node ${id} should orbit the root, got ${distance}`);
}

// Non-directory, non-root kinds are ignored (only retained memory becomes graph material).
const withNoise = computePolynetLayout(
  [
    { id: ROOT_ID, kind: "community" },
    { id: "chat:1", kind: "chat_activity" },
    { id: "node:a", kind: "directory_node" },
  ],
  ROOT_ID,
);
assert.equal(withNoise.size, 2, "only root + directory nodes should be placed");
assert.ok(withNoise.has("node:a"), "directory node should be placed");
assert.ok(!withNoise.has("chat:1"), "non-directory activity should not be placed");

console.log("Community PolyNet graph layout proof passed");
