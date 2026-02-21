import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";

const DRAG_START_THRESHOLD_PX = 4;
const AUTO_SCROLL_EDGE_PX = 32;
const AUTO_SCROLL_MAX_STEP_PX = 16;

type UseRailPointerReorderArgs = {
  itemIds: string[];
  enabled: boolean;
  onMoveToIndex: (draggedId: string, targetIndex: number) => void;
};

type DragSession = {
  pointerId: number;
  draggedId: string;
  startIndex: number;
  idsSnapshot: string[];
  centersById: Map<string, number>;
  startClientY: number;
  startScrollTop: number;
  baseMinDeltaY: number;
  baseMaxDeltaY: number;
  hasMoved: boolean;
  captureElement: HTMLElement;
};

type DragVisualState = {
  draggedId: string;
  startIndex: number;
  projectedIndex: number;
  deltaY: number;
  active: boolean;
};

type RailPointerBindings = {
  ref: (element: HTMLElement | null) => void;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onClickCapture: (event: MouseEvent<HTMLElement>) => void;
  style: CSSProperties | undefined;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeProjectedIndex(session: DragSession, deltaY: number): number {
  const draggedCenter = (session.centersById.get(session.draggedId) ?? 0) + deltaY;
  const movingDown = deltaY >= 0;
  let index = 0;
  for (const id of session.idsSnapshot) {
    if (id === session.draggedId) continue;
    const center = session.centersById.get(id) ?? 0;
    if (movingDown ? draggedCenter >= center : draggedCenter > center) {
      index += 1;
    }
  }
  return index;
}

function computeAutoScrollStep(container: HTMLElement, pointerClientY: number): number {
  if (container.scrollHeight <= container.clientHeight + 1) return 0;
  const rect = container.getBoundingClientRect();
  const pointerY = clamp(pointerClientY, rect.top, rect.bottom);
  const topEdge = rect.top + AUTO_SCROLL_EDGE_PX;
  const bottomEdge = rect.bottom - AUTO_SCROLL_EDGE_PX;

  let step = 0;
  if (pointerY < topEdge) {
    const intensity = (topEdge - pointerY) / AUTO_SCROLL_EDGE_PX;
    step = -Math.max(1, Math.round(AUTO_SCROLL_MAX_STEP_PX * intensity));
  } else if (pointerY > bottomEdge) {
    const intensity = (pointerY - bottomEdge) / AUTO_SCROLL_EDGE_PX;
    step = Math.max(1, Math.round(AUTO_SCROLL_MAX_STEP_PX * intensity));
  }

  if (step < 0) {
    return Math.max(step, -container.scrollTop);
  }
  if (step > 0) {
    const maxDown = container.scrollHeight - container.clientHeight - container.scrollTop;
    return Math.min(step, maxDown);
  }
  return 0;
}

function computeSiblingShift(session: DragSession, id: string, projectedIndex: number): number {
  const ids = session.idsSnapshot;
  const draggedIndex = session.startIndex;
  const itemIndex = ids.indexOf(id);
  if (itemIndex < 0 || itemIndex === draggedIndex) return 0;

  const centerAt = (index: number): number => {
    const slotId = ids[index];
    return session.centersById.get(slotId) ?? 0;
  };

  if (projectedIndex > draggedIndex && itemIndex > draggedIndex && itemIndex <= projectedIndex) {
    return -(centerAt(itemIndex) - centerAt(itemIndex - 1));
  }
  if (projectedIndex < draggedIndex && itemIndex >= projectedIndex && itemIndex < draggedIndex) {
    return centerAt(itemIndex + 1) - centerAt(itemIndex);
  }
  return 0;
}

export function useRailPointerReorder(args: UseRailPointerReorderArgs) {
  const { itemIds, enabled, onMoveToIndex } = args;
  const containerRef = useRef<HTMLElement | null>(null);
  const itemElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const dragSessionRef = useRef<DragSession | null>(null);
  const dragVisualRef = useRef<DragVisualState | null>(null);
  const onMoveToIndexRef = useRef(onMoveToIndex);
  const suppressNextClickRef = useRef(false);
  const [dragVisual, setDragVisual] = useState<DragVisualState | null>(null);
  const [dragActive, setDragActive] = useState(false);

  onMoveToIndexRef.current = onMoveToIndex;
  dragVisualRef.current = dragVisual;

  const finishDrag = useCallback(
    (commit: boolean) => {
      const session = dragSessionRef.current;
      const visual = dragVisualRef.current;
      if (!session) return;

      if (commit && session.hasMoved && visual && visual.projectedIndex !== session.startIndex) {
        onMoveToIndexRef.current(session.draggedId, visual.projectedIndex);
      }

      if (session.hasMoved) {
        suppressNextClickRef.current = true;
      }

      try {
        if (session.captureElement.hasPointerCapture(session.pointerId)) {
          session.captureElement.releasePointerCapture(session.pointerId);
        }
      } catch {
        // Ignore capture release failures.
      }

      document.body.style.userSelect = "";
      dragSessionRef.current = null;
      setDragVisual(null);
      setDragActive(false);
    },
    [],
  );

  useEffect(() => {
    if (!dragActive) return;

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;

      const container = containerRef.current;
      if (!container) return;

      if (!session.hasMoved) {
        const rawDeltaY = event.clientY - session.startClientY;
        const initialDeltaY = clamp(rawDeltaY, session.baseMinDeltaY, session.baseMaxDeltaY);
        if (Math.abs(initialDeltaY) < DRAG_START_THRESHOLD_PX) return;
        session.hasMoved = true;
        document.body.style.userSelect = "none";
      }

      // Scroll the rail list when dragging near the top/bottom edges.
      const autoScrollStep = computeAutoScrollStep(container, event.clientY);
      if (autoScrollStep !== 0) {
        container.scrollTop += autoScrollStep;
      }

      const scrollDeltaY = container.scrollTop - session.startScrollTop;
      const rawDeltaY = event.clientY - session.startClientY + scrollDeltaY;
      const minDeltaY = session.baseMinDeltaY + scrollDeltaY;
      const maxDeltaY = session.baseMaxDeltaY + scrollDeltaY;
      const deltaY = clamp(rawDeltaY, minDeltaY, maxDeltaY);

      const projectedIndex = computeProjectedIndex(session, deltaY);
      setDragVisual((previous) => {
        if (!previous) return previous;
        if (previous.deltaY === deltaY && previous.projectedIndex === projectedIndex && previous.active) {
          return previous;
        }
        return {
          ...previous,
          active: true,
          deltaY,
          projectedIndex,
        };
      });
      event.preventDefault();
    };

    const handlePointerUp = (event: globalThis.PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      finishDrag(true);
    };

    const handlePointerCancel = (event: globalThis.PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      finishDrag(false);
    };

    const handleWindowBlur = () => {
      finishDrag(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      finishDrag(false);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [dragActive, finishDrag]);

  const setContainerElement = useCallback((element: HTMLElement | null) => {
    containerRef.current = element;
  }, []);

  const setItemElement = useCallback((id: string, element: HTMLElement | null) => {
    if (element) {
      itemElementsRef.current.set(id, element);
      return;
    }
    itemElementsRef.current.delete(id);
  }, []);

  const onPointerDown = useCallback(
    (id: string, event: PointerEvent<HTMLElement>) => {
      if (!enabled) return;
      if (itemIds.length < 2) return;
      if (event.button !== 0 || !event.isPrimary) return;

      const container = containerRef.current;
      const draggedElement = itemElementsRef.current.get(id);
      if (!container || !draggedElement) return;

      const idsSnapshot = itemIds.slice();
      const startIndex = idsSnapshot.indexOf(id);
      if (startIndex < 0) return;

      const containerRect = container.getBoundingClientRect();
      const draggedRect = draggedElement.getBoundingClientRect();
      const centersById = new Map<string, number>();

      for (const itemId of idsSnapshot) {
        const element = itemElementsRef.current.get(itemId);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        centersById.set(itemId, rect.top + rect.height / 2);
      }

      dragSessionRef.current = {
        pointerId: event.pointerId,
        draggedId: id,
        startIndex,
        idsSnapshot,
        centersById,
        startClientY: event.clientY,
        startScrollTop: container.scrollTop,
        baseMinDeltaY: containerRect.top - draggedRect.top,
        baseMaxDeltaY: containerRect.bottom - draggedRect.bottom,
        hasMoved: false,
        captureElement: event.currentTarget,
      };

      setDragVisual({
        draggedId: id,
        startIndex,
        projectedIndex: startIndex,
        deltaY: 0,
        active: false,
      });
      setDragActive(true);

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures.
      }
      event.preventDefault();
    },
    [enabled, itemIds],
  );

  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!suppressNextClickRef.current) return;
    suppressNextClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const getItemBindings = useCallback(
    (id: string): RailPointerBindings => {
      const isDraggingThisItem = dragVisual?.active && dragVisual.draggedId === id;
      let style: CSSProperties | undefined;
      if (dragVisual?.active) {
        const session = dragSessionRef.current;
        if (session) {
          if (isDraggingThisItem) {
            style = {
              transform: `translateY(${dragVisual.deltaY}px)`,
              transition: "none",
              zIndex: 12,
            };
          } else {
            const shift = computeSiblingShift(session, id, dragVisual.projectedIndex);
            style = {
              transform: `translateY(${shift}px)`,
              transition: "transform 120ms ease",
            };
          }
        }
      }

      return {
        ref: (element: HTMLElement | null) => {
          setItemElement(id, element);
        },
        onPointerDown: (event) => {
          onPointerDown(id, event);
        },
        onClickCapture,
        style,
      };
    },
    [dragVisual, onClickCapture, onPointerDown, setItemElement],
  );

  return {
    setContainerElement,
    getItemBindings,
    draggingId: dragVisual?.active ? dragVisual.draggedId : null,
  };
}
