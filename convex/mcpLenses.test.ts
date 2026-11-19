import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { ensureGeneralChannel } from "./communityChannelCore";
import schema from "./schema";
import { handleMcpPost, handleToolCall } from "./httpMcp";
import { api, internal } from "./_generated/api";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import { BUDGET_LIMITS } from "../shared/operationCatalog";
import { POLYNET_CANONICAL_TOOL_DEFINITIONS } from "../shared/polynetCanonicalToolContract";

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
  let lastError: { code: number; message: string } | null = null;
  const call = async (handle: string, name: string, args: Record<string, unknown>, aiApp?: string) => {
    // As in production: the MCP door verified the token itself, and nothing
    // after it has a backend sign-in to lean on.
    const as = t;
    const res = await handleMcpPost({
      ctx: { runQuery: (ref: any, a: any) => as.query(ref, a), runMutation: (ref: any, a: any) => as.mutation(ref, a), runAction: (ref: any, a: any) => as.action(ref, a) },
      req: new Request("https://example.convex.site/runtime/mcp", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
      }),
      jsonResponse: (_req, status, payload) => Response.json(payload, { status }),
      requireAuthenticatedActor: async () => ({ ok: true, actor: { authSubject: `${handle}-subject`, dbUserId: users[handle], ...(aiApp ? { aiApp } : {}) } }) as any,
    });
    const json = await res.json() as any;
    lastError = json.error ?? null;
    return json.result;
  };
  // The generic write, as the executor runs it for an outside AI behind the
  // door. tools/call no longer offers it (each action has its own named
  // tool), but the rules these tests prove are the executor's.
  const raw = async (handle: string, name: string, args: Record<string, unknown>) => {
    const result = await handleToolCall({
      ctx: { runQuery: (ref: any, a: any) => t.query(ref, a), runMutation: (ref: any, a: any) => t.mutation(ref, a), runAction: (ref: any, a: any) => t.action(ref, a) },
      authSubject: `${handle}-subject`, actor: { dbUserId: users[handle] }, toolName: name, toolArgs: args });
    return result.ok ? result.result as any
      : { isError: true, structuredContent: { error: result.message, ...((result as any).code ? { code: (result as any).code } : {}), ...((result as any).details ?? {}) } } as any;
  };
  return { call, raw, t, users, lastError: () => lastError };
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
  const posted = await f.raw("member", "polynet_write", { path: "/communities/run-club/channels/general/", mode: "create",
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
  f.raw(who, "polynet_write", { path, mode: "create", content: { text: `post ${key}` }, idempotency_key: key });

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
  const dressed = await f.raw("member", "polynet_write", { path: "/communities/run-club/channels/general/", mode: "create",
    content: { text: "another", root_id: " " }, idempotency_key: "dressed" });
  expect(dressed.structuredContent).toMatchObject({ code: "rate_limited", budget: "post_channel" });
  // The same key with different words is a different request, and is counted.
  const reused = await f.raw("member", "polynet_write", { path: "/communities/run-club/channels/general/", mode: "create",
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
  const write = (key: string, content: Record<string, unknown>) => f.raw("member", "polynet_write",
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

test("the same words cannot be reached by an edit, or by two requests at once", async () => {
  const f = await fixture();
  const general = "/communities/run-club/channels/general/";
  const minute = () => f.t.run(async (ctx: any) => {
    for (const row of await ctx.db.query("accessBudgetCounters").collect()) await ctx.db.patch(row._id, { minuteStartMs: row.minuteStartMs - 60_000 });
  });
  const words = "Join my new course, link in my profile, starts Monday.";
  const first = await f.raw("member", "polynet_write", { path: general, mode: "create", content: { text: words }, idempotency_key: "a" });
  expect(first.isError, JSON.stringify(first)).toBe(false);
  const firstRef = first.structuredContent.ref as string;
  await minute();
  const other = await f.raw("member", "polynet_write", { path: general, mode: "create", content: { text: "Something else entirely, about the weekend run." }, idempotency_key: "b" });
  expect(other.isError, JSON.stringify(other)).toBe(false);
  // Editing the second post into the first one's words is a repeat.
  const edited = await f.raw("member", "polynet_write", { path: `${general}${other.structuredContent.ref}.md`, mode: "update", content: { text: words }, idempotency_key: "c" });
  expect(edited.structuredContent).toMatchObject({ code: "ai_post_duplicate" });
  // Editing the first post without changing its words is not.
  const same = await f.raw("member", "polynet_write", { path: `${general}${firstRef}.md`, mode: "update", content: { text: `${words} ` }, idempotency_key: "d" });
  expect(same.isError, JSON.stringify(same)).toBe(false);
  // Two requests at once for new words: one posts.
  await minute();
  const twice = "Two requests arrive together with these exact words.";
  const [one, two] = await Promise.all(["e", "f"].map((key) => f.raw("member", "polynet_write",
    { path: `${general}${firstRef}/`, mode: "append", content: { text: twice }, idempotency_key: key })));
  expect([one.isError, two.isError].filter(Boolean)).toHaveLength(1);
  expect(await f.t.run((ctx: any) => ctx.db.query("communityInteractionReplies").collect())).toHaveLength(1);
});

test("words whose post failed can be posted again", async () => {
  const f = await fixture();
  const words = "This post goes to a channel that does not exist first.";
  const missing = await f.raw("member", "polynet_write", { path: "/communities/run-club/channels/nowhere/", mode: "create", content: { text: words }, idempotency_key: "x" });
  expect(missing.isError).toBe(true);
  expect(await f.t.run((ctx: any) => ctx.db.query("aiPostFingerprints").collect())).toHaveLength(0);
  expect((await f.raw("member", "polynet_write", { path: "/communities/run-club/channels/general/", mode: "create", content: { text: words }, idempotency_key: "y" })).isError).toBe(false);
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

// ---- the member lens, finished (docs/specs/agent-access-v0.md, slice 3)

// A conversation between the owner and the member, started by the owner in the app.
async function conversation(f: any, text = "Are you coming to the Sunday run?") {
  const communityId = await f.t.run(async (ctx: any) => (await ctx.db.query("communities").withIndex("by_slug", (q: any) => q.eq("slug", "run-club")).first())._id);
  const sent = await f.t.mutation((internal as any).directMessages.sendSiteDirectMessageForTrustedUserInternal,
    { userId: f.users.owner, communityId, handle: "member", text });
  return { id: sent.conversation_id as string, path: `/messages/${sent.conversation_id}/`, communityId };
}

test("a person's AI reads their own conversations and replies in one that exists, marked", async () => {
  const f = await fixture();
  const c = await conversation(f);
  // The top of the repository shows messages to a person's own AI.
  const root = await f.call("member", "polynet_list", { path: "/" });
  expect(root.structuredContent.entries.map((entry: any) => entry.path)).toContain("/messages/");
  const inbox = await f.call("member", "polynet_list", { path: "/messages/" });
  expect(inbox.isError, JSON.stringify(inbox)).toBe(false);
  expect(inbox.structuredContent.entries).toHaveLength(1);
  expect(inbox.structuredContent.entries[0]).toMatchObject({ path: c.path, with: "owner", handle: "owner", unread: 1 });
  // No ids of people anywhere in it.
  expect(JSON.stringify(inbox.structuredContent)).not.toContain(String(f.users.owner));
  const read = await f.call("member", "polynet_list", { path: c.path });
  expect(read.structuredContent.entries).toMatchObject([{ from_me: false, text: "Are you coming to the Sunday run?", via_ai: false }]);
  // A reply through the AI: sent as the member, marked for both people.
  const reply = await f.raw("member", "polynet_write", { path: c.path, mode: "append", content: { text: "Yes, see you at 7." }, idempotency_key: "r1" });
  expect(reply.isError, JSON.stringify(reply)).toBe(false);
  expect(reply.structuredContent.message).toMatchObject({ from_me: true, text: "Yes, see you at 7.", via_ai: true });
  const stored: any[] = await f.t.run((ctx: any) => ctx.db.query("dmMessages").collect());
  expect(stored.map((row) => [row.viaAi === true, String(row.senderUserId) === String(f.users.member)])).toEqual([[false, false], [true, true]]);
  // The same reply sent again is the same message.
  await f.raw("member", "polynet_write", { path: c.path, mode: "append", content: { text: "Yes, see you at 7." }, idempotency_key: "r1" });
  expect(await f.t.run((ctx: any) => ctx.db.query("dmMessages").collect())).toHaveLength(2);
  // The owner, in the app, sees the mark on it.
  const seen = await f.t.withIdentity({ subject: "owner-subject" }).query((api as any).directMessages.listDirectMessages,
    { authSubject: "owner-subject", conversationId: c.id });
  expect(seen.map((message: any) => message.via_ai)).toEqual([false, true]);
});

test("message answers are in the tools' published shapes, and two people's AIs can use the same key", async () => {
  const f = await fixture();
  const c = await conversation(f);
  for (const path of ["/messages/", c.path]) {
    const listed = await f.call("member", "polynet_list", { path });
    for (const field of (POLYNET_CANONICAL_TOOL_DEFINITIONS.polynet_list.outputSchema as any).required as string[]) expect(listed.structuredContent, `${path} ${field}`).toHaveProperty(field);
  }
  expect((await f.call("member", "polynet_read", { path: c.path })).isError).toBe(true);
  const mine = await f.raw("member", "polynet_write", { path: c.path, mode: "append", content: { text: "From the member." }, idempotency_key: "r1" });
  // The write's own fields, without Polynet's bookkeeping: an outside AI is never handed the receipt.
  for (const field of ((POLYNET_CANONICAL_TOOL_DEFINITIONS.polynet_write.outputSchema as any).required as string[]).filter((field) => field !== "receipt")) {
    expect(mine.structuredContent).toHaveProperty(field);
  }
  expect(mine.structuredContent).not.toHaveProperty("receipt");
  expect(JSON.stringify(mine.structuredContent)).not.toMatch(/authority_lane|principal_kind|polynet\.canonical/);
  // The owner's AI, with the same key, sends its own message.
  const theirs = await f.raw("owner", "polynet_write", { path: c.path, mode: "append", content: { text: "From the owner." }, idempotency_key: "r1" });
  expect(theirs.structuredContent.message).toMatchObject({ from_me: true, text: "From the owner." });
  const stored: any[] = await f.t.run((ctx: any) => ctx.db.query("dmMessages").collect());
  expect(stored.filter((row) => row.viaAi).map((row) => String(row.senderUserId)).sort()).toEqual([String(f.users.member), String(f.users.owner)].sort());
});

test("an AI cannot start a conversation, read someone else's, or get round a block", async () => {
  const f = await fixture();
  const c = await conversation(f);
  // Someone who is not in the conversation finds nothing at its path.
  expect((await f.call("outsider", "polynet_list", { path: c.path })).isError).toBe(true);
  expect((await f.raw("outsider", "polynet_write", { path: c.path, mode: "append", content: { text: "hello there" }, idempotency_key: "o1" })).isError).toBe(true);
  expect((await f.call("outsider", "polynet_list", { path: "/messages/" })).structuredContent.entries).toEqual([]);
  // There is no path that names a person: nothing starts a conversation.
  for (const path of ["/messages/", "/messages/owner/", "/messages/new/"]) {
    expect((await f.raw("member", "polynet_write", { path, mode: "append", content: { text: "hello there" }, idempotency_key: `n${path.length}` })).isError, path).toBe(true);
  }
  expect((await f.raw("member", "polynet_write", { path: c.path, mode: "create", content: { text: "hello there" }, idempotency_key: "n0" })).isError).toBe(true);
  expect(await f.t.run((ctx: any) => ctx.db.query("dmConversations").collect())).toHaveLength(1);
  // The owner blocks the member: the member's AI can no longer reply.
  const memberPublic = await f.t.run(async (ctx: any) => (await ctx.db.get(f.users.member)).publicUserId ?? null);
  if (memberPublic) {
    await f.t.withIdentity({ subject: "owner-subject" }).mutation((api as any).directMessages.blockDirectMessageUser, { authSubject: "owner-subject", targetUserId: memberPublic });
    const blocked = await f.raw("member", "polynet_write", { path: c.path, mode: "append", content: { text: "Still coming?" }, idempotency_key: "b1" });
    expect(blocked.isError).toBe(true);
  }
});

test("message replies through an AI have their own, smaller budget, and the same content checks", async () => {
  const f = await fixture();
  const c = await conversation(f);
  expect((await f.raw("member", "polynet_write", { path: c.path, mode: "append", content: { text: "x".repeat(1_600) }, idempotency_key: "long" })).structuredContent)
    .toMatchObject({ code: "ai_post_too_long" });
  await f.t.run(async (ctx: any) => { for (const row of await ctx.db.query("accessBudgetCounters").collect()) await ctx.db.delete(row._id); });
  await spent(f, f.users.member, "message_reply", "", BUDGET_LIMITS.message_reply.perMinute);
  const refused = await f.raw("member", "polynet_write", { path: c.path, mode: "append", content: { text: "One more." }, idempotency_key: "over" });
  expect(refused.structuredContent).toMatchObject({ code: "rate_limited", budget: "message_reply", window: "minute" });
  // Posting in a channel is a different budget.
  expect((await post(f, "member", "still-posts")).isError).toBe(false);
});

test("the host's switch: members' AIs read but do not post, and the rules say so", async () => {
  const f = await fixture();
  const c = await conversation(f);
  const owner = f.t.withIdentity({ subject: "owner-subject" });
  expect((await post(f, "member", "before")).isError).toBe(false);
  // A member cannot flip it; the host can.
  await expect(f.t.withIdentity({ subject: "member-subject" }).mutation((api as any).communityAiRules.setCommunityAiPosting,
    { authSubject: "member-subject", communityId: c.communityId, allowed: false })).rejects.toThrow();
  expect(await owner.mutation((api as any).communityAiRules.setCommunityAiPosting, { authSubject: "owner-subject", communityId: c.communityId, allowed: false }))
    .toMatchObject({ posting_allowed: false });
  await f.t.run(async (ctx: any) => { for (const row of await ctx.db.query("accessBudgetCounters").collect()) await ctx.db.delete(row._id); });
  const refused = await post(f, "member", "after");
  expect(refused.structuredContent).toMatchObject({ code: "ai_posting_off" });
  // Reading still works, the rules say why, and messages are not the host's to switch off.
  expect((await f.call("member", "polynet_list", { path: "/communities/run-club/channels/general/" })).isError).toBe(false);
  expect((await f.call("member", "polynet_read", { path: "/communities/run-club/rules.md" })).structuredContent.body).toContain("turned off in this community");
  expect((await f.raw("member", "polynet_write", { path: c.path, mode: "append", content: { text: "Yes, see you at 7." }, idempotency_key: "dm" })).isError).toBe(false);
  // The host's own AI is refused too: the switch is about AIs, not about who.
  expect((await post(f, "owner", "host-ai")).structuredContent).toMatchObject({ code: "ai_posting_off" });
  // Back on.
  await owner.mutation((api as any).communityAiRules.setCommunityAiPosting, { authSubject: "owner-subject", communityId: c.communityId, allowed: true });
  await f.t.run(async (ctx: any) => { for (const row of await ctx.db.query("accessBudgetCounters").collect()) await ctx.db.delete(row._id); });
  expect((await post(f, "member", "back-on")).isError).toBe(false);
});

// ---- builder parity, part one: channels (docs/specs/agent-access-v0.md, slice 4)

test("a builder's AI makes, renames, describes and orders channels; a member's cannot", async () => {
  const f = await fixture();
  const op = (who: string, operation: string, input: Record<string, unknown>, key: string) => f.raw(who, "polynet_call", {
    operation, version: 1, target: `/communities/run-club/capabilities/${operation}.json`, input, idempotency_key: key });
  const slugs = async () => (await f.call("owner", "polynet_list", { path: "/communities/run-club/channels/" })).structuredContent.entries
    .map((entry: any) => entry.path.split("/channels/")[1].replace(/\/$/, ""));
  // The capabilities a builder's AI is shown include them; a member's do not.
  const shown = async (who: string) => (await f.call(who, "polynet_list", { path: "/communities/run-club/capabilities/" })).structuredContent.entries
    .map((entry: any) => String(entry.path)).filter((path: string) => path.includes("community.channel.") && !path.includes("mark_read"));
  expect((await shown("owner")).map((path: string) => path.split("capabilities/")[1]).sort()).toEqual([
    "community.channel.create.json", "community.channel.describe.json", "community.channel.move.json", "community.channel.rename.json"]);
  expect(await shown("member")).toEqual([]);

  const made = await op("owner", "community.channel.create", { name: "Race reports" }, "c1");
  expect(made.isError, JSON.stringify(made)).toBe(false);
  expect(made.structuredContent.result.channel).toMatchObject({ slug: "race-reports", name: "Race reports" });
  await op("owner", "community.channel.create", { name: "Gear" }, "c2");
  expect(await slugs()).toEqual(["general", "race-reports", "gear"]);
  // The same call again is the same channel.
  await op("owner", "community.channel.create", { name: "Race reports" }, "c1");
  expect(await slugs()).toEqual(["general", "race-reports", "gear"]);

  expect((await op("owner", "community.channel.rename", { channel: "gear", name: "Kit" }, "r1")).structuredContent.result.channel)
    .toMatchObject({ slug: "gear", name: "Kit" });
  expect((await op("owner", "community.channel.describe", { channel: "gear", description: "Shoes, watches, bottles." }, "d1")).structuredContent.result.channel)
    .toMatchObject({ description: "Shoes, watches, bottles." });
  // Kit first among the others, then back after race reports.
  expect((await op("owner", "community.channel.move", { channel: "gear", after: "general" }, "m1")).isError).toBe(false);
  expect(await slugs()).toEqual(["general", "gear", "race-reports"]);
  expect((await op("owner", "community.channel.move", { channel: "gear", after: "race-reports" }, "m2")).isError).toBe(false);
  expect(await slugs()).toEqual(["general", "race-reports", "gear"]);

  // Clean refusals: a name in use, a channel that isn't there, General, and extra fields.
  expect((await op("owner", "community.channel.create", { name: "Kit" }, "x1")).structuredContent).toMatchObject({ code: "channel_name_taken" });
  expect((await op("owner", "community.channel.rename", { channel: "nowhere", name: "X" }, "x2")).structuredContent).toMatchObject({ code: "channel_not_found" });
  expect((await op("owner", "community.channel.rename", { channel: "general", name: "Lobby" }, "x3")).isError).toBe(true);
  expect((await op("owner", "community.channel.create", { name: "Secret", accessMode: "restricted" }, "x4")).structuredContent).toMatchObject({ code: "invalid_tool_args" });
  // A member's AI, and anything that deletes, is not there at all.
  expect((await op("member", "community.channel.create", { name: "Mine" }, "x5")).structuredContent).toMatchObject({ code: "operation_not_found" });
  expect((await op("owner", "community.channel.delete", { channel: "gear" }, "x6")).structuredContent).toMatchObject({ code: "operation_not_found" });
  expect(await slugs()).toEqual(["general", "race-reports", "gear"]);
  // Counted as builder changes for this community.
  const counted: any[] = await f.t.run((ctx: any) => ctx.db.query("accessBudgetCounters").collect());
  expect(counted.find((row: any) => row.budget === "builder_change")).toMatchObject({ scope: "run-club" });
});

// ---- builder parity, part one: courses and lessons (docs/specs/agent-access-v0.md, slice 4b)

test("a builder's AI builds courses in draft; it can't publish them or delete what members see", async () => {
  const f = await fixture();
  const communityId = await f.t.run(async (ctx: any) => (await ctx.db.query("communities").withIndex("by_slug", (q: any) => q.eq("slug", "run-club")).first())._id);
  const batch = (who: string, key: string, summary: string, operations: unknown[]) => f.raw(who, "polynet_write", {
    path: "/communities/run-club/builder/resources/", mode: "create", content: { summary, operations }, idempotency_key: key });
  const courses = () => f.t.run(async (ctx: any) => (await ctx.db.query("communityResourceModules").collect())
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder).map((row: any) => ({ id: String(row._id), name: row.name, status: row.status, updatedAt: row.updatedAt })));
  const lessons = () => f.t.run(async (ctx: any) => (await ctx.db.query("communityResources").collect())
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder).map((row: any) => ({ id: String(row._id), title: row.title, moduleId: String(row.moduleId), links: row.lessonLinks ?? [], updatedAt: row.updatedAt })));

  // One batch: a course and two lessons, one with a link. Applied at once.
  const made = await batch("owner", "b1", "Start a course on the first 5k.", [
    { op: "create_module", module_key: "5k", name: "Your first 5k", description_md: "Eight weeks, three runs a week." },
    { op: "create_page", module_key: "5k", title: "Week 1: walk and run", body_md: "Alternate one minute of each.",
      lesson_links: [{ title: "The plan", url: "https://example.com/plan" }] },
    { op: "create_page", module_key: "5k", title: "Week 2: longer runs", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  ]);
  expect(made.isError, JSON.stringify(made)).toBe(false);
  expect(made.structuredContent.result).toMatchObject({ status: "applied", applied: true, operation_count: 3 });
  expect((await courses()).map((course: any) => [course.name, course.status])).toEqual([["Your first 5k", "draft"]]);
  const [week1, week2] = await lessons();
  expect([week1.title, week2.title]).toEqual(["Week 1: walk and run", "Week 2: longer runs"]);
  expect(week1.links).toEqual([{ title: "The plan", url: "https://example.com/plan" }]);
  // Sent again, it is the same batch: nothing is made twice.
  expect((await batch("owner", "b1", "Start a course on the first 5k.", [
    { op: "create_module", module_key: "5k", name: "Your first 5k", description_md: "Eight weeks, three runs a week." },
    { op: "create_page", module_key: "5k", title: "Week 1: walk and run", body_md: "Alternate one minute of each.",
      lesson_links: [{ title: "The plan", url: "https://example.com/plan" }] },
    { op: "create_page", module_key: "5k", title: "Week 2: longer runs", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  ])).isError).toBe(false);
  expect(await lessons()).toHaveLength(2);

  // Edit and reorder in one batch.
  const [course] = await courses();
  const second = await batch("owner", "b2", "Fix the title, put week 2 first.", [
    { op: "edit_page", resource_id: week1.id, expected_updated_at: week1.updatedAt, title: "Week 1: walk, then run", lesson_links: [] },
    { op: "reorder_pages", module_id: course.id, resource_ids: [week2.id, week1.id] },
  ]);
  expect(second.isError, JSON.stringify(second)).toBe(false);
  expect(second.structuredContent.result).toMatchObject({ applied: true });
  expect((await lessons()).map((lesson: any) => [lesson.title, lesson.links.length])).toEqual([["Week 2: longer runs", 0], ["Week 1: walk, then run", 0]]);

  // Publishing is a person's switch: the AI is refused and told where it is.
  const publishing = await batch("owner", "b2p", "Publish.", [
    { op: "edit_module", module_id: course.id, expected_updated_at: (await courses())[0].updatedAt, module_status: "live" }]);
  expect(publishing.isError).toBe(true);
  expect(JSON.stringify(publishing)).toContain("use the Published switch");
  expect((await courses())[0].status).toBe("draft");

  // An order that leaves a lesson out is refused, and nothing in its batch is applied.
  const stale = await batch("owner", "b3", "Reorder.", [
    { op: "create_page", module_id: course.id, title: "Week 3" },
    { op: "reorder_pages", module_id: course.id, resource_ids: [week1.id, week2.id] },
  ]);
  expect(stale.isError).toBe(true);
  expect(await lessons()).toHaveLength(2);

  // While the course is a draft, the AI deletes a lesson in it.
  const drafts = await lessons();
  const doomed = drafts.find((lesson: any) => lesson.title.startsWith("Week 2"));
  const deleting = await batch("owner", "b4", "Drop week 2.", [{ op: "delete_page", resource_id: doomed.id, expected_updated_at: doomed.updatedAt }]);
  expect(deleting.isError, JSON.stringify(deleting)).toBe(false);
  expect((await lessons()).map((lesson: any) => lesson.title)).toEqual(["Week 1: walk, then run"]);
  const meanwhile = await batch("owner", "b5", "Add a second course.", [{ op: "create_module", name: "Race day" }]);
  expect(meanwhile.structuredContent.result).toMatchObject({ applied: true });
  await f.raw("owner", "polynet_write", { path: "/communities/run-club/builder/resources/", mode: "create",
    content: { summary: "Race day first.", operations: [{ op: "reorder_modules", module_ids: (await courses()).map((row: any) => row.id).reverse() }] }, idempotency_key: "b6" });
  expect((await courses()).map((row: any) => row.name)).toEqual(["Race day", "Your first 5k"]);

  // The person publishes the course in the app. From then on the AI can still
  // edit and add lessons, but not delete one members can see.
  await f.t.run(async (ctx: any) => ctx.db.patch(ctx.db.normalizeId("communityResourceModules", course.id), { status: "live" }));
  const [live] = await lessons();
  const edited = await batch("owner", "b7", "Tidy the title.", [{ op: "edit_page", resource_id: live.id, expected_updated_at: live.updatedAt, title: "Week 1" }]);
  expect(edited.isError, JSON.stringify(edited)).toBe(false);
  const [after] = await lessons();
  const removing = await batch("owner", "b8", "Drop week 1.", [{ op: "delete_page", resource_id: after.id, expected_updated_at: after.updatedAt }]);
  expect(removing.isError).toBe(true);
  expect(JSON.stringify(removing)).toContain("members can see it");
  expect((await lessons()).map((lesson: any) => lesson.title)).toEqual(["Week 1"]);

  // A member's AI has no builder folder at all.
  expect((await batch("member", "m1", "Mine.", [{ op: "create_module", name: "Mine" }])).isError).toBe(true);
  expect(await courses()).toHaveLength(2);
});

test("an outside AI is offered only reading and the named actions: the generic write and call are not there", async () => {
  const f = await fixture();
  for (const name of ["polynet_write", "polynet_call"]) {
    expect(await f.call("member", name, { path: "/communities/run-club/channels/general/", mode: "create", content: { text: "hi" }, idempotency_key: "g" })).toBeUndefined();
    expect(f.lastError()).toEqual({ code: -32601, message: "Tool not found." });
  }
  const posts = (await f.t.run((ctx: any) => ctx.db.query("communityInteractionRoots").collect())) as any[];
  expect(posts.filter((post) => post.contentSummary === "hi")).toEqual([]);
});

test("what an outside AI sends must fit the tool's shape: unknown, missing or wrong fields are refused with where and what", async () => {
  const f = await fixture();
  const refused = async (name: string, args: Record<string, unknown>, ...expected: string[]) => {
    const result = await f.call("owner", name, args);
    expect(result.isError, JSON.stringify(result)).toBe(true);
    expect(result.structuredContent.code).toBe("invalid_tool_args");
    for (const problem of expected) expect(result.structuredContent.problems).toContain(problem);
  };
  await refused("polynet_post", { community: "run-club", channel: "general", text: "Hello", not_in_schema: { x: 1 } }, "not_in_schema: not a field of this tool");
  await refused("polynet_post", { community: "run-club", channel: "general" }, "text: missing");
  await refused("polynet_post", { community: "run-club", channel: "general", text: 42 }, "text: should be text, got a number");
  // A misspelled optional field would have been dropped, and the event made without it.
  await refused("polynet_create_event", { community: "run-club", title: "Hill repeats", starts_at: "2026-12-01T07:00:00-05:00",
    timezone: "America/New_York", recurence_frequency: "weekly" }, "recurence_frequency: not a field of this tool");
  await refused("polynet_create_event", { community: "run-club", title: "Hill repeats", starts_at: "2026-12-01T07:00:00-05:00",
    timezone: "America/New_York", recurrence_frequency: "fortnightly" }, 'recurrence_frequency: must be one of "none", "daily", "weekly", "monthly"');
  await refused("polynet_list", { path: "/communities/", limt: 5 }, "limt: not a field of this tool");
  expect(await f.t.run((ctx: any) => ctx.db.query("communityEvents").collect())).toEqual([]);
  // What fits runs.
  expect((await f.call("owner", "polynet_post", { community: "run-club", channel: "general", text: "Hello" })).isError).toBe(false);
});

test("two people's AIs sending the same short words, or picking the same key, make two posts", async () => {
  const f = await fixture();
  // One new post a minute in a channel, per person: each post here starts a fresh minute.
  const post = async (who: string, text: string, key?: string) => {
    await f.t.run(async (ctx: any) => {
      for (const row of await ctx.db.query("accessBudgetCounters").collect()) await ctx.db.patch(row._id, { minuteStartMs: row.minuteStartMs - 60_000 });
    });
    return await f.call(who, "polynet_post", { community: "run-club", channel: "general", text, ...(key ? { idempotency_key: key } : {}) });
  };
  const mine = await post("member", "Count me in!");
  const theirs = await post("owner", "Count me in!");
  expect(mine.isError, JSON.stringify(mine)).toBe(false);
  expect(theirs.isError, JSON.stringify(theirs)).toBe(false);
  expect(theirs.structuredContent.ref).not.toBe(mine.structuredContent.ref);
  const a = await post("member", "Anyone up for hills on Thursday evening?", "post-1");
  const b = await post("owner", "I lost my water bottle at the track, has anyone seen it?", "post-1");
  expect(a.isError, JSON.stringify(a)).toBe(false);
  expect(b.isError, JSON.stringify(b)).toBe(false);
  // One person's retry is still a retry: the same post, not a second.
  expect((await post("member", "Anyone up for hills on Thursday evening?", "post-1")).structuredContent.ref).toBe(a.structuredContent.ref);
  // Two long keys that differ only at the end are two posts too.
  const long = "k".repeat(110);
  const first = await post("member", "Long key, first post about the weekend.", `${long}-a`);
  const second = await post("member", "Long key, second post about shoes.", `${long}-b`);
  expect(first.isError, JSON.stringify(first)).toBe(false);
  expect(second.isError, JSON.stringify(second)).toBe(false);
  expect(second.structuredContent.ref).not.toBe(first.structuredContent.ref);
  const roots = (await f.t.run((ctx: any) => ctx.db.query("communityInteractionRoots").collect())) as any[];
  expect(roots.filter((root) => root.contentSummary === "Count me in!")).toHaveLength(2);
  expect(roots.filter((root) => /hills on Thursday/.test(root.contentSummary))).toHaveLength(1);
});

// A person's own AI asks for what asks every time: Polynet asks the person
// with a Yes/No card (convex/communityGuideQuestions.ts) and runs the saved
// request only after their yes, once.
async function approvalsFixture() {
  const f = await fixture();
  const runClub = await f.t.run(async (ctx: any) => (await ctx.db.query("communities").collect()).find((row: any) => row.slug === "run-club")._id);
  const asOwner = f.t.withIdentity({ subject: "owner-subject" });
  const cards = () => asOwner.query((api as any).communityGuideQuestions.listGuideQuestions, { communityId: runClub }) as Promise<any[]>;
  const answer = (questionId: string, reply: "yes" | "no") =>
    asOwner.action((api as any).communityGuideQuestions.answerGuideQuestion, { communityId: runClub, questionId, answer: reply });
  const role = () => f.t.run(async (ctx: any) => (await ctx.db.query("communityMemberships").collect())
    .find((row: any) => String(row.userId) === String(f.users.member) && String(row.communityId) === String(runClub)).role);
  return { ...f, runClub, cards, answer, role };
}

test("a person's own AI asks to change a role: Polynet asks the person, and only their Yes runs it, once", async () => {
  const f = await approvalsFixture();
  const ask = { community: "run-club", members: ["member"], role: "moderator", idempotency_key: "make-mod" };
  const asked = await f.call("owner", "polynet_set_member_role", ask, "Claude");
  expect(asked.isError, JSON.stringify(asked)).toBe(false);
  expect(asked.structuredContent).toMatchObject({ status: "waiting_for_person", approve_in_polynet: expect.stringContaining("/c/run-club/") });
  expect(asked.structuredContent.note).toContain('idempotency_key "make-mod"');
  expect(await f.role()).toBe("member");
  // The card names the app that asked; it can't be always-allowed.
  const [card, ...others] = await f.cards();
  expect(others).toEqual([]);
  expect(card).toMatchObject({ kind: "change", askedBy: "Claude", canAlways: false });
  // Asking again is the same request, still waiting: one card, nothing done. With a new key too: the card's own key is given back.
  expect((await f.call("owner", "polynet_set_member_role", ask, "Claude")).structuredContent.status).toBe("waiting_for_person");
  const newKey = await f.call("owner", "polynet_set_member_role", { ...ask, idempotency_key: "make-mod-again" }, "Claude");
  expect(newKey.structuredContent.status).toBe("waiting_for_person");
  expect(newKey.structuredContent.note).toContain('idempotency_key "make-mod"');
  expect(await f.cards()).toHaveLength(1);
  // Someone else can't answer it.
  await expect(f.t.withIdentity({ subject: "member-subject" }).action((api as any).communityGuideQuestions.answerGuideQuestion,
    { communityId: f.runClub, questionId: card.id, answer: "yes" })).rejects.toThrow();
  expect(await f.role()).toBe("member");
  // The person's Yes runs it.
  expect(await f.answer(card.id, "yes")).toMatchObject({ status: "done" });
  expect(await f.role()).toBe("moderator");
  expect(await f.cards()).toEqual([]);
  // Asking again now gives what happened, and runs nothing again.
  const again = await f.call("owner", "polynet_set_member_role", ask, "Claude");
  expect(again.structuredContent).toMatchObject({ status: "done" });
  const audits = await f.t.run((ctx: any) => ctx.db.query("criticalAuditEvents").collect()) as any[];
  expect(audits.filter((row) => row.eventType === "community_member_role_set")).toHaveLength(1);
  // Asked for again on purpose, with a new key, it is a new request: a new card.
  expect((await f.call("owner", "polynet_set_member_role", { ...ask, idempotency_key: "make-mod-2" }, "Claude")).structuredContent.status).toBe("waiting_for_person");
  expect(await f.cards()).toHaveLength(1);
});

test("a Yes that stopped part way is marked failed after ten minutes, so the AI isn't told to wait for ever", async () => {
  const f = await approvalsFixture();
  const ask = { community: "run-club", members: ["member"], role: "moderator", idempotency_key: "stuck-1" };
  await f.call("owner", "polynet_set_member_role", ask, "Claude");
  const [card] = await f.cards();
  // The run started and never finished.
  await f.t.run((ctx: any) => ctx.db.patch(card.id, { status: "running", answeredAt: Date.now() - 11 * 60 * 1000 }));
  const again = await f.call("owner", "polynet_set_member_role", ask, "Claude");
  expect(again.isError).toBe(true);
  expect(again.structuredContent.code).toBe("failed_after_yes");
  expect(await f.role()).toBe("member");
  // A run still within its ten minutes is still waiting.
  await f.call("owner", "polynet_set_member_role", { ...ask, idempotency_key: "stuck-2" }, "Claude");
  const [fresh] = await f.cards();
  await f.t.run((ctx: any) => ctx.db.patch(fresh.id, { status: "running", answeredAt: Date.now() - 60 * 1000 }));
  expect((await f.call("owner", "polynet_set_member_role", { ...ask, idempotency_key: "stuck-2" }, "Claude")).structuredContent.status).toBe("waiting_for_person");
});

test("the person's No does nothing, and the AI is told so when it asks again", async () => {
  const f = await approvalsFixture();
  const ask = { community: "run-club", text: "# Handbook\n\nBe kind.", idempotency_key: "publish-1" };
  expect((await f.call("owner", "polynet_publish_handbook", ask)).structuredContent.status).toBe("waiting_for_person");
  const [card] = await f.cards();
  // No app name in the sign-in: the card says so plainly.
  expect(card.askedBy).toBe("Your AI app");
  expect(await f.answer(card.id, "no")).toMatchObject({ status: "declined" });
  const handbook = await f.t.run((ctx: any) => ctx.db.query("communityHandbooks").collect()) as any[];
  expect(handbook.filter((row) => row.approvedMd)).toEqual([]);
  const again = await f.call("owner", "polynet_publish_handbook", ask);
  expect(again.isError).toBe(true);
  expect(again.structuredContent.code).toBe("declined_by_person");
});

test("removing and banning, and deleting a post, wait for the person's Yes too; posts and replies still go out", async () => {
  const f = await approvalsFixture();
  // A post goes out as before: no card.
  const posted = await f.call("owner", "polynet_post", { community: "run-club", channel: "general", text: "Hills on Thursday?" }, "ChatGPT");
  expect(posted.isError, JSON.stringify(posted)).toBe(false);
  expect(await f.cards()).toEqual([]);
  // Deleting it waits.
  const del = await f.call("owner", "polynet_delete_post", { community: "run-club", channel: "general", post: posted.structuredContent.ref }, "ChatGPT");
  expect(del.structuredContent.status, JSON.stringify(del)).toBe("waiting_for_person");
  // Banning a member waits (it was a link to do by hand before).
  const ban = await f.call("owner", "polynet_ban_members", { community: "run-club", members: ["member"], reason: "spam" }, "ChatGPT");
  expect(ban.structuredContent.status, JSON.stringify(ban)).toBe("waiting_for_person");
  const cards = await f.cards();
  expect(cards.map((card) => [card.kind, card.askedBy])).toEqual([["remove", "ChatGPT"], ["remove", "ChatGPT"]]);
  const roots = () => f.t.run((ctx: any) => ctx.db.query("communityInteractionRoots").collect()) as Promise<any[]>;
  expect((await roots()).find((row) => row.contentSummary === "Hills on Thursday?").status).toBe("live");
  expect(await f.role()).toBe("member");
  for (const card of cards) expect(await f.answer(card.id, "yes"), card.question).toMatchObject({ status: "done" });
  // Asked again after the Yes, the AI is told it was done, though the person banned is no longer a member to name.
  const banAgain = await f.call("owner", "polynet_ban_members", { community: "run-club", members: ["member"], reason: "spam" }, "ChatGPT");
  expect(banAgain.isError, JSON.stringify(banAgain)).toBe(false);
  expect(banAgain.structuredContent.status).toBe("done");
  expect((await roots()).find((row) => row.contentSummary === "Hills on Thursday?").status).not.toBe("live");
  const blocks = await f.t.run((ctx: any) => ctx.db.query("communityBlocks").collect()) as any[];
  expect(blocks.filter((row) => String(row.userId) === String(f.users.member) && !row.liftedAt)).toHaveLength(1);
});

test("an AI can't pile up requests: ten wait at most, and the guide's questions are left alone", async () => {
  const f = await approvalsFixture();
  // Twenty requests that expired unanswered a while ago: they neither count nor hide new ones.
  await f.t.run(async (ctx: any) => {
    for (let index = 0; index < 20; index += 1) {
      await ctx.db.insert("communityGuideQuestions", { communityId: f.runClub, userId: f.users.owner, kind: "change", toolName: "polynet_call",
        inputJson: `{"old":${index}}`, question: `Old request ${index}?`, status: "waiting", ownAiApp: "Claude", createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000 - index });
    }
  });
  // A question the guide asked in the person's talk.
  await f.t.run((ctx: any) => ctx.db.insert("communityGuideQuestions", { communityId: f.runClub, userId: f.users.owner, kind: "post", toolName: "polynet_write",
    inputJson: "{}", question: "Post this in General?", status: "waiting", runId: "guide-run", createdAt: Date.now() }));
  for (let index = 0; index < 10; index += 1) {
    const asked = await f.call("owner", "polynet_publish_handbook", { community: "run-club", text: `Draft ${index}`, idempotency_key: `p${index}` }, "Claude");
    expect(asked.structuredContent.status, JSON.stringify(asked)).toBe("waiting_for_person");
  }
  const over = await f.call("owner", "polynet_publish_handbook", { community: "run-club", text: "One more", idempotency_key: "p10" }, "Claude");
  expect(over.isError).toBe(true);
  expect(over.structuredContent.code).toBe("approvals_waiting");
  const cards = await f.cards();
  expect(cards).toHaveLength(11);
  expect(cards.filter((card) => !card.askedBy).map((card) => card.question)).toEqual(["Post this in General?"]);
});

test("an outside AI sees a weekly event once, at its next time, with the next few after it", async () => {
  const f = await fixture();
  const made = await f.call("owner", "polynet_create_event", { community: "run-club", title: "Hill repeats", starts_at: "2027-01-05T07:00:00-05:00",
    timezone: "America/New_York", location_type: "online", recurrence_frequency: "weekly" });
  expect(made.isError, JSON.stringify(made)).toBe(false);
  expect(made.structuredContent).not.toHaveProperty("receipt");
  const listed = await f.call("member", "polynet_list", { path: "/communities/run-club/events/" });
  const entries = listed.structuredContent.entries as any[];
  expect(entries.map((entry) => entry.title)).toEqual(["Hill repeats"]);
  expect(entries[0].next_times).toHaveLength(3);
  // The occurrence listed still reads on its own path.
  expect((await f.call("member", "polynet_read", { path: entries[0].path })).isError).toBe(false);
});
