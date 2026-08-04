import { describe, expect, test } from "vitest";

import {
  claimInlineUserSelect,
  computeAutoScrollStep,
  computeProjectedIndex,
  computeSiblingShift,
  releaseInlineUserSelect,
  shouldCommitPointerSort,
} from "../shared/usePointerSortableList";

function dragSession(draggedId: string, startIndex: number) {
  return {
    pointerId: 1,
    draggedId,
    startIndex,
    idsSnapshot: ["alpha", "beta", "gamma"],
    centersById: new Map([
      ["alpha", 10],
      ["beta", 30],
      ["gamma", 50],
    ]),
    startClientY: 10,
    startScrollTop: 0,
    baseMinDeltaY: 0,
    baseMaxDeltaY: 40,
    hasMoved: true,
  };
}

describe("pointer sortable list ownership", () => {
  test("restores the exact prior inline user-select value once", () => {
    const style = { userSelect: "text" };
    const owner = claimInlineUserSelect(style);
    expect(style.userSelect).toBe("none");

    releaseInlineUserSelect(style, owner);
    expect(style.userSelect).toBe("text");

    style.userSelect = "contain";
    releaseInlineUserSelect(style, owner);
    expect(style.userSelect).toBe("contain");
  });

  test("does not overwrite a newer global style owner", () => {
    const style = { userSelect: "text" };
    const owner = claimInlineUserSelect(style);
    style.userSelect = "contain";

    releaseInlineUserSelect(style, owner);
    expect(style.userSelect).toBe("contain");
  });

  test("overlapping claims restore safely in either release order", () => {
    const firstStyle = { userSelect: "text" };
    const first = claimInlineUserSelect(firstStyle);
    const second = claimInlineUserSelect(firstStyle);
    releaseInlineUserSelect(firstStyle, first);
    releaseInlineUserSelect(firstStyle, second);
    expect(firstStyle.userSelect).toBe("text");

    const secondStyle = { userSelect: "text" };
    const third = claimInlineUserSelect(secondStyle);
    const fourth = claimInlineUserSelect(secondStyle);
    releaseInlineUserSelect(secondStyle, fourth);
    releaseInlineUserSelect(secondStyle, third);
    expect(secondStyle.userSelect).toBe("text");
  });
});

describe("pointer sortable list projection", () => {
  test("commits only a moved drag with a changed projected index", () => {
    expect(shouldCommitPointerSort(true, { hasMoved: true, startIndex: 0 }, { projectedIndex: 2 })).toBe(true);
    expect(shouldCommitPointerSort(false, { hasMoved: true, startIndex: 0 }, { projectedIndex: 2 })).toBe(false);
    expect(shouldCommitPointerSort(true, { hasMoved: false, startIndex: 0 }, { projectedIndex: 2 })).toBe(false);
    expect(shouldCommitPointerSort(true, { hasMoved: true, startIndex: 0 }, { projectedIndex: 0 })).toBe(false);
    expect(shouldCommitPointerSort(true, { hasMoved: true, startIndex: 0 }, null)).toBe(false);
  });

  test("projects and shifts siblings in both directions", () => {
    const down = dragSession("alpha", 0);
    expect(computeProjectedIndex(down as any, 40)).toBe(2);
    expect(computeSiblingShift(down as any, "beta", 2)).toBe(-20);
    expect(computeSiblingShift(down as any, "gamma", 2)).toBe(-20);

    const up = dragSession("gamma", 2);
    expect(computeProjectedIndex(up as any, -40)).toBe(0);
    expect(computeSiblingShift(up as any, "alpha", 0)).toBe(20);
    expect(computeSiblingShift(up as any, "beta", 0)).toBe(20);
  });

  test("bounds edge auto-scroll to the available range", () => {
    const container = {
      scrollHeight: 600,
      clientHeight: 200,
      scrollTop: 50,
      getBoundingClientRect: () => ({ top: 100, bottom: 300 }),
    } as any;

    expect(computeAutoScrollStep(container, 100)).toBe(-16);
    expect(computeAutoScrollStep(container, 300)).toBe(16);

    container.scrollTop = 0;
    expect(computeAutoScrollStep(container, 100)).toBe(0);
    container.scrollTop = 400;
    expect(computeAutoScrollStep(container, 300)).toBe(0);
  });
});
