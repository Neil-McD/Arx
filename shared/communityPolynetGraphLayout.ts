// Deterministic organic layout for the Polynet community memory graph.
//
// The community root is a seed neuron at the world origin {0,0}. Directory
// memory nodes spread outward on growth rings, but each node's angle and radius
// are perturbed by a stable hash of its id so the field looks grown rather than
// mechanically even. The function is pure and synchronous: the same input always
// produces the same positions (no Math.random / Date), so the graph never jitters
// across re-renders, and it is cheap enough to run every render with no physics loop.

export type PolynetLayoutNodeInput = {
  id: string;
  kind: "community" | "forming_memory" | "directory_node" | string;
};

export type PolynetLayoutEdgeInput = {
  from: string;
  to: string;
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
const FORMING_RING_RADIUS = 92;
const FORMING_RADIUS_JITTER = 10;

// Force-relaxation tuning (Fruchterman-Reingold). The ring layout above is only a
// deterministic *seed*; when edges are supplied we relax it so linked nodes cluster
// (the Obsidian feel). The pass is pure/deterministic — it starts from the seed and
// iterates fixed math, no Math.random / Date — so the graph never jitters.
const IDEAL_EDGE_LENGTH = 165; // k — the natural spring rest length
const RELAX_ITERATIONS = 160;
const RELAX_GRAVITY = 0.025; // mild pull to origin so disconnected clusters don't drift off
const RELAX_INITIAL_TEMP = IDEAL_EDGE_LENGTH * 1.1;
const RELAX_COOLING = 0.955;
const RELAX_MIN_TEMP = 2;

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
  edges: ReadonlyArray<PolynetLayoutEdgeInput> = [],
): Map<string, PolynetLayoutPosition> {
  const positions = new Map<string, PolynetLayoutPosition>();
  positions.set(rootNodeId, { x: 0, y: 0 });

  const directoryNodes = nodes.filter(
    (node) => node.kind === "directory_node" && node.id !== rootNodeId,
  );
  const formingNodes = nodes
    .filter((node) => node.kind === "forming_memory" && node.id !== rootNodeId)
    .sort((a, b) => a.id.localeCompare(b.id));

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

  // Relax the seed with edge springs so connected memory clusters pull together.
  relaxPolynetLayout(positions, rootNodeId, edges);

  // Transient formation belongs close to the organism core and must not move
  // retained memory. Place it after durable nodes have finished relaxing.
  formingNodes.forEach((node, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(1, formingNodes.length)) * Math.PI * 2;
    const radius = FORMING_RING_RADIUS + (hashUnit(`${node.id}#forming`) - 0.5) * 2 * FORMING_RADIUS_JITTER;
    positions.set(node.id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  });

  return positions;
}

