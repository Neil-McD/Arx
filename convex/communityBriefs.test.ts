/// <reference types="vite/client" />
// A place's brief (convex/communityBriefs.ts): made due by people's posts in
// open channels, written in one model request by the guide on the run entry,
// each point citing a post it was shown.
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { markCommunityBriefDue } from "./communityBriefs";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.UTC(2026, 10, 15, 15, 0, 0);
const HOUR = 60 * 60_000;
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

async function world(t: any) {
  return await t.run(async (ctx: any) => {
    const ownerId = await ctx.db.insert("users", { authSubject: "owner", displayName: "Owner", createdAt: NOW, updatedAt: NOW });
    const mayaId = await ctx.db.insert("users", { authSubject: "maya", displayName: "Maya", createdAt: NOW, updatedAt: NOW });
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "brief-club", name: "Brief club", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityMemberships", { communityId, userId: mayaId, role: "member", accessSource: "free_grant", state: "active", createdAt: NOW, updatedAt: NOW });
    // Funded: the owner is the platform operator.
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: NOW, updatedAt: NOW });
    const general = await ctx.db.insert("communityChannels", { communityId, systemRole: "general", slug: "general", name: "general",
      accessMode: "all_members", postingPolicy: "members", status: "active", position: 0, createdByUserId: ownerId, createdAt: NOW, updatedAt: NOW } as any);
    const pod = await ctx.db.insert("communityChannels", { communityId, slug: "founders", name: "founders", accessMode: "restricted",
      postingPolicy: "members", status: "active", position: 1, createdByUserId: ownerId, createdAt: NOW, updatedAt: NOW } as any);
    return { ownerId, mayaId, communityId, general, pod };
  });
}

const post = (t: any, w: any, extra: Record<string, unknown>) => t.run((ctx: any) => ctx.db.insert("communityInteractionRoots", {
  communityId: w.communityId, channelId: w.general, actorType: "human", actorUserId: w.mayaId, kind: "discussion", status: "live",
  visibilityScope: "community", contentSummary: "x", replyCount: 0, reactionSummary: [], idempotencyKey: `k${Math.random()}`,
  createdAt: NOW, updatedAt: NOW, ...extra }));
const reply = (t: any, w: any, rootId: any, extra: Record<string, unknown>) => t.run((ctx: any) => ctx.db.insert("communityInteractionReplies", {
  communityId: w.communityId, channelId: w.general, rootId, seq: 1, actorType: "human", actorUserId: w.ownerId, status: "live",
  visibilityScope: "community", contentSummary: "y", reactionSummary: [], idempotencyKey: `r${Math.random()}`, createdAt: NOW, updatedAt: NOW, ...extra }));

const briefWork = (t: any, communityId: any) => t.run((ctx: any) => ctx.db.query("agentWork")
  .withIndex("by_scope_kind", (q: any) => q.eq("scopeKey", `community:${String(communityId)}`).eq("kind", "brief")).first());

function stubProvider() {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS", "1000000");
  vi.stubEnv("POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS", "2000000");
  vi.stubEnv("POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS", "1000000");
}
const usage = { input_tokens: 2000, output_tokens: 100, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } };
const writeCall = (id: string, input: Record<string, unknown>) => ({ id, model: "gpt-6-luna", service_tier: "default", usage,
  output: [{ type: "function_call", call_id: id, name: "polynet_call", arguments: JSON.stringify({ operation: "brief.write", input }) }] });
function fakeModel(replies: any[]) {
  const bodies: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: any, options: any) => {
    bodies.push(JSON.parse(options.body));
    return new Response(JSON.stringify(replies[Math.min(bodies.length - 1, replies.length - 1)]), { status: 200 });
  }));
  return bodies;
}
// Makes the brief due and moves the clock to when it runs.
async function due(t: any, w: any) {
  await t.run((ctx: any) => markCommunityBriefDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "human", nowMs: NOW }));
  const row: any = await briefWork(t, w.communityId);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(row.dueAt);
  return row;
}

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
  expect(await briefWork(t, w.communityId)).toMatchObject({ kind: "brief", pending: 2, dueAt: NOW + HOUR });
});

