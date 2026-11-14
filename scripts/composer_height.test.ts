import { afterEach, describe, expect, it } from "vitest";
import { composerMaxHeightPx, fitComposerHeight, resetComposerHeight } from "../shared/composerHeight";

// A stand-in textarea: content height is lines × 22 plus 18 of padding, and
// scrollTop is clamped the way a browser clamps it.
function fakeTextarea(lines: number, caretAtEnd = true) {
  const parentVars = new Map<string, string>();
  const box: any = {
    value: Array.from({ length: lines }, (_, i) => `line ${i + 1}`).join("\n"),
    style: { height: "", overflowY: "" },
    parentElement: { style: { setProperty: (name: string, value: string) => parentVars.set(name, value) } },
    _scrollTop: 0,
    get scrollHeight() { return lines * 22 + 18; },
    get clientHeight() { return box.style.height === "auto" ? box.scrollHeight : parseFloat(box.style.height); },
    get scrollTop() { return box._scrollTop; },
    set scrollTop(next: number) { box._scrollTop = Math.max(0, Math.min(next, box.scrollHeight - box.clientHeight)); },
  };
  box.selectionEnd = caretAtEnd ? box.value.length : 0;
  return { box, parentVars };
}

const originalWindow = (globalThis as any).window;
afterEach(() => { (globalThis as any).window = originalWindow; });

describe("composer height", () => {
  it("grows line by line with no scrolling while it fits", () => {
    (globalThis as any).window = { innerHeight: 1000 };
    const { box } = fakeTextarea(4);
    fitComposerHeight(box);
    expect(box.style.height).toBe(`${4 * 22 + 18}px`);
    expect(box.style.overflowY).toBe("hidden");
    expect(box.scrollTop).toBe(0);
  });

  it("stops at about ten lines, then keeps the last line and its padding in view", () => {
    (globalThis as any).window = { innerHeight: 1000 };
    const { box, parentVars } = fakeTextarea(14);
    fitComposerHeight(box);
    expect(box.style.height).toBe("240px");
    expect(box.style.overflowY).toBe("auto");
    expect(box.scrollTop).toBe(box.scrollHeight - 240);
    expect(parentVars.get("--mention-composer-scroll-top")).toBe(`${box.scrollHeight - 240}px`);
  });

  it("never takes more than 40% of a short window", () => {
    (globalThis as any).window = { innerHeight: 500 };
    expect(composerMaxHeightPx()).toBe(200);
  });

  it("keeps its place when the edit is higher up", () => {
    (globalThis as any).window = { innerHeight: 1000 };
    const { box } = fakeTextarea(14, false);
    fitComposerHeight(box);
    box.scrollTop = 30;
    fitComposerHeight(box);
    expect(box.scrollTop).toBe(30);
  });

  it("goes back to one line once the message has gone", () => {
    const { box, parentVars } = fakeTextarea(14);
    fitComposerHeight(box);
    resetComposerHeight(box);
    expect(box.style.height).toBe("auto");
    expect(box.style.overflowY).toBe("hidden");
    expect(parentVars.get("--mention-composer-scroll-top")).toBe("0px");
  });
});
