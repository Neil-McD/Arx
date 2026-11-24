// Picking something up by its grip and putting it down somewhere else in the
// same list: a course's lessons, the courses on the shelf. The thing lifts
// off the page and follows the pointer; the others slide aside to show the
// gap it would land in; letting go drops it there and saves the order once.
// Pointer events, not the browser's drag-and-drop: the same on a mouse and a
// finger, and it can be dropped anywhere, not only exactly on another item.
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { orderAfterDrop } from "../../../../shared/communityClassroom";

export const SLIDE_MS = 180;
// Long-press delay when picking up a card directly (not its grip): long enough
// that a normal tap opens the item and a swipe scrolls the page, short enough
// that tap-and-hold feels immediate.
export const HOLD_MS = 220;
export const HOLD_SLOP_PX = 8;

type Held = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  item: HTMLElement;
  container: HTMLElement;
  clone: HTMLElement | null;
  order: string[];
  from: string[];
  baseKey: string;
  quietUntil: number;
  x: number;
  y: number;
  fromHold: boolean;
};

type TimerHandle = ReturnType<typeof setTimeout> | number;

type PendingHold = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  item: HTMLElement;
  container: HTMLElement;
  timer: TimerHandle;
};

export type DragOrderHost = {
  addEventListener: (type: string, listener: any, options?: any) => void;
  removeEventListener: (type: string, listener: any, options?: any) => void;
  setTimeout: (fn: () => void, ms: number) => TimerHandle;
  clearTimeout: (id: TimerHandle) => void;
  requestAnimationFrame: (fn: () => void) => void;
  now: () => number;
  setBodyDragStyle: (active: boolean) => void;
};