// In-place Fruchterman-Reingold relaxation. `positions` already holds the ring seed;
// the root stays pinned at the origin (the community "core" everything orbits).
function relaxPolynetLayout(
  positions: Map<string, PolynetLayoutPosition>,
  rootNodeId: string,
  edges: ReadonlyArray<PolynetLayoutEdgeInput>,
): void {
  const ids = Array.from(positions.keys());
  if (ids.length < 3 || edges.length === 0) return;

  // Only springs whose endpoints both exist and differ pull on the layout.
  const springs = edges.filter(
    (edge) => edge.from !== edge.to && positions.has(edge.from) && positions.has(edge.to),
  );
  if (springs.length === 0) return;

  const k = IDEAL_EDGE_LENGTH;
  let temp = RELAX_INITIAL_TEMP;

  for (let iteration = 0; iteration < RELAX_ITERATIONS; iteration += 1) {
    const disp = new Map<string, PolynetLayoutPosition>();
    for (const id of ids) disp.set(id, { x: 0, y: 0 });

    // Repulsion between every pair (O(n^2); n is bounded to <=120 nodes).
    for (let i = 0; i < ids.length; i += 1) {
      const a = positions.get(ids[i])!;
      const da = disp.get(ids[i])!;
      for (let j = i + 1; j < ids.length; j += 1) {
        const b = positions.get(ids[j])!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          // Break exact overlaps deterministically using id order.
          dx = (i - j) * 0.01;
          dy = 0.01;
          dist = Math.hypot(dx, dy);
        }
        const force = (k * k) / dist;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        da.x += fx;
        da.y += fy;
        const db = disp.get(ids[j])!;
        db.x -= fx;
        db.y -= fy;
      }
    }

    // Attraction along springs.
    for (const spring of springs) {
      const a = positions.get(spring.from)!;
      const b = positions.get(spring.to)!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.max(0.01, Math.hypot(dx, dy));
      const force = (dist * dist) / k;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const da = disp.get(spring.from)!;
      const db = disp.get(spring.to)!;
      da.x -= fx;
      da.y -= fy;
      db.x += fx;
      db.y += fy;
    }

    // Apply displacement (capped by temperature), with a mild pull to origin.
    for (const id of ids) {
      if (id === rootNodeId) continue;
      const p = positions.get(id)!;
      const d = disp.get(id)!;
      d.x -= p.x * RELAX_GRAVITY;
      d.y -= p.y * RELAX_GRAVITY;
      const len = Math.hypot(d.x, d.y);
      if (len > 0.0001) {
        const step = Math.min(len, temp);
        p.x += (d.x / len) * step;
        p.y += (d.y / len) * step;
      }
    }

    // Root stays fixed at the center.
    positions.set(rootNodeId, { x: 0, y: 0 });
    temp = Math.max(RELAX_MIN_TEMP, temp * RELAX_COOLING);
  }
}

export type PolynetBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type PolynetViewport = {
  width: number;
  height: number;
};

export type PolynetFitTransform = {
  scale: number;
  tx: number;
  ty: number;
};

// Axis-aligned bounding box of all placed node positions. A single seed at the
// origin yields a zero-size box centered on the origin.
export function computePolynetBounds(
  positions: ReadonlyArray<PolynetLayoutPosition> | ReadonlyMap<string, PolynetLayoutPosition>,
): PolynetBounds {
  const list = positions instanceof Map ? Array.from(positions.values()) : (positions as ReadonlyArray<PolynetLayoutPosition>);
  if (!list.length) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of list) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// Viewport transform (1 unit == 1 CSS px) that centers `bounds` and scales it to
// fit `viewport` with `padding` px of margin, clamped to [minScale, maxScale].
// A point at world (wx, wy) renders at (tx + wx*scale, ty + wy*scale).
export function computeFitTransform(
  bounds: PolynetBounds,
  viewport: PolynetViewport,
  options: { padding?: number; minScale?: number; maxScale?: number; defaultScale?: number } = {},
): PolynetFitTransform {
  const padding = options.padding ?? 64;
  const minScale = options.minScale ?? 0.4;
  const maxScale = options.maxScale ?? 3;
  const defaultScale = options.defaultScale ?? 1;
  const vw = Math.max(0, viewport.width);
  const vh = Math.max(0, viewport.height);

  const contentW = bounds.maxX - bounds.minX;
  const contentH = bounds.maxY - bounds.minY;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  const availW = Math.max(1, vw - padding * 2);
  const availH = Math.max(1, vh - padding * 2);

  let scale: number;
  if (contentW <= 0 && contentH <= 0) {
    // Single seed (or coincident points): no content extent to fit.
    scale = defaultScale;
  } else {
    const fitW = contentW > 0 ? availW / contentW : Infinity;
    const fitH = contentH > 0 ? availH / contentH : Infinity;
    scale = Math.min(fitW, fitH);
  }
  scale = Math.max(minScale, Math.min(maxScale, scale));

  // Place the content center at the viewport center.
  return {
    scale,
    tx: vw / 2 - centerX * scale,
    ty: vh / 2 - centerY * scale,
  };
}
