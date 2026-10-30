import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import { SDK_SOURCE } from "./sdk";

// Loads the exact text the edge serves, fresh for each test.
let loads = 0;
async function loadSdk() {
  const file = join(mkdtempSync(join(tmpdir(), "polynet-sdk-")), `sdk-${++loads}.mjs`);
  writeFileSync(file, SDK_SOURCE);
  return (await import(/* @vite-ignore */ pathToFileURL(file).href)).default;
}

type Route = (url: string, init: RequestInit) => Response | Promise<Response>;
function stubFetch(routes: Record<string, Route>) {
  const calls: Array<{ url: string; body: any }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body ?? null;
    calls.push({ url, body });
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch ${url}`);
    return await route(url, init);
  }));
  return calls;
}

const signedIn = () => Response.json({ signed_in: true, community: "run-club", join_url: "https://polynet.example/c/run-club", live: { url: "https://live.example", token: "pnw_x" } });
const ok = (value: unknown) => Response.json({ ok: true, value });

afterEach(() => vi.unstubAllGlobals());

test("posts, replies, reacts and asks the agent through the door on this community's paths", async () => {
  const calls = stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { tool, input } = JSON.parse(String(init.body));
      if (tool === "polynet_list" && input.path === "/communities/run-club/") return ok({ community: { slug: "run-club", name: "Run Club" } });
      return ok({ tool, input });
    },
  });
  const polynet = await loadSdk();
  expect(polynet.version).toBe("1");
  await polynet.session();

  await polynet.post("general", "Morning run at 7");
  await polynet.post("general", "I'm in", { replyTo: "interaction:root:abc123" });
  await polynet.react("interaction:root:abc123", "🔥", true);
  await polynet.post("general", "what's the route?", { askAgent: true });

  const writes = calls.filter((call) => call.body?.tool === "polynet_write").map((call) => call.body.input);
  expect(writes[0]).toMatchObject({ path: "/communities/run-club/channels/general/", mode: "create", content: { text: "Morning run at 7" } });
  expect(writes[1]).toMatchObject({ mode: "append", content: { text: "I'm in", root_id: "abc123" } });
  expect(writes[2]).toMatchObject({ content: { text: "@Run Club what's the route?", mentions: [{ agentKey: "community_agent" }] } });
  for (const input of writes) expect(input.idempotency_key).toMatch(/^[a-f0-9]{32}$/);
  const reaction = calls.find((call) => call.body?.tool === "polynet_call")!.body.input;
  expect(reaction).toMatchObject({
    target: "/communities/run-club/capabilities/community.interaction.react.json", operation: "community.interaction.react",
    version: 1, input: { ref: "interaction:root:abc123", emoji: "🔥", on: true },
  });
});

test("feed returns posts oldest first; errors surface as PolynetError", async () => {
  stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { input } = JSON.parse(String(init.body));
      if (input.path.endsWith("/missing/")) return Response.json({ ok: false, code: "semantic_not_found", message: "Not found." });
      return ok({ entries: [
        { ref: "interaction:root:2", object_type: "root" },
        { ref: "interaction:reply:9", object_type: "reply" },
        { ref: "interaction:root:1", object_type: "root" },
      ] });
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  expect((await polynet.feed("general")).map((entry: any) => entry.ref)).toEqual(["interaction:root:1", "interaction:root:2"]);
  await expect(polynet.feed("missing")).rejects.toMatchObject({ name: "PolynetError", code: "semantic_not_found" });
});

test("readText never pages a .json document, even one that doesn't parse", async () => {
  const calls = stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": () => ok({ path: "/communities/run-club/memory/m1.json", body: "{\"body_md\": \"cut", truncated: true, next_offset: 24000 }),
  });
  const polynet = await loadSdk();
  await polynet.session();
  const text = await polynet.readText("/communities/run-club/memory/m1.json");
  expect(text).toBe("{\"body_md\": \"cut");
  expect(calls.filter((call) => call.body?.tool === "polynet_read")).toHaveLength(1);
});

test("feed reads past a page of only replies instead of returning no posts", async () => {
  const calls = stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { input } = JSON.parse(String(init.body));
      if (!input.cursor) return ok({ entries: [{ ref: "interaction:reply:9", object_type: "reply" }], next_cursor: "c1", truncated: true });
      return ok({ entries: [{ ref: "interaction:root:1", object_type: "root" }], next_cursor: null, truncated: false });
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  const posts = await polynet.feed("general", { limit: 1 });
  expect(posts.map((entry: any) => entry.ref)).toEqual(["interaction:root:1"]);
  expect(posts.cursor).toBeNull();
  expect(calls.filter((call) => call.body?.tool === "polynet_list" && String(call.body.input.path).includes("/channels/"))).toHaveLength(2);
});

test("feed pages back through history with the list's cursor", async () => {
  const calls = stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { input } = JSON.parse(String(init.body));
      if (!input.cursor) return ok({ entries: [{ ref: "interaction:root:2", object_type: "root" }], next_cursor: "1700", truncated: true });
      return ok({ entries: [{ ref: "interaction:root:1", object_type: "root" }], next_cursor: null, truncated: false });
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  const newest = await polynet.feed("general", { limit: 20 });
  expect(newest.map((entry: any) => entry.ref)).toEqual(["interaction:root:2"]);
  expect(newest.cursor).toBe("1700");
  const older = await polynet.feed("general", { cursor: newest.cursor });
  expect(older.map((entry: any) => entry.ref)).toEqual(["interaction:root:1"]);
  expect(older.cursor).toBeNull();
  const inputs = calls.filter((call) => call.body?.tool === "polynet_list").map((call) => call.body.input);
  expect(inputs.slice(-2)).toEqual([
    { path: "/communities/run-club/channels/general/", limit: 20 },
    { path: "/communities/run-club/channels/general/", limit: 50, cursor: "1700" },
  ]);
});

test("thread reads the whole thread, following the server's pages; past the cap it says it isn't complete", async () => {
  const reply = (n: number) => ({ type: "interaction", ref: "interaction:reply:" + n, object_type: "reply", text: "r" + n });
  let endless = false;
  const calls = stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { input } = JSON.parse(String(init.body));
      if (endless) return ok({ entries: [reply(Number(input.cursor || 0) + 1)], next_cursor: String(Number(input.cursor || 0) + 1), truncated: true });
      // As the executor lists a thread: the post and 100 replies, then the rest after the cursor.
      if (!input.cursor) {
        return ok({ entries: [{ type: "interaction", ref: "interaction:root:p", object_type: "root", text: "post" }, ...Array.from({ length: 100 }, (_, i) => reply(i + 1))],
          next_cursor: "1700000000100", truncated: true });
      }
      return ok({ entries: [reply(101), reply(102)], next_cursor: null, truncated: false });
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  const whole = await polynet.thread("general", "interaction:root:p");
  expect(whole).toHaveLength(103);
  expect(whole[0].ref).toBe("interaction:root:p");
  expect(whole.at(-1).ref).toBe("interaction:reply:102");
  expect(whole.complete).toBe(true);
  const inputs = calls.filter((call) => call.body?.tool === "polynet_list").map((call) => call.body.input).slice(-2);
  expect(inputs).toEqual([
    { path: "/communities/run-club/channels/general/interaction:root:p/" },
    { path: "/communities/run-club/channels/general/interaction:root:p/", cursor: "1700000000100" },
  ]);

  endless = true;
  const before = calls.length;
  const capped = await polynet.thread("general", "interaction:root:p");
  expect(calls.length - before).toBe(20);
  expect(capped).toHaveLength(20);
  expect(capped.complete).toBe(false);
});

test("channels follows every page of the listing", async () => {
  const calls = stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { input } = JSON.parse(String(init.body));
      if (!input.cursor) return ok({ entries: [{ type: "channel", slug: "general", name: "General", is_general: true, unread: true, mentioned: true, seen_through_at: 1700 }], truncated: true, next_cursor: "page2" });
      return ok({ entries: [{ type: "channel", slug: "crew", name: "Crew", capabilities: { canPost: false, canReply: false } }], truncated: false });
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  expect(await polynet.channels()).toEqual([
    { slug: "general", name: "General", path: undefined, isGeneral: true, canPost: true, canReply: true, unread: true, mentioned: true, seenThroughAt: 1700 },
    { slug: "crew", name: "Crew", path: undefined, isGeneral: false, canPost: false, canReply: false, unread: false, mentioned: false, seenThroughAt: null },
  ]);
  const channelCalls = calls.filter((call) => call.body?.input?.path === "/communities/run-club/channels/");
  expect(channelCalls.map((call) => call.body.input.cursor)).toEqual([undefined, "page2"]);
});

test("session names the community and the signed-in member", async () => {
  stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": () => ok({ entries: [], community: { slug: "run-club", name: "Dawn Patrol" },
      viewer: { display_name: "Sam Rivera", handle: "sam", avatar_url: "https://x/sam.png", role: "member" } }),
  });
  const polynet = await loadSdk();
  expect(await polynet.session()).toMatchObject({
    signed_in: true, community: "run-club", community_name: "Dawn Patrol",
    member: { name: "Sam Rivera", handle: "sam", avatar_url: "https://x/sam.png", role: "member" },
  });
});

test("an expired session reads as signed out", async () => {
  stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": () => Response.json({ ok: false, code: "sign_in_required" }, { status: 401 }),
  });
  const polynet = await loadSdk();
  expect(await polynet.session()).toMatchObject({ signed_in: false, member: null });
});

test("posts always carry their whole text; readText reads a post's blocks", async () => {
  stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { tool, input } = JSON.parse(String(init.body));
      if (tool === "polynet_read") return ok({ body: JSON.stringify({ content_blocks: [{ text: "First part." }, { text: "Second part." }] }) });
      if (input.path === "/communities/run-club/") return ok({ entries: [] });
      return ok({ entries: [
        { type: "interaction", ref: "interaction:root:1", object_type: "root", snippet: "Short", reply_count: 2, can_edit: true },
        { type: "interaction", ref: "interaction:root:2", object_type: "root", snippet: "Long…", snippet_truncated: true, text: "Long and whole" },
      ] });
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  const posts = await polynet.feed("general");
  expect(posts.map((post: any) => [post.text, post.reply_count, post.can_edit])).toEqual([["Long and whole", 0, false], ["Short", 2, true]]);
  expect(await polynet.readText({ path: "/communities/run-club/channels/general/interaction:root:9.md" })).toBe("First part.\n\nSecond part.");
});

test("events lists from now, from a time or a cursor; event reads one by its ref and refuses anything else", async () => {
  const event = { title: "Long run", starts_at: "2026-11-01T13:00:00.000Z", ends_at: null, timezone: "America/New_York", parent_event_id: "k1" };
  const calls = stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { tool, input } = JSON.parse(String(init.body));
      if (input.path === "/communities/run-club/") return ok({ entries: [] });
      if (tool === "polynet_read") return ok({ body: JSON.stringify(event, null, 2), ref: "event:k1:1793538000000" });
      return ok({ entries: [{ ...event, ref: "event:k1:1793538000000", path: "/communities/run-club/events/event:k1:1793538000000.md" }], next_cursor: input.cursor === "5" ? null : "1793538000001" });
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  const upcoming = await polynet.events();
  expect([upcoming.length, upcoming.cursor]).toEqual([1, "1793538000001"]);
  expect((await polynet.events({ cursor: "5", limit: 50 })).cursor).toBeNull();
  await polynet.events({ from: new Date(Date.UTC(2026, 7, 1)) });
  await polynet.events({ from: "2026-08-01T00:00:00Z", limit: 5 });
  const lists = calls.filter((call) => call.body?.tool === "polynet_list" && call.body.input.path.endsWith("/events/")).map((call) => call.body.input);
  expect(lists).toEqual([
    { path: "/communities/run-club/events/", limit: 20 },
    { path: "/communities/run-club/events/", limit: 50, cursor: "5" },
    { path: "/communities/run-club/events/", limit: 20, cursor: "1785542400000" },
    { path: "/communities/run-club/events/", limit: 5, cursor: "1785542400000" },
  ]);
  await expect(polynet.events({ from: "soon" })).rejects.toMatchObject({ code: "invalid_tool_args" });

  expect(await polynet.event("event:k1:1793538000000")).toMatchObject({ title: "Long run", ref: "event:k1:1793538000000", path: "/communities/run-club/events/event:k1:1793538000000.md" });
  expect(await polynet.event(upcoming[0])).toMatchObject({ title: "Long run" });
  const reads = calls.filter((call) => call.body?.tool === "polynet_read").map((call) => call.body.input.path);
  expect(reads).toEqual(["/communities/run-club/events/event:k1:1793538000000.md", "/communities/run-club/events/event:k1:1793538000000.md"]);
  // Only an event's own ref becomes a path: nothing else reaches the door.
  for (const bad of ["event:k1", "event:k1:12:3", "event:../members/x:1", "k1~1793538000000", "", null]) {
    await expect(polynet.event(bad), String(bad)).rejects.toMatchObject({ code: "invalid_tool_args" });
  }
  expect(calls.filter((call) => call.body?.tool === "polynet_read")).toHaveLength(2);
});

test("readText reads a long lesson a page at a time, forward only; a JSON document is read once", async () => {
  const lesson = "# Week one\n\n" + "Run easy. ".repeat(30);
  const calls = stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { input } = JSON.parse(String(init.body));
      if (input.path === "/communities/run-club/") return ok({ entries: [] });
      if (input.path.includes("/memory/")) return ok({ body: JSON.stringify({ title: "Pace", body_md: "Slow is smooth." }), next_offset: 40 });
      if (input.path.includes("stuck")) return ok({ body: "Same page.", next_offset: 10 });
      // The server's pages: 100 characters each.
      const offset = input.offset ?? 0;
      const body = lesson.slice(offset, offset + 100);
      return ok({ body, next_offset: offset + 100 < lesson.length ? offset + 100 : null });
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  const path = "/communities/run-club/resources/start-here~k1/week-one~k2.md";
  expect(await polynet.readText({ path })).toBe(lesson);
  expect(calls.filter((call) => call.body?.input?.path === path).map((call) => call.body.input.offset ?? 0)).toEqual([0, 100, 200, 300]);
  expect(await polynet.readText({ path: "/communities/run-club/memory/m1.md" })).toBe("Slow is smooth.");
  expect(calls.filter((call) => call.body?.input?.path?.includes("/memory/"))).toHaveLength(1);
  // A server that doesn't move on ends the read rather than looping.
  expect(await polynet.readText("/communities/run-club/resources/a~k1/stuck~k3.md")).toBe("Same page.Same page.");
});

test("a signed-out member gets sign_in_required", async () => {
  stubFetch({
    "/__polynet/auth/session": () => Response.json({ signed_in: false, community: "run-club", join_url: "x" }),
    "/__polynet/api": () => Response.json({ ok: false, code: "sign_in_required" }, { status: 401 }),
  });
  const polynet = await loadSdk();
  await polynet.session();
  await expect(polynet.channels()).rejects.toMatchObject({ code: "sign_in_required", status: 401 });
});

test("askAgent streams the reply", async () => {
  const sse = "event: start\ndata: {}\n\nevent: delta\ndata: {\"delta\":\"Hi \"}\n\nevent: delta\ndata: {\"delta\":\"there\"}\n\nevent: done\ndata: {\"full_content\":\"Hi there\"}\n\n";
  stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/agent": () => new Response(sse, { headers: { "content-type": "text/event-stream" } }),
  });
  const polynet = await loadSdk();
  const seen: string[] = [];
  expect(await polynet.askAgent("hello", { onDelta: (text: string) => seen.push(text) })).toBe("Hi there");
  expect(seen).toEqual(["Hi ", "Hi there", "Hi there"]);
});

test("watch subscribes to this channel's live signal with the watch token", async () => {
  stubFetch({ "/__polynet/auth/session": signedIn });
  const subscriptions: Array<{ name: string; args: any }> = [];
  vi.stubGlobal("convex", {
    ConvexClient: class {
      constructor(public url: string) {}
      onUpdate(name: string, args: any, callback: (result: any) => void) {
        subscriptions.push({ name, args });
        callback({ ok: true, version: 1 });
        return () => undefined;
      }
      close() {}
    },
  });
  const polynet = await loadSdk();
  let changes = 0;
  await polynet.watch("general", () => { changes += 1; });
  expect(subscriptions).toEqual([{ name: "communityLive:watch", args: { token: "pnw_x", path: "/communities/run-club/channels/general/" } }]);
  expect(changes).toBe(1);
});

test("signed out, the page still knows the community's public identity", async () => {
  const calls = stubFetch({
    "/__polynet/auth/session": () => Response.json({
      signed_in: false, community: "run-club", community_name: "Dawn Patrol", community_one_liner: "We run early.",
      community_about: null, member_count: 40, join_url: "j", studio_url: "j",
    }),
  });
  const polynet = await loadSdk();
  expect(await polynet.session()).toMatchObject({ signed_in: false, community_name: "Dawn Patrol", community_one_liner: "We run early.", member_count: 40, member: null });
  expect(await polynet.community()).toEqual({ name: "Dawn Patrol", slug: "run-club" });
  expect(calls.map((call) => call.url)).toEqual(["/__polynet/auth/session"]);
});

test("every post's actor has the same keys; the agent's are null", async () => {
  stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { input } = JSON.parse(String(init.body));
      if (input.path === "/communities/run-club/") return ok({ entries: [] });
      return ok({ entries: [{ type: "interaction", ref: "interaction:root:1", object_type: "root", snippet: "Hi", actor: { type: "community_agent", agent_key: "community_agent", user_id: null } }] });
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  expect((await polynet.feed("general"))[0].actor).toEqual({ type: "community_agent", agent_key: "community_agent", user_id: null, display_name: null, handle: null, avatar_url: null });
});

test("watch calls back when the session ends, so the re-read surfaces sign_in_required", async () => {
  stubFetch({ "/__polynet/auth/session": signedIn, "/__polynet/api": () => ok({ entries: [] }) });
  let push: (result: unknown) => void = () => undefined;
  vi.stubGlobal("convex", { ConvexClient: class {
    onUpdate(_name: string, _args: unknown, callback: (result: unknown) => void) { push = callback; return () => undefined; }
    close() {}
  } });
  const polynet = await loadSdk();
  let changes = 0;
  await polynet.watch("general", () => { changes += 1; });
  push({ ok: true, version: 1 });
  push({ ok: false, code: "session_invalid" });
  expect(changes).toBe(2);
  expect((await polynet.session()).signed_in).toBe(false);
});

test("account() reads the member's Polynet account; signed out it throws sign_in_required", async () => {
  stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": () => ok({ entries: [] }),
    "/__polynet/account": () => Response.json({ ok: true, account: { member: { name: "Sam" }, community: { slug: "run-club", role: "member" }, links: { communities: "c", discover: "d" } } }),
  });
  const polynet = await loadSdk();
  await polynet.session();
  expect(await polynet.account()).toMatchObject({ member: { name: "Sam" }, community: { role: "member" }, links: { communities: "c", discover: "d" } });
  stubFetch({ "/__polynet/account": () => Response.json({ ok: false, code: "sign_in_required" }, { status: 401 }) });
  await expect(polynet.account()).rejects.toMatchObject({ code: "sign_in_required" });
});

test("discover() lists published communities without a session; a failure is a PolynetError", async () => {
  const card = { slug: "trail-club", name: "Trail Club", one_liner: null, avatar_url: null, member_count: 4, url: "https://trail-club.polynet.page", has_site: true, here: false };
  const calls = stubFetch({ "/__polynet/discover": () => Response.json({ ok: true, communities: [card] }) });
  const polynet = await loadSdk();
  expect(await polynet.discover()).toEqual([card]);
  // Signed out works: it never asks for the session.
  expect(calls.map((call) => call.url)).toEqual(["/__polynet/discover"]);
  stubFetch({ "/__polynet/discover": () => Response.json({ ok: false, code: "discover_unavailable" }, { status: 502 }) });
  await expect(polynet.discover()).rejects.toMatchObject({ name: "PolynetError", code: "discover_unavailable", status: 502 });
});

test("members() lists the community's members, following pages", async () => {
  stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { input } = JSON.parse(String(init.body));
      if (input.path === "/communities/run-club/") return ok({ entries: [] });
      if (!input.cursor) return ok({ entries: [{ type: "member_self_context", path: "/communities/run-club/members/me/" },
        { type: "member", name: "Sam", role: "owner", ref: "user:1", path: "/communities/run-club/members/sam.md",
          handle: "sam", avatar_url: "https://x/sam.png", online: true }], truncated: true, next_cursor: "p2" });
      return ok({ entries: [{ type: "member", name: "Ava", ref: "user:2", path: "/communities/run-club/members/ava.md" }] });
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  expect(await polynet.members()).toEqual([
    { name: "Sam", role: "owner", ref: "user:1", path: "/communities/run-club/members/sam.md", handle: "sam", avatar_url: "https://x/sam.png", online: true },
    { name: "Ava", role: "member", ref: "user:2", path: "/communities/run-club/members/ava.md", handle: null, avatar_url: null, online: false },
  ]);
});

test("profile and online read the member's JSON documents; markRead and typing call their operations", async () => {
  const calls = stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { tool, input } = JSON.parse(String(init.body));
      if (tool === "polynet_read") return ok({ body: JSON.stringify({ read: input.path }) });
      if (tool === "polynet_list") return ok({ entries: [] });
      return ok({ ok: true });
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  expect(await polynet.profile("@sam")).toEqual({ read: "/communities/run-club/members/sam.json" });
  expect(await polynet.profile({ ref: "user:abc", handle: null })).toEqual({ read: "/communities/run-club/members/by-user/abc.json" });
  expect(await polynet.online()).toEqual({ read: "/communities/run-club/presence.json" });

  await polynet.markRead("general");
  await polynet.markRead("general", { created_at: "2026-10-28T10:00:00.000Z" });
  await expect(polynet.markRead("general", "not a time")).rejects.toMatchObject({ code: "invalid_tool_args" });
  await polynet.typing("general", true);
  await polynet.typing("general", true); // throttled
  await polynet.typing("general", false, { thread: "interaction:root:abc" }); // never started there: nothing to clear
  await polynet.typing("general", false);
  const ops = calls.filter((call) => call.body?.tool === "polynet_call").map((call) => [call.body.input.operation, call.body.input.input]);
  expect(ops).toEqual([
    ["community.channel.mark_read", { channel: "general" }],
    ["community.channel.mark_read", { channel: "general", through_at: Date.parse("2026-10-28T10:00:00.000Z") }],
    ["community.typing.set", { channel: "general", on: true }],
    ["community.typing.set", { channel: "general", on: false }],
  ]);
});

test("post mentions members by ref, alongside an agent mention", async () => {
  const calls = stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { tool, input } = JSON.parse(String(init.body));
      if (tool === "polynet_list" && input.path === "/communities/run-club/") return ok({ community: { slug: "run-club", name: "Run Club" } });
      return ok({});
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  await polynet.post("general", "@sam @ava see you at 6", { mentions: [{ ref: "user:sam1", handle: "sam" }, "user:ava2"], askAgent: true });
  const write = calls.find((call) => call.body?.tool === "polynet_write")!.body.input;
  expect(write.content.mentions).toEqual([{ userId: "sam1" }, { userId: "ava2" }, { agentKey: "community_agent" }]);
});

test("a post retried with its own key reuses the key and never uploads a file twice", async () => {
  let failWrites = 1;
  const calls = stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/upload": (_url, init) => {
      const name = decodeURIComponent((init.headers as Record<string, string>)["x-polynet-file-name"]);
      return Response.json({ ok: true, attachment: { attachmentId: "att-" + name } });
    },
    "/__polynet/api": (_url, init) => {
      const { tool } = JSON.parse(String(init.body));
      if (tool === "polynet_write" && failWrites-- > 0) return Response.json({ ok: false, code: "community_chat_write_failed" });
      return ok({ ref: "interaction:root:new" });
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  const photo = new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" });
  const options = { files: [photo], key: "retry-key-1" };
  await expect(polynet.post("general", "Look", options)).rejects.toMatchObject({ code: "community_chat_write_failed" });
  expect(await polynet.post("general", "Look", options)).toMatchObject({ ref: "interaction:root:new" });
  expect(calls.filter((call) => call.url === "/__polynet/upload")).toHaveLength(1);
  const writes = calls.filter((call) => call.body?.tool === "polynet_write").map((call) => call.body.input);
  expect(writes.map((input) => input.idempotency_key)).toEqual(["retry-key-1", "retry-key-1"]);
  expect(writes[1].content.attachments).toEqual([{ attachmentId: "att-photo.png" }]);
  // A different key uploads again; a malformed one is refused before anything is sent.
  await polynet.post("general", "Look", { files: [photo], key: "another-key" });
  expect(calls.filter((call) => call.url === "/__polynet/upload")).toHaveLength(2);
  await expect(polynet.post("general", "x", { key: "bad key!" })).rejects.toMatchObject({ code: "invalid_tool_args" });
});

test("one File in two posts keeps each post's upload, so retrying the first never re-uploads", async () => {
  let failFirst = 1;
  let n = 0;
  const calls = stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/upload": () => Response.json({ ok: true, attachment: { attachmentId: "att-" + ++n } }),
    "/__polynet/api": (_url, init) => {
      const { tool, input } = JSON.parse(String(init.body));
      if (tool === "polynet_write" && input.idempotency_key === "first-key-1" && failFirst-- > 0) return Response.json({ ok: false, code: "community_chat_write_failed" });
      return ok({ ref: "interaction:root:new" });
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  const photo = new File([new Uint8Array([1])], "photo.png", { type: "image/png" });
  await expect(polynet.post("general", "One", { files: [photo], key: "first-key-1" })).rejects.toMatchObject({ code: "community_chat_write_failed" });
  await polynet.post("general", "Two", { files: [photo], key: "second-key-1" });
  await polynet.post("general", "One", { files: [photo], key: "first-key-1" });
  const writes = calls.filter((call) => call.body?.tool === "polynet_write").map((call) => [call.body.input.idempotency_key, call.body.input.content.attachments]);
  expect(writes).toEqual([
    ["first-key-1", [{ attachmentId: "att-1" }]],
    ["second-key-1", [{ attachmentId: "att-2" }]],
    ["first-key-1", [{ attachmentId: "att-1" }]],
  ]);
});

test("a message over the server's 8,000-character limit is refused before anything is uploaded or sent", async () => {
  const calls = stubFetch({ "/__polynet/auth/session": signedIn, "/__polynet/api": () => ok({ ref: "interaction:root:new" }) });
  const polynet = await loadSdk();
  await polynet.session();
  const photo = new File([new Uint8Array([1])], "photo.png", { type: "image/png" });
  await expect(polynet.post("general", "x".repeat(8001), { files: [photo] })).rejects.toMatchObject({ code: "message_too_long" });
  expect(calls.filter((call) => call.url === "/__polynet/upload" || call.body?.tool === "polynet_write")).toHaveLength(0);
  await polynet.post("general", "x".repeat(8000));
  expect(calls.filter((call) => call.body?.tool === "polynet_write")).toHaveLength(1);
});

test("a retry uploads again a file whose upload the server has let lapse, if no write has claimed it", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    let uploads = 0;
    const calls = stubFetch({
      "/__polynet/auth/session": signedIn,
      "/__polynet/upload": (_url, init) => {
        const name = decodeURIComponent((init.headers as Record<string, string>)["x-polynet-file-name"]);
        // The second file fails the first time, so no write goes out.
        if (name === "notes.pdf" && uploads++ === 0) return Response.json({ ok: false, code: "upload_failed" }, { status: 500 });
        return Response.json({ ok: true, attachment: { attachmentId: "att-" + name + "-" + Date.now() } });
      },
      "/__polynet/api": () => ok({ ref: "interaction:root:new" }),
    });
    const polynet = await loadSdk();
    await polynet.session();
    const photo = new File([new Uint8Array([1])], "photo.png", { type: "image/png" });
    const notes = new File([new Uint8Array([2])], "notes.pdf", { type: "application/pdf" });
    const options = { files: [photo, notes], key: "lapsed-key-1" };
    await expect(polynet.post("general", "Look", options)).rejects.toMatchObject({ code: "upload_failed" });
    vi.setSystemTime(Date.now() + 26 * 60_000);
    await polynet.post("general", "Look", options);
    const uploaded = calls.filter((call) => call.url === "/__polynet/upload");
    expect(uploaded).toHaveLength(4);
    const [write] = calls.filter((call) => call.body?.tool === "polynet_write").map((call) => call.body.input);
    expect(write.idempotency_key).toBe("lapsed-key-1");
    expect(write.content.attachments.map((a: any) => a.attachmentId)).toEqual([`att-photo.png-${Date.now()}`, `att-notes.pdf-${Date.now()}`]);
  } finally {
    vi.useRealTimers();
  }
});

test("a post whose uploads lapsed before it claimed them uploads once more under a new key, which later retries keep", async () => {
  const writeResults = [
    Response.json({ ok: false, code: "community_chat_write_failed", message: "Server Error\nUncaught Error: community_attachment_claim_invalid" }),
    Response.json({ ok: false, code: "community_chat_write_failed", message: "Try again." }),
  ];
  let uploads = 0;
  const calls = stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/upload": () => Response.json({ ok: true, attachment: { attachmentId: "att-" + ++uploads } }),
    "/__polynet/api": (_url, init) => {
      const { tool } = JSON.parse(String(init.body));
      if (tool === "polynet_write") return writeResults.shift() ?? ok({ ref: "interaction:root:new" });
      return ok({});
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  const photo = new File([new Uint8Array([1])], "photo.png", { type: "image/png" });
  const options = { files: [photo], key: "claimed-key-1" };
  await expect(polynet.post("general", "Look", options)).rejects.toMatchObject({ code: "community_chat_write_failed", message: "Try again." });
  expect(await polynet.post("general", "Look", options)).toMatchObject({ ref: "interaction:root:new" });
  const writes = calls.filter((call) => call.body?.tool === "polynet_write").map((call) => call.body.input);
  const [first, second, third] = writes.map((input) => input.idempotency_key);
  expect(writes).toHaveLength(3);
  expect(first).toBe("claimed-key-1");
  expect(second).toMatch(/^[a-f0-9]{32}$/);
  expect(third).toBe(second);
  expect(writes.map((input) => input.content.attachments)).toEqual([[{ attachmentId: "att-1" }], [{ attachmentId: "att-2" }], [{ attachmentId: "att-2" }]]);
  expect(calls.filter((call) => call.url === "/__polynet/upload")).toHaveLength(2);
});

test("watch passes who's typing, says when posts changed, and drops a typist nobody renewed", async () => {
  vi.useFakeTimers();
  try {
    stubFetch({ "/__polynet/auth/session": signedIn, "/__polynet/api": () => ok({ entries: [] }) });
    let push: (result: unknown) => void = () => undefined;
    vi.stubGlobal("convex", { ConvexClient: class {
      onUpdate(_name: string, _args: unknown, callback: (result: unknown) => void) { push = callback; return () => undefined; }
      close() {}
    } });
    const polynet = await loadSdk();
    const updates: any[] = [];
    await polynet.watch("general", (update: unknown) => { updates.push(update); });
    const ava = { ref: "user:2", name: "Ava", avatar_url: null, thread_ref: null };
    push({ ok: true, version: 1, typing: [] });
    push({ ok: true, version: 1, typing: [{ ...ava, expires_in_ms: 5000 }] });
    push({ ok: true, version: 1, typing: [{ ...ava, expires_in_ms: 5000 }] }); // nothing new: no call
    push({ ok: true, version: 2, typing: [{ ...ava, expires_in_ms: 5000 }] });
    await vi.advanceTimersByTimeAsync(6000);
    expect(updates).toEqual([
      { changed: true, typing: [] },
      { changed: false, typing: [ava] },
      { changed: true, typing: [ava] },
      { changed: false, typing: [] },
    ]);
  } finally {
    vi.useRealTimers();
  }
});

test("watch keeps a typist whose lease keeps renewing", async () => {
  vi.useFakeTimers();
  try {
    stubFetch({ "/__polynet/auth/session": signedIn, "/__polynet/api": () => ok({ entries: [] }) });
    let push: (result: unknown) => void = () => undefined;
    vi.stubGlobal("convex", { ConvexClient: class {
      onUpdate(_name: string, _args: unknown, callback: (result: unknown) => void) { push = callback; return () => undefined; }
      close() {}
    } });
    const polynet = await loadSdk();
    const updates: any[] = [];
    await polynet.watch("general", (update: unknown) => { updates.push(update); });
    const ava = { ref: "user:2", name: "Ava", avatar_url: null, thread_ref: null };
    push({ ok: true, version: 1, typing: [{ ...ava, lease_until: 5000, expires_in_ms: 5000 }] });
    await vi.advanceTimersByTimeAsync(4000);
    push({ ok: true, version: 1, typing: [{ ...ava, lease_until: 9000, expires_in_ms: 5000 }] });
    await vi.advanceTimersByTimeAsync(4000);
    expect(updates).toEqual([{ changed: true, typing: [ava] }]);
  } finally {
    vi.useRealTimers();
  }
});

test("watchOnline watches presence.json and calls back only when who's online changes", async () => {
  stubFetch({ "/__polynet/auth/session": signedIn, "/__polynet/api": () => ok({ entries: [] }) });
  const paths: string[] = [];
  let push: (result: unknown) => void = () => undefined;
  vi.stubGlobal("convex", { ConvexClient: class {
    onUpdate(_name: string, args: any, callback: (result: unknown) => void) { paths.push(args.path); push = callback; return () => undefined; }
    close() {}
  } });
  const polynet = await loadSdk();
  await polynet.session();
  let changes = 0;
  await polynet.watchOnline(() => { changes += 1; });
  push({ ok: true, version: "a" });
  push({ ok: true, version: "a" });
  push({ ok: true, version: "a,b" });
  expect(paths).toEqual(["/communities/run-club/presence.json"]);
  expect(changes).toBe(2);
});

function fakeVisibleDocument() {
  const listeners: Array<() => void> = [];
  const doc = { visibilityState: "visible", addEventListener: (_type: string, listener: () => void) => { listeners.push(listener); } };
  return { doc, show: (state: string) => { doc.visibilityState = state; listeners.forEach((listener) => listener()); } };
}

test("a signed-in member's open page sends a presence heartbeat about once a minute, paused while hidden", async () => {
  vi.useFakeTimers();
  try {
    const page = fakeVisibleDocument();
    vi.stubGlobal("document", page.doc);
    const calls = stubFetch({ "/__polynet/auth/session": signedIn, "/__polynet/api": () => ok({ entries: [] }) });
    const polynet = await loadSdk();
    await polynet.session();
    const beats = () => calls.filter((call) => call.body?.input?.operation === "community.presence.heartbeat").length;
    await vi.advanceTimersByTimeAsync(0);
    expect(beats()).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(beats()).toBe(2);
    page.show("hidden");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(beats()).toBe(2);
    page.show("visible");
    expect(beats()).toBe(3);
    expect(calls.find((call) => call.body?.input?.operation === "community.presence.heartbeat")!.body.input).toMatchObject({
      target: "/communities/run-club/capabilities/community.presence.heartbeat.json", input: {},
    });
  } finally {
    vi.useRealTimers();
  }
});

test("signed out, no heartbeat is sent", async () => {
  vi.useFakeTimers();
  try {
    vi.stubGlobal("document", fakeVisibleDocument().doc);
    const calls = stubFetch({ "/__polynet/auth/session": () => Response.json({ signed_in: false, community: "run-club", join_url: "x" }) });
    const polynet = await loadSdk();
    await polynet.session();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls.map((call) => call.url)).toEqual(["/__polynet/auth/session"]);
  } finally {
    vi.useRealTimers();
  }
});

// Just enough DOM to see what markdown() builds: elements, attributes, text.
function fakeDocument() {
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const make = (tag: string | null): any => {
    const node: any = { tag, children: [] as any[], attrs: {} as Record<string, string>,
      append(...items: any[]) { for (const item of items) node.children.push(item); },
      set textContent(text: string) { node.children = [String(text)]; },
      set href(value: string) { node.attrs.href = value; }, set rel(value: string) { node.attrs.rel = value; },
      set target(value: string) { node.attrs.target = value; },
      toString(): string {
        const inner = node.children.map((child: any) => typeof child === "string" ? escape(child) : child.toString()).join("");
        if (!tag) return inner;
        const attrs = Object.entries(node.attrs).map(([key, value]) => ` ${key}="${value}"`).join("");
        return tag === "br" ? "<br>" : `<${tag}${attrs}>${inner}</${tag}>`;
      } };
    return node;
  };
  return { createElement: (tag: string) => make(tag), createDocumentFragment: () => make(null) };
}

test("markdown builds safe DOM: no markup from Polynet text gets through", async () => {
  vi.stubGlobal("document", fakeDocument());
  const polynet = await loadSdk();
  const html = (text: string) => String(polynet.markdown(text));
  expect(html("Hello **run club** and *you*\nsecond line")).toBe("<p>Hello <strong>run club</strong> and <em>you</em><br>second line</p>");
  expect(html("# Plan\n- one\n- two\n\n1. first\n> quoted")).toBe("<h3>Plan</h3><ul><li>one</li><li>two</li></ul><ol><li>first</li></ol><blockquote>quoted</blockquote>");
  expect(html("Use \x60npm run\x60:\n\x60\x60\x60\nconst a = 1;\n\x60\x60\x60")).toBe("<p>Use <code>npm run</code>:</p><pre><code>const a = 1;</code></pre>");
  expect(html("[route](https://maps.example/r) or https://club.example/join.")).toBe(
    '<p><a href="https://maps.example/r" rel="noopener noreferrer" target="_blank">route</a> or ' +
    '<a href="https://club.example/join" rel="noopener noreferrer" target="_blank">https://club.example/join</a>.</p>');
  // Markup and script links stay text.
  expect(html('<img src=x onerror="alert(1)"> [x](javascript:alert(1))')).toBe('<p>&lt;img src=x onerror="alert(1)"&gt; [x](javascript:alert(1))</p>');
  expect(html("")).toBe("");
  expect(html(null as any)).toBe("");
});

test("lessons, lesson, progress and setProgress read one set of resources for any view", async () => {
  const course = "/communities/run-club/resources/map~m1/";
  const page = `${course}set-up~r1.md`;
  const calls = stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { tool, input } = JSON.parse(String(init.body));
      if (tool === "polynet_list" && input.path === "/communities/run-club/") return ok({ community: { slug: "run-club", name: "Run Club" } });
      if (tool === "polynet_list" && input.path === "/communities/run-club/resources/") {
        return ok({ entries: [{ kind: "directory", name: "Map the business", path: course }] });
      }
      if (tool === "polynet_list" && input.path === course) {
        return ok({ entries: [
          { kind: "document", name: "Set up Draw.io", ref: "resource:r1", path: page, lesson: { stage: "Map the business", gate: true } },
          { kind: "document", name: "Notes", ref: "resource:r2", path: `${course}notes~r2.md` },
        ] });
      }
      if (tool === "polynet_read" && input.path === page) {
        return ok({ path: page, ref: "resource:r1", body: "Intro", lesson: { stage: "Map the business", variants: [{ key: "cowork", label: "Cowork", body_md: "x" }] } });
      }
      if (tool === "polynet_read" && input.path === "/communities/run-club/members/me/progress.json") {
        return ok({ body: JSON.stringify({ journey: null, stages: [{ name: "Map the business", locked: false }], lessons: [] }) });
      }
      if (tool === "polynet_list" && input.path === "/communities/run-club/members/me/forms/") {
        return ok({ entries: [{ kind: "document", form_key: "map-checkpoint", path: "/communities/run-club/members/me/forms/f1.json" }] });
      }
      if (tool === "polynet_read" && input.path === "/communities/run-club/members/me/forms/f1.json") {
        return ok({ body: JSON.stringify({ ref: "form-request:f1", form_version_ref: "form-version:v1", revision: 2, questions: [], answers: {} }) });
      }
      if (tool === "polynet_call") return ok({ ok: true, ref: input.input.ref, status: input.input.status });
      return Response.json({ ok: false, code: "unexpected" });
    },
  });
  const polynet = await loadSdk();
  await polynet.session();

  expect(await polynet.lessonForm({ type: "form", form_key: "other" })).toBeNull();
  const form = await polynet.lessonForm({ type: "form", form_key: "map-checkpoint" });
  expect(form).toMatchObject({ ref: "form-request:f1", revision: 2 });
  await polynet.submitLessonForm(form, { goal: "Ship it" });
  expect(calls.filter((call) => call.body?.tool === "polynet_call").at(-1)!.body.input).toMatchObject({
    operation: "community.form.submit",
    input: { form_request_ref: "form-request:f1", form_version_ref: "form-version:v1", expected_revision: 2, answers: { goal: "Ship it" } },
  });

  const all = await polynet.lessons();
  expect(all).toEqual([
    { title: "Set up Draw.io", ref: "resource:r1", path: page, course: "Map the business", course_path: course, lesson: { stage: "Map the business", gate: true } },
    { title: "Notes", ref: "resource:r2", path: `${course}notes~r2.md`, course: "Map the business", course_path: course, lesson: null },
  ]);
  expect(await polynet.lesson(all[0])).toMatchObject({ title: "Set up Draw.io", body: "Intro", lesson: { variants: [{ key: "cowork" }] } });
  expect(await polynet.progress()).toMatchObject({ journey: null, stages: [{ name: "Map the business" }] });
  await polynet.setProgress(all[0], "done");
  const progressCall = calls.filter((call) => call.body?.tool === "polynet_call").at(-1)!.body.input;
  expect(progressCall).toMatchObject({
    target: "/communities/run-club/capabilities/community.resource.progress.set.json",
    operation: "community.resource.progress.set", version: 1, input: { ref: "resource:r1", status: "done" },
  });
  await polynet.answer(all[0], "pick-tool", ["claude-code"]);
  const answerCall = calls.filter((call) => call.body?.tool === "polynet_call").at(-1)!.body.input;
  expect(answerCall).toMatchObject({
    target: "/communities/run-club/capabilities/community.resource.response.set.json",
    operation: "community.resource.response.set", input: { ref: "resource:r1", element: "pick-tool", value: ["claude-code"] },
  });
  await polynet.answer("resource:r1", "pick-tool");
  expect(calls.filter((call) => call.body?.tool === "polynet_call").at(-1)!.body.input.input.value).toBeNull();
});
