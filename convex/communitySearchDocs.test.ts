/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import { buildCommunitySearchQuery } from "../shared/communitySearchText";

// Search rows follow every write to a post, in the same transaction: create,
// reply, edit, delete, a channel turning private, and a backfill for old posts.
const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);

const OWNER = "search-owner";
const NOW = 1_780_000_000_000;

afterEach(() => { vi.useRealTimers(); });

async function fixture(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { authSubject: OWNER, displayName: "Maya Chen", handle: "maya", normalizedHandle: "maya", createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("userProfileDetails", { userId: ownerId, displayName: "Maya Chen", avatarUrl: "https://example.com/maya.png", createdAt: NOW, updatedAt: NOW } as any);
    for (const document of PLATFORM_LEGAL_DOCUMENTS) {
      await ctx.db.insert("legalAcceptances", { userId: ownerId, documentKey: document.key, documentVersion: document.version, acceptedAt: NOW, source: "test", createdAt: NOW });
    }
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "sunrise", name: "Sunrise", visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 1, createdAt: NOW, updatedAt: NOW,
    } as any);
    const channel = (slug: string, general = false) => ctx.db.insert("communityChannels", {
      communityId, ...(general ? { systemRole: "general" as const } : { createdByUserId: ownerId }), slug, name: general ? "General" : "Beta", normalizedName: slug,
      accessMode: "all_members", postingPolicy: "members", status: "active", position: general ? 0 : 1, createdAt: NOW, updatedAt: NOW,
    } as any);
    await channel("general", true);
    const betaId = await channel("beta");
    return { communityId, betaId, ownerId };
  });
}

const docs = (t: any, communityId: any) =>
  t.run((ctx: any) => ctx.db.query("communitySearchDocs").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).collect());

const search = (t: any, communityId: any, words: string, accessKey = "shared") =>
  t.run((ctx: any) => ctx.db.query("communitySearchDocs")
    .withSearchIndex("search_text", (q: any) => q.search("searchText", buildCommunitySearchQuery(words)).eq("communityId", communityId).eq("accessKey", accessKey))
    .take(10));

test("a post and its reply are searchable by every word, in the same write, and leave with the post", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const asOwner = t.withIdentity({ subject: OWNER });
  // Long enough that the stored summary (500 chars) can't hold the last word.
  const text = `Board reset Thursday. ${"Bring chalk and patience. ".repeat(30)}Last thing: zanzibar tape.`;
  const post = await asOwner.mutation(api.communityInteractions.createCommunityInteractionComposerMessage, {
    communityId: f.communityId, channelId: f.betaId, idempotencyKey: "p1", text,
  });
  const rootId = post.interaction.root_id as any;
  await asOwner.mutation(api.communityInteractions.createCommunityInteractionComposerMessage, {
    communityId: f.communityId, channelId: f.betaId, rootId, idempotencyKey: "r1", text: "Same here",
  });

  const rows = await docs(t, f.communityId);
  expect(rows.map((row: any) => row.kind).sort()).toEqual(["post", "reply"]);
  expect(rows.every((row: any) => row.accessKey === "shared" && String(row.channelId) === String(f.betaId) && String(row.authorUserId) === String(f.ownerId))).toBe(true);
  expect((await search(t, f.communityId, "zanzibar")).map((row: any) => row.kind)).toEqual(["post"]);
  // Stems: "taping" finds "tape"; the reply is found by the thread it answers.
  expect((await search(t, f.communityId, "taping")).length).toBeGreaterThan(0);
  expect((await search(t, f.communityId, "same")).map((row: any) => row.kind)).toEqual(["reply"]);
  expect((await search(t, f.communityId, "board reset")).map((row: any) => row.kind).sort()).toEqual(["post", "reply"]);

  // Edit: the old words leave, the new ones arrive, and the reply follows its
  // thread's new opening.
  await asOwner.mutation(api.communityInteractions.editCommunityInteractionMessage, {
    targetType: "root", targetId: String(rootId), text: "Moved to Friday, bring quokka gloves.",
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await search(t, f.communityId, "zanzibar")).toHaveLength(0);
  expect((await search(t, f.communityId, "quokka")).map((row: any) => row.kind).sort()).toEqual(["post", "reply"]);
  expect((await search(t, f.communityId, "thursday")).map((row: any) => row.kind)).toEqual([]);

  // Delete the post: its row and its replies' rows go with it.
  await asOwner.mutation(api.communityInteractions.deleteCommunityInteractionMessage, { targetType: "root", targetId: String(rootId) });
  expect(await docs(t, f.communityId)).toHaveLength(0);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});

