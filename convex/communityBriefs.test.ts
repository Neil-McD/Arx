/// <reference types="vite/client" />
// A place's brief (convex/communityBriefs.ts): made due by people's posts in
// open channels, written once by the guide on the run entry, replacing the last.
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { markCommunityBriefDue } from "./communityBriefs";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.UTC(2026, 10, 15, 15, 0, 0);
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

async function world(t: any) {
  return await t.run(async (ctx: any) => {
    const ownerId = await ctx.db.insert("users", { authSubject: "owner", displayName: "Owner", createdAt: NOW, updatedAt: NOW });
    const mayaId = await ctx.db.insert("users", { authSubject: "maya", displayName: "Maya", createdAt: NOW, updatedAt: NOW });
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "brief-club", name: "Brief club", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityMemberships", { communityId, userId: mayaId, role: "member", accessSource: "free_grant", state: "active", createdAt: NOW, updatedAt: NOW });
    const general = await ctx.db.insert("communityChannels", { communityId, systemRole: "general", slug: "general", name: "general",
      accessMode: "all_members", postingPolicy: "members", status: "active", position: 0, createdByUserId: ownerId, createdAt: NOW, updatedAt: NOW } as any);
    const pod = await ctx.db.insert("communityChannels", { communityId, slug: "founders", name: "founders", accessMode: "restricted",
      postingPolicy: "members", status: "active", position: 1, createdByUserId: ownerId, createdAt: NOW, updatedAt: NOW } as any);
    return { ownerId, mayaId, communityId, general, pod };
  });
}

const briefWork = (t: any, communityId: any) => t.run((ctx: any) => ctx.db.query("agentWork")
  .withIndex("by_scope_kind", (q: any) => q.eq("scopeKey", `community:${String(communityId)}`).eq("kind", "brief")).first());

test("a person's post in an open channel makes the brief due an hour later; a pod, the guide or a private talk don't", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  await t.run((ctx: any) => markCommunityBriefDue(ctx, { communityId: w.communityId, channelId: w.pod, actorType: "human", nowMs: NOW }));
  await t.run((ctx: any) => markCommunityBriefDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "community_agent", nowMs: NOW }));
  await t.run((ctx: any) => markCommunityBriefDue(ctx, { communityId: w.communityId, channelId: undefined, actorType: "human", nowMs: NOW }));
  expect(await briefWork(t, w.communityId)).toBeNull();
  await t.run((ctx: any) => markCommunityBriefDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "human", nowMs: NOW }));
  await t.run((ctx: any) => markCommunityBriefDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "human", nowMs: NOW + 5_000 }));
  // A burst is read once: the second post joins the first, due an hour after it.
  expect(await briefWork(t, w.communityId)).toMatchObject({ kind: "brief", pending: 2, dueAt: NOW + 60 * 60_000 });
});

test("the guide writes the brief once from what was said; a refused brief is written again; the next replaces it", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS", "1000000");
  vi.stubEnv("POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS", "2000000");
  vi.stubEnv("POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS", "1000000");
  const t = convexTest(schema, modules);
  const w = await world(t);
  await t.run((ctx: any) => ctx.db.insert("operatorRoles", { userId: w.ownerId, role: "owner", active: true, createdAt: NOW, updatedAt: NOW }));
  await t.run(async (ctx: any) => {
    await ctx.db.insert("communityInteractionRoots", { communityId: w.communityId, channelId: w.general, actorType: "human", actorUserId: w.mayaId,
      kind: "discussion", status: "live", visibilityScope: "community", contentSummary: "Who's in for the Saturday climb at the north wall?",
      replyCount: 0, reactionSummary: [], idempotencyKey: "climb", createdAt: NOW + 10, updatedAt: NOW + 10 });
    await ctx.db.insert("communityInteractionRoots", { communityId: w.communityId, channelId: w.pod, actorType: "human", actorUserId: w.mayaId,
      kind: "discussion", status: "live", visibilityScope: "community", contentSummary: "POD SECRET", replyCount: 0, reactionSummary: [],
      idempotencyKey: "pod", createdAt: NOW + 20, updatedAt: NOW + 20 });
    await ctx.db.insert("communityJoinRequests", { communityId: w.communityId, userId: w.mayaId, status: "pending", createdAt: NOW, updatedAt: NOW } as any);
  });
  await t.run((ctx: any) => markCommunityBriefDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "human", nowMs: NOW }));
  const row: any = await briefWork(t, w.communityId);
  await t.run((ctx: any) => ctx.db.patch(row._id, { reviewedThrough: NOW }));

  const usage = { input_tokens: 2000, output_tokens: 100, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } };
  const call = (id: string, input: Record<string, unknown>) => ({ id, model: "gpt-6-luna", service_tier: "default", usage,
    output: [{ type: "function_call", call_id: id, name: "polynet_call", arguments: JSON.stringify({ operation: "brief.write", input }) }] });
  const replies = [
    call("c1", { headline: "x".repeat(200), points: ["too long a headline"] }),
    call("c2", { headline: "Saturday climb is filling up", points: ["Maya asked who's in for Saturday at the north wall."], next_step: "Reply if you're coming." }),
    { id: "r3", model: "gpt-6-luna", service_tier: "default", usage, output_text: "Wrote the first brief." },
  ];
  const bodies: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: any, options: any) => {
    bodies.push(JSON.parse(options.body));
    return new Response(JSON.stringify(replies[bodies.length - 1] ?? replies[2]), { status: 200 });
  }));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(row.dueAt);
  expect(await t.action(internal.communityBriefs.runCommunityBriefInternal, { workId: row._id })).toEqual({ status: "written" });

  const prompt = JSON.stringify(bodies[0].input);
  expect(prompt).toContain("north wall");
  // Only open channels; never a pod or a builder's business.
  expect(prompt).not.toContain("POD SECRET");
  expect(prompt).not.toMatch(/join request/i);
  // The refused write came back with its reason.
  expect(JSON.stringify(bodies[1].input)).toContain("headline_invalid");
  const briefs: any[] = await t.run((ctx: any) => ctx.db.query("communityBriefs").collect());
  expect(briefs).toHaveLength(1);
  expect(briefs[0]).toMatchObject({ scopeKey: `community:${String(w.communityId)}`, headline: "Saturday climb is filling up", nextStep: "Reply if you're coming." });
  const runs: any[] = await t.run((ctx: any) => ctx.db.query("agentWorkRuns").collect());
  expect(runs[0]).toMatchObject({ kind: "brief", status: "done", summary: "Wrote the first brief." });
  // Nothing new since: no more work is due.
  expect(await briefWork(t, w.communityId)).toMatchObject({ pending: 0 });
  expect((await briefWork(t, w.communityId)).dueAt).toBeUndefined();
});
