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

test("channels follows every page of the listing", async () => {
  const calls = stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { input } = JSON.parse(String(init.body));
      if (!input.cursor) return ok({ entries: [{ type: "channel", slug: "general", name: "General", is_general: true }], truncated: true, next_cursor: "page2" });
      return ok({ entries: [{ type: "channel", slug: "crew", name: "Crew", capabilities: { canPost: false } }], truncated: false });
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  expect(await polynet.channels()).toEqual([
    { slug: "general", name: "General", path: undefined, isGeneral: true, canPost: true },
    { slug: "crew", name: "Crew", path: undefined, isGeneral: false, canPost: false },
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

test("members() lists the community's members, following pages", async () => {
  stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { input } = JSON.parse(String(init.body));
      if (input.path === "/communities/run-club/") return ok({ entries: [] });
      if (!input.cursor) return ok({ entries: [{ type: "member_self_context", path: "/communities/run-club/members/me/" },
        { type: "member", name: "Sam", role: "owner", ref: "user:1", path: "/communities/run-club/members/sam.md" }], truncated: true, next_cursor: "p2" });
      return ok({ entries: [{ type: "member", name: "Ava", ref: "user:2", path: "/communities/run-club/members/ava.md" }] });
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  expect(await polynet.members()).toEqual([
    { name: "Sam", role: "owner", ref: "user:1", path: "/communities/run-club/members/sam.md" },
    { name: "Ava", role: "member", ref: "user:2", path: "/communities/run-club/members/ava.md" },
  ]);
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