test("a channel turning private moves its rows to that channel's key; back again, they're shared", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const asOwner = t.withIdentity({ subject: OWNER });
  await asOwner.mutation(api.communityInteractions.createCommunityInteractionComposerMessage, {
    communityId: f.communityId, channelId: f.betaId, idempotencyKey: "p1", text: "Secret route for the yellow problem",
  });
  await asOwner.mutation(api.communityChannels.setChannelAccess, {
    communityId: f.communityId, channelId: f.betaId, accessMode: "restricted", expectedAccessMode: "all_members", acknowledgeHistoryExposure: true,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await search(t, f.communityId, "yellow")).toHaveLength(0);
  expect(await search(t, f.communityId, "yellow", `channel:${f.betaId}`)).toHaveLength(1);

  await asOwner.mutation(api.communityChannels.setChannelAccess, {
    communityId: f.communityId, channelId: f.betaId, accessMode: "all_members", expectedAccessMode: "restricted", acknowledgeHistoryExposure: true,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await search(t, f.communityId, "yellow")).toHaveLength(1);

  // Renamed: found by the new name, no longer by the old.
  await asOwner.mutation(api.communityChannels.renameCommunityChannel, { communityId: f.communityId, channelId: f.betaId, name: "Projects" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await search(t, f.communityId, "projects")).toHaveLength(1);
  expect(await search(t, f.communityId, "beta")).toHaveLength(0);
});

test("the backfill builds rows for posts written before search existed, and skips unreadable ones", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await t.run(async (ctx) => {
    const root = (status: string, visibilityScope: string, text: string, key: string) => ctx.db.insert("communityInteractionRoots", {
      communityId: f.communityId, channelId: f.betaId, actorType: "human", actorUserId: f.ownerId, kind: "discussion", status, visibilityScope,
      contentSummary: text, replyCount: 0, reactionSummary: [], idempotencyKey: key, createdAt: NOW, updatedAt: NOW,
    } as any);
    const live = await root("live", "community", "Old post about hangboards", "a");
    await root("deleted", "community", "Deleted hangboard post", "b");
    await root("live", "private", "Private hangboard note", "c");
    await ctx.db.insert("communityInteractionReplies", {
      communityId: f.communityId, channelId: f.betaId, rootId: live, seq: 1, actorType: "human", actorUserId: f.ownerId, status: "live",
      visibilityScope: "community", contentSummary: "Mine is in the garage", reactionSummary: [], idempotencyKey: "r", createdAt: NOW, updatedAt: NOW,
    } as any);
  });
  expect(await docs(t, f.communityId)).toHaveLength(0);
  await t.mutation(internal.communitySearchDocs.backfillCommunitySearchDocsInternal, { communityId: f.communityId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const rows = await docs(t, f.communityId);
  expect(rows.map((row: any) => row.kind).sort()).toEqual(["post", "reply"]);
  expect((await search(t, f.communityId, "garage")).map((row: any) => row.kind)).toEqual(["reply"]);
  // Safe to repeat: no duplicates.
  await t.mutation(internal.communitySearchDocs.backfillCommunitySearchDocsInternal, { communityId: f.communityId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await docs(t, f.communityId)).toHaveLength(2);
});
