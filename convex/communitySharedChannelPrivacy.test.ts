/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { ensureGeneralChannel, listSharedCommunityChannels, listSharedChannelReadableRows, listChannelReadableRows } from "./communityChannelCore";
import { interactionTraceHasSharedSource } from "./communityInteractionEvidenceCore";
import { resolveCommunityEvidenceRefCore } from "./communityEvidenceCore";
import { buildCommunitySourceTraceRevision, measureCommunityCompilerEvidenceForCommunity, drainIneligiblePendingSourceTracesForCommunity } from "./communityCompilerEvidenceCore";
import { settleCommunityIntelligenceFromDigestItemsCore } from "./communityCompilerCandidates";
import { buildCommunityMemoryWorkKey } from "./communityMemoryWorkKey";
import { normalizeCommunityMemoryDecision } from "../shared/communityMemoryDecisionContract";

const modules = import.meta.glob(["./communityWeeklyDigestWorker.ts", "./_generated/**/*.*s"]);
const NOW = Date.parse("2026-08-14T12:00:00Z");
const ACTIVITY = Date.parse("2026-08-12T12:00:00Z");

async function fixture(ctx: MutationCtx) {
  const ownerId = await ctx.db.insert("users", { authSubject: "privacy-owner", displayName: "Owner", createdAt: NOW, updatedAt: NOW });
  const communityId = await ctx.db.insert("communities", {
    ownerId, name: "Privacy fixture", slug: "privacy-fixture", visibility: "unlisted",
    inferenceFundingPolicy: "managed_required", entryPolicy: "open", lifecycleStatus: "active", lifecycleGeneration: 0,
    createdAt: NOW, updatedAt: NOW,
  });
  const general = await ensureGeneralChannel({ ctx, communityId, nowMs: NOW });
  const shared = await ctx.db.insert("communityChannels", {
    communityId, name: "Announcements", slug: "announcements", accessMode: "all_members", postingPolicy: "managers",
    replyPolicy: "disabled", status: "active", position: 1, createdAt: NOW, updatedAt: NOW,
  });
  const restricted = await ctx.db.insert("communityChannels", {
    communityId, name: "Private", slug: "private", accessMode: "restricted", postingPolicy: "members",
    status: "active", position: 2, createdAt: NOW, updatedAt: NOW,
  });
  const root = async (channelId: any, text: string, createdAt = ACTIVITY) => ctx.db.insert("communityInteractionRoots", {
    communityId, channelId, actorType: "human", actorUserId: ownerId, kind: "discussion", status: "live",
    visibilityScope: "community", contentSummary: text, replyCount: 0, reactionSummary: [],
    idempotencyKey: text, createdAt, updatedAt: createdAt,
  });
  const sharedRoot = await root(shared, "Shared announcement");
  const privateRoot = await root(restricted, "PRIVATE SECRET", ACTIVITY + 1);
  return { ownerId, communityId, general, shared, restricted, sharedRoot, privateRoot, root };
}

async function trace(ctx: MutationCtx, f: Awaited<ReturnType<typeof fixture>>, rootId: any, channelId: any) {
  return ctx.db.insert("communitySourceTraces", {
    communityId: f.communityId, channelId, sourceType: "interaction", sourceId: `interaction:root:${rootId}`,
    summary: "Captured interaction", visibilityScope: "community", sourceVisibility: "community",
    artifactIds: [], outcomeObservationIds: [], actorType: "member", actorUserId: f.ownerId,
    compilerState: "pending", compilerPendingSince: ACTIVITY, createdAt: ACTIVITY, updatedAt: ACTIVITY,
  });
}

