import { describe, expect, it } from "vitest";

import { subscribeCloudCommunityAttentionRows } from "../shared/cloudCommunityAttentionGateway";
import {
  applyInFlightCommunityAttentionClears,
  type CommunityAttentionIndicators,
  type InFlightCommunityAttentionMark,
} from "../shared/useCommunityAttentionController";

type WatchHarness = {
  args: { communityId: string; section: string; paginationOpts: { numItems: number } };
  result: unknown;
  listener: (() => void) | null;
  disposed: boolean;
};

function createLiveClientHarness() {
  const watches: WatchHarness[] = [];
  const liveClient = {
    authSubject: "attention-test-user",
    close: () => {},
    client: {
      watchQuery: (_query: unknown, args: WatchHarness["args"]) => {
        const harness: WatchHarness = {
          args,
          result: undefined,
          listener: null,
          disposed: false,
        };
        watches.push(harness);
        return {
          localQueryResult: () => harness.result,
          onUpdate: (listener: () => void) => {
            harness.listener = listener;
            return () => {
              harness.disposed = true;
              harness.listener = null;
            };
          },
        };
      },
    },
  };
  return { liveClient, watches };
}

describe("community attention realtime gateway", () => {
  it("pages each community, keeps partial results unknown, and clears revoked descendants", () => {
    const harness = createLiveClientHarness();
    const updates: any[] = [];
    const dispose = subscribeCloudCommunityAttentionRows({ liveClient: harness.liveClient as any,
      communityIds: ["one", "one", "two"], onUpdate: rows => updates.push(rows) });
    expect(harness.watches.map(w => w.args.communityId)).toEqual(["one", "two"]);
    expect(harness.watches.every(w => w.args.paginationOpts.numItems === 10)).toBe(true);
    const emit = (index: number, isDone: boolean, channels: any[], cursor = "") => {
      const w = harness.watches[index]!;
      w.result = { page: channels, isDone, continueCursor: cursor,
        attention: { community_id: w.args.communityId, chat: channels.some(c => c.chat),
          mentions: false, resources: false, events: false, channels } };
      w.listener?.();
    };
    emit(0, true, []);
    expect(updates.at(-1)).toEqual([]);
    emit(2, false, [], "later");
    emit(3, true, [{ channel_id: "late", channel_slug: "late", chat: true, mentions: false }]);
    expect(updates.at(-1)).toMatchObject([{ community_id: "one", chat: true, channels: [{ channel_id: "late" }] }]);
    emit(2, false, [], "changed");
    expect(harness.watches[3]!.disposed).toBe(true);
    expect(updates.at(-1)).toEqual([]);
    emit(4, true, []);
    expect(updates.at(-1)).toMatchObject([{ community_id: "one", chat: false, channels: [] }]);
    dispose();
    expect(harness.watches.every(w => w.disposed)).toBe(true);
  });

  it("returns an inert subscription for an empty scope", () => {
    const harness = createLiveClientHarness();
    const updates: unknown[] = [];
    const dispose = subscribeCloudCommunityAttentionRows({
      liveClient: harness.liveClient as any,
      communityIds: [],
      onUpdate: (rows) => updates.push(rows),
    });

    expect(updates).toEqual([[]]);
    expect(harness.watches).toHaveLength(0);
    expect(dispose()).toBeUndefined();
  });
});

describe("community attention optimistic reconciliation", () => {
  const serverAttention: Record<string, CommunityAttentionIndicators> = {
    "community-1": {
      chat: true,
      resources: true,
      events: true,
      mentions: true,
      chat_last_seen_at: null,
      channels: [],
    },
  };

  it("overlays every concurrent in-flight clear without mutating server truth", () => {
    const inFlightMarks: InFlightCommunityAttentionMark[] = [
      { communityId: "community-1", surface: "resources", optimistic: true },
      { communityId: "community-1", surface: "events", optimistic: true },
    ];

    const reconciled = applyInFlightCommunityAttentionClears(serverAttention, inFlightMarks);

    expect(reconciled["community-1"]?.resources).toBe(false);
    expect(reconciled["community-1"]?.events).toBe(false);
    expect(reconciled["community-1"]?.chat).toBe(true);
    expect(serverAttention["community-1"]?.resources).toBe(true);
    expect(serverAttention["community-1"]?.events).toBe(true);
  });

  it("restores only the failed mark while preserving another in-flight clear", () => {
    const inFlightMarks = new Map<string, InFlightCommunityAttentionMark>([
      ["resources", { communityId: "community-1", surface: "resources", optimistic: true }],
      ["events", { communityId: "community-1", surface: "events", optimistic: true }],
    ]);
    inFlightMarks.delete("resources");

    const reconciled = applyInFlightCommunityAttentionClears(
      serverAttention,
      inFlightMarks.values(),
    );

    expect(reconciled["community-1"]?.resources).toBe(true);
    expect(reconciled["community-1"]?.events).toBe(false);
  });

  it("does not clear a surface whose acknowledgement is explicitly non-optimistic", () => {
    const reconciled = applyInFlightCommunityAttentionClears(serverAttention, [
      { communityId: "community-1", surface: "events", optimistic: false },
    ]);

    expect(reconciled["community-1"]?.events).toBe(true);
  });
});
