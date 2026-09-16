import { describe, expect, it } from "vitest";

import { subscribeCloudCommunityAttentionRows } from "../shared/cloudCommunityAttentionGateway";
import { MAX_COMMUNITY_ATTENTION_COMMUNITIES_PER_QUERY } from "../shared/communityAttentionContract";
import {
  applyInFlightCommunityAttentionClears,
  type CommunityAttentionIndicators,
  type InFlightCommunityAttentionMark,
} from "../shared/useCommunityAttentionController";

type WatchHarness = {
  args: { communityIds: string[] };
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
      watchQuery: (_query: unknown, args: { communityIds: string[] }) => {
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
  it("bounds large accounts per query, publishes one complete map, and disposes every batch", () => {
    const harness = createLiveClientHarness();
    const updates: Array<Array<{ community_id: string }>> = [];
    const communityIds = Array.from(
      { length: MAX_COMMUNITY_ATTENTION_COMMUNITIES_PER_QUERY * 2 + 1 },
      (_, index) => `community-${String(index).padStart(3, "0")}`,
    ).reverse();

    const dispose = subscribeCloudCommunityAttentionRows({
      liveClient: harness.liveClient as any,
      communityIds: [...communityIds, communityIds[0]!],
      onUpdate: (rows) => updates.push(rows),
    });

    expect(harness.watches.map((watch) => watch.args.communityIds.length)).toEqual([
      MAX_COMMUNITY_ATTENTION_COMMUNITIES_PER_QUERY,
      MAX_COMMUNITY_ATTENTION_COMMUNITIES_PER_QUERY,
      1,
    ]);
    expect(harness.watches.flatMap((watch) => watch.args.communityIds)).toEqual(
      [...new Set(communityIds)].sort(),
    );

    for (const [index, watch] of harness.watches.entries()) {
      watch.result = watch.args.communityIds.map((communityId) => ({
        community_id: communityId,
        batch: index,
      }));
      watch.listener?.();
      expect(updates).toHaveLength(index === harness.watches.length - 1 ? 1 : 0);
    }
    expect(updates[0]).toHaveLength(communityIds.length);

    dispose();
    expect(harness.watches.every((watch) => watch.disposed)).toBe(true);
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
