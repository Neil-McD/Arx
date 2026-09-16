import { expect, test, vi } from "vitest";
import { subscribeChannelDirectoryPages } from "../shared/cloudCommunityChannelsGateway";

test("directory follows empty filtered pages and invalidates descendants on revocation", () => {
  const subscriptions: any[] = [], updates: any[] = [];
  const watch = vi.fn((section, cursor) => {
    const item: any = { section, cursor, result: undefined, callback: () => {}, stopped: false };
    subscriptions.push(item);
    return { localQueryResult: () => item.result,
      onUpdate: (callback: () => void) => { item.callback = callback; return () => { item.stopped = true; }; } };
  });
  const emit = (index: number, result: any) => { subscriptions[index].result = result; subscriptions[index].callback(); };
  const stop = subscribeChannelDirectoryPages({ watch, onUpdate: value => updates.push(value) });
  const channel = (id: string, position: number) => ({ id, slug: id, name: id, position });
  emit(0, { page: [channel("general", 0)], isDone: true, continueCursor: "", max_active_channels: 10 });
  expect(subscriptions[1].section).toBe("private");
  emit(1, { page: [], isDone: false, continueCursor: "next" });
  expect(subscriptions[2].cursor).toBe("next");
  emit(2, { page: [channel("own", 2)], isDone: true, continueCursor: "" });
  expect(updates.at(-1)).toMatchObject({ isComplete: true, channels: [{ id: "general" }, { id: "own" }] });
  emit(1, { page: [], isDone: true, continueCursor: "" });
  expect(subscriptions[2].stopped).toBe(true);
  expect(updates.at(-1).channels.map((c: any) => c.id)).toEqual(["general"]);
  const count = updates.length; subscriptions[2].callback(); expect(updates).toHaveLength(count);
  stop(); expect(subscriptions.every(item => item.stopped)).toBe(true);
});

test("directory clears exposed rows when a live permission query fails", () => {
  const callbacks: (() => void)[] = [], updates: any[] = []; let denied = false;
  const stop = subscribeChannelDirectoryPages({
    watch: () => ({ localQueryResult: () => { if (denied) throw new Error("access revoked"); return { page: [], isDone: true }; },
      onUpdate: cb => { callbacks.push(cb); return () => {}; } }),
    onUpdate: value => updates.push(value), onError: () => {},
  });
  denied = true; callbacks[0]();
  expect(updates.at(-1)).toMatchObject({ channels: [], isComplete: false }); stop();
});
