import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { ensureGeneralChannel } from "./communityChannelCore";
import schema from "./schema";
import { handleMcpPost } from "./httpMcp";
import { api } from "./_generated/api";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import { BUDGET_LIMITS } from "../shared/operationCatalog";

const modules = import.meta.glob("./**/*.*s");

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

// Cloudflare, recorded: upload pass (asks for every file), file upload, script, hostname map.
function fakeCloudflare() {
  for (const [key, value] of Object.entries({
    CLOUDFLARE_API_TOKEN: "cf-token", CLOUDFLARE_ACCOUNT_ID: "acct", POLYNET_SITES_NAMESPACE: "sites",
    POLYNET_SITES_ROUTES_KV_ID: "routes", POLYNET_SITES_DOMAIN: "polynet.page",
  })) vi.stubEnv(key, value);
  const calls: Array<{ method: string; url: string; body: any }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const method = init?.method ?? "GET";
    let body: any = init?.body ?? null;
    if (body instanceof FormData) {
      const fields: Record<string, string> = {};
      for (const [key, value] of (body as any).entries() as Iterable<[string, unknown]>) fields[key] = typeof value === "string" ? value : await (value as Blob).text();
      body = fields;
    } else if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { /* text */ }
    }
    calls.push({ method, url: String(url), body });
    if (String(url).endsWith("/assets-upload-session")) {
      const hashes = Object.values(body.manifest).map((entry: any) => entry.hash);
      return Response.json({ success: true, result: { jwt: "pass", buckets: [hashes] } });
    }
    if (String(url).includes("/workers/assets/upload")) return Response.json({ success: true, result: { jwt: "done" } }, { status: 201 });
    return Response.json({ success: true, result: {} });
  });
  return calls;
}

async function fixture() {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const ids = await t.run(async (ctx) => {
    const user = async (handle: string) => {
      const userId = await ctx.db.insert("users", {
        authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle, createdAt: nowMs, updatedAt: nowMs,
      });
      for (const document of PLATFORM_LEGAL_DOCUMENTS) {
        await ctx.db.insert("legalAcceptances", {
          userId, documentKey: document.key, documentVersion: document.version, acceptedAt: nowMs, source: "test", createdAt: nowMs,
        });
      }
      await ctx.db.insert("userProfileDetails", { userId, displayName: handle, avatarUrl: `https://example.com/${handle}.png`, createdAt: nowMs, updatedAt: nowMs });
      return userId;
    };
    const owner = await user("owner");
    const member = await user("member");
    const outsider = await user("outsider");
    const community = async (slug: string, ownerId: any) => {
      const communityId = await ctx.db.insert("communities", {
        ownerId, slug, name: slug, visibility: "unlisted", inferenceFundingPolicy: "managed_required",
        entryPolicy: "open", activeMemberCount: 2, createdAt: nowMs, updatedAt: nowMs,
      });
      await ensureGeneralChannel({ ctx, communityId, nowMs });
      return communityId;
    };
    const runClub = await community("run-club", owner);
    const otherClub = await community("other-club", outsider);
    for (const [communityId, userId] of [[runClub, member], [otherClub, owner]] as const) {
      await ctx.db.insert("communityMemberships", {
        communityId, userId, role: "member", accessSource: "free_grant", state: "active",
        activationSequence: 1, activatedAt: nowMs, createdAt: nowMs, updatedAt: nowMs,
      });
    }
    return { owner, member, outsider };
  });
  const users: Record<string, any> = ids;
  const call = async (handle: string, name: string, args: Record<string, unknown>) => {
    // The verified sign-in travels with the request, as it does in production.
    const as = t.withIdentity({ subject: `${handle}-subject` });
    const res = await handleMcpPost({
      ctx: { runQuery: (ref: any, a: any) => as.query(ref, a), runMutation: (ref: any, a: any) => as.mutation(ref, a), runAction: (ref: any, a: any) => as.action(ref, a) },
      req: new Request("https://example.convex.site/runtime/mcp", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
      }),
      jsonResponse: (_req, status, payload) => Response.json(payload, { status }),
      requireAuthenticatedActor: async () => ({ ok: true, actor: { authSubject: `${handle}-subject`, dbUserId: users[handle] } }) as any,
    });
    return (await res.json() as any).result;
  };
  return { call, t, users };
}

