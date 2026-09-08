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
  send(0, ["one"], "next");
  expect(update).toHaveBeenLastCalledWith([{ id: "one" }], true);
  stop.loadMore(); stop.loadMore();
  expect(harness.watches).toHaveLength(2);
  send(1, ["two"], null);
  expect(update).toHaveBeenLastCalledWith([{ id: "one" }, { id: "two" }], false);
  send(0, ["replacement"], "new-cursor");
  expect(harness.watches[1].stop).toHaveBeenCalled();
  expect(update).toHaveBeenLastCalledWith([{ id: "replacement" }], true);
  const calls = update.mock.calls.length;
  send(1, ["stale"], null);
  expect(update).toHaveBeenCalledTimes(calls);
  stop.loadMore(); send(2, ["foreign-visit"], null, "other");
  expect(update).toHaveBeenLastCalledWith([{ id: "replacement" }], true);
  stop(); send(0, ["late"], null);
  expect(harness.close).toHaveBeenCalledOnce();
  expect(update).toHaveBeenLastCalledWith([{ id: "replacement" }], true);
  expect(error).not.toHaveBeenCalled();
});
