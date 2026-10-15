/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { measureCommunityCompilerEvidenceForCommunity } from "./communityCompilerEvidenceCore";
import { buildCommunityInteractionEvidenceRef } from "../shared/communityEvidenceContract";

// Compiler admission measured against canonical sources: interaction traces count
// only while their exact live root resolves in a shared channel of the community.
const modules = import.meta.glob(["./_generated/**/*.*s"]);
const NOW = 2_000;

type TraceSpec = {
  id: string;
  sourceType?: string;
  group?: string;
  summary?: string;
  createdAt?: number;
  continuation?: boolean;
  visibilityScope?: "admin" | "community" | "public";
  source?: "live" | "bare_label" | "hidden" | "private_channel" | "foreign";
};

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { authSubject: "admission-member", createdAt: 1, updatedAt: 1 });
    const community = (slug: string) => ctx.db.insert("communities", {
      ownerId: userId, slug, name: slug, visibility: "unlisted", inferenceFundingPolicy: "managed_required",
      entryPolicy: "open", activeMemberCount: 1, createdAt: 1, updatedAt: 1,
    });
    const communityId = await community("admission");
    const foreignCommunityId = await community("admission-foreign");
    const channel = (target: any, slug: string, accessMode: "all_members" | "restricted") =>
      ctx.db.insert("communityChannels", {
        communityId: target, slug, name: slug, ...(slug === "general" ? { systemRole: "general" as const } : {}),
        accessMode, postingPolicy: "members", status: "active", position: 0, createdByUserId: userId,
        createdAt: 1, updatedAt: 1,
      } as any);
    return {
      userId, communityId, foreignCommunityId,
      sharedChannelId: await channel(communityId, "general", "all_members"),
      privateChannelId: await channel(communityId, "private", "restricted"),
      foreignChannelId: await channel(foreignCommunityId, "general", "all_members"),
    };
  });

  async function insertTraces(specs: TraceSpec[]) {
    await t.run(async (ctx) => {
      for (const spec of specs) {
        const sourceType = spec.sourceType ?? "interaction";
        const createdAt = spec.createdAt ?? 1_000;
        let sourceId = spec.id;
        let channelId: any = undefined;
        if (sourceType === "interaction" && spec.source !== "bare_label") {
          const kind = spec.source ?? "live";
          const rootCommunityId = kind === "foreign" ? ids.foreignCommunityId : ids.communityId;
          channelId = kind === "private_channel" ? ids.privateChannelId
            : kind === "foreign" ? ids.foreignChannelId : ids.sharedChannelId;
          const rootId = await ctx.db.insert("communityInteractionRoots", {
            communityId: rootCommunityId, channelId, actorType: "human", actorUserId: ids.userId,
            kind: "discussion", status: kind === "hidden" ? "hidden" : "live", visibilityScope: "community",
            contentSummary: spec.summary ?? spec.id, replyCount: 0, reactionSummary: [],
            idempotencyKey: `admission-${spec.id}`, createdAt, updatedAt: createdAt,
          } as any);
          sourceId = buildCommunityInteractionEvidenceRef({ objectType: "root", objectId: String(rootId) });
        }
        const visibilityScope = spec.visibilityScope ?? "community";
        await ctx.db.insert("communitySourceTraces", {
          communityId: ids.communityId, ...(channelId ? { channelId } : {}), sourceType, sourceId,
          summary: spec.summary ?? spec.id, visibilityScope, sourceVisibility: visibilityScope,
          artifactIds: [], outcomeObservationIds: [], actorType: "member", actorUserId: ids.userId,
          ...(spec.group ? { compilerGroupKey: spec.group } : {}),
          compilerState: "pending", compilerPendingSince: createdAt,
          ...(spec.continuation ? { compilerContinuationReady: true } : {}),
          createdAt, updatedAt: createdAt,
        } as any);
      }
    });
  }

  const measure = () => t.run((ctx) =>
    measureCommunityCompilerEvidenceForCommunity({ ctx, communityId: ids.communityId, nowMs: NOW }));
  const summaries = async (rows: Array<{ _id: any }>) =>
    t.run(async (ctx) => Promise.all(rows.map(async (row) => (await ctx.db.get(row._id) as any).summary)));
  return { t, ids, insertTraces, measure, summaries };
}

test("one live shared post is admitted as standard evidence without waking the compiler", async () => {
  const f = await fixture();
  await f.insertTraces([{ id: "keyword", summary: "unsafe broken failed blocker" }]);
  const { measurement } = await f.measure();
  expect(measurement).toMatchObject({ reason: "no_trigger", pending_standard: 1, pending_critical: 0, should_run: false });
});