test("every member reaches the MCP in their own lens; outsiders find nothing", async () => {
  const f = await fixture();
  // A member of run-club reads their community as a member: no builder/ in it.
  const memberCall = await f.call("member", "polynet_list", { path: "/communities/run-club/" });
  expect(memberCall.isError).toBe(false);
  expect(memberCall.structuredContent.authority).toEqual({ lane: "member", relation: "member" });
  expect(JSON.stringify(memberCall.structuredContent.entries)).not.toContain("/builder/");
  expect((await f.call("member", "polynet_list", { path: "/communities/run-club/builder/" })).content[0].text).toContain("semantic_not_found");
  // Posting works in the member lens.
  const posted = await f.call("member", "polynet_write", { path: "/communities/run-club/channels/general/", mode: "create",
    content: { text: "Morning run at 7" }, idempotency_key: "member-post" });
  expect(posted.isError, JSON.stringify(posted)).toBe(false);
  // Someone who isn't in run-club gets nothing from it.
  const outsiderCall = await f.call("outsider", "polynet_list", { path: "/communities/run-club/" });
  expect(outsiderCall.isError).toBe(true);
  expect(outsiderCall.content[0].text).toContain("semantic_not_found");
  // The communities directory lists what the caller belongs to, with their role.
  const member = await f.call("member", "polynet_list", { path: "/communities/" });
  expect(member.structuredContent.entries.map((entry: any) => [entry.path, entry.role])).toEqual([["/communities/run-club/", "member"]]);
});

// What a person's own AI spends in this minute or this day, set directly.
const spent = (f: any, userId: any, budget: string, scope: string, minuteCount: number, dayCount = minuteCount) => f.t.run((ctx: any) =>
  ctx.db.insert("accessBudgetCounters", { userId, budget, scope, minuteStartMs: Date.now(), minuteCount, dayStartMs: Date.now(), dayCount, updatedAt: Date.now() }));
const post = (f: any, who: string, key: string, path = "/communities/run-club/channels/general/") =>
  f.call(who, "polynet_write", { path, mode: "create", content: { text: `post ${key}` }, idempotency_key: key });

test("past the post budget, the MCP answers rate_limited with a machine-readable retry time", async () => {
  const f = await fixture();
  // The member has used this minute's posts.
  await spent(f, f.users.member, "post", "", BUDGET_LIMITS.post.perMinute);
  const refused = await post(f, "member", "over");
  expect(refused.isError).toBe(true);
  expect(refused.structuredContent).toMatchObject({ code: "rate_limited", retry_after_ms: expect.any(Number), budget: "post", window: "minute" });
  expect(refused.structuredContent.error).toContain("rate_limited");
  // Reads still work.
  expect((await f.call("member", "polynet_list", { path: "/communities/run-club/" })).isError).toBe(false);
});

test("one new post a minute in a channel; a refused post spends nothing", async () => {
  const f = await fixture();
  expect((await post(f, "member", "first")).isError).toBe(false);
  const second = await post(f, "member", "second");
  expect(second.isError).toBe(true);
  expect(second.structuredContent).toMatchObject({ code: "rate_limited", budget: "post_channel", window: "minute" });
  // The refused post did not come out of the day's posts.
  const rows: any[] = await f.t.run((ctx: any) => ctx.db.query("accessBudgetCounters").collect());
  expect(rows.find((row: any) => row.budget === "post")).toMatchObject({ minuteCount: 1, dayCount: 1 });
  expect(rows.find((row: any) => row.budget === "post_channel")).toMatchObject({ scope: "run-club/general", minuteCount: 1 });
});

test("nothing in a call makes it cheaper: a reused key or a blank root_id is still counted", async () => {
  const f = await fixture();
  expect((await post(f, "member", "first")).isError).toBe(false);
  // A second new post dressed as a reply to nothing is still a new post.
  const dressed = await f.call("member", "polynet_write", { path: "/communities/run-club/channels/general/", mode: "create",
    content: { text: "another", root_id: " " }, idempotency_key: "dressed" });
  expect(dressed.structuredContent).toMatchObject({ code: "rate_limited", budget: "post_channel" });
  // The same key with different words is a different request, and is counted.
  const reused = await f.call("member", "polynet_write", { path: "/communities/run-club/channels/general/", mode: "create",
    content: { text: "different words" }, idempotency_key: "first" });
  expect(reused.structuredContent).toMatchObject({ code: "rate_limited", budget: "post_channel" });
  // The same request, to the letter, is a retry: not refused, not counted again.
  expect((await post(f, "member", "first")).isError).toBe(false);
  const rows: any[] = await f.t.run((ctx: any) => ctx.db.query("accessBudgetCounters").collect());
  expect(rows.find((row: any) => row.budget === "post")).toMatchObject({ minuteCount: 1 });
});

