import { afterEach, describe, expect, it, vi } from "vitest";
import { createDragOrderController, HOLD_MS, type DragOrderHost } from "../apps/web/src/v1/useDragOrder";

type FakeElement = {
  dataset: Record<string, string>;
  style: Record<string, string>;
  classList: { add: (name: string) => void; remove: (name: string) => void; classes: Set<string> };
  parentElement: FakeContainer | null;
  removed: boolean;
  getBoundingClientRect: () => { left: number; top: number; right: number; bottom: number; width: number; height: number };
  cloneNode: () => FakeElement;
  removeAttribute: (name: string) => void;
  setAttribute: (name: string, value: string) => void;
  remove: () => void;
  closest: () => FakeElement;
  getAnimations: () => Array<{ finish: () => void }>;
};

type FakeContainer = {
  children: FakeElement[];
  clones: FakeElement[];
  appendChild: (el: FakeElement) => void;
  querySelectorAll: () => FakeElement[];
};

function makeHarness(initialIds = ["c1", "c2", "c3"]) {
  let order = [...initialIds];
  let held: string | null = null;
  let preview: { order: string[]; baseKey: string } | null = null;
  let nowMs = 1_000;
  let bodyDrag = false;
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  const onOrder = vi.fn((next: string[]) => {
    order = [...next];
  });

  const makeBox = (index: number) => ({
    left: index * 220,
    top: 0,
    right: index * 220 + 200,
    bottom: 140,
    width: 200,
    height: 140,
  });

  const container: FakeContainer = {
    children: [],
    clones: [],
    appendChild(el) {
      container.clones.push(el);
    },
    querySelectorAll() {
      const current = preview ? preview.order : order;
      return current.map((id) => container.children.find((el) => el.dataset.dragItem === id)!);
    },
  };

  const makeItem = (id: string): FakeElement => {
    const classes = new Set<string>();
    const el: FakeElement = {
      dataset: { dragItem: id },
      style: {},
      classList: {
        classes,
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
      },
      parentElement: container,
      removed: false,
      getBoundingClientRect: () => {
        const current = preview ? preview.order : order;
        return makeBox(Math.max(0, current.indexOf(id)));
      },
      cloneNode: () => {
        const clone = makeItem(id);
        clone.parentElement = null;
        return clone;
      },
      removeAttribute: (name) => {
        if (name === "data-drag-item") delete el.dataset.dragItem;
      },
      setAttribute: () => {},
      remove: () => {
        el.removed = true;
      },
      closest: () => el,
      getAnimations: () => [],
    };
    return el;
  };
  container.children = initialIds.map(makeItem);

  const host: DragOrderHost = {
    addEventListener(type, listener) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id as any),
    requestAnimationFrame: (fn) => fn(),
    now: () => nowMs,
    setBodyDragStyle: (active) => {
      bodyDrag = active;
    },
  };

  const emit = (type: string, event: any) => {
    for (const listener of [...(listeners.get(type) ?? [])]) listener(event);
  };

  const controller = createDragOrderController({
    getOrder: () => (preview ? preview.order : order),
    getIdsKey: () => order.join("|"),
    getDrawnKey: () => (preview ? preview.order : order).join("|"),
    liftedClass: "klift",
    onOrder,
    onHeldChange: (next) => {
      held = typeof next === "function" ? next(held) : next;
    },
    onPreviewChange: (next) => {
      preview = typeof next === "function" ? next(preview) : next;
    },
    host,
  });

  return {
    controller,
    container,
    emit,
    onOrder,
    item: (id: string) => container.children.find((el) => el.dataset.dragItem === id)!,
    getHeld: () => held,
    getPreview: () => preview,
    getBodyDrag: () => bodyDrag,
    advanceNow: (ms: number) => {
      nowMs += ms;
      vi.advanceTimersByTime(ms);
    },
  };
}

describe("useDragOrder tap-and-hold and grip drag behavior", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lifts after tap-and-hold, reorders on drop, blocks touch scroll while lifted, and suppresses post-drop click", () => {
    vi.useFakeTimers();
    const h = makeHarness(["c1", "c2", "c3"]);
    const hold = h.controller.hold("c1");

    hold.onPointerDown({ button: 0, pointerId: 1, clientX: 50, clientY: 50, currentTarget: h.item("c1") as any });
    expect(h.getHeld()).toBeNull();

    // Advancing past HOLD_MS lifts the card and starts blocking touch scroll.
    h.advanceNow(HOLD_MS);
    expect(h.getHeld()).toBe("c1");
    expect(h.getBodyDrag()).toBe(true);
    const touchMove = { preventDefault: vi.fn() };
    h.emit("touchmove", touchMove);
    expect(touchMove.preventDefault).toHaveBeenCalledOnce();

    // Dragging onto c2 (x=250) swaps c1 after c2, then releasing commits the order.
    h.emit("pointermove", { pointerId: 1, clientX: 250, clientY: 50 });
    h.emit("pointerup", { pointerId: 1 });
    expect(h.onOrder).toHaveBeenCalledWith(["c2", "c1", "c3"]);
    expect(h.getBodyDrag()).toBe(false);

    // The synthetic click fired right after dropping a hold-drag must be suppressed.
    const clickEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    hold.onClickCapture(clickEvent);
    expect(clickEvent.preventDefault).toHaveBeenCalledOnce();
    expect(clickEvent.stopPropagation).toHaveBeenCalledOnce();
  });

  it("cancels tap-and-hold when the user swipes to scroll, leaving normal taps and clicks intact", () => {
    vi.useFakeTimers();
    const h = makeHarness(["c1", "c2", "c3"]);
    const hold = h.controller.hold("c1");

    hold.onPointerDown({ button: 0, pointerId: 2, clientX: 50, clientY: 50, currentTarget: h.item("c1") as any });
    // User swipes vertically > HOLD_SLOP_PX before HOLD_MS -> cancels hold.
    h.emit("pointermove", { pointerId: 2, clientX: 50, clientY: 75 });
    h.advanceNow(HOLD_MS + 50);
    expect(h.getHeld()).toBeNull();
    expect(h.onOrder).not.toHaveBeenCalled();

    // A quick tap does not suppress click.
    hold.onPointerDown({ button: 0, pointerId: 3, clientX: 50, clientY: 50, currentTarget: h.item("c1") as any });
    h.advanceNow(60);
    h.emit("pointerup", { pointerId: 3 });
    const clickEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    hold.onClickCapture(clickEvent);
    expect(clickEvent.preventDefault).not.toHaveBeenCalled();
    expect(clickEvent.stopPropagation).not.toHaveBeenCalled();
  });

  it("lifts immediately on grip drag and cancels cleanly on Escape without committing", () => {
    vi.useFakeTimers();
    const h = makeHarness(["c1", "c2", "c3"]);
    const grip = h.controller.grip("c1");
    const preventDefault = vi.fn();

    grip.onPointerDown({ button: 0, pointerId: 4, clientX: 50, clientY: 50, currentTarget: h.item("c1") as any, preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    h.emit("pointermove", { pointerId: 4, clientX: 250, clientY: 50 });
    expect(h.getHeld()).toBe("c1");

    const esc = { key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() };
    h.emit("keydown", esc);
    expect(esc.preventDefault).toHaveBeenCalledOnce();
    expect(h.getHeld()).toBeNull();
    expect(h.getPreview()).toBeNull();
    expect(h.onOrder).not.toHaveBeenCalled();
  });
});
