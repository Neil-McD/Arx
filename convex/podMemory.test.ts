/// <reference types="vite/client" />
// Pod memory (pods slice C): each pod with the guide in it learns from its own
// room; what it learns stays inside that pod.
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { markCommunityMemoryReviewDue } from "./communityMemory";
import { communityScopeKey, notesByUpdated, podScopeKey, workFor } from "./communityNotesStore";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.UTC(2026, 10, 15, 15, 0, 0);

async function world(t: any) {
  return await t.run(async (ctx: any) => {
    const user = (subject: string) => ctx.db.insert("users", { authSubject: subject, displayName: subject, createdAt: NOW, updatedAt: NOW });
    const ownerId = await user("owner");
    const hostId = await user("host");
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "club", name: "Club", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityMemberships", { communityId, userId: hostId, role: "member", accessSource: "free_grant", state: "active", createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: NOW, updatedAt: NOW });
    const channel = (slug: string, accessMode: "all_members" | "restricted") => ctx.db.insert("communityChannels", { communityId, slug, name: slug,
      accessMode, postingPolicy: "members", status: "active", position: 0, createdAt: NOW, updatedAt: NOW });
    const generalId = await channel("general", "all_members");
    const climbersId = await channel("climbers", "restricted");
    const foundersId = await channel("founders", "restricted");
    await ctx.db.insert("communityPods", { communityId, channelId: climbersId, purpose: "Train together.", visibility: "listed", hostUserIds: [hostId], createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityPods", { communityId, channelId: foundersId, purpose: "Founders.", visibility: "hidden", createdAt: NOW, updatedAt: NOW });
    // The guide works in climbers only.
    await ctx.db.insert("communityChannelParticipants", { communityId, channelId: climbersId, principalKey: "community_agent", status: "active", createdByUserId: ownerId, createdAt: NOW, updatedAt: NOW });
    const post = (channelId: any, text: string, key: string, at: number) => ctx.db.insert("communityInteractionRoots", { communityId, channelId,
      actorType: "human", actorUserId: hostId, kind: "discussion", status: "live", visibilityScope: "community", contentSummary: text,
      replyCount: 0, reactionSummary: [], idempotencyKey: key, createdAt: at, updatedAt: at });
    const climbPost = await post(climbersId, "Pod rule: we log every session in the tracker by Sunday.", "c1", NOW + 10);
    const foundersPost = await post(foundersId, "Founders pricing is $597.", "f1", NOW + 20);
    return { ownerId, hostId, communityId, generalId, climbersId, foundersId, climbPost, foundersPost };
  });
}

test("a post in a pod's room makes that pod's memory due, only where the guide works; open channels feed the community's", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  await t.run(async (ctx: any) => {
    await markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.foundersId, actorType: "human", nowMs: NOW });
    expect(await workFor(ctx, podScopeKey(w.foundersId), "memory_review")).toBeNull();
    await markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.climbersId, actorType: "human", nowMs: NOW });
    expect(await workFor(ctx, podScopeKey(w.climbersId), "memory_review")).toMatchObject({ pending: 1, scope: "pod" });
    expect(await workFor(ctx, communityScopeKey(w.communityId), "memory_review")).toBeNull();
    await markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.generalId, actorType: "human", nowMs: NOW });
    expect(await workFor(ctx, communityScopeKey(w.communityId), "memory_review")).toMatchObject({ pending: 1, scope: "community" });
  });
});

