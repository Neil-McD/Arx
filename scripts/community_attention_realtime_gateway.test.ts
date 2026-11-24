import { describe, expect, it } from "vitest";

import {
  MAX_CLOUD_COMMUNITY_RAIL_ATTENTION_BATCH,
  subscribeCloudCommunityAttentionRows,
} from "../shared/cloudCommunityAttentionGateway";
import {
  applyInFlightCommunityAttentionClears,
  retainCommunityAttentionAcrossScopeChange,
  type CommunityAttentionIndicators,
  type InFlightCommunityAttentionMark,
} from "../shared/useCommunityAttentionController";

type WatchHarness = {
  query: unknown;
  args: {
    communityId?: string;
    communityIds?: string[];
    section?: string;
    paginationOpts?: { numItems: number };
  };
  result: unknown;
  error?: unknown;
  listener: (() => void) | null;
  disposed: boolean;
};

function createLiveClientHarness() {
  const watches: WatchHarness[] = [];
  const liveClient = {
    authSubject: "attention-test-user",
    close: () => {},
    client: {
      watchQuery: (query: unknown, args: WatchHarness["args"]) => {
        const harness: WatchHarness = {
          query,
          args,
          result: undefined,
          listener: null,
          disposed: false,
        };
        watches.push(harness);
        return {
          localQueryResult: () => {
            if (harness.error) throw harness.error;
            return harness.result;
          },
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
    expect(harness.watches.every(w => w.args.paginationOpts?.numItems === 10)).toBe(true);
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

  it("pages only the active community and batches all other sidebar communities into one rail watch", () => {
    const harness = createLiveClientHarness();
    const updates: any[] = [];
    const errors: unknown[] = [];
    const dispose = subscribeCloudCommunityAttentionRows({
      liveClient: harness.liveClient as any,
      communityIds: ["c-active", "c-two", "c-three", "c-four", "c-five"],
      activeCommunityId: "c-active",
      onUpdate: (rows) => updates.push(rows),
      onError: (error) => errors.push(error),
    });

    // 1 initial shared-section page watch for the active community + 1 batched rail watch for all 4 others.
    expect(harness.watches).toHaveLength(2);
    const activeWatch = harness.watches.find((w) => w.args.communityId === "c-active")!;
    const railWatch = harness.watches.find((w) => Array.isArray(w.args.communityIds))!;
    expect(activeWatch.args.section).toBe("shared");
    expect(railWatch.args.communityIds).toEqual(["c-five", "c-four", "c-three", "c-two"]);

    // Rail watch resolves independently with unread dots for background communities.
    railWatch.result = [
      { community_id: "c-two", chat: true, resources: false, events: false, mentions: false },
      { community_id: "c-three", chat: false, resources: false, events: true, mentions: false },
      { community_id: "c-four", chat: false, resources: false, events: false, mentions: false },
    ];
    railWatch.listener?.();
    expect(updates.at(-1)).toEqual([
      { community_id: "c-two", chat: true, resources: false, events: false, mentions: false, chat_last_seen_at: null, is_rail_summary: true, channels: [] },
      { community_id: "c-three", chat: false, resources: false, events: true, mentions: false, chat_last_seen_at: null, is_rail_summary: true, channels: [] },
      { community_id: "c-four", chat: false, resources: false, events: false, mentions: false, chat_last_seen_at: null, is_rail_summary: true, channels: [] },
    ]);

    // Active community completes shared + private sections and merges with the rail batch.
    activeWatch.result = {
      page: [{ channel_id: "ch-1", channel_slug: "general", chat: true, mentions: false, chat_last_seen_at: 1000, latest_activity_at: 2000 }],
      isDone: true,
      continueCursor: "",
      attention: {
        community_id: "c-active",
        chat: true,
        mentions: false,
        resources: true,
        events: false,
        channels: [{ channel_id: "ch-1", channel_slug: "general", chat: true, mentions: false, chat_last_seen_at: 1000, latest_activity_at: 2000 }],
      },
    };
    activeWatch.listener?.();
    const privateWatch = harness.watches.find((w) => w.args.communityId === "c-active" && w.args.section === "private")!;
    privateWatch.result = {
      page: [],
      isDone: true,
      continueCursor: "",
      attention: { community_id: "c-active", chat: false, mentions: false, resources: true, events: false, channels: [] },
    };
    privateWatch.listener?.();
    expect(updates.at(-1)).toHaveLength(4);
    expect(updates.at(-1).find((row: any) => row.community_id === "c-active")).toMatchObject({
      community_id: "c-active",
      chat: true,
      resources: true,
      channels: [{ channel_slug: "general", chat: true }],
    });

    // Rail watch error fails closed (drops background chunk rows) while preserving active community rows.
    railWatch.error = new Error("rail_watch_failed");
    railWatch.listener?.();
    expect(errors).toHaveLength(1);
    expect(updates.at(-1).map((row: any) => row.community_id)).toEqual(["c-active"]);

    dispose();
    expect(harness.watches.every((w) => w.disposed)).toBe(true);
  });

  it("uses zero per-community page watches when no community is active and chunks rail watches", () => {
    const harness = createLiveClientHarness();
    const communityIds = Array.from(
      { length: MAX_CLOUD_COMMUNITY_RAIL_ATTENTION_BATCH + 5 },
      (_, index) => `community-${String(index).padStart(2, "0")}`,
    );
    const dispose = subscribeCloudCommunityAttentionRows({
      liveClient: harness.liveClient as any,
      communityIds,
      activeCommunityId: null,
      onUpdate: () => {},
    });

    expect(harness.watches).toHaveLength(2);
    expect(harness.watches.every((w) => w.args.communityId === undefined)).toBe(true);
    expect(harness.watches[0]!.args.communityIds).toHaveLength(MAX_CLOUD_COMMUNITY_RAIL_ATTENTION_BATCH);
    expect(harness.watches[1]!.args.communityIds).toHaveLength(5);

    dispose();
    expect(harness.watches.every((w) => w.disposed)).toBe(true);
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

  it("drops a short-circuited rail summary when its community becomes active while retaining other sidebar dots", () => {
    const previous: Record<string, CommunityAttentionIndicators> = {
      "c-old-active": {
        chat: true,
        resources: false,
        events: false,
        mentions: false,
        chat_last_seen_at: 1_500,
        channels: [],
      },
      "c-new-active": {
        chat: false,
        resources: false,
        events: true,
        mentions: false,
        chat_last_seen_at: null,
        is_rail_summary: true,
        channels: [],
      },
      "c-other": {
        chat: true,
        resources: false,
        events: false,
        mentions: false,
        chat_last_seen_at: null,
        is_rail_summary: true,
        channels: [],
      },
      "c-removed": {
        chat: true,
        resources: false,
        events: false,
        mentions: false,
        chat_last_seen_at: null,
        is_rail_summary: true,
        channels: [],
      },
    };

    const retained = retainCommunityAttentionAcrossScopeChange(
      previous,
      ["c-old-active", "c-new-active", "c-other"],
      "c-new-active",
    );

    expect(Object.keys(retained).sort()).toEqual(["c-old-active", "c-other"]);
    expect(retained["c-new-active"]).toBeUndefined();
    expect(retained["c-removed"]).toBeUndefined();
  });
});
