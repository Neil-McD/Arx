import { useCallback, useEffect, useRef, useState } from "react";

import type { PolynetLayoutPosition } from "../../../../shared/communityPolynetGraphLayout";

// Interactive viewport for the PolyNet memory graph: pan, zoom-about-cursor, and
// per-node drag. World coordinates come from the deterministic layout (root at
// origin). The SVG viewBox is sized to match the shell in CSS pixels, so one SVG
// user unit equals one CSS pixel and pointer math stays 1:1 for panning.
//
// A node at world (wx, wy) renders at user-space (tx + wx*scale, ty + wy*scale).

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;
const ZOOM_STEP = 1.2;
// Pointer travel (CSS px) below which a press counts as a click, not a drag.
const CLICK_MOVE_THRESHOLD = 3;

export type PolynetViewportTransform = {
  scale: number;
  tx: number;
  ty: number;
};

type DragKind = "none" | "pan" | "node";

type DragState = {
  kind: DragKind;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startTx: number;
  startTy: number;
  nodeId: string | null;
  nodeStartWorld: PolynetLayoutPosition | null;
  moved: boolean;
};

type UseWebPolynetGraphViewportArgs = {
  svgRef: React.RefObject<SVGSVGElement | null>;
  onSelectNode: (nodeId: string) => void;
};

function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

export function useWebPolynetGraphViewport(args: UseWebPolynetGraphViewportArgs) {
  const { svgRef, onSelectNode } = args;
  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;

  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState<PolynetViewportTransform>({ scale: 1, tx: 0, ty: 0 });
  const [dragOverrides, setDragOverrides] = useState<Map<string, PolynetLayoutPosition>>(new Map());
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const transformRef = useRef(transform);
  transformRef.current = transform;
  const dragRef = useRef<DragState | null>(null);
  // Once the viewport has a size we center the world origin once.
  const centeredRef = useRef(false);

  // Keep the SVG user space equal to its CSS pixel box and center the seed once.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setViewport({ width, height });
      if (!centeredRef.current && width > 0 && height > 0) {
        centeredRef.current = true;
        setTransform({ scale: 1, tx: width / 2, ty: height / 2 });
      }
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [svgRef]);

  const pointerToUserSpace = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: clientX - rect.left, y: clientY - rect.top };
    },
    [svgRef],
  );

  // Wheel zoom must preventDefault, so attach a non-passive listener directly.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = transformRef.current;
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const nextScale = clampScale(current.scale * factor);
      if (nextScale === current.scale) return;
      const point = pointerToUserSpace(event.clientX, event.clientY);
      // Keep the point under the cursor fixed while scaling.
      const ratio = nextScale / current.scale;
      setTransform({
        scale: nextScale,
        tx: point.x - (point.x - current.tx) * ratio,
        ty: point.y - (point.y - current.ty) * ratio,
      });
    };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [svgRef, pointerToUserSpace]);

  const endDrag = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDraggingNodeId(null);
    setIsPanning(false);
    // A press that never really moved on a node is a selection.
    if (drag.kind === "node" && drag.nodeId && !drag.moved) {
      onSelectNodeRef.current(drag.nodeId);
    }
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    if (!drag.moved && Math.hypot(dx, dy) > CLICK_MOVE_THRESHOLD) {
      drag.moved = true;
    }
    if (drag.kind === "pan") {
      setTransform((prev) => ({ ...prev, tx: drag.startTx + dx, ty: drag.startTy + dy }));
      return;
    }
    if (drag.kind === "node" && drag.nodeId && drag.nodeStartWorld) {
      // Convert pixel travel into world travel by dividing out the scale.
      const scale = transformRef.current.scale || 1;
      const nextWorld = {
        x: drag.nodeStartWorld.x + dx / scale,
        y: drag.nodeStartWorld.y + dy / scale,
      };
      setDragOverrides((prev) => {
        const next = new Map(prev);
        next.set(drag.nodeId as string, nextWorld);
        return next;
      });
    }
  }, []);

  const handleBackgroundPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const current = transformRef.current;
    dragRef.current = {
      kind: "pan",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startTx: current.tx,
      startTy: current.ty,
      nodeId: null,
      nodeStartWorld: null,
      moved: false,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const makeNodePointerDownHandler = useCallback(
    (nodeId: string, worldPos: PolynetLayoutPosition) =>
      (event: React.PointerEvent) => {
        if (event.button !== 0) return;
        // Stop the background pan from also starting.
        event.stopPropagation();
        const current = transformRef.current;
        const startWorld = dragOverrides.get(nodeId) ?? worldPos;
        dragRef.current = {
          kind: "node",
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startTx: current.tx,
          startTy: current.ty,
          nodeId,
          nodeStartWorld: startWorld,
          moved: false,
        };
        setDraggingNodeId(nodeId);
        // Capture on the SVG so the shared move/up handlers keep receiving events.
        svgRef.current?.setPointerCapture(event.pointerId);
      },
    [dragOverrides, svgRef],
  );

  const worldPositionFor = useCallback(
    (nodeId: string, layoutPos: PolynetLayoutPosition | undefined): PolynetLayoutPosition =>
      dragOverrides.get(nodeId) ?? layoutPos ?? { x: 0, y: 0 },
    [dragOverrides],
  );

  const zoomBy = useCallback((factor: number) => {
    const current = transformRef.current;
    const nextScale = clampScale(current.scale * factor);
    if (nextScale === current.scale) return;
    // Zoom about the viewport center for button-driven zoom.
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    const ratio = nextScale / current.scale;
    setTransform({
      scale: nextScale,
      tx: cx - (cx - current.tx) * ratio,
      ty: cy - (cy - current.ty) * ratio,
    });
  }, [viewport.width, viewport.height]);

  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP), [zoomBy]);
  const resetView = useCallback(() => {
    setDragOverrides(new Map());
    setTransform({ scale: 1, tx: viewport.width / 2, ty: viewport.height / 2 });
  }, [viewport.width, viewport.height]);

  return {
    viewport,
    transform,
    isPanning,
    draggingNodeId,
    worldPositionFor,
    handlers: {
      onBackgroundPointerDown: handleBackgroundPointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      makeNodePointerDownHandler,
    },
    actions: { zoomIn, zoomOut, resetView },
  };
}