test("a pod's review reads its room, writes the pod's notes from its own posts, and can't cite another pod", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS", "1000000");
  vi.stubEnv("POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS", "2000000");
  vi.stubEnv("POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS", "1000000");
  const t = convexTest(schema, modules);
  const w = await world(t);
  const { workId } = await t.mutation(internal.communityMemoryReview.requestMemoryReviewNowInternal, { communityId: w.communityId, podRoomId: w.climbersId, sinceMs: NOW });
  const usage = { input_tokens: 2000, output_tokens: 100, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } };
  const apply = { operation: "memory.apply", input: {
    notes: [
      { title: "Session log", body: "Log every session in the tracker by Sunday.", evidence_refs: [`post:${w.climbPost}`] },
      { title: "Leaked", body: "Founders pricing.", evidence_refs: [`post:${w.foundersPost}`] },
    ],
    index: "- [Session log](memory/session-log.md)",
  } };
  const bodies: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: any, options: any) => {
    bodies.push(JSON.parse(options.body));
    return new Response(JSON.stringify(bodies.length === 1
      ? { id: "r1", model: "gpt-6-luna", service_tier: "default", usage, output: [{ type: "function_call", call_id: "c1", name: "polynet_call", arguments: JSON.stringify(apply) }] }
      : { id: "r2", model: "gpt-6-luna", service_tier: "default", usage, output_text: "Added the session rule." }), { status: 200 });
  }));
  expect(await t.action(internal.communityMemoryReview.runMemoryReviewInternal, { workId })).toEqual({ status: "reviewed" });
  const prompt = JSON.stringify(bodies[0].input);
  expect(prompt).toContain("log every session");
  expect(prompt).toContain("climbers pod's memory");
  expect(prompt).not.toContain("Founders pricing");
  expect(JSON.stringify(bodies[1].input)).toContain("evidence_not_shared");
  await t.run(async (ctx: any) => {
    expect((await notesByUpdated(ctx, podScopeKey(w.climbersId)).collect()).map((note: any) => note.slug)).toEqual(["session-log"]);
    expect(await notesByUpdated(ctx, communityScopeKey(w.communityId)).collect()).toEqual([]);
    expect(await notesByUpdated(ctx, podScopeKey(w.foundersId)).collect()).toEqual([]);
  });
  // The community's own reads never show it.
  expect((await t.query(internal.communityNotes.listCommunityNotesInternal, { communityId: w.communityId })).notes).toEqual([]);
  expect(await t.query(internal.communityMemory.readCommunityMemoryIndexInternal, { communityId: w.communityId })).toBeNull();
  expect(await t.query(internal.communityMemory.readCommunityMemoryIndexInternal, { communityId: w.communityId, podRoomId: String(w.climbersId) }))
    .toMatchObject({ bodyMd: "- [Session log](memory/session-log.md)" });
});

test("a pod's review is skipped once the guide is taken out of the pod", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const { workId } = await t.mutation(internal.communityMemoryReview.requestMemoryReviewNowInternal, { communityId: w.communityId, podRoomId: w.climbersId, sinceMs: NOW });
  await t.run(async (ctx: any) => {
    const seat = await ctx.db.query("communityChannelParticipants").withIndex("by_channel_principal", (q: any) => q.eq("channelId", w.climbersId).eq("principalKey", "community_agent")).first();
    await ctx.db.patch(seat._id, { status: "revoked" });
  });
  expect(await t.mutation(internal.communityMemoryReview.claimMemoryReviewInternal, { workId, nowMs: Date.now() + 1_000 })).toEqual({ skipped: true });
});

test("a pod's hosts may undo its memory; not the community's", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  await t.run(async (ctx: any) => {
    for (const [scopeKey, slug] of [[podScopeKey(w.climbersId), "pod-note"], [communityScopeKey(w.communityId), "community-note"]] as const) {
      await ctx.db.insert("communityNotes", { scopeKey, communityId: w.communityId, slug, title: slug, bodyMd: "x", source: "learned", authorKind: "guide",
        evidenceRefs: [`post:${w.climbPost}`], searchText: "x", createdAt: NOW, updatedAt: NOW });
    }
  });
  const host = t.withIdentity({ subject: "host" });
  expect(await host.mutation(api.communityMemory.undoLearnedNote, { communityId: w.communityId, slug: "pod-note", podRoomId: String(w.climbersId) }))
    .toEqual({ undone: "removed" });
  await expect(host.mutation(api.communityMemory.undoLearnedNote, { communityId: w.communityId, slug: "community-note" })).rejects.toThrow(/community_forbidden/);
  await expect(host.mutation(api.communityMemory.undoLearnedNote, { communityId: w.communityId, slug: "x", podRoomId: String(w.foundersId) })).rejects.toThrow();
});