export function createDragOrderController(opts: {
  getOrder: () => string[];
  getIdsKey: () => string;
  getDrawnKey: () => string;
  liftedClass: string;
  onOrder: (ids: string[]) => void;
  onHeldChange: (id: string | null | ((current: string | null) => string | null)) => void;
  onPreviewChange: (
    next:
      | { order: string[]; baseKey: string }
      | null
      | ((current: { order: string[]; baseKey: string } | null) => { order: string[]; baseKey: string } | null),
  ) => void;
  onBeforeReorder?: (container: HTMLElement, items: HTMLElement[]) => void;
  host: DragOrderHost;
}) {
  const { host } = opts;
  let heldState: Held | null = null;
  let pendingHold: PendingHold | null = null;
  let suppressClickUntil = 0;
  let activeContainer: HTMLElement | null = null;

  const itemsOf = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>(":scope > [data-drag-item]"));

  const blockTouchScroll = (event: { preventDefault: () => void }) => {
    if (heldState?.clone) event.preventDefault();
  };

  const lift = (state: Held) => {
    const box = state.item.getBoundingClientRect();
    const clone = state.item.cloneNode(true) as HTMLElement;
    clone.removeAttribute("data-drag-item");
    clone.setAttribute("aria-hidden", "true");
    Object.assign(clone.style, {
      position: "fixed",
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      margin: "0",
      zIndex: "60",
      pointerEvents: "none",
    });
    state.container.appendChild(clone);
    // "fixed" is measured from an ancestor that is transformed, when there is one.
    const drawn = clone.getBoundingClientRect();
    clone.style.left = `${box.left + (box.left - drawn.left)}px`;
    clone.style.top = `${box.top + (box.top - drawn.top)}px`;
    host.requestAnimationFrame(() => {
      for (const name of opts.liftedClass.split(/\s+/).filter(Boolean)) clone.classList.add(name);
    });
    state.clone = clone;
    host.setBodyDragStyle(true);
    host.addEventListener("touchmove", blockTouchScroll, { passive: false });
    opts.onHeldChange(state.id);
  };

  const retarget = (state: Held) => {
    if (state.order.join("|") !== opts.getDrawnKey()) return;
    const items = itemsOf(state.container);
    const over = items.find((element) => {
      if (element.dataset.dragItem === state.id) return false;
      const box = element.getBoundingClientRect();
      return state.x >= box.left && state.x <= box.right && state.y >= box.top && state.y <= box.bottom;
    });
    const target = over?.dataset.dragItem;
    if (!target) return;
    const from = state.order.indexOf(state.id);
    const to = state.order.indexOf(target);
    if (from < 0 || to < 0) return;
    const next = orderAfterDrop(state.order, state.id, from < to ? state.order[to + 1] ?? null : target);
    if (!next) return;
    opts.onBeforeReorder?.(state.container, items);
    state.order = next;
    // Nothing is judged while things are sliding; where the pointer ended up
    // is looked at again once they have stopped.
    state.quietUntil = host.now() + SLIDE_MS + 40;
    host.setTimeout(() => {
      if (heldState === state) retarget(state);
    }, SLIDE_MS + 50);
    opts.onPreviewChange({ order: next, baseKey: state.baseKey });
  };

  const move = (event: { pointerId: number; clientX: number; clientY: number }) => {
    const state = heldState;
    if (!state || event.pointerId !== state.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.clone) {
      if (Math.hypot(dx, dy) < 4) return;
      lift(state);
    }
    state.clone!.style.translate = `${dx}px ${dy}px`;
    state.x = event.clientX;
    state.y = event.clientY;
    if (host.now() >= state.quietUntil) retarget(state);
  };

  const stop = () => {
    host.removeEventListener("pointermove", move);
    host.removeEventListener("pointerup", drop);
    host.removeEventListener("pointercancel", cancel);
    host.removeEventListener("keydown", key, true);
    host.removeEventListener("touchmove", blockTouchScroll);
    host.setBodyDragStyle(false);
    const state = heldState;
    heldState = null;
    return state;
  };

  const watchPendingHold = (event: { pointerId: number; clientX: number; clientY: number }) => {
    const pending = pendingHold;
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > HOLD_SLOP_PX) {
      clearPendingHold();
    }
  };

  const clearPendingHold = () => {
    const pending = pendingHold;
    if (!pending) return;
    host.clearTimeout(pending.timer);
    host.removeEventListener("pointermove", watchPendingHold);
    host.removeEventListener("pointerup", clearPendingHold);
    host.removeEventListener("pointercancel", clearPendingHold);
    pendingHold = null;
  };

  const settle = (state: Held) => {
    const clone = state.clone;
    if (!clone) return;
    const gap = itemsOf(state.container).find((element) => element.dataset.dragItem === state.id);
    const done = () => {
      clone.remove();
      opts.onHeldChange((current) => (current === state.id ? null : current));
    };
    if (!gap) {
      done();
      return;
    }
    const to = gap.getBoundingClientRect();
    const now = clone.getBoundingClientRect();
    const [x, y] = (clone.style.translate || "0px 0px").split(" ").map((part) => parseFloat(part) || 0);
    for (const name of opts.liftedClass.split(/\s+/).filter(Boolean)) clone.classList.remove(name);
    clone.style.transition = "translate .16s cubic-bezier(.2,.7,.2,1)";
    clone.style.translate = `${x + (to.left + to.width / 2) - (now.left + now.width / 2)}px ${y + (to.top + to.height / 2) - (now.top + now.height / 2)}px`;
    host.setTimeout(done, 170);
  };

  function drop(event?: { pointerId: number }) {
    if (event && heldState && event.pointerId !== heldState.pointerId) return;
    const state = stop();
    if (!state || !state.clone) return;
    if (state.fromHold) suppressClickUntil = host.now() + 400;
    for (const element of itemsOf(state.container)) {
      if (typeof element.getAnimations === "function") {
        for (const animation of element.getAnimations()) animation.finish();
      }
    }
    retarget(state);
    host.requestAnimationFrame(() => host.requestAnimationFrame(() => settle(state)));
    const changed = state.order.some((id, index) => id !== state.from[index]);
    if (!changed) {
      opts.onPreviewChange(null);
      return;
    }
    const shown = { order: state.order, baseKey: state.baseKey };
    opts.onPreviewChange(shown);
    opts.onOrder(state.order);
    host.setTimeout(() => opts.onPreviewChange((current) => (current && current.order === shown.order ? null : current)), 6000);
  }

  function cancel(event?: { pointerId: number }) {
    if (event && heldState && event.pointerId !== heldState.pointerId) return;
    const state = stop();
    if (!state) return;
    if (state.fromHold && state.clone) suppressClickUntil = host.now() + 400;
    if (state.clone) {
      opts.onBeforeReorder?.(state.container, itemsOf(state.container));
      state.clone.remove();
    }
    opts.onHeldChange(null);
    opts.onPreviewChange(null);
  }

  function key(event: { key: string; preventDefault: () => void; stopPropagation: () => void }) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  }

  const beginDrag = (state: Held, immediateLift: boolean) => {
    activeContainer = state.container;
    heldState = state;
    if (immediateLift) lift(state);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", drop);
    host.addEventListener("pointercancel", cancel);
    host.addEventListener("keydown", key, true);
  };

  return {
    getContainer: () => activeContainer,
    dispose: () => {
      clearPendingHold();
      const active = stop();
      active?.clone?.remove();
    },
    grip: (id: string) => ({
      style: { touchAction: "none" as const },
      onPointerDown: (event: Pick<ReactPointerEvent<HTMLElement>, "button" | "pointerId" | "clientX" | "clientY" | "currentTarget" | "preventDefault">) => {
        if (event.button !== 0 || heldState) return;
        const item = event.currentTarget.closest<HTMLElement>("[data-drag-item]");
        const container = item?.parentElement;
        if (!item || !container) return;
        clearPendingHold();
        event.preventDefault();
        beginDrag(
          {
            id,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            item,
            container,
            clone: null,
            order: opts.getOrder(),
            from: opts.getOrder(),
            baseKey: opts.getIdsKey(),
            quietUntil: 0,
            x: event.clientX,
            y: event.clientY,
            fromHold: false,
          },
          false,
        );
      },
    }),
    // Tap-and-hold (or click-and-hold) directly on a card: lifts after HOLD_MS
    // while normal taps still open it and touch swipes still scroll the page.
    hold: (id: string) => ({
      onPointerDown: (event: Pick<ReactPointerEvent<HTMLElement>, "button" | "pointerId" | "clientX" | "clientY" | "currentTarget">) => {
        if (event.button !== 0 || heldState || pendingHold) return;
        const item = event.currentTarget.closest<HTMLElement>("[data-drag-item]");
        const container = item?.parentElement;
        if (!item || !container) return;
        const { pointerId, clientX: startX, clientY: startY } = event;
        const timer = host.setTimeout(() => {
          const pending = pendingHold;
          if (!pending || pending.pointerId !== pointerId || heldState) return;
          clearPendingHold();
          beginDrag(
            {
              id,
              pointerId,
              startX,
              startY,
              item,
              container,
              clone: null,
              order: opts.getOrder(),
              from: opts.getOrder(),
              baseKey: opts.getIdsKey(),
              quietUntil: 0,
              x: startX,
              y: startY,
              fromHold: true,
            },
            true,
          );
        }, HOLD_MS);
        pendingHold = { id, pointerId, startX, startY, item, container, timer };
        host.addEventListener("pointermove", watchPendingHold);
        host.addEventListener("pointerup", clearPendingHold);
        host.addEventListener("pointercancel", clearPendingHold);
      },
      onClickCapture: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
        if (host.now() < suppressClickUntil) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      onContextMenu: (event: { preventDefault: () => void }) => {
        if (heldState?.fromHold || pendingHold || host.now() < suppressClickUntil) {
          event.preventDefault();
        }
      },
    }),
  };
}