test("the day's posts run out even when the minute has room", async () => {
  const f = await fixture();
  await spent(f, f.users.member, "post", "", 0, BUDGET_LIMITS.post.perDay);
  const refused = await post(f, "member", "day");
  expect(refused.structuredContent).toMatchObject({ code: "rate_limited", budget: "post", window: "day" });
  expect(refused.structuredContent.retry_after_ms).toBeGreaterThan(60_000);
});

test("reads and searches through a person's own AI are counted too", async () => {
  const f = await fixture();
  expect((await f.call("member", "polynet_list", { path: "/communities/run-club/" })).isError).toBe(false);
  const counted: any[] = await f.t.run((ctx: any) => ctx.db.query("accessBudgetCounters").collect());
  expect(counted.find((row: any) => row.budget === "read")).toMatchObject({ minuteCount: 1, dayCount: 1 });
  await f.t.run(async (ctx: any) => { for (const row of await ctx.db.query("accessBudgetCounters").collect()) await ctx.db.delete(row._id); });
  await spent(f, f.users.member, "read", "", BUDGET_LIMITS.read.perMinute);
  const refused = await f.call("member", "polynet_list", { path: "/communities/run-club/" });
  expect(refused.structuredContent).toMatchObject({ code: "rate_limited", budget: "read", window: "minute" });
  await spent(f, f.users.member, "search", "", BUDGET_LIMITS.search.perMinute);
  const search = await f.call("member", "polynet_search", { path: "/communities/run-club/channels/", query: "run" });
  expect(search.structuredContent).toMatchObject({ code: "rate_limited", budget: "search" });
  // Another person's budget is their own.
  expect((await f.call("owner", "polynet_list", { path: "/communities/run-club/" })).isError).toBe(false);
});

test("a builder works on its own community in the builder lens and on others as a member", async () => {
  const f = await fixture();
  const own = await f.call("owner", "polynet_list", { path: "/communities/run-club/" });
  expect(own.isError).toBe(false);
  expect(own.structuredContent.authority).toEqual({ lane: "builder", relation: "owner" });
  // In other-club the owner is only a member.
  const other = await f.call("owner", "polynet_list", { path: "/communities/other-club/" });
  expect(other.structuredContent.authority).toEqual({ lane: "member", relation: "member" });
  // Communities it owns come first, then the ones it belongs to, a page at a time.
  const entries: any[] = [];
  let cursor: string | null = null;
  do {
    const page: any = await f.call("owner", "polynet_list", { path: "/communities/", ...(cursor ? { cursor } : {}) });
    entries.push(...page.structuredContent.entries);
    cursor = page.structuredContent.next_cursor;
  } while (cursor);
  expect(entries.map((entry: any) => [entry.path, entry.role]).sort()).toEqual([
    ["/communities/other-club/", "member"], ["/communities/run-club/", "owner"]]);
});

// ---- guidance and output quality (docs/specs/agent-access-v0.md, slice 2)

test("an AI finds the rules in every community: Polynet's, then the host's", async () => {
  const f = await fixture();
  const listed = await f.call("member", "polynet_list", { path: "/communities/run-club/" });
  expect(listed.structuredContent.entries.map((entry: any) => entry.path)).toContain("/communities/run-club/rules.md");
  const before = await f.call("member", "polynet_read", { path: "/communities/run-club/rules.md" });
  expect(before.isError, JSON.stringify(before)).toBe(false);
  expect(before.structuredContent.body).toContain("## Polynet's rules");
  expect(before.structuredContent.body).toContain("No house rules yet");
  // The host writes house rules; a member cannot.
  const asOwner = f.t.withIdentity({ subject: "owner-subject" });
  const communityId = await f.t.run(async (ctx: any) => (await ctx.db.query("communities").withIndex("by_slug", (q: any) => q.eq("slug", "run-club")).first())._id);
  await asOwner.mutation((api as any).communityAiRules.saveCommunityAiRules, { authSubject: "owner-subject", communityId, text: "Wins go in #wins." });
  await expect(f.t.withIdentity({ subject: "member-subject" }).mutation((api as any).communityAiRules.saveCommunityAiRules,
    { authSubject: "member-subject", communityId, text: "Anything goes." })).rejects.toThrow();
  const after = await f.call("member", "polynet_read", { path: "/communities/run-club/rules.md" });
  expect(after.structuredContent.body).toContain("> Wins go in #wins.");
  expect(after.structuredContent.body).not.toContain("Anything goes");
  // Someone outside the community reads nothing.
  expect((await f.call("outsider", "polynet_read", { path: "/communities/run-club/rules.md" })).isError).toBe(true);
});