test("shared audience is selected before channel/message limits, including manager-post announcement rooms", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const f = await fixture(ctx);
    for (let i = 0; i < 12; i++) await ctx.db.insert("communityChannels", {
      communityId: f.communityId, name: `Private ${i}`, slug: `private-${i}`, accessMode: "restricted", postingPolicy: "members",
      status: "active", position: i + 3, createdAt: NOW, updatedAt: NOW,
    });
    for (let i = 0; i < 205; i++) await f.root(f.restricted, `PRIVATE ${i}`, ACTIVITY + i + 2);
    expect((await listSharedCommunityChannels({ ctx, communityId: f.communityId })).map(c => c._id)).toEqual([f.general._id, f.shared]);
    const rows = await listSharedChannelReadableRows({ ctx, tableName: "communityInteractionRoots", communityId: f.communityId, limit: 1 });
    expect(rows.map(r => r._id)).toEqual([f.sharedRoot]);
    await expect(listChannelReadableRows({ ctx, tableName: "communityInteractionRoots", communityId: f.communityId, channel: (await ctx.db.get(f.restricted))!, limit: 1 })).rejects.toThrow("community_channel_unavailable");
  });
});

test("shared reply aggregates reject copied channel IDs and hidden roots", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const f = await fixture(ctx);
    for (const rootId of [f.privateRoot, f.sharedRoot]) await ctx.db.insert("communityInteractionReplies", {
      communityId: f.communityId, channelId: f.shared, rootId, actorType: "human", actorUserId: f.ownerId,
      status: "live", visibilityScope: "community", contentSummary: "Reply", seq: 1,
      reactionSummary: [], idempotencyKey: String(rootId), createdAt: ACTIVITY, updatedAt: ACTIVITY,
    });
    const args = { ctx, tableName: "communityInteractionReplies" as const, communityId: f.communityId, limit: 20 };
    expect(await listSharedChannelReadableRows(args)).toHaveLength(1);
    await ctx.db.patch(f.sharedRoot, { status: "hidden" });
    expect(await listSharedChannelReadableRows(args)).toEqual([]);
  });
});

test("weekly digest keeps shared activity despite newer private volume", async () => {
  const t = convexTest(schema, modules);
  const communityId = await t.run(async (ctx) => {
    const f = await fixture(ctx);
    for (let i = 0; i < 45; i++) await f.root(f.restricted, `PRIVATE ${i}`, ACTIVITY + 100 + i);
    return f.communityId;
  });
  const result = await t.query((internal as any).communityWeeklyDigestWorker.readCommunityWeeklyDigestPageInternal, {
    communityId, communityLifecycleGeneration: 0, nowMs: NOW, periodStartDay: "2026-08-10", periodEndDay: "2026-08-13",
  });
  expect(JSON.stringify(result.digestSnapshot)).toContain("Shared announcement");
  expect(JSON.stringify(result.digestSnapshot)).not.toContain("PRIVATE");
});

test("direct evidence and captured source refs revalidate audience, archive, provenance, and community", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const f = await fixture(ctx);
    const traceId = await trace(ctx, f, f.sharedRoot, f.shared);
    const row = (await ctx.db.get(traceId))!;
    const args = { ctx, communityId: f.communityId, trace: row };
    expect(await interactionTraceHasSharedSource(args)).toBe(true);
    const otherCommunityId = await ctx.db.insert("communities", {
      ownerId: f.ownerId, name: "Other", slug: "other", visibility: "unlisted", inferenceFundingPolicy: "managed_required",
      entryPolicy: "open", createdAt: NOW, updatedAt: NOW,
    });
    expect(await interactionTraceHasSharedSource({ ...args, communityId: otherCommunityId })).toBe(false);
    expect(await interactionTraceHasSharedSource({ ...args, trace: { ...row, channelId: f.restricted } })).toBe(false);
    expect((await resolveCommunityEvidenceRefCore({ ctx, communityId: f.communityId, ref: `interaction:root:${f.privateRoot}` })).status).toBe("revoked");
    await ctx.db.patch(f.shared, { accessMode: "restricted" });
    expect(await interactionTraceHasSharedSource(args)).toBe(false);
    expect((await resolveCommunityEvidenceRefCore({ ctx, communityId: f.communityId, ref: `trace:${traceId}` })).status).toBe("revoked");
    await ctx.db.patch(f.shared, { accessMode: "all_members", status: "archived" });
    expect(await interactionTraceHasSharedSource(args)).toBe(false);
    expect(await interactionTraceHasSharedSource({ ...args, trace: { ...row, sourceId: "interaction:root:invalid" } })).toBe(false);
  });
});