export function useDragOrder(ids: string[], onOrder: (ids: string[]) => void, liftedClass: string) {
  const [held, setHeld] = useState<string | null>(null);
  // The order shown while something is held, and after the drop until the
  // saved order arrives.
  const [preview, setPreview] = useState<{ order: string[]; baseKey: string } | null>(null);
  const idsKey = ids.join("|");
  const order = preview && preview.baseKey === idsKey ? preview.order : ids;
  const orderKey = order.join("|");
  const orderRef = useRef(order);
  orderRef.current = order;
  const idsKeyRef = useRef(idsKey);
  idsKeyRef.current = idsKey;
  const onOrderRef = useRef(onOrder);
  onOrderRef.current = onOrder;
  const wasRef = useRef<Map<string, DOMRect> | null>(null);
  const drawnRef = useRef(orderKey);

  const controllerRef = useRef<ReturnType<typeof createDragOrderController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createDragOrderController({
      getOrder: () => orderRef.current,
      getIdsKey: () => idsKeyRef.current,
      getDrawnKey: () => drawnRef.current,
      liftedClass,
      onOrder: (next) => onOrderRef.current(next),
      onHeldChange: setHeld,
      onPreviewChange: setPreview,
      onBeforeReorder: (_container, items) => {
        wasRef.current = new Map(items.map((element) => [element.dataset.dragItem ?? "", element.getBoundingClientRect()]));
      },
      host: {
        addEventListener: (type, listener, options) => window.addEventListener(type, listener, options),
        removeEventListener: (type, listener, options) => window.removeEventListener(type, listener, options),
        setTimeout: (fn, ms) => window.setTimeout(fn, ms),
        clearTimeout: (id) => window.clearTimeout(id as number),
        requestAnimationFrame: (fn) => { window.requestAnimationFrame(fn); },
        now: () => performance.now(),
        setBodyDragStyle: (active) => {
          document.body.style.userSelect = active ? "none" : "";
          document.body.style.cursor = active ? "grabbing" : "";
        },
      },
    });
  }

  useLayoutEffect(() => {
    drawnRef.current = orderKey;
    const was = wasRef.current;
    wasRef.current = null;
    const container = controllerRef.current?.getContainer();
    if (!was || !container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const element of Array.from(container.querySelectorAll<HTMLElement>(":scope > [data-drag-item]"))) {
      const before = was.get(element.dataset.dragItem ?? "");
      if (!before) continue;
      const now = element.getBoundingClientRect();
      const dx = before.left - now.left;
      const dy = before.top - now.top;
      if (dx || dy) element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: SLIDE_MS, easing: "cubic-bezier(.2,.7,.2,1)" });
    }
  }, [orderKey]);

  useEffect(() => () => controllerRef.current?.dispose(), []);

  return {
    order,
    held,
    grip: (id: string) => controllerRef.current!.grip(id),
    hold: (id: string) => controllerRef.current!.hold(id),
    item: (id: string) => ({ "data-drag-item": id }),
  };
}