test("one model request: the guide is shown who the community is and its threads by what matters, and writes a cited brief", async () => {
  stubProvider();
  const t = convexTest(schema, modules);
  const w = await world(t);
  await t.run((ctx: any) => ctx.db.insert("communityHandbooks", { communityId: w.communityId, approvedMd: "Keep it friendly and short.",
    approvedAt: NOW, draftStatus: "idle", createdAt: NOW, updatedAt: NOW }));
  const climb = await post(t, w, { contentSummary: "Who's in for the Saturday climb at the north wall?", replyCount: 2, createdAt: NOW + 10 });
  const yes = await reply(t, w, climb, { contentSummary: "I'm in, bringing chalk.", createdAt: NOW + 20 });
  await reply(t, w, climb, { contentSummary: "Me too.", actorUserId: w.mayaId, seq: 2, createdAt: NOW + 30 });
  const lonely = await post(t, w, { contentSummary: "Anyone have a spare harness?", createdAt: NOW + 5 });
  await post(t, w, { channelId: w.pod, contentSummary: "POD SECRET", createdAt: NOW + 6 });
  await post(t, w, { contentSummary: "GUIDE SAID THIS", actorType: "community_agent", actorUserId: undefined, actorAgentKey: "guide", createdAt: NOW + 7 });
  await post(t, w, { contentSummary: "TAKEN DOWN", status: "hidden", createdAt: NOW + 8 });
  await post(t, w, { contentSummary: "LAST MONTH", createdAt: NOW - 30 * 24 * HOUR });
  await t.run((ctx: any) => ctx.db.insert("communityJoinRequests", { communityId: w.communityId, userId: w.mayaId, status: "pending", createdAt: NOW, updatedAt: NOW } as any));

  const bodies = fakeModel([writeCall("c1", { headline: "Saturday climb is on",
    points: [{ text: "Maya's Saturday climb at the north wall has two takers.", refs: [`post:${climb}`, `reply:${yes}`] }] })]);
  const row = await due(t, w);
  expect(await t.action(internal.communityBriefs.runCommunityBriefInternal, { workId: row._id })).toEqual({ status: "written" });

  // The write ends the run: no second request to say what changed.
  expect(bodies).toHaveLength(1);
  const prompt = JSON.stringify(bodies[0].input) + JSON.stringify(bodies[0].instructions ?? "");
  // Who the community is, and how its builder wants the guide to speak.
  expect(prompt).toContain("Brief club");
  expect(prompt).toContain("Keep it friendly and short.");
  // The thread people replied to comes before the one nobody answered, each post with the id a point cites.
  expect(prompt.indexOf("north wall")).toBeLessThan(prompt.indexOf("spare harness"));
  expect(prompt).toContain(`post:${climb}`);
  expect(prompt).toContain(`reply:${yes}`);
  expect(prompt).toContain("Owner (host)");
  expect(prompt).toContain(`post:${lonely}`);
  expect(prompt).toContain("a question nobody has answered");
  // Only people's live, recent posts in open channels; never a pod or a builder's business.
  for (const never of ["POD SECRET", "GUIDE SAID THIS", "TAKEN DOWN", "LAST MONTH"]) expect(prompt).not.toContain(never);
  // (The instructions name join requests as off limits; nothing says one is waiting.)
  expect(prompt).not.toMatch(/waiting to join|pending/i);

  const briefs: any[] = await t.run((ctx: any) => ctx.db.query("communityBriefs").collect());
  expect(briefs).toHaveLength(1);
  expect(briefs[0]).toMatchObject({ scopeKey: `community:${String(w.communityId)}`, headline: "Saturday climb is on",
    points: [{ text: "Maya's Saturday climb at the north wall has two takers.", refs: [`post:${climb}`, `reply:${yes}`] }] });
  const runs: any[] = await t.run((ctx: any) => ctx.db.query("agentWorkRuns").collect());
  expect(runs[0]).toMatchObject({ kind: "brief", status: "done", summary: "Saturday climb is on", promptTokens: 2000 });
  // Nothing new since: no more work is due, and the next brief waits out its gap.
  const after: any = await briefWork(t, w.communityId);
  expect(after).toMatchObject({ pending: 0, reviewedThrough: row.dueAt });
  expect(after.dueAt).toBeUndefined();
  await t.run((ctx: any) => markCommunityBriefDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "human", nowMs: row.dueAt + 10 * 60_000 }));
  expect((await briefWork(t, w.communityId)).dueAt).toBe(row.dueAt + 3 * HOUR);
});

test("a point citing a post it wasn't shown, or a link, is refused with the reason and written again", async () => {
  stubProvider();
  const t = convexTest(schema, modules);
  const w = await world(t);
  const climb = await post(t, w, { contentSummary: "Saturday climb at the north wall.", createdAt: NOW + 10 });
  const elsewhere = await post(t, w, { channelId: w.pod, contentSummary: "POD SECRET", createdAt: NOW + 6 });
  const bodies = fakeModel([
    writeCall("c1", { headline: "News", points: [{ text: "From the pod.", refs: [`post:${elsewhere}`] }] }),
    writeCall("c2", { headline: "News", points: [{ text: "Sign up at evil.com", refs: [`post:${climb}`] }] }),
  ]);
  const row = await due(t, w);
  // Two refusals use up the run: nothing is written, and it is retried.
  expect(await t.action(internal.communityBriefs.runCommunityBriefInternal, { workId: row._id })).toMatchObject({ status: "failed" });
  expect(JSON.stringify(bodies[1].input)).toContain("refs_invalid");
  expect(await t.run((ctx: any) => ctx.db.query("communityBriefs").collect())).toHaveLength(0);
  expect(await briefWork(t, w.communityId)).toMatchObject({ pending: 1, failures: 1 });
});

test("a run that ends in words without a valid brief leaves the activity for the retry", async () => {
  stubProvider();
  const t = convexTest(schema, modules);
  const w = await world(t);
  await post(t, w, { contentSummary: "Anyone climbing?", createdAt: NOW + 10 });
  fakeModel([writeCall("c1", { headline: "", points: [] }),
    { id: "r2", model: "gpt-6-luna", service_tier: "default", usage, output_text: "I couldn't write it." }]);
  const row = await due(t, w);
  expect(await t.action(internal.communityBriefs.runCommunityBriefInternal, { workId: row._id })).toEqual({ status: "failed", errorCode: "brief_not_written" });
  expect(await t.run((ctx: any) => ctx.db.query("communityBriefs").collect())).toHaveLength(0);
  const after: any = await briefWork(t, w.communityId);
  expect(after).toMatchObject({ pending: 1, failures: 1 });
  expect(after.dueAt).toBeGreaterThan(row.dueAt);
});

test("a place with nothing recent to say costs nothing", async () => {
  stubProvider();
  const t = convexTest(schema, modules);
  const w = await world(t);
  await post(t, w, { contentSummary: "LAST MONTH", createdAt: NOW - 30 * 24 * HOUR });
  const bodies = fakeModel([writeCall("c1", { headline: "x", points: [] })]);
  const row = await due(t, w);
  expect(await t.action(internal.communityBriefs.runCommunityBriefInternal, { workId: row._id })).toEqual({ status: "empty" });
  expect(bodies).toHaveLength(0);
});