test("a post through an AI is marked for everyone; one typed in the app is not", async () => {
  const f = await fixture();
  expect((await post(f, "member", "marked")).isError).toBe(false);
  const roots: any[] = await f.t.run((ctx: any) => ctx.db.query("communityInteractionRoots").collect());
  expect(roots).toHaveLength(1);
  expect(roots[0].viaAi).toBe(true);
  // The same person typing in the app: no mark, and a client cannot set one.
  const communityId = roots[0].communityId;
  await f.t.withIdentity({ subject: "member-subject" }).mutation((api as any).communityInteractions.createCommunityInteractionComposerMessage,
    { authSubject: "member-subject", communityId, channelId: roots[0].channelId, idempotencyKey: "typed", text: "Typed by hand" });
  const typed = (await f.t.run((ctx: any) => ctx.db.query("communityInteractionRoots").collect()) as any[]).find((row) => row.contentSummary?.includes("Typed"));
  expect(typed.viaAi).toBeUndefined();
  await expect(f.t.withIdentity({ subject: "member-subject" }).mutation((api as any).communityInteractions.createCommunityInteractionComposerMessage,
    { authSubject: "member-subject", communityId, channelId: roots[0].channelId, idempotencyKey: "forged", text: "x", viaAi: true })).rejects.toThrow();
});

test("the server refuses what guidance alone would not stop", async () => {
  const f = await fixture();
  const write = (key: string, content: Record<string, unknown>) => f.call("member", "polynet_write",
    { path: "/communities/run-club/channels/general/", mode: "create", content, idempotency_key: key });
  const minute = () => f.t.run(async (ctx: any) => {
    for (const row of await ctx.db.query("accessBudgetCounters").collect()) await ctx.db.patch(row._id, { minuteStartMs: row.minuteStartMs - 60_000 });
  });
  // Too long.
  const long = await write("long", { text: "word ".repeat(600) });
  expect(long.structuredContent).toMatchObject({ code: "ai_post_too_long" });
  await minute();
  // Too many links.
  expect((await write("links", { text: "https://a.example https://b.example https://c.example https://d.example" })).structuredContent)
    .toMatchObject({ code: "ai_post_too_many_links" });
  await minute();
  // Everyone.
  expect((await write("everyone", { text: "hello @everyone" })).structuredContent).toMatchObject({ code: "ai_post_mentions_everyone" });
  await minute();
  // The same words twice in a day, however they are dressed.
  const words = "We shipped the new onboarding flow today, thanks to Sam.";
  expect((await write("first", { text: words })).isError).toBe(false);
  await minute();
  const again = await write("second", { text: `  ${words.toUpperCase()}  ` });
  expect(again.structuredContent).toMatchObject({ code: "ai_post_duplicate" });
  // Nothing refused was posted.
  expect(await f.t.run((ctx: any) => ctx.db.query("communityInteractionRoots").collect())).toHaveLength(1);
  // The refused request itself, sent again, is still refused (its receipt failed, it did not post).
  await minute();
  expect((await write("second", { text: `  ${words.toUpperCase()}  ` })).isError).toBe(true);
  // Other words are fine.
  await minute();
  expect((await write("third", { text: "A different update: the docs are live too, with screenshots." })).isError).toBe(false);
});

test("the server tells a connecting AI how to behave", async () => {
  const res = await handleMcpPost({
    ctx: {} as any,
    req: new Request("https://example.convex.site/runtime/mcp", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }) }),
    jsonResponse: (_req, status, payload) => Response.json(payload, { status }),
    requireAuthenticatedActor: async () => ({ ok: true, actor: { authSubject: "member-subject", dbUserId: "u" } }) as any,
  });
  const instructions = (await res.json() as any).result.instructions as string;
  expect(instructions).toContain("rules.md");
  expect(instructions).toContain("marked as made through an AI");
});
