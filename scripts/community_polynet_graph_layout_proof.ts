import assert from "node:assert/strict";

import {
  computeFitTransform,
  computePolynetBounds,
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

// Canonical resource source nodes participate; transient activity/approval projections remain ignored.
const withNoise = computePolynetLayout(
  [
    { id: ROOT_ID, kind: "community" },
    { id: "chat:1", kind: "chat_activity" },
    { id: "approval:1", kind: "forming_memory" },
    { id: "node:a", kind: "directory_node" },
    { id: "resource_node:1", kind: "resource_node" },
  ],
  ROOT_ID,
);
assert.equal(withNoise.size, 3, "root, learned memory, and canonical resource memory should be placed");
assert.ok(withNoise.has("node:a"), "directory node should be placed");
assert.ok(withNoise.has("resource_node:1"), "resource source node should be placed");
assert.ok(!withNoise.has("chat:1"), "non-directory activity should not be placed");
assert.ok(!withNoise.has("approval:1"), "approval-plane projections should not be placed");

// A projected provenance edge must materially pull a retained memory toward its
// canonical resource source; otherwise the new topology would be decorative only.
const provenanceNodes: PolynetLayoutNodeInput[] = [
  { id: ROOT_ID, kind: "community" },
  { id: "directory_node:claim", kind: "directory_node" },
  { id: "resource_node:source", kind: "resource_node" },
  { id: "directory_node:other", kind: "directory_node" },
];
const containmentEdges = [{ from: ROOT_ID, to: "resource_node:source" }];
const withoutDerivation = computePolynetLayout(provenanceNodes, ROOT_ID, containmentEdges);
const withDerivation = computePolynetLayout(provenanceNodes, ROOT_ID, [
  ...containmentEdges,
  { from: "directory_node:claim", to: "resource_node:source" },
]);
const provenanceDistance = (layout: Map<string, { x: number; y: number }>) => {
  const memory = layout.get("directory_node:claim")!;
  const resource = layout.get("resource_node:source")!;
  return Math.hypot(memory.x - resource.x, memory.y - resource.y);
};
assert.ok(
  provenanceDistance(withDerivation) < provenanceDistance(withoutDerivation),
  "derived resource lineage should form a visible memory-source cluster",
);

// --- bounds ---
const seedBounds = computePolynetBounds(computePolynetLayout(makeNodes(0), ROOT_ID));
assert.deepEqual(
  seedBounds,
  { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  "lone seed bounds should collapse to the origin",
);
const popBounds = computePolynetBounds(populated);
assert.ok(popBounds.minX < 0 && popBounds.maxX > 0, "populated bounds should span the origin on x");
assert.ok(popBounds.minY < 0 && popBounds.maxY > 0, "populated bounds should span the origin on y");
for (const [, pos] of populated) {
  assert.ok(pos.x >= popBounds.minX - 1e-6 && pos.x <= popBounds.maxX + 1e-6, "x within bounds");
  assert.ok(pos.y >= popBounds.minY - 1e-6 && pos.y <= popBounds.maxY + 1e-6, "y within bounds");
}

// --- fit transform ---
const VP = { width: 800, height: 500 };
// Lone seed: centered at viewport center, default scale, clamped.
const seedFit = computeFitTransform(seedBounds, VP, { padding: 72, minScale: 0.4, maxScale: 3, defaultScale: 1 });
assert.equal(seedFit.scale, 1, "lone seed should use the default scale");
assert.equal(seedFit.tx, 400, "lone seed should center x at viewport center");
assert.equal(seedFit.ty, 250, "lone seed should center y at viewport center");

// Populated: content center maps to viewport center; scale within clamp range.
const popFit = computeFitTransform(popBounds, VP, { padding: 72, minScale: 0.4, maxScale: 3, defaultScale: 1 });
assert.ok(popFit.scale >= 0.4 && popFit.scale <= 3, "fit scale stays clamped");
const cx = (popBounds.minX + popBounds.maxX) / 2;
const cy = (popBounds.minY + popBounds.maxY) / 2;
assert.ok(Math.abs(popFit.tx + cx * popFit.scale - VP.width / 2) < 1e-6, "content center maps to viewport center x");
assert.ok(Math.abs(popFit.ty + cy * popFit.scale - VP.height / 2) < 1e-6, "content center maps to viewport center y");

// Clamp: enormous content floors at minScale; tiny content caps at maxScale.
const hugeFit = computeFitTransform({ minX: -100000, minY: -100000, maxX: 100000, maxY: 100000 }, VP, { padding: 72, minScale: 0.4, maxScale: 3 });
assert.equal(hugeFit.scale, 0.4, "huge content should floor at minScale");
const tinyFit = computeFitTransform({ minX: -1, minY: -1, maxX: 1, maxY: 1 }, VP, { padding: 72, minScale: 0.4, maxScale: 3 });
assert.equal(tinyFit.scale, 3, "tiny content should cap at maxScale");

console.log("Community Polynet graph layout proof passed");
