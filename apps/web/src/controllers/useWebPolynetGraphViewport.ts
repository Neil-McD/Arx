import { useCallback, useEffect, useRef, useState } from "react";

import {
  computeFitTransform,
  computePolynetBounds,
  type PolynetLayoutPosition,
} from "../../../../shared/communityPolynetGraphLayout";

// Interactive viewport for the PolyNet memory graph: pan, zoom-about-cursor, and
// per-node drag. World coordinates come from the deterministic layout (root at
// origin). One SVG user unit equals one CSS pixel, so pointer math stays 1:1.
//
// The graph DOM is rendered conditionally (only once the overview loads), so the
// container/SVG mount *after* this hook first runs. We therefore attach the
// ResizeObserver and the wheel listener through callback refs — they fire when the
// element actually mounts — instead of effects keyed to a ref object that would
// run once (while the element is still null) and never re-run.
//
// A node at world (wx, wy) renders at user-space (tx + wx*scale, ty + wy*scale).

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;
const ZOOM_STEP = 1.2;
const FIT_PADDING = 72;
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
  layout: ReadonlyMap<string, PolynetLayoutPosition>;
  onSelectNode: (nodeId: string) => void;
};

function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

export function useWebPolynetGraphViewport(args: UseWebPolynetGraphViewportArgs) {
  const { layout, onSelectNode } = args;
  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState<PolynetViewportTransform>({ scale: 1, tx: 0, ty: 0 });
  const [dragOverrides, setDragOverrides] = useState<Map<string, PolynetLayoutPosition>>(new Map());
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const transformRef = useRef(transform);
  transformRef.current = transform;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const dragRef = useRef<DragState | null>(null);
  // Once the user manually pans/zooms/drags, stop auto-fitting their view.
  const userAdjustedRef = useRef(false);

  // Live element + listener handles owned by the callback refs below.
  const containerElRef = useRef<HTMLDivElement | null>(null);
  const svgElRef = useRef<SVGSVGElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const wheelCleanupRef = useRef<(() => void) | null>(null);

  // Measure the container and auto-fit until the user takes over.
  const applyMeasure = useCallback((width: number, height: number) => {
    setViewport({ width, height });
    if (!userAdjustedRef.current && width > 0 && height > 0) {
      const bounds = computePolynetBounds(layoutRef.current);
      setTransform(
        computeFitTransform(bounds, { width, height }, {
          padding: FIT_PADDING,
          minScale: MIN_SCALE,
          maxScale: MAX_SCALE,
          defaultScale: 1,
        }),
      );
    }
  }, []);

  const fitView = useCallback(() => {
    const vp = viewportRef.current;
    if (vp.width <= 0 || vp.height <= 0) return;
    const bounds = computePolynetBounds(layoutRef.current);
    setTransform(
      computeFitTransform(bounds, vp, {
        padding: FIT_PADDING,
        minScale: MIN_SCALE,
        maxScale: MAX_SCALE,
        defaultScale: 1,
      }),
    );
  }, []);

  // Callback ref: attach the ResizeObserver + initial fit when the container mounts.
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    containerElRef.current = el;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    applyMeasure(rect.width, rect.height);
    if (typeof ResizeObserver === "undefined") return;
    observerRef.current = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      applyMeasure(entry.contentRect.width, entry.contentRect.height);
    });
    observerRef.current.observe(el);
  }, [applyMeasure]);

  // Callback ref: attach the non-passive wheel listener when the SVG mounts.
  const svgRef = useCallback((el: SVGSVGElement | null) => {
    if (wheelCleanupRef.current) {
      wheelCleanupRef.current();
      wheelCleanupRef.current = null;
    }
    svgElRef.current = el;
    if (!el) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = transformRef.current;
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const nextScale = clampScale(current.scale * factor);
      if (nextScale === current.scale) return;
      userAdjustedRef.current = true;
      const rect = containerElRef.current?.getBoundingClientRect();
      const px = rect ? event.clientX - rect.left : 0;
      const py = rect ? event.clientY - rect.top : 0;
      const ratio = nextScale / current.scale;
      setTransform({
        scale: nextScale,
        tx: px - (px - current.tx) * ratio,
        ty: py - (py - current.ty) * ratio,
      });
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    wheelCleanupRef.current = () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // Disconnect listeners on unmount.
  useEffect(() => () => {
    observerRef.current?.disconnect();
    wheelCleanupRef.current?.();
  }, []);

  // Re-fit when the node set changes (until the user has taken over).
  useEffect(() => {
    if (userAdjustedRef.current) return;
    const el = containerElRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    applyMeasure(rect.width, rect.height);
  }, [layout, applyMeasure]);

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
      // A real pan or node move counts as the user taking over the view.
      userAdjustedRef.current = true;
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
        svgElRef.current?.setPointerCapture(event.pointerId);
      },
    [dragOverrides],
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
    userAdjustedRef.current = true;
    // Zoom about the viewport center for button-driven zoom.
    const vp = viewportRef.current;
    const cx = vp.width / 2;
    const cy = vp.height / 2;
    const ratio = nextScale / current.scale;
    setTransform({
      scale: nextScale,
      tx: cx - (cx - current.tx) * ratio,
      ty: cy - (cy - current.ty) * ratio,
    });
  }, []);

  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP), [zoomBy]);
  // Reset hands the view back to auto-fit framing and drops manual node moves.
  const resetView = useCallback(() => {
    userAdjustedRef.current = false;
    setDragOverrides(new Map());
    fitView();
  }, [fitView]);

  return {
    containerRef,
    svgRef,
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
