import { expect, test } from "vitest";
import { applyLiveRootWindow, mergeOlderRootPage } from "../apps/web/src/controllers/communityRootWindows";

const root = (id: string, minute: number) => ({ root: { id, created_at: new Date(Date.UTC(2026, 9, 20, 10, minute)).toISOString() } }) as any;
const ids = (roots: any[]) => roots.map((bundle) => bundle.root.id);

test("a post deleted elsewhere drops out of Studio's live feed", () => {
  const shown = [root("c", 3), root("b", 2), root("a", 1)];
  expect(ids(applyLiveRootWindow(shown, [root("c", 3), root("a", 1)], 50))).toEqual(["c", "a"]);
  // Deleting the only post empties the feed.
  expect(ids(applyLiveRootWindow([root("a", 1)], [], 50))).toEqual([]);
});

test("older pages stay loaded under a full live window", () => {
  const shown = [root("e", 5), root("d", 4), root("old-1", 1)];
  // A new post f slides d out of a window of 2: d is older now, not deleted.
  expect(ids(applyLiveRootWindow(shown, [root("f", 6), root("e", 5)], 2))).toEqual(["f", "e", "d", "old-1"]);
  // d deleted inside the window: c moves up, d drops, older pages stay.
  expect(ids(applyLiveRootWindow([root("e", 5), root("d", 4), root("c", 3), root("old-1", 1)], [root("e", 5), root("c", 3)], 2)))
    .toEqual(["e", "c", "old-1"]);
});

test("loading an older page adds to the feed", () => {
  expect(ids(mergeOlderRootPage([root("b", 2)], [root("a", 1), root("b", 2)]))).toEqual(["b", "a"]);
});
