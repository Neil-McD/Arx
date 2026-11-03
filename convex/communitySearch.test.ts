/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

// Full-history search: every post and reply the reader may read, by words,
// re-checked against the real post, with person, date, kind and sort filters.
const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const DAY = 86_400_000;
const NOW = 1_780_000_000_000;

afterEach(() => { vi.useRealTimers(); });

async function fixture(t: any) {
  const ids = await t.run(async (ctx: any) => {
    const user = async (handle: string, name: string) => {
      const id = await ctx.db.insert("users", { authSubject: `${handle}-subject`, displayName: name, handle, normalizedHandle: handle, createdAt: NOW, updatedAt: NOW });
      await ctx.db.insert("userProfileDetails", { userId: id, displayName: name, avatarUrl: `https://example.com/${handle}.png`, createdAt: NOW, updatedAt: NOW });
      for (const document of PLATFORM_LEGAL_DOCUMENTS) {
        await ctx.db.insert("legalAcceptances", { userId: id, documentKey: document.key, documentVersion: document.version, acceptedAt: NOW, source: "test", createdAt: NOW });
      }
      return id;
    };
    const owner = await user("neil", "Neil");
    const maya = await user("maya", "Maya Chen");
    const theo = await user("theo", "Theo Brennan");
    const communityId = await ctx.db.insert("communities", {
      ownerId: owner, slug: "sunrise", name: "Sunrise", visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 3, createdAt: NOW, updatedAt: NOW,
    });
    const membership = (userId: any) => ctx.db.insert("communityMemberships", {
      communityId, userId, role: "member", accessSource: "free_grant", active: true, activationSequence: 1, activatedAt: NOW - 400 * DAY, createdAt: NOW - 400 * DAY, updatedAt: NOW,
    });
    const mayaMembership = await membership(maya);
    await membership(theo);
    const channel = (slug: string, accessMode: string, position: number, general = false) => ctx.db.insert("communityChannels", {
      communityId, ...(general ? { systemRole: "general" } : { createdByUserId: owner }), slug, name: general ? "General" : slug, normalizedName: slug,
      accessMode, postingPolicy: "members", status: "active", position, createdAt: NOW, updatedAt: NOW,
    });
    const general = await channel("general", "all_members", 0, true);
    const crew = await channel("crew", "restricted", 1);
    // Maya is invited to the private room; Theo is not.
    await ctx.db.insert("communityChannelParticipants", {
      communityId, channelId: crew, principalKey: `user:${maya}`, membershipId: mayaMembership, membershipActivationSequence: 1, status: "active", createdByUserId: owner, createdAt: NOW, updatedAt: NOW,
    });
    let n = 0;
    const post = async (channelId: any, by: any, text: string, at: number, status = "live") => {
      const rootId = await ctx.db.insert("communityInteractionRoots", {
        communityId, channelId, actorType: "human", actorUserId: by, kind: "discussion", status, visibilityScope: "community",
        contentSummary: text.slice(0, 500), replyCount: 0, reactionSummary: [], idempotencyKey: `p${n++}`, createdAt: at, updatedAt: at,
      });
      await ctx.db.insert("communityInteractionContentBlocks", { communityId, rootId, blockOrder: 0, blockType: "markdown_text", text, createdAt: at, updatedAt: at });
      return rootId;
    };
    // The oldest post, 300 posts back, with its keyword past the 500-char summary.
    await post(general, maya, `Beginner circuit plan. ${"Warm up properly. ".repeat(40)}The circuit uses the quokka holds.`, NOW - 300 * DAY);
    for (let i = 0; i < 300; i += 1) await post(general, theo, `Session ${i}: board was busy`, NOW - (299 - i) * DAY);
    await post(crew, maya, "Crew only: the quokka project is hard", NOW - 10 * DAY);
    const deleted = await post(general, maya, "Deleted quokka rumour", NOW - 5 * DAY, "deleted");
    return { communityId, owner, maya, theo, general, crew, deleted };
  });
  vi.useFakeTimers();
  await t.mutation(internal.communitySearchDocs.backfillCommunitySearchDocsInternal, { communityId: ids.communityId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  // A stale row for the deleted post, as if a sync had been missed.
  await t.run(async (ctx: any) => {
    await ctx.db.insert("communitySearchDocs", {
      communityId: ids.communityId, kind: "post", rootId: ids.deleted, channelId: ids.general, accessKey: "shared", authorUserId: ids.maya,
      sourceCreatedAt: NOW - 5 * DAY, searchText: "#General · by Maya Chen\\nDeleted quokka rumour", updatedAt: NOW,
    });
  });
  return ids;
}

const search = (t: any, f: any, userId: any, query: string, extra: Record<string, unknown> = {}) =>
  t.action(internal.communityInteractionEvidence.searchCommunityInteractionEvidenceInternal, {
    actorKind: "human", userId, communityId: f.communityId, query, surface: "member_agent_dock", ...extra,
  }) as Promise<any>;

test("finds a post 300 posts back by a word past its first 500 characters, with a snippet around the match", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const found = await search(t, f, f.theo, "quokka holds");
  expect(found.diagnostics.strategy).toBe("full_text_index");
  const general = found.results.filter((r: any) => r.channel_slug === "general");
  expect(general).toHaveLength(1);
  expect(general[0].snippet).toContain("quokka holds");
  expect(general[0].snippet.startsWith("…")).toBe(true);
});

test("private rooms: their members find them, others and the public agent never do; deleted posts never return", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const texts = (result: any) => result.results.map((r: any) => r.snippet);
  const asMaya = texts(await search(t, f, f.maya, "quokka"));
  expect(asMaya.some((s: string) => s.includes("Crew only"))).toBe(true);
  const asTheo = texts(await search(t, f, f.theo, "quokka"));
  expect(asTheo.some((s: string) => s.includes("Crew only"))).toBe(false);
  const asAgent = texts(await search(t, f, f.maya, "quokka", { actorKind: "community_agent" }));
  expect(asAgent.some((s: string) => s.includes("Crew only"))).toBe(false);
  for (const list of [asMaya, asTheo, asAgent]) expect(list.some((s: string) => s.includes("rumour"))).toBe(false);
});

