import { describe, expect, it, vi } from "vitest";
import { subscribeCloudCommunityMemberSuccessDossier } from "../shared/cloudCommunityMemberWorkflowsGateway";

function fixture(initial?: unknown) {
  let result = initial;
  let error: Error | undefined;
  let publish = () => {};
  const stop = vi.fn();
  const watchQuery = vi.fn((_query: unknown, _args: unknown) => ({
    localQueryResult: () => { if (error) throw error; return result; },
    onUpdate: (callback: () => void) => { publish = callback; return stop; },
  }));
  const onUpdate = vi.fn(), onError = vi.fn();
  const unsubscribe = subscribeCloudCommunityMemberSuccessDossier({
    liveClient: { client: { watchQuery }, authSubject: "manager" } as any,
    communityId: "community", membershipId: "member", onUpdate, onError,
  });
  return { onUpdate, onError, unsubscribe, stop, watchQuery,
    emit: (value: unknown) => { result = value; error = undefined; publish(); },
    fail: () => { error = new Error("community_forbidden"); publish(); },
  };
}

describe("member dossier realtime subscription", () => {
  it("targets only the selected authorized member and ignores unresolved results", () => {
    const f = fixture();
    expect(f.watchQuery.mock.calls[0]?.[1]).toEqual({ authSubject: "manager", communityId: "community", membershipId: "member" });
    expect(f.onUpdate).not.toHaveBeenCalled();
    f.unsubscribe();
  });
  it("publishes cached state and completion without a board-token update", () => {
    const f = fixture({ status: "running" });
    f.emit({ status: "complete", evidence: { source_id: "reply" } });
    expect(f.onUpdate.mock.calls.map(call => call[0].status)).toEqual(["running", "complete"]);
    f.unsubscribe();
  });
  it("reports revoked access and can receive recovered data", () => {
    const f = fixture();
    f.fail();
    expect(f.onError).toHaveBeenCalledWith(new Error("community_forbidden"));
    f.emit({ status: "pending" });
    expect(f.onUpdate).toHaveBeenCalledWith({ status: "pending" });
    f.unsubscribe();
  });
  it("releases the watcher and ignores queued callbacks after close or member switch", () => {
    const old = fixture();
    old.unsubscribe();
    const current = fixture();
    old.emit({ membership_id: "old" });
    old.fail();
    current.emit({ membership_id: "current" });
    expect(old.stop).toHaveBeenCalledOnce();
    expect(old.onUpdate).not.toHaveBeenCalled();
    expect(old.onError).not.toHaveBeenCalled();
    expect(current.onUpdate).toHaveBeenCalledWith({ membership_id: "current" });
    current.unsubscribe();
  });
});
