// Deterministic organic layout for the PolyNet community memory graph.
//
// The community root is a seed neuron at the world origin {0,0}. Directory
// memory nodes spread outward on growth rings, but each node's angle and radius
// are perturbed by a stable hash of its id so the field looks grown rather than
// mechanically even. The function is pure and synchronous: the same input always
// produces the same positions (no Math.random / Date), so the graph never jitters
// across re-renders, and it is cheap enough to run every render with no physics loop.

export type PolynetLayoutNodeInput = {
  id: string;
  kind: "community" | "directory_node" | string;
};

export type PolynetLayoutPosition = {
  x: number;
  y: number;
};

// World-space tuning. Units are arbitrary; the viewport maps them to pixels.
const RING_GAP = 130;
const FIRST_RING_RADIUS = 150;
const BASE_RING_CAPACITY = 6;
const ANGLE_JITTER = 0.42; // radians of wobble around the evenly-spaced slot
const RADIUS_JITTER = 0.3; // fraction of RING_GAP

// Deterministic 0..1 hash of a string (FNV-1a derived). Stable across runs.
function hashUnit(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  // Map the 32-bit result into [0, 1).
  return ((hash >>> 0) % 100000) / 100000;
}

// Capacity of ring k (1-based) grows so outer rings hold more nodes.
function ringCapacity(ringIndex: number): number {
  return BASE_RING_CAPACITY * ringIndex;
}

export function computePolynetLayout(
  nodes: ReadonlyArray<PolynetLayoutNodeInput>,
  rootNodeId: string,
): Map<string, PolynetLayoutPosition> {
  const positions = new Map<string, PolynetLayoutPosition>();
  positions.set(rootNodeId, { x: 0, y: 0 });

  const directoryNodes = nodes.filter(
    (node) => node.kind === "directory_node" && node.id !== rootNodeId,
  );

  let ringIndex = 1;
  let positionInRing = 0;
  let capacity = ringCapacity(ringIndex);

  directoryNodes.forEach((node) => {
    if (positionInRing >= capacity) {
      ringIndex += 1;
      positionInRing = 0;
      capacity = ringCapacity(ringIndex);
    }

    const ringRadius = FIRST_RING_RADIUS + (ringIndex - 1) * RING_GAP;
    const angleJitter = (hashUnit(node.id) - 0.5) * 2 * ANGLE_JITTER;
    const radiusJitter = (hashUnit(`${node.id}#r`) - 0.5) * 2 * RADIUS_JITTER * RING_GAP;
    // Offset each ring's starting angle so rings do not line up into spokes.
    const ringPhase = ringIndex * 0.7;
    const slotAngle = (positionInRing / capacity) * Math.PI * 2;
    const angle = -Math.PI / 2 + slotAngle + ringPhase + angleJitter;
    const radius = ringRadius + radiusJitter;

    positions.set(node.id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });

    positionInRing += 1;
  });

  return positions;
}