test("compiler measurement and existing drain exclude captured private traces without losing shared work", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const f = await fixture(ctx);
    const sharedId = await trace(ctx, f, f.sharedRoot, f.shared);
    const privateId = await trace(ctx, f, f.privateRoot, f.restricted);
    const args = { ctx, communityId: f.communityId, nowMs: NOW };
    expect((await measureCommunityCompilerEvidenceForCommunity(args)).selectedRows.map(r => r._id)).toEqual([sharedId]);
    expect(await drainIneligiblePendingSourceTracesForCommunity(args)).toBe(1);
    expect(await ctx.db.get(privateId)).toMatchObject({ compilerState: "excluded_by_visibility", compilerLastHandledAt: NOW });
    expect((await ctx.db.get(privateId))?.compilerPendingSince).toBeUndefined();
    expect(await drainIneligiblePendingSourceTracesForCommunity(args)).toBe(0);
  });
});

test("settlement rechecks queued sources and does not roll back unrelated decisions; replay creates no memory", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const f = await fixture(ctx);
    const secondRoot = await f.root(f.general._id, "Another shared message");
    const ids = [await trace(ctx, f, f.sharedRoot, f.shared), await trace(ctx, f, secondRoot, f.general._id)];
    const items = [];
    for (const id of ids) {
      const row = (await ctx.db.get(id))!;
      const item = {
        category: "chat_activity" as const, title: "Captured", summary: "Captured", priority: 1, confidence: 1,
        sourceTypes: ["interaction"], sourceIds: [row.sourceId!], sourceTraceIds: [id],
        sourceRevisions: [await buildCommunitySourceTraceRevision(row)],
      };
      items.push({ ...item, workKey: await buildCommunityMemoryWorkKey({ communityId: f.communityId, ...item, contentRevisions: item.sourceRevisions }) });
    }
    const digestId = await ctx.db.insert("communityCompilerDigests", {
      communityId: f.communityId, dedupeKey: "privacy-digest", windowStartedAt: ACTIVITY, windowEndedAt: NOW,
      summary: "Queued", itemCount: items.length, items, createdByActorType: "compiler", createdAt: NOW, updatedAt: NOW,
      signalCounts: { chat: 2, aiFeed: 0, resources: 0, events: 0, sourceTraces: 2, outcomes: 0, newMembers: 0, activeMembers: 0, postingMembers: 0, aiFeedReactingMembers: 0 },
    });
    await ctx.db.patch(f.shared, { accessMode: "restricted" });
    const decisions = items.map((item, index) => normalizeCommunityMemoryDecision({
      workKey: item.workKey, disposition: index === 0 ? "retain" : "dismiss_low_signal", reason: "Test decision",
      nodeType: "insight", title: "Must not retain private source", bodyMd: "PRIVATE", confidence: 1,
    }));
    const args = { ctx, communityId: f.communityId, digestId, decisions, nowMs: NOW };
    const result = await settleCommunityIntelligenceFromDigestItemsCore(args);
    expect(result.decisions[0]).toMatchObject({ status: "excluded_by_visibility" });
    expect((await ctx.db.get(ids[1]))?.compilerState).toBe("dismissed_low_signal");
    expect((await settleCommunityIntelligenceFromDigestItemsCore(args)).decisions[1]).toMatchObject({ reused_existing: true });
    expect(await ctx.db.query("communityIntelligenceNodes").collect()).toEqual([]);
    expect(await ctx.db.query("communityIntelligenceChangeRequests").collect()).toEqual([]);
  });
});
