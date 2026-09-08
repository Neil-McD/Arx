import { expect, test, vi } from "vitest";
const harness = vi.hoisted(() => ({ watches: [] as any[], close: vi.fn() }));
vi.mock("../shared/convexAuthenticatedClient", () => ({ requireConvexUrl: () => "https://example.convex.cloud" }));
vi.mock("../shared/convexRealtimeAuth", () => ({ acquireAuthenticatedConvexRealtimeClient: () => ({
  authSubject: "member", close: harness.close, client: { watchQuery: (_api: unknown, args: unknown) => {
    const row = { args, value: undefined as any, notify: () => {}, stop: vi.fn() }; harness.watches.push(row);
    return { localQueryResult: () => row.value, onUpdate: (fn: () => void) => { row.notify = fn; return row.stop; } };
  } },
}) }));
import { subscribeMemberForms } from "../shared/cloudCommunityFormRequestsGateway";

test("member form pages reset on live changes and stop after unsubscribe", () => {
  harness.watches = []; harness.close.mockClear();
  const update = vi.fn(), error = vi.fn();
  const stop = subscribeMemberForms({}, "community", async s => s, update, error);
  const send = (index: number, ids: string[], nextCursor: string | null, visit = "visit") => {
    const row = harness.watches[index]; row.value = { rows: ids.map(id => ({ id })), nextCursor, visit }; row.notify();
  };
  send(0, [], null);
  expect(harness.watches[0].stop).toHaveBeenCalledOnce();
  expect(harness.watches[1].args).toMatchObject({ cursor: null, visit: "visit" });
  send(1, ["one"], "next");
  expect(update).toHaveBeenLastCalledWith([{ id: "one" }], true);
  stop.loadMore(); stop.loadMore();
  expect(harness.watches).toHaveLength(3);
  send(2, ["two"], null);
  expect(update).toHaveBeenLastCalledWith([{ id: "one" }, { id: "two" }], false);
  send(1, ["replacement"], "new-cursor");
  expect(harness.watches[2].stop).toHaveBeenCalled();
  expect(update).toHaveBeenLastCalledWith([{ id: "replacement" }], true);
  const calls = update.mock.calls.length;
  send(2, ["stale"], null);
  expect(update).toHaveBeenCalledTimes(calls);
  stop.loadMore(); send(3, ["foreign-visit"], null, "other");
  expect(update).toHaveBeenLastCalledWith([{ id: "replacement" }], true);
  send(1, [], null, "new-visit");
  expect(harness.watches[4].args).toMatchObject({ cursor: null, visit: "new-visit" });
  expect(update).toHaveBeenLastCalledWith([], false);
  send(1, ["old-visit-late"], null);
  send(4, ["new-form"], null, "new-visit");
  expect(update).toHaveBeenLastCalledWith([{ id: "new-form" }], false);
  stop(); send(4, ["late"], null, "new-visit");
  expect(harness.close).toHaveBeenCalledOnce();
  expect(update).toHaveBeenLastCalledWith([{ id: "new-form" }], false);
  expect(error).not.toHaveBeenCalled();
});