test.each(["bare_label", "hidden", "private_channel", "foreign"] as const)(
  "an interaction trace whose source is %s is not admitted",
  async (source) => {
    const f = await fixture();
    await f.insertTraces([{ id: `invalid-${source}`, source }]);
    const { measurement, selectedRows } = await f.measure();
    expect(measurement).toMatchObject({ pending_total: 0, pending_trace_total: 0, reason: "no_trigger" });
    expect(selectedRows).toHaveLength(0);
  },
);

test("a full episode packet selects twelve traces and continues the rest", async () => {
  const f = await fixture();
  await f.insertTraces(Array.from({ length: 14 }, (_, index) =>
    ({ id: `episode-a-${index}`, group: "interaction_episode:a", createdAt: 1_000 + index })));
  const full = await f.measure();
  expect(full.measurement).toMatchObject({ reason: "full_packet", selected_packet_count: 1, has_more_pending: true });
  expect(full.selectedRows).toHaveLength(12);
  expect(full.continuationRows).toHaveLength(2);
});

test("continuation-ready remainder runs as a bounded continuation", async () => {
  const f = await fixture();
  await f.insertTraces(Array.from({ length: 2 }, (_, index) =>
    ({ id: `episode-a-${12 + index}`, group: "interaction_episode:a", createdAt: 1_012 + index, continuation: true })));
  const continued = await f.measure();
  expect(continued.measurement).toMatchObject({ reason: "bounded_continuation", pending_continuation: 1 });
  expect(continued.selectedRows).toHaveLength(2);
  expect(continued.continuationRows).toHaveLength(0);
});

test("critical evidence precedes continuation and retired AI Feed traces never enter a packet", async () => {
  const f = await fixture();
  await f.insertTraces([
    { id: "continued-standard", group: "continued", continuation: true },
    { id: "critical-outcome", sourceType: "outcome", group: "critical" },
    { id: "new-strong", sourceType: "ai_feed", group: "strong" },
  ]);
  const result = await f.measure();
  expect(result.measurement.reason).toBe("critical_evidence");
  expect(await f.summaries(result.selectedRows)).toEqual(["critical-outcome", "continued-standard"]);
});

test("nine separate episodes meet the batch threshold within the packet limit", async () => {
  const f = await fixture();
  await f.insertTraces(Array.from({ length: 9 }, (_, index) =>
    ({ id: `episode-${index}`, group: `interaction_episode:${index}` })));
  const result = await f.measure();
  expect(result.measurement).toMatchObject({
    reason: "batch_threshold", pending_total: 9, pending_trace_total: 9, selected_packet_count: 8, has_more_pending: true,
  });
  expect(result.selectedRows).toHaveLength(8);
  expect(result.continuationRows).toHaveLength(1);
});

test("one outcome is critical and retired AI Feed traces are not admitted", async () => {
  const critical = await fixture();
  await critical.insertTraces([{ id: "outcome", sourceType: "outcome" }]);
  expect((await critical.measure()).measurement.reason).toBe("critical_evidence");

  const retired = await fixture();
  await retired.insertTraces(Array.from({ length: 5 }, (_, index) =>
    ({ id: `feed-${index}`, sourceType: "ai_feed", group: `ai_feed:${index}` })));
  const result = await retired.measure();
  expect(result.measurement).toMatchObject({ reason: "no_trigger", pending_total: 0 });
  expect(result.selectedRows).toHaveLength(0);
});

test("ungrouped live posts each form their own packet", async () => {
  const f = await fixture();
  await f.insertTraces([{ id: "legacy-a" }, { id: "legacy-b" }]);
  const result = await f.measure();
  expect(result.measurement.pending_total).toBe(2);
  expect(result.measurement.selected_packet_keys).toEqual(
    result.selectedRows.map((row) => `source_trace:${String(row._id)}`));
});

test("a scan overflow across visibility scopes stays bounded and reports a lower bound", async () => {
  const f = await fixture();
  await f.insertTraces(Array.from({ length: 501 }, (_, index) => ({
    id: `overflow-${index}`, group: `overflow:${index}`,
    visibilityScope: index < 250 ? "admin" as const : index < 500 ? "community" as const : "public" as const,
  })));
  const result = await f.measure();
  expect(result.measurement).toMatchObject({ pending_total: 500, counts_are_lower_bound: true, has_more_pending: true });
  expect(result.continuationRows).toHaveLength(96);
});

test("one shared post wakes the compiler once it has waited six hours", async () => {
  const hour = 60 * 60 * 1000;
  const f = await fixture();
  await f.insertTraces([{ id: "single-post", createdAt: 1_000 }]);
  const measureAt = (nowMs: number) => f.t.run((ctx) =>
    measureCommunityCompilerEvidenceForCommunity({ ctx, communityId: f.ids.communityId, nowMs }));
  expect((await measureAt(1_000 + 6 * hour - 1)).measurement).toMatchObject({ reason: "no_trigger", should_run: false });
  expect((await measureAt(1_000 + 6 * hour)).measurement).toMatchObject({
    reason: "oldest_pending_age", should_run: true, pending_standard: 1,
  });
});