test("person, date, kind and newest-first filters", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const byTheo = await search(t, f, f.maya, "board", { authorUserId: f.theo, limit: 20 });
  expect(byTheo.results.length).toBeGreaterThan(0);
  expect(byTheo.results.every((r: any) => r.actor.user_id !== null)).toBe(true);
  expect((await search(t, f, f.maya, "quokka", { authorUserId: f.theo })).results).toHaveLength(0);
  // Maya's quokka posts: one 300 days ago in General, one 10 days ago in the crew room.
  const lastMonth = await search(t, f, f.maya, "quokka", { fromMs: NOW - 30 * DAY });
  expect(lastMonth.results.map((r: any) => r.channel_slug)).toEqual(["crew"]);
  const lastYear = await search(t, f, f.maya, "quokka", { toMs: NOW - 200 * DAY });
  expect(lastYear.results.map((r: any) => r.channel_slug)).toEqual(["general"]);
  const newest = await search(t, f, f.maya, "quokka", { sort: "newest" });
  expect(newest.results.map((r: any) => r.channel_slug)).toEqual(["crew", "general"]);
  // More matches than the page: truncated says so.
  expect((await search(t, f, f.maya, "session", { limit: 5 })).truncated).toBe(true);
  expect((await search(t, f, f.maya, "session", { kind: "reply" })).results).toHaveLength(0);
});

test("a General search isn't crowded out by other rooms, and finds posts from before channels", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await t.run(async (ctx: any) => {
    const beta = await ctx.db.insert("communityChannels", {
      communityId: f.communityId, createdByUserId: f.owner, slug: "beta", name: "beta", normalizedName: "beta",
      accessMode: "all_members", postingPolicy: "members", status: "active", position: 2, createdAt: NOW, updatedAt: NOW,
    });
    for (let i = 0; i < 80; i += 1) {
      await ctx.db.insert("communityInteractionRoots", {
        communityId: f.communityId, channelId: beta, actorType: "human", actorUserId: f.maya, kind: "discussion", status: "live", visibilityScope: "community",
        contentSummary: `quokka quokka beta ${i}`, replyCount: 0, reactionSummary: [], idempotencyKey: `b${i}`, createdAt: NOW - i, updatedAt: NOW - i,
      });
    }
    await ctx.db.insert("communityInteractionRoots", {
      communityId: f.communityId, actorType: "human", actorUserId: f.maya, kind: "discussion", status: "live", visibilityScope: "community",
      contentSummary: "Legacy quokka note from before channels", replyCount: 0, reactionSummary: [], idempotencyKey: "legacy", createdAt: NOW - 500 * DAY, updatedAt: NOW,
    });
  });
  await t.mutation(internal.communitySearchDocs.backfillCommunitySearchDocsInternal, { communityId: f.communityId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const general = await search(t, f, f.theo, "quokka", { channelSlug: "general", authorUserId: f.maya, limit: 20 });
  const snippets = general.results.map((r: any) => r.snippet);
  expect(general.results.every((r: any) => r.channel_slug === "general")).toBe(true);
  expect(snippets.some((s: string) => s.includes("quokka holds"))).toBe(true);
  expect(snippets.some((s: string) => s.includes("Legacy quokka"))).toBe(true);
});

test("filters need words: a query with none can't silently drop them", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await expect(search(t, f, f.maya, "*", { authorUserId: f.maya })).rejects.toThrow("community_search_filters_need_words");
  expect((await search(t, f, f.maya, "*")).diagnostics.strategy).toBe("bounded_lexical");
});

test("search keeps working past ten rooms in total (up to 100 can be private)", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await t.run(async (ctx: any) => {
    for (let i = 0; i < 12; i += 1) {
      await ctx.db.insert("communityChannels", {
        communityId: f.communityId, createdByUserId: f.owner, slug: `room-${i}`, name: `room-${i}`, normalizedName: `room-${i}`,
        accessMode: "restricted", postingPolicy: "members", status: "active", position: 10 + i, createdAt: NOW, updatedAt: NOW,
      });
    }
  });
  const asMaya = await search(t, f, f.maya, "quokka");
  expect(asMaya.results.map((r: any) => r.channel_slug).sort()).toEqual(["crew", "general"]);
  const asTheo = await search(t, f, f.theo, "quokka");
  expect(asTheo.results.map((r: any) => r.channel_slug)).toEqual(["general"]);
});

test("a manager past the private-room bound: a miss falls back to the recent scan but stays marked incomplete", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await t.run(async (ctx: any) => {
    for (let i = 0; i < 25; i += 1) {
      await ctx.db.insert("communityChannels", {
        communityId: f.communityId, createdByUserId: f.owner, slug: `vault-${i}`, name: `vault-${i}`, normalizedName: `vault-${i}`,
        accessMode: "restricted", postingPolicy: "members", status: "active", position: 10 + i, createdAt: NOW, updatedAt: NOW,
      });
    }
  });
  // The owner reads every private room; this word matches nothing searched.
  const result = await search(t, f, f.owner, "zzznomatch");
  expect(result.diagnostics.strategy).toBe("bounded_lexical_fallback");
  expect(result.truncated).toBe(true);
});
