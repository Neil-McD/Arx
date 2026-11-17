// Picking something up by its grip and putting it down somewhere else in the
// same list: a course's lessons, the courses on the shelf. The thing lifts
// off the page and follows the pointer; the others slide aside to show the
// gap it would land in; letting go drops it there and saves the order once.
// Pointer events, not the browser's drag-and-drop: the same on a mouse and a
// finger, and it can be dropped anywhere, not only exactly on another item.
import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { orderAfterDrop } from "../../../../shared/communityClassroom";

const SLIDE_MS = 180;

type Held = {
  id: string;
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
};

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
  const onOrderRef = useRef(onOrder);
  onOrderRef.current = onOrder;
  const heldRef = useRef<Held | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  // Where everything was just before the order changed, so it can slide.
  const wasRef = useRef<Map<string, DOMRect> | null>(null);

  const itemsOf = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>(":scope > [data-drag-item]"));

  // The order that is actually on the page: a change asked for is not judged
  // against again until it has been drawn.
  const drawnRef = useRef(orderKey);
  useLayoutEffect(() => {
    drawnRef.current = orderKey;
    const was = wasRef.current;
    wasRef.current = null;
    const container = containerRef.current;
    if (!was || !container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const element of itemsOf(container)) {
      const before = was.get(element.dataset.dragItem ?? "");
      if (!before) continue;
      const now = element.getBoundingClientRect();
      const dx = before.left - now.left;
      const dy = before.top - now.top;
      if (dx || dy) element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: SLIDE_MS, easing: "cubic-bezier(.2,.7,.2,1)" });
    }
  }, [orderKey]);

  const lift = (state: Held) => {
    const box = state.item.getBoundingClientRect();
    const clone = state.item.cloneNode(true) as HTMLElement;
    clone.removeAttribute("data-drag-item");
    clone.setAttribute("aria-hidden", "true");
    Object.assign(clone.style, { position: "fixed", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, margin: "0", zIndex: "60", pointerEvents: "none" });
    state.container.appendChild(clone);
    // "fixed" is measured from an ancestor that is transformed, when there is one.
    const drawn = clone.getBoundingClientRect();
    clone.style.left = `${box.left + (box.left - drawn.left)}px`;
    clone.style.top = `${box.top + (box.top - drawn.top)}px`;
    requestAnimationFrame(() => { for (const name of liftedClass.split(/\s+/).filter(Boolean)) clone.classList.add(name); });
    state.clone = clone;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    setHeld(state.id);
  };

  const move = (event: PointerEvent) => {
    const state = heldRef.current;
    if (!state) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.clone) {
      if (Math.hypot(dx, dy) < 4) return;
      lift(state);
    }
    state.clone!.style.translate = `${dx}px ${dy}px`;
    state.x = event.clientX;
    state.y = event.clientY;
    if (performance.now() >= state.quietUntil) retarget(state);
  };
  // Over another item: take its place, and it slides into ours.
  function retarget(state: Held) {
    if (state.order.join("|") !== drawnRef.current) return;
    const over = itemsOf(state.container).find((element) => {
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
    wasRef.current = new Map(itemsOf(state.container).map((element) => [element.dataset.dragItem ?? "", element.getBoundingClientRect()]));
    state.order = next;
    // Nothing is judged while things are sliding; where the pointer ended up
    // is looked at again once they have stopped.
    state.quietUntil = performance.now() + SLIDE_MS + 40;
    window.setTimeout(() => { if (heldRef.current === state) retarget(state); }, SLIDE_MS + 50);
    setPreview({ order: next, baseKey: state.baseKey });
  }

  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", drop);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", key, true);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    const state = heldRef.current;
    heldRef.current = null;
    return state;
  };
  // The lifted copy settles into the gap, then goes.
  const settle = (state: Held) => {
    const clone = state.clone;
    if (!clone) return;
    const gap = itemsOf(state.container).find((element) => element.dataset.dragItem === state.id);
    const done = () => { clone.remove(); setHeld((current) => (current === state.id ? null : current)); };
    if (!gap) { done(); return; }
    const to = gap.getBoundingClientRect();
    const now = clone.getBoundingClientRect();
    const [x, y] = (clone.style.translate || "0px 0px").split(" ").map((part) => parseFloat(part) || 0);
    for (const name of liftedClass.split(/\s+/).filter(Boolean)) clone.classList.remove(name);
    clone.style.transition = "translate .16s cubic-bezier(.2,.7,.2,1)";
    // Measured while still tilted, so aim by centres.
    clone.style.translate = `${x + (to.left + to.width / 2) - (now.left + now.width / 2)}px ${y + (to.top + to.height / 2) - (now.top + now.height / 2)}px`;
    window.setTimeout(done, 170);
  };
  function drop() {
    const state = stop();
    if (!state || !state.clone) return;
    // A quick flick can let go mid-slide: stop the slide and look once more.
    for (const element of itemsOf(state.container)) for (const animation of element.getAnimations()) animation.finish();
    retarget(state);
    wasRef.current = null;
    // Once the last change is drawn, the copy settles into the gap.
    requestAnimationFrame(() => requestAnimationFrame(() => settle(state)));
    const changed = state.order.some((id, index) => id !== state.from[index]);
    if (!changed) { setPreview(null); return; }
    const shown = { order: state.order, baseKey: state.baseKey };
    setPreview(shown);
    onOrderRef.current(state.order);
    // If the saved order never arrives (the save failed), go back to what is true.
    window.setTimeout(() => setPreview((current) => (current && current.order === shown.order ? null : current)), 6000);
  }
  function cancel() {
    const state = stop();
    if (!state) return;
    if (state.clone) {
      wasRef.current = new Map(itemsOf(state.container).map((element) => [element.dataset.dragItem ?? "", element.getBoundingClientRect()]));
      state.clone.remove();
    }
    setHeld(null);
    setPreview(null);
  }
  function key(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  }

  return {
    // The ids in the order to draw them.
    order,
    // The id that is in the air; its place in the list is the gap.
    held,
    grip: (id: string) => ({
      style: { touchAction: "none" as const },
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        if (event.button !== 0 || heldRef.current) return;
        const item = event.currentTarget.closest<HTMLElement>("[data-drag-item]");
        const container = item?.parentElement;
        if (!item || !container) return;
        event.preventDefault();
        containerRef.current = container;
        heldRef.current = { id, startX: event.clientX, startY: event.clientY, item, container, clone: null, order: orderRef.current, from: orderRef.current, baseKey: idsKey, quietUntil: 0, x: event.clientX, y: event.clientY };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", drop);
        window.addEventListener("pointercancel", cancel);
        window.addEventListener("keydown", key, true);
      },
    }),
    item: (id: string) => ({ "data-drag-item": id }),
  };
}
