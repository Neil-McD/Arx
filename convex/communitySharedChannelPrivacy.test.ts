/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { ensureGeneralChannel, listSharedCommunityChannels, listSharedChannelReadableRows, listChannelReadableRows } from "./communityChannelCore";
import { requireSharedInteractionEvidenceChannel, resolveCommunityInteractionEvidenceSource } from "./communityInteractionEvidenceCore";

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

test("direct evidence revalidates audience, archive and community at the moment it's read", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const f = await fixture(ctx);
    const shared = (communityId = f.communityId) => resolveCommunityInteractionEvidenceSource({ ctx, communityId, objectType: "root", objectId: f.sharedRoot })
      .then(async (source) => {
        if (!source) return false;
        try { await requireSharedInteractionEvidenceChannel({ ctx, communityId, source }); return true; } catch { return false; }
      });
    expect(await shared()).toBe(true);
    const otherCommunityId = await ctx.db.insert("communities", {
      ownerId: f.ownerId, name: "Other", slug: "other", visibility: "unlisted", inferenceFundingPolicy: "managed_required",
      entryPolicy: "open", createdAt: NOW, updatedAt: NOW,
    } as any);
    expect(await shared(otherCommunityId)).toBe(false);
    // A post in a private room is never shared evidence.
    const privateSource = await resolveCommunityInteractionEvidenceSource({ ctx, communityId: f.communityId, objectType: "root", objectId: f.privateRoot });
    await expect(requireSharedInteractionEvidenceChannel({ ctx, communityId: f.communityId, source: privateSource! })).rejects.toThrow();
    // A room that turns private, or is archived, stops being shared at once.
    await ctx.db.patch(f.shared, { accessMode: "restricted" });
    expect(await shared()).toBe(false);
    await ctx.db.patch(f.shared, { accessMode: "all_members", status: "archived" });
    expect(await shared()).toBe(false);
    expect(await resolveCommunityInteractionEvidenceSource({ ctx, communityId: f.communityId, objectType: "root", objectId: "invalid" })).toBeNull();
  });
});
