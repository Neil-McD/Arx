import { expect, test } from "vitest";
import { subscribeCommunityPages, type CommunityPage } from "../shared/subscribeCommunityPages";

test("single section pagination crosses empty pages, clears stale descendants, and fails closed", () => {
  const watches: Array<{ value: CommunityPage; update?: () => void; stopped: boolean }> = [];
  let output: CommunityPage[] = [];
  let complete = false;
  const stop = subscribeCommunityPages({ sections: ["shared"], maxPages: 2,
    watch: (_section, cursor) => {
      const row = { value: cursor ? { page: ["member"], isDone: true, continueCursor: null } : { page: [], isDone: false, continueCursor: "next" }, stopped: false, update: undefined as (() => void) | undefined };
      watches.push(row);
      return { localQueryResult: () => row.value, onUpdate: (cb: () => void) => { row.update = cb; return () => { row.stopped = true; }; } };
    }, onUpdate: (pages, done) => { output = pages; complete = done; },
  });
  expect(output.flatMap(page => page.page)).toEqual(["member"]);
  expect(complete).toBe(true);
  watches[0].value = { page: [], isDone: true, continueCursor: null }; watches[0].update?.();
  expect(output.flatMap(page => page.page)).toEqual([]);
  expect(watches[1].stopped).toBe(true);
  watches[0].value = { page: [], isDone: false, continueCursor: null }; watches[0].update?.();
  expect(output).toEqual([]); expect(complete).toBe(false);
  stop(); expect(watches.every(row => row.stopped)).toBe(true);
});

test("page budget prevents automatic whole-community scans", () => {
  let count = 0;
  const stop = subscribeCommunityPages({ sections: ["shared"], maxPages: 1,
    watch: () => { count++; return { localQueryResult: () => ({ page: [], isDone: false, continueCursor: "next" }), onUpdate: () => () => {} }; },
    onUpdate: () => {},
  });
  expect(count).toBe(1); stop();
});
