// @vitest-environment node
// The blocks in a real browser: the exact text the edge serves, on a page with
// a fake SDK the test drives (window.fake), so no Polynet backend is involved.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { KIT_SOURCE } from "./blocks/kit";
import { CHANNELS_SOURCE } from "./blocks/channels";
import { CHAT_SOURCE } from "./blocks/chat";
import { COMPOSER_SOURCE } from "./blocks/composer";
import { MEMBERS_SOURCE } from "./blocks/members";
import { PROFILE_SOURCE } from "./blocks/profile";
import { PAGE_SOURCE } from "./blocks/page";
import { EVENTS_SOURCE } from "./blocks/events";
import { LEARN_SOURCE } from "./blocks/learn";
import { KNOWLEDGE_SOURCE } from "./blocks/knowledge";
import { ASK_SOURCE } from "./blocks/ask";
import { DISCOVER_SOURCE } from "./blocks/discover";
import { UI_CSS, UI_SOURCE } from "./ui";

const SITE = "https://run-club.polynet.test";

// Stands in for /__polynet/sdk.js: answers from window.fake and records calls.
const FAKE_SDK = String.raw`
const fake = window.fake;
const record = (name, args) => { fake.calls.push([name, ...args]); };
const fail = () => { if (fake.signedOut) { const error = new Error("Sign in."); error.code = "sign_in_required"; throw error; } };
export default {
  session: async () => fake.session,
  signIn: (path) => record("signIn", [path]),
  channels: async () => { fail(); record("channels", []); return fake.channels.map((c) => Object.assign({}, c)); },
  feed: async (slug, options) => {
    fail();
    record("feed", [slug, options]);
    const all = (fake.feeds[slug] || []).map((p) => Object.assign({}, p));
    const limit = (options && options.limit) || 50;
    // Pages count back from the newest; the cursor is where the page before starts.
    const end = options && options.cursor ? Number(String(options.cursor).slice(6)) : all.length;
    const start = Math.max(0, end - limit);
    const posts = all.slice(start, end);
    posts.cursor = start > 0 ? "older:" + start : null;
    return posts;
  },
  // threadCap: a read that stops short of the whole thread, as the real SDK's does past its page cap.
  thread: async (slug, ref) => {
    fail();
    record("thread", [slug, ref]);
    const all = (fake.threads[ref] || []).map((p) => Object.assign({}, p));
    const entries = fake.threadCap ? all.slice(0, fake.threadCap) : all;
    entries.complete = entries.length === all.length;
    return entries;
  },
  react: async (ref, emoji, on) => { record("react", [ref, emoji, on]); return { reacted: on }; },
  // Writes land in window.fake, so the chat's next read shows them like the server would.
  post: async (slug, text, options) => {
    options = options || {};
    record("post", [slug, text, { replyTo: options.replyTo || null, mentions: options.mentions || [], askAgent: !!options.askAgent,
      key: options.key, files: (options.files || []).map((file) => file.name) }]);
    if (fake.hold) await new Promise((resolve) => { fake.release = resolve; });
    if (fake.failPosts > 0) { fake.failPosts -= 1; const error = new Error("Nope."); error.code = "community_chat_write_failed"; throw error; }
    fake.seq = (fake.seq || 0) + 1;
    const entry = { path: "/x/new" + fake.seq + ".md", type: "interaction", text, actor: fake.me, created_at: new Date().toISOString(),
      reactions: [], reacted_by_me: [], by_me: true, can_edit: true, reply_count: 0, edited_at: null,
      attachments: (options.files || []).map((file, i) => ({ ref: "attachment:" + fake.seq + i, name: file.name, kind: "file", size: file.size })) };
    if (options.replyTo) {
      entry.ref = "interaction:reply:new" + fake.seq;
      entry.object_type = "reply";
      const root = (fake.feeds[slug] || []).find((p) => p.ref === options.replyTo);
      if (root) root.reply_count += 1;
      fake.threads[options.replyTo] = fake.threads[options.replyTo] || [Object.assign({}, root)];
      fake.threads[options.replyTo].push(entry);
    } else {
      entry.ref = "interaction:root:new" + fake.seq;
      entry.object_type = "root";
      (fake.feeds[slug] = fake.feeds[slug] || []).push(entry);
    }
    return { ref: entry.ref, path: entry.path };
  },
  edit: async (entry, text) => {
    record("edit", [entry.ref, text]);
    if (fake.failEdit) { const error = new Error("Nope."); error.code = "community_chat_write_failed"; throw error; }
    for (const list of Object.values(fake.feeds)) for (const p of list) if (p.ref === entry.ref) { p.text = text; p.edited_at = new Date().toISOString(); }
    return { ok: true };
  },
  remove: async (entry) => {
    record("remove", [entry.ref]);
    for (const slug of Object.keys(fake.feeds)) fake.feeds[slug] = fake.feeds[slug].filter((p) => p.ref !== entry.ref);
    return { ok: true };
  },
  typing: async (slug, on, options) => { record("typing", [slug, on, (options && options.thread) || null]); },
  members: async () => { fail(); record("members", []); return fake.members.map((m) => Object.assign({}, m)); },
  profile: async (who) => {
    fail();
    record("profile", [who]);
    const key = typeof who === "string" ? who : who.handle || who.ref;
    const found = Object.values(fake.profiles).find((p) => p.handle === key || p.ref === key);
    if (!found) { const error = new Error("Not found."); error.code = "semantic_not_found"; throw error; }
    return JSON.parse(JSON.stringify(found));
  },
  watchOnline: async (onChange) => {
    record("watchOnline", []);
    fake.onlineWatchers.push(onChange);
    onChange();
    return () => { fake.onlineWatchers = fake.onlineWatchers.filter((f) => f !== onChange); };
  },
  markRead: async (slug) => { record("markRead", [slug]); return {}; },
  watch: async (slug, onChange) => {
    record("watch", [slug]);
    (fake.watchers[slug] = fake.watchers[slug] || []).push(onChange);
    onChange({ changed: true, typing: [] });
    return () => { fake.watchers[slug] = fake.watchers[slug].filter((f) => f !== onChange); };
  },
  fileUrl: (file) => "/__polynet/files/" + String(file.ref || file).replace("attachment:", ""),
  // Paragraph text, with inline code as code (like the real one), never markup.
  markdown: (text) => {
    const p = document.createElement("p");
    for (const piece of String(text).split(/(\x60[^\x60]+\x60)/)) {
      if (/^\x60.*\x60$/.test(piece)) { const code = document.createElement("code"); code.textContent = piece.slice(1, -1); p.append(code); }
      else if (piece) p.append(piece);
    }
    const f = document.createDocumentFragment(); f.append(p); return f;
  },
  // Events from now (or options.from, or a cursor), in start order, a page at a time.
  events: async (options) => {
    fail();
    options = options || {};
    record("events", [options.from !== undefined ? "from" : options.cursor ? "cursor" : "now", options.limit]);
    if (fake.failEvents) { const error = new Error("Nope."); error.code = "community_event_list_failed"; throw error; }
    const from = options.cursor ? Number(options.cursor) : options.from !== undefined ? new Date(options.from).getTime() : Date.now();
    const all = fake.events.filter((e) => Date.parse(e.starts_at) >= from).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    const limit = options.limit || 20;
    const page = all.slice(0, limit).map((e) => Object.assign({}, e));
    page.cursor = all.length > limit ? String(Date.parse(page[page.length - 1].starts_at) + 1) : null;
    return page;
  },
  event: async (ref) => {
    fail();
    record("event", [String(ref.ref || ref)]);
    const found = fake.events.find((e) => e.ref === String(ref.ref || ref));
    if (!found) { const error = new Error("Event not found."); error.code = "semantic_not_found"; throw error; }
    return Object.assign({}, found);
  },
  resources: async (path) => { fail(); record("resources", [path || null]); return (fake.resources[path || ""] || []).map((e) => Object.assign({}, e)); },
  readText: async (entry) => {
    fail();
    const path = entry.path || entry;
    record("readText", [path]);
    if (fake.failRead) { const error = new Error("Nope."); error.code = "semantic_not_found"; throw error; }
    return fake.texts[path] || "";
  },
  knowledge: async (query) => {
    fail();
    record("knowledge", [query || null]);
    const all = fake.memories.map((m) => Object.assign({}, m));
    return query ? all.filter((m) => m.title.toLowerCase().indexOf(query.toLowerCase()) !== -1) : all;
  },
  agentHistory: async () => { fail(); record("agentHistory", []); return fake.agent.history.map((m) => Object.assign({}, m)); },
  // Streams fake.agent.reply in two pieces; hold pauses after the first.
  askAgent: async (text, options) => {
    record("askAgent", [text, options.key || null]);
    if (fake.agent.fail > 0) { fake.agent.fail -= 1; const error = new Error("The agent is busy right now."); error.code = "agent_failed"; throw error; }
    const reply = fake.agent.reply;
    const half = reply.slice(0, Math.ceil(reply.length / 2));
    options.onDelta(half);
    if (fake.agent.hold) await new Promise((resolve) => { fake.agent.release = resolve; });
    options.onDelta(reply);
    return reply;
  },
  // Public: never asks whether anyone is signed in.
  discover: async () => {
    record("discover", []);
    if (fake.failDiscover > 0) { fake.failDiscover -= 1; const error = new Error("Nope."); error.code = "discover_unavailable"; throw error; }
    return fake.discover.map((c) => Object.assign({}, c));
  },
  account: async () => fake.account || ({ member: {}, community: {}, links: { messages: "https://polynet.test/?dm=inbox" } }),
  signOut: async () => {},
};
`;

const minutes = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const human = (name: string, id: string) => ({ type: "human", display_name: name, handle: id, avatar_url: null, user_id: id });
const ME = human("Me", "me");
const post = (ref: string, actor: object, created_at: string, text: string, extra: object = {}) => ({
  ref: `interaction:root:${ref}`, path: `/x/${ref}.md`, object_type: "root", type: "interaction", text, actor, created_at,
  reactions: [], reacted_by_me: [], by_me: false, can_edit: false, reply_count: 0, attachments: [], edited_at: null, ...extra,
});

function fixture() {
  const sam = human("Sam Rivera", "sam");
  const ana = human("Ana Ito", "ana");
  const yesterday = new Date(Date.now() - 86_400_000);
  yesterday.setHours(12, 0, 0, 0);
  return {
    session: { signed_in: true, community: "run-club", community_name: "Run Club", join_url: "https://polynet.test/c/run-club", member: { name: "Me", handle: "me", avatar_url: null } },
    me: ME,
    members: [
      { name: "Sam Rivera", handle: "sam", ref: "user:sam", avatar_url: null, online: false, role: "member" },
      { name: "Ana Ito", handle: "ana", ref: "user:ana", avatar_url: null, online: true, role: "member" },
      { name: "No Handle", handle: null, ref: "user:nh", avatar_url: null, online: true, role: "member" },
      { name: "Me", handle: "me", ref: "user:me", avatar_url: null, online: true, role: "member" },
    ],
    hold: false,
    failPosts: 0,
    threadCap: 0,
    failEdit: false,
    signedOut: false,
    channels: [
      { slug: "general", name: "General", isGeneral: true, canPost: true, canReply: true, unread: true, mentioned: false, seenThroughAt: Date.now() - 30 * 60_000 },
      { slug: "crew", name: "Crew", isGeneral: false, canPost: true, canReply: true, unread: true, mentioned: true, seenThroughAt: null },
      { slug: "routes", name: "Routes", isGeneral: false, canPost: true, canReply: true, unread: false, mentioned: false, seenThroughAt: null },
    ],
    feeds: {
      general: [
        post("1", sam, yesterday.toISOString(), "Yesterday's long run was great"),
        post("2", sam, minutes(60), "Morning all"),
        post("3", sam, minutes(59), "Coffee after?", { reactions: [{ emoji: "🔥", count: 2 }], reacted_by_me: ["🔥"] }),
        post("4", ana, minutes(10), "I'm in", { reply_count: 2 }),
        post("5", { type: "community_agent", display_name: null, handle: null, avatar_url: null }, minutes(9), "The route is 8 km."),
      ],
      crew: [post("c1", ana, minutes(5), "Crew only: Saturday plan")],
      routes: [],
    } as Record<string, object[]>,
    threads: {
      "interaction:root:4": [
        post("4", ana, minutes(10), "I'm in", { reply_count: 2 }),
        { ...post("r1", sam, minutes(8), "Great, see you there"), ref: "interaction:reply:r1", object_type: "reply" },
        { ...post("r2", ana, minutes(7), "Bring a headlamp"), ref: "interaction:reply:r2", object_type: "reply" },
      ],
    } as Record<string, object[]>,
    profiles: {
      sam: { ref: "user:sam", name: "Sam Rivera", handle: "sam", avatar_url: null, role: "admin", online: false,
        bio: "Trail runner.\n<b>not bold</b>", links: { youtube: "https://youtube.com/@samruns", x: "javascript:alert(1)", instagram: "data:text/html,hi" } },
      ana: { ref: "user:ana", name: "Ana Ito", handle: "ana", avatar_url: null, role: "member", online: true, bio: null, links: { youtube: null, x: "https://x.com/ana", instagram: null } },
      me: { ref: "user:me", name: "Me", handle: "me", avatar_url: null, role: "member", online: true, bio: "It's me.", links: {} },
    } as Record<string, object>,
    onlineWatchers: [] as unknown[],
    watchers: {},
    events: [] as Array<Record<string, unknown>>,
    failEvents: false,
    resources: {} as Record<string, object[]>,
    texts: {} as Record<string, string>,
    failRead: false,
    memories: [] as Array<{ title: string } & Record<string, unknown>>,
    agent: { history: [] as object[], reply: "", fail: 0, hold: false } as Record<string, unknown>,
    discover: [] as Array<Record<string, unknown>>,
    failDiscover: 0,
    calls: [] as unknown[],
  };
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Run Club</title>
<script type="module" src="/__polynet/ui.js"></script></head>
<body style="font-family: Georgia, serif; margin: 0">
<polynet-account></polynet-account>
<div style="display:flex; gap:24px; padding:16px"><polynet-channels style="width:200px"></polynet-channels><polynet-chat style="flex:1; height:600px"></polynet-chat></div>
</body></html>`;

let browser: Browser;
let siteDir: string;
beforeAll(async () => {
  browser = await chromium.launch();
  siteDir = mkdtempSync(join(tmpdir(), "polynet-blocks-"));
});
afterAll(async () => { await browser?.close(); });

async function open(setup: (fake: ReturnType<typeof fixture>) => void = () => {}, html = PAGE, path = "/", device: object = {}, headers: Record<string, string> = {}) {
  const fake = fixture();
  setup(fake);
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, ...device });
  const files: Record<string, string> = {
    "/__polynet/ui.js": UI_SOURCE, "/__polynet/sdk.js": FAKE_SDK, "/__polynet/blocks/kit.js": KIT_SOURCE,
    "/__polynet/blocks/channels.js": CHANNELS_SOURCE, "/__polynet/blocks/chat.js": CHAT_SOURCE, "/__polynet/blocks/composer.js": COMPOSER_SOURCE,
    "/__polynet/blocks/members.js": MEMBERS_SOURCE, "/__polynet/blocks/profile.js": PROFILE_SOURCE, "/__polynet/ui.css": UI_CSS,
    "/__polynet/blocks/page.js": PAGE_SOURCE, "/__polynet/blocks/events.js": EVENTS_SOURCE, "/__polynet/blocks/learn.js": LEARN_SOURCE,
    "/__polynet/blocks/knowledge.js": KNOWLEDGE_SOURCE, "/__polynet/blocks/ask.js": ASK_SOURCE, "/__polynet/blocks/discover.js": DISCOVER_SOURCE,
  };
  await page.route(`${SITE}/**`, async (route) => {
    const url = new URL(route.request().url());
    const body = files[url.pathname];
    if (body !== undefined) return route.fulfill({ body, contentType: url.pathname.endsWith(".css") ? "text/css" : "text/javascript" });
    return route.fulfill({ body: html, contentType: "text/html", headers });
  });
  await page.addInitScript((state) => {
    (window as any).fake = state;
    (window as any).channelEvents = [];
    document.addEventListener("polynet:channel", (event: any) => (window as any).channelEvents.push(event.detail.slug));
  }, fake);
  await page.goto(SITE + path);
  return page;
}

const calls = (page: Page, name: string) => page.evaluate((n) => (window as any).fake.calls.filter((c: unknown[]) => c[0] === n), name);
const emit = (page: Page, slug: string, update: object) => page.evaluate(([s, u]) => {
  for (const f of (window as any).fake.watchers[s as string] || []) f(u);
}, [slug, update] as const);

test("the kit helpers name authors, typists and group the feed", async () => {
  const file = join(siteDir, "kit.mjs");
  writeFileSync(file, KIT_SOURCE);
  const kit = await import(/* @vite-ignore */ pathToFileURL(file).href);
  expect(kit.typingText([])).toBe("");
  expect(kit.typingText([{ name: "Sam" }])).toBe("Sam is typing…");
  expect(kit.typingText([{ name: "Sam" }, { name: "Ana" }])).toBe("Sam and Ana are typing…");
  expect(kit.typingText([{ name: "A" }, { name: "B" }, { name: "C" }])).toBe("A, B and C are typing…");
  expect(kit.typingText([{}, {}, {}, {}])).toBe("Several people are typing…");
  expect(kit.authorName({ type: "community_agent" }, "Run Club")).toBe("Run Club agent");
  expect(kit.authorName({ type: "community_agent", display_name: "Sam" }, "Run Club")).toBe("Run Club agent · for Sam");
  expect(kit.authorName({ type: "human", handle: "sam" })).toBe("@sam");
  expect(kit.fileSize(2_500_000)).toBe("2.4 MB");

  const now = new Date(2026, 9, 28, 12, 0);
  const at = (h: number, m: number, day = 28) => new Date(2026, 9, day, h, m).toISOString();
  const sam = human("Sam", "sam");
  const items = kit.feedItems([
    post("a", sam, at(9, 0, 27), "old"),
    post("b", sam, at(9, 0), "one"),
    post("c", sam, at(9, 3), "two"),
    post("d", sam, at(9, 30), "three"),
    post("e", human("Ana", "ana"), at(9, 31), "four"),
    post("f", sam, at(9, 32), "mine", { by_me: true }),
  ], { seenThroughAt: Date.parse(at(9, 10)), now });
  expect(items.map((item: any) => item.type === "message" ? `${item.post.text}${item.grouped ? "+" : ""}` : `[${item.label}]`))
    .toEqual(["[Yesterday]", "old", "[Today]", "one", "two+", "[New]", "three", "four", "mine"]);
  // Only someone else's post is "new"; never read means no divider at all.
  expect(kit.feedItems([post("f", sam, at(9, 32), "mine", { by_me: true })], { seenThroughAt: 0, now }).map((i: any) => i.type)).toEqual(["day", "message"]);
  expect(kit.feedItems([post("b", sam, at(9, 0), "one")], { seenThroughAt: null, now }).map((i: any) => i.type)).toEqual(["day", "message"]);
});

test("channels show unread and mention marks; selecting one updates the URL, fires polynet:channel and moves the chat", async () => {
  const page = await open();
  const nav = page.locator("polynet-channels nav[aria-label=Channels]");
  await expect.poll(() => nav.locator("a").count()).toBe(3);
  const general = nav.locator("a[data-slug=general]");
  expect(await general.getAttribute("aria-current")).toBe("page");
  expect(await general.getAttribute("href")).toBe("?channel=general");
  expect(await general.locator("[part=unread-dot]").count()).toBe(1);
  const crew = nav.locator("a[data-slug=crew]");
  expect(await crew.locator("[part=mention-badge]").textContent()).toBe("@");
  expect(await crew.textContent()).toContain("mentions you, unread");
  expect(await nav.locator("a[data-slug=routes] [part=unread-dot]").count()).toBe(0);

  // Keyboard: the current channel is the one tab stop; arrows move.
  await general.focus();
  await page.keyboard.press("ArrowDown");
  expect(await page.evaluate(() => document.querySelector("polynet-channels")!.shadowRoot!.activeElement?.getAttribute("data-slug"))).toBe("crew");
  await page.keyboard.press("Enter");

  await expect.poll(() => page.evaluate(() => location.search)).toBe("?channel=crew");
  expect(await page.evaluate(() => (window as any).channelEvents)).toEqual(["crew"]);
  await expect.poll(() => crew.getAttribute("aria-current")).toBe("page");
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message-body]").allTextContents()).toEqual(["Crew only: Saturday plan"]);
  expect(await chat.locator("[part=title]").textContent()).toBe("#Crew");

  // Back returns both blocks to General.
  await page.goBack();
  await expect.poll(() => general.getAttribute("aria-current")).toBe("page");
  await expect.poll(() => chat.locator("[part~=message-body]").count()).toBe(5);
  await page.close();
});

test("a channel in the URL opens directly; an unknown one falls back to General", async () => {
  const page = await open(() => {}, PAGE, "/?channel=crew");
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message-body]").allTextContents()).toEqual(["Crew only: Saturday plan"]);
  await page.close();
  const other = await open(() => {}, PAGE, "/?channel=secret");
  await expect.poll(() => other.locator("polynet-chat [part~=message-body]").count()).toBe(5);
  await other.close();
});

test("the feed groups by author, divides days, marks what's new, and styles the agent", async () => {
  const page = await open();
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  const feed = chat.locator("[part=feed]");
  expect(await feed.getAttribute("role")).toBe("log");
  expect(await feed.getAttribute("aria-live")).toBe("polite");
  expect(await chat.locator("[part=day-divider]").allTextContents()).toEqual(["Yesterday", "Today"]);
  // "New" sits before the first post after the member's last read (30 minutes ago).
  const order = await chat.locator("[part=messages] > li").evaluateAll((nodes) => nodes.map((n) =>
    n.getAttribute("part")!.includes("new-divider") ? "NEW" : n.getAttribute("part")!.includes("day-divider") ? "DAY" : n.querySelector("[part~=message-body]")!.textContent));
  expect(order).toEqual(["DAY", "Yesterday's long run was great", "DAY", "Morning all", "Coffee after?", "NEW", "I'm in", "The route is 8 km."]);
  expect(await chat.locator("[part~=message-grouped]").count()).toBe(1);
  expect(await chat.locator("[part~=message-grouped] .sr").textContent()).toBe("Sam Rivera: ");
  const agent = chat.locator("[part~=message-agent]");
  expect(await agent.locator("[part=message-author]").textContent()).toBe("Run Club agent");
  expect(await agent.locator("[part~=avatar-agent]").count()).toBe(1);
  const time = chat.locator("[part~=message] time").first();
  expect(await time.getAttribute("datetime")).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  // Reactions are toggles: pressed shows, a click turns it off at once and tells Polynet.
  const fire = chat.locator("[part~=reaction]").first();
  expect(await fire.getAttribute("aria-pressed")).toBe("true");
  expect(await fire.getAttribute("aria-label")).toBe("🔥 2 reactions");
  await fire.click();
  await expect.poll(() => chat.locator("[part~=reaction]").first().getAttribute("aria-pressed")).toBe("false");
  expect(await chat.locator("[part~=reaction]").first().getAttribute("aria-label")).toBe("🔥 1 reaction");
  expect(await calls(page, "react")).toEqual([["react", "interaction:root:3", "🔥", false]]);
  await page.close();
});

test("signed out, both blocks show no content: the chat offers sign-in and join", async () => {
  const page = await open((fake) => { fake.session = { signed_in: false, community: "run-club", community_name: "Run Club", join_url: "https://polynet.test/c/run-club" } as any; });
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.getAttribute("state")).toBe("signed-out");
  expect(await chat.locator("[part=sign-in]").textContent()).toBe("Sign in");
  expect(await chat.locator("[part=join]").getAttribute("href")).toBe("https://polynet.test/c/run-club");
  expect(await page.locator("polynet-channels").getAttribute("state")).toBe("signed-out");
  const text = await page.evaluate(() => ["polynet-chat", "polynet-channels"].map((tag) => document.querySelector(tag)!.shadowRoot!.textContent).join(" "));
  for (const words of ["Morning all", "Crew", "General"]) expect(text).not.toContain(words);
  expect(await calls(page, "feed")).toEqual([]);
  expect(await calls(page, "channels")).toEqual([]);
  await chat.locator("[part=sign-in]").click();
  expect(await calls(page, "signIn")).toHaveLength(1);
  await page.close();
});

test("a session that ends turns the chat into the sign-in prompt and clears the feed", async () => {
  const page = await open();
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  await page.evaluate(() => { (window as any).fake.signedOut = true; });
  await emit(page, "general", { changed: true, typing: [] });
  await expect.poll(() => chat.getAttribute("state")).toBe("signed-out");
  expect(await chat.locator("[part~=message]").count()).toBe(0);
  await page.close();
});

test("the thread opens beside the feed, stays live, and closes with Esc back to its button", async () => {
  const page = await open();
  const chat = page.locator("polynet-chat");
  const replies = chat.locator("[part=replies]");
  await expect.poll(() => replies.textContent()).toBe("2 replies");
  await replies.click();
  const panel = chat.locator("[part=thread-panel]");
  await expect.poll(() => panel.locator("[part~=message-body]").allTextContents()).toEqual(["I'm in", "Great, see you there", "Bring a headlamp"]);
  expect(await panel.isVisible()).toBe(true);
  expect(await chat.locator("[part=replies]").getAttribute("aria-expanded")).toBe("true");
  expect(await panel.locator("[part=thread-divider]").textContent()).toBe("2 replies");

  await page.evaluate(() => {
    const fake = (window as any).fake;
    fake.threads["interaction:root:4"].push({ ...fake.threads["interaction:root:4"][1], ref: "interaction:reply:r3", text: "Me too" });
  });
  await emit(page, "general", { changed: true, typing: [{ ref: "user:sam", name: "Sam Rivera", thread_ref: "interaction:root:4" }] });
  await expect.poll(() => panel.locator("[part~=message-body]").count()).toBe(4);
  expect(await panel.locator("[part=thread-typing]").textContent()).toBe("Sam Rivera is typing…");

  await page.keyboard.press("Escape");
  await expect.poll(() => panel.isVisible()).toBe(false);
  expect(await page.evaluate(() => document.querySelector("polynet-chat")!.shadowRoot!.activeElement?.getAttribute("part"))).toBe("replies");

  // The close button works too.
  await chat.locator("[part=replies]").click();
  await expect.poll(() => panel.isVisible()).toBe(true);
  await chat.locator("[part=thread-close]").click();
  await expect.poll(() => panel.isVisible()).toBe(false);
  await page.close();
});

test("live: typing shows who, new posts append, and the channel is marked read at the bottom", async () => {
  const page = await open();
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  // General was unread: being at the bottom marks it read and tells the channels.
  await expect.poll(() => calls(page, "markRead")).toEqual([["markRead", "general"]]);
  await expect.poll(() => page.locator("polynet-channels a[data-slug=general] [part=unread-dot]").count()).toBe(0);

  await emit(page, "general", { changed: false, typing: [{ ref: "user:sam", name: "Sam Rivera", thread_ref: null }, { ref: "user:ana", name: "Ana Ito", thread_ref: null }] });
  await expect.poll(() => chat.locator("[part=typing]").textContent()).toBe("Sam Rivera and Ana Ito are typing…");

  await page.evaluate(() => {
    const fake = (window as any).fake;
    fake.feeds.general.push({ ...fake.feeds.general[1], ref: "interaction:root:6", text: "On my way", created_at: new Date().toISOString() });
  });
  await emit(page, "general", { changed: true, typing: [] });
  await expect.poll(() => chat.locator("[part~=message-body]").last().textContent()).toBe("On my way");
  expect(await chat.locator("[part=typing]").textContent()).toBe("");
  await expect.poll(() => calls(page, "markRead")).toHaveLength(2);
  await page.close();
});

test("when another member deletes the first post of a short channel, it goes on the next refresh", async () => {
  const page = await open();
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  await page.evaluate(() => { const fake = (window as any).fake; fake.feeds.general.shift(); });
  await emit(page, "general", { changed: true, typing: [] });
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(4);
  await page.close();
});

test("after more than a page arrives at once, the posts in between load when scrolling up", async () => {
  const page = await open();
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  await page.evaluate(() => {
    const fake = (window as any).fake;
    const base = fake.feeds.general[1];
    for (let i = 0; i < 60; i += 1) fake.feeds.general.push({ ...base, ref: "interaction:root:burst" + i, text: "Burst " + i, created_at: new Date(Date.now() + i).toISOString() });
  });
  await emit(page, "general", { changed: true, typing: [] });
  await expect.poll(() => chat.locator("[part~=message-body]").last().textContent()).toBe("Burst 59");
  for (let i = 0; i < 6; i += 1) {
    await chat.locator("[part=feed]").evaluate((feed) => { feed.scrollTop = 0; feed.dispatchEvent(new Event("scroll")); });
    await page.waitForTimeout(150);
  }
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(65);
  await page.close();
});

test("a channel isn't marked read if the member scrolls up during the short delay", async () => {
  const page = await open((fake) => { for (let i = 0; i < 30; i += 1) fake.feeds.general.push({ ...fake.feeds.general[1], ref: "interaction:root:x" + i, text: "Filler " + i }); });
  const chat = page.locator("polynet-chat");
  await expect.poll(() => calls(page, "markRead")).toHaveLength(1);
  await page.evaluate(() => {
    const fake = (window as any).fake;
    fake.feeds.general.push({ ...fake.feeds.general[1], ref: "interaction:root:late", text: "Late", created_at: new Date().toISOString() });
  });
  await emit(page, "general", { changed: true, typing: [] });
  await expect.poll(() => chat.locator("[part~=message-body]").last().textContent()).toBe("Late");
  // Scroll away before the read delay ends.
  await chat.locator("[part=feed]").evaluate((feed) => { feed.scrollTop = 0; feed.dispatchEvent(new Event("scroll")); });
  await page.waitForTimeout(900);
  expect(await calls(page, "markRead")).toHaveLength(1);
  await page.close();
});

test("ui.css keeps a block's slot content hidden until the block is defined", async () => {
  // The edge links ui.css first in <head>; ui.js is held back here so the blocks stay undefined.
  const page = await open(() => {}, `<!doctype html><html lang="en"><head><link rel="stylesheet" href="/__polynet/ui.css"><title>x</title></head>
    <body><polynet-chat><p slot="empty" id="quiet">Quiet in here.</p></polynet-chat><polynet-members><p slot="empty" id="nobody">Nobody yet.</p></polynet-members></body></html>`);
  const visibility = (id: string) => page.evaluate((i) => getComputedStyle(document.getElementById(i)!).visibility, id);
  expect(await visibility("quiet")).toBe("hidden");
  expect(await visibility("nobody")).toBe("hidden");
  await page.evaluate(() => customElements.define("polynet-chat", class extends HTMLElement {}));
  expect(await visibility("quiet")).toBe("visible");
  expect(await visibility("nobody")).toBe("hidden");
  await page.close();
});

test("ui.js loads a block only when its tag is on the page, including one added later", async () => {
  const page = await open(() => {}, `<!doctype html><html lang="en"><head><title>x</title><script type="module" src="/__polynet/ui.js"></script></head><body><p>Hi</p></body></html>`);
  await page.waitForTimeout(200);
  const loaded = () => page.evaluate(() => performance.getEntriesByType("resource").map((e) => new URL(e.name).pathname).filter((p) => p.startsWith("/__polynet/blocks/")));
  expect(await loaded()).toEqual([]);
  await page.evaluate(() => document.body.append(document.createElement("polynet-chat")));
  await expect.poll(() => page.evaluate(() => !!customElements.get("polynet-chat"))).toBe(true);
  expect((await loaded()).sort()).toEqual(["/__polynet/blocks/chat.js", "/__polynet/blocks/composer.js", "/__polynet/blocks/kit.js"]);
  expect(await page.evaluate(() => !!customElements.get("polynet-channels"))).toBe(false);
  await page.close();
});

test("a pinned channel ignores the page's selection; a narrow chat shows the thread over the feed", async () => {
  const html = `<!doctype html><html lang="en"><head><title>x</title><script type="module" src="/__polynet/ui.js"></script></head>
    <body><polynet-channels></polynet-channels><polynet-chat channel="general" style="width:320px;height:560px"></polynet-chat></body></html>`;
  const page = await open(() => {}, html);
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  await page.locator("polynet-channels a[data-slug=crew]").click();
  await expect.poll(() => page.evaluate(() => location.search)).toBe("?channel=crew");
  await page.waitForTimeout(100);
  expect(await chat.locator("[part~=message]").count()).toBe(5);

  await chat.locator("[part=replies]").click();
  const box = await chat.locator("[part=thread-panel]").boundingBox();
  const host = await chat.boundingBox();
  expect(box && host && Math.abs(box.width - host.width) < 2).toBe(true);
  await page.close();
});

const shadowActive = (page: Page) => page.evaluate(() => {
  const active = document.querySelector("polynet-chat")!.shadowRoot!.activeElement;
  return active ? active.getAttribute("part") : null;
});
const mine = (fake: ReturnType<typeof fixture>) => {
  fake.feeds.general.push(post("m1", ME, minutes(2), "My plan", { by_me: true, can_edit: true }));
};

test("the composer sends with Enter or the button, Shift+Enter is a new line, and a sent post is pending until the server shows it", async () => {
  const page = await open((fake) => { fake.hold = true; });
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  const input = chat.locator("[part=footer] [part=composer-input]");
  const send = chat.locator("[part=footer] [part~=composer-send]");
  expect(await input.getAttribute("placeholder")).toBe("Message #General");
  expect(await input.getAttribute("aria-label")).toBe("Message #General");
  expect(await send.textContent()).toBe("Send");
  expect(await send.isDisabled()).toBe(true);

  await input.focus();
  await page.keyboard.type("Line one");
  // Every keystroke says so (the real SDK throttles what it sends).
  expect([...new Set((await calls(page, "typing")).map((c: unknown) => JSON.stringify(c)))]).toEqual([JSON.stringify(["typing", "general", true, null])]);
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("line two");
  expect(await input.inputValue()).toBe("Line one\nline two");
  await page.keyboard.press("Enter");
  expect(await input.inputValue()).toBe("");
  const pending = chat.locator("[part~=message-pending]");
  await expect.poll(() => pending.locator("[part~=message-body]").textContent()).toBe("Line one\nline two");
  expect(await pending.locator("[part~=message-action]").count()).toBe(0);
  expect((await calls(page, "post")).map((c: any) => [c[1], c[2]])).toEqual([["general", "Line one\nline two"]]);
  expect((await calls(page, "typing")).at(-1)).toEqual(["typing", "general", false, null]);

  await page.evaluate(() => (window as any).fake.release());
  await expect.poll(() => pending.count()).toBe(0);
  await expect.poll(() => chat.locator("[part~=message-body]").last().textContent()).toBe("Line one\nline two");
  expect(await chat.locator("[part~=message-mine]").count()).toBe(1);

  await page.evaluate(() => { (window as any).fake.hold = false; });
  await input.fill("Via the button");
  await send.click();
  await expect.poll(() => chat.locator("[part~=message-body]").last().textContent()).toBe("Via the button");
  await page.close();
});

test("a failed send keeps the text in the box with Retry, and the retry reuses its key", async () => {
  const page = await open((fake) => { fake.failPosts = 1; });
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  const input = chat.locator("[part=footer] [part=composer-input]");
  await input.fill("Will this work?");
  await input.press("Enter");
  await expect.poll(() => chat.locator("[part~=message-failed]").count()).toBe(1);
  expect(await chat.locator("[part~=message-failed] [part=message-status]").textContent()).toContain("Not sent");
  expect(await input.inputValue()).toBe("Will this work?");
  expect(await chat.locator("[part=footer] [part=composer-error]").textContent()).toContain("wasn't sent");
  expect(await chat.locator("[part=footer] [part=composer-error]").getAttribute("role")).toBe("alert");

  await chat.locator("[part=footer] [part=composer-retry]").click();
  await expect.poll(() => chat.locator("[part~=message-body]").last().textContent()).toBe("Will this work?");
  expect(await chat.locator("[part~=message-failed]").count()).toBe(0);
  expect(await input.inputValue()).toBe("");
  expect(await chat.locator("[part=footer] [part=composer-error]").textContent()).toBe("");
  const posts = await calls(page, "post");
  expect(posts).toHaveLength(2);
  expect(posts[1][3].key).toBe(posts[0][3].key);
  expect(await chat.locator("[part~=message-mine]").count()).toBe(1);
  await page.close();
});

test("a failed send with files reuses its key only for the very same File objects, not a file picked again", async () => {
  const page = await open((fake) => { fake.failPosts = 2; });
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  const chips = chat.locator("[part=footer] [part=attachment-chip]");
  // The same name, type, size and date each time, as when the member picks the same file again.
  const drop = () => page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array([37, 80, 68, 70])], "plan.pdf", { type: "application/pdf", lastModified: 1_700_000_000_000 }));
    document.querySelector("polynet-chat")!.shadowRoot!.querySelector("[part=composer-box]")!
      .dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await drop();
  await expect.poll(() => chips.count()).toBe(1);
  await chat.locator("[part=footer] [part=composer-input]").fill("Route plan");
  await chat.locator("[part=footer] [part~=composer-send]").click();
  await expect.poll(() => chat.locator("[part=footer] [part=composer-retry]").count()).toBe(1);
  expect(await chips.count()).toBe(1);

  // Retry resends the same File objects: the same key.
  await chat.locator("[part=footer] [part=composer-retry]").click();
  await expect.poll(() => calls(page, "post")).toHaveLength(2);
  await expect.poll(() => chat.locator("[part=footer] [part=composer-retry]").count()).toBe(1);

  // Removed and picked again: a new File, so a new upload and a new key.
  await chat.locator("[part=footer] [aria-label='Remove plan.pdf']").click();
  await drop();
  await expect.poll(() => chips.count()).toBe(1);
  await chat.locator("[part=footer] [part~=composer-send]").click();
  await expect.poll(() => calls(page, "post")).toHaveLength(3);
  const keys = (await calls(page, "post")).map((c: any) => c[3].key);
  expect((await calls(page, "post")).map((c: any) => [c[2], c[3].files])).toEqual([
    ["Route plan", ["plan.pdf"]], ["Route plan", ["plan.pdf"]], ["Route plan", ["plan.pdf"]],
  ]);
  expect(keys[1]).toBe(keys[0]);
  expect(keys[2]).not.toBe(keys[0]);
  await expect.poll(() => chat.locator("[part~=message-body]").last().textContent()).toBe("Route plan");
  await page.close();
});

test("where the member can't post or reply, a quiet note replaces the box and Reply is not offered", async () => {
  const page = await open((fake) => { fake.channels[0].canPost = false; fake.channels[0].canReply = false; });
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  expect(await chat.locator("[part=footer] [part=composer-input]").isVisible()).toBe(false);
  expect(await chat.locator("[part=footer] [part=composer-note]").first().textContent()).toBe("You can read this channel, but not post in it.");
  expect(await chat.locator("[part~=message-action-reply]").count()).toBe(0);
  await chat.locator("[part=replies]").click();
  const panel = chat.locator("[part=thread-panel]");
  await expect.poll(() => panel.locator("[part=composer-note]").textContent()).toBe("Replies are off for you here.");
  expect(await panel.locator("[part=composer-input]").isVisible()).toBe(false);
  await page.close();
});

test("@ suggests members (online first) and the agent; arrows, Enter and Tab pick; only tags still in the text are sent", async () => {
  const page = await open();
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  const input = chat.locator("[part=footer] [part=composer-input]");
  const list = chat.locator("[part=footer] [part=mention-list]");
  const names = () => list.locator("[part~=mention-option] .who > span:first-child").allTextContents();
  await input.focus();
  await page.keyboard.type("Hey @a");
  // No handle, no tag; nobody tags themselves.
  await expect.poll(names).toEqual(["Run Club agent", "Ana Ito", "Sam Rivera"]);
  expect(await list.getAttribute("role")).toBe("listbox");
  expect(await input.getAttribute("aria-expanded")).toBe("true");
  const active = () => input.getAttribute("aria-activedescendant").then((id) => list.locator(`[id="${id}"] .who > span:first-child`).textContent());
  expect(await active()).toBe("Run Club agent");
  await page.keyboard.press("ArrowDown");
  expect(await active()).toBe("Ana Ito");
  await page.keyboard.press("Enter");
  expect(await input.inputValue()).toBe("Hey @ana ");
  expect(await list.isVisible()).toBe(false);
  expect(await calls(page, "members")).toHaveLength(1);

  await page.keyboard.type("and @sa");
  await expect.poll(names).toEqual(["Sam Rivera"]);
  await page.keyboard.press("Tab");
  expect(await input.inputValue()).toBe("Hey @ana and @sam ");
  await page.keyboard.type("@");
  await expect.poll(() => list.isVisible()).toBe(true);
  await page.keyboard.press("Escape");
  expect(await list.isVisible()).toBe(false);

  // Sam's tag is edited out before sending: only Ana is mentioned.
  await input.fill("Hey @ana and Sam");
  await input.press("Enter");
  await expect.poll(() => calls(page, "post")).toHaveLength(1);
  const [, , text, options] = (await calls(page, "post"))[0];
  expect(text).toBe("Hey @ana and Sam");
  expect(options.mentions).toEqual([{ ref: "user:ana", handle: "ana" }]);
  expect(options.askAgent).toBe(false);
  expect(await calls(page, "members")).toHaveLength(1);
  await page.close();
});

test("@ suggests and tags only where the server counts a tag: at the start or after a space", async () => {
  const page = await open();
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  const input = chat.locator("[part=footer] [part=composer-input]");
  const list = chat.locator("[part=footer] [part=mention-list]");
  await input.focus();
  // "(@sa" would never count as a tag on the server, so nothing is offered.
  await page.keyboard.type("(@sa");
  expect(await list.isVisible()).toBe(false);
  await page.keyboard.type(" @sa");
  await expect.poll(() => list.locator("[part~=mention-option]").count()).toBe(1);
  await page.keyboard.press("Tab");
  expect(await input.inputValue()).toBe("(@sa @sam ");
  // A tag later edited to sit behind punctuation is dropped, not sent to fail.
  await input.fill("(@sam see you");
  await input.press("Enter");
  await expect.poll(() => calls(page, "post")).toHaveLength(1);
  expect((await calls(page, "post"))[0][3].mentions).toEqual([]);
  // A string, so the import runs in the page and not through the test's bundler.
  const tokens = await page.evaluate(`import("/__polynet/blocks/composer.js").then(({ hasToken }) =>
    ["@sam hi", "hi\\n@sam", "hi @Sam.", "(@sam", "me@sam", "\\"@sam", "@samuel", "@sam-x"].map((text) => hasToken(text, "@sam")))`);
  expect(tokens).toEqual([true, true, true, false, false, false, false, false]);
  await page.close();
});

test("tagging the community agent inserts its mention token and asks it", async () => {
  const page = await open();
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  const input = chat.locator("[part=footer] [part=composer-input]");
  await input.focus();
  await page.keyboard.type("@ru");
  await expect.poll(() => chat.locator("[part=footer] [part~=mention-option]").count()).toBe(1);
  await chat.locator("[part=footer] [part~=mention-agent]").click();
  expect(await input.inputValue()).toBe("@Run Club ");
  await page.keyboard.type("what's the route?");
  await page.keyboard.press("Enter");
  await expect.poll(() => calls(page, "post")).toHaveLength(1);
  const [, , text, options] = (await calls(page, "post"))[0];
  expect(text).toBe("@Run Club what's the route?");
  expect(options.askAgent).toBe(true);
  expect(options.mentions).toEqual([]);
  await page.close();
});

test("attachments: pick, paste and drop add chips; too big is refused; remove works; files go to post", async () => {
  const page = await open();
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  expect(await chat.locator("[part=footer] [part=composer-attach]").getAttribute("aria-label")).toBe("Attach files");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  await chat.locator("[part=footer] input[type=file]").setInputFiles([
    { name: "photo.png", mimeType: "image/png", buffer: png },
    { name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 notes") },
    { name: "huge.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(6 * 1024 * 1024, 1) },
  ]);
  const chips = chat.locator("[part=footer] [part=attachment-chip]");
  await expect.poll(() => chips.count()).toBe(2);
  await expect.poll(() => chips.first().locator("img[part=attachment-thumb]").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  expect(await chips.nth(1).textContent()).toContain("notes.pdf");
  expect(await chat.locator("[part=footer] [part=composer-error]").textContent()).toBe("huge.pdf is too big (other files up to 5 MB).");
  expect(await chat.locator("[part=footer] [part~=composer-send]").isDisabled()).toBe(false);

  await chat.locator("[part=footer] [aria-label='Remove notes.pdf']").click();
  await expect.poll(() => chips.count()).toBe(1);
  await page.evaluate(() => {
    const root = document.querySelector("polynet-chat")!.shadowRoot!;
    const file = (name: string) => { const data = new DataTransfer(); data.items.add(new File([new Uint8Array([137, 80, 78, 71])], name, { type: "image/png" })); return data; };
    root.querySelector("[part=composer-input]")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: file("pasted.png"), bubbles: true, cancelable: true }));
    root.querySelector("[part=composer-box]")!.dispatchEvent(new DragEvent("drop", { dataTransfer: file("dropped.png"), bubbles: true, cancelable: true }));
  });
  await expect.poll(() => chips.count()).toBe(3);

  await chat.locator("[part=footer] [part=composer-input]").fill("Look");
  await chat.locator("[part=footer] [part~=composer-send]").click();
  await expect.poll(() => calls(page, "post")).toHaveLength(1);
  expect((await calls(page, "post"))[0][3].files).toEqual(["photo.png", "pasted.png", "dropped.png"]);
  await expect.poll(() => chips.count()).toBe(0);
  await page.close();
});

test("a message over 8,000 characters stays in the box with a note saying how much to trim", async () => {
  const page = await open();
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  const input = chat.locator("[part=footer] [part=composer-input]");
  await input.fill("x".repeat(8005));
  await chat.locator("[part=footer] [part~=composer-send]").click();
  await expect.poll(() => chat.locator("[part=footer] [part=composer-error]").textContent()).toContain("Trim 5 to send");
  expect(await calls(page, "post")).toHaveLength(0);
  expect((await input.inputValue()).length).toBe(8005);
  await input.fill("x".repeat(8000));
  await expect.poll(() => chat.locator("[part=footer] [part=composer-error]").textContent()).toBe("");
  await chat.locator("[part=footer] [part~=composer-send]").click();
  await expect.poll(() => calls(page, "post")).toHaveLength(1);
  await page.close();
});

test("an edit over 8,000 characters keeps the editor open and saves nothing", async () => {
  const page = await open(mine);
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(6);
  const own = chat.locator("[part~=message-mine]");
  await own.locator("[part~=message-action-edit]").click();
  const editor = chat.locator("[part=edit-input]");
  await editor.fill("y".repeat(8003));
  await editor.press("Enter");
  await expect.poll(() => chat.locator("[part=edit-error]").textContent()).toContain("Trim 3 to save");
  expect(await calls(page, "edit")).toHaveLength(0);
  expect((await editor.inputValue()).length).toBe(8003);
  // Cancel: the post is unchanged.
  await chat.locator("[part=edit-cancel]").click();
  await expect.poll(() => own.locator("[part~=message-body]").textContent()).toBe("My plan");
  await page.close();
});

test("a failed text-only send keeps its key across a reload, so resending can't post it twice", async () => {
  const page = await open((fake) => { fake.failPosts = 1; });
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  const input = chat.locator("[part=footer] [part=composer-input]");
  await input.fill("Lost in transit");
  await chat.locator("[part=footer] [part~=composer-send]").click();
  await expect.poll(() => input.inputValue()).toBe("Lost in transit");
  const firstKey = (await calls(page, "post"))[0][3].key;
  await page.reload();
  await expect.poll(() => input.inputValue()).toBe("Lost in transit");
  await chat.locator("[part=footer] [part~=composer-send]").click();
  await expect.poll(async () => (await calls(page, "post")).length).toBe(1);
  expect((await calls(page, "post"))[0][3].key).toBe(firstKey);
  await page.close();
});

test("drafts stay with their channel when the member switches away and back", async () => {
  const page = await open();
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  const input = chat.locator("[part=footer] [part=composer-input]");
  await input.fill("Half a thought");
  await page.locator("polynet-channels a[data-slug=crew]").click();
  await expect.poll(() => input.getAttribute("placeholder")).toBe("Message #Crew");
  expect(await input.inputValue()).toBe("");
  // Leaving the channel says the member stopped typing there.
  expect((await calls(page, "typing")).at(-1)).toEqual(["typing", "general", false, null]);
  await page.goBack();
  await expect.poll(() => input.getAttribute("placeholder")).toBe("Message #General");
  expect(await input.inputValue()).toBe("Half a thought");
  await page.close();
});

test("a draft belongs to the member who wrote it, not whoever signs in next on the tab", async () => {
  const page = await open();
  const chat = page.locator("polynet-chat");
  const input = chat.locator("[part=footer] [part=composer-input]");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  await input.fill("Half a thought");
  await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("polynet:draft:")))).toEqual(["polynet:draft:run-club:me:general:"]);
  // Someone else signs in on the same tab: no draft for them.
  await page.addInitScript(() => { (window as any).fake.session.member = { name: "Other", handle: "other", avatar_url: null }; });
  await page.reload();
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  expect(await input.inputValue()).toBe("");
  // The writer comes back: their draft is still there.
  await page.addInitScript(() => { (window as any).fake.session.member = { name: "Me", handle: "me", avatar_url: null }; });
  await page.reload();
  await expect.poll(() => input.inputValue()).toBe("Half a thought");
  await page.close();
});

test("a deleted post from older history stays gone after the refresh", async () => {
  const page = await open((fake) => {
    const older = Array.from({ length: 55 }, (_, i) => post("o" + i, human("Sam", "sam"), minutes(400 - i), "Older " + i));
    older[0] = post("old-mine", fake.me, minutes(400), "My old plan", { by_me: true, can_edit: true });
    fake.feeds.general = [...older, ...fake.feeds.general];
  });
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(50);
  await chat.locator("[part=feed]").evaluate((feed) => { feed.scrollTop = 0; feed.dispatchEvent(new Event("scroll")); });
  const own = chat.locator("[part~=message-mine]");
  await expect.poll(() => own.count()).toBe(1);
  await own.locator("[part~=message-action-delete]").click();
  await chat.locator("[part=delete-confirm-yes]").click();
  await expect.poll(() => calls(page, "remove")).toEqual([["remove", "interaction:root:old-mine"]]);
  await emit(page, "general", { changed: true, typing: [] });
  await page.waitForTimeout(300);
  expect(await own.count()).toBe(0);
  await page.close();
});

test("the member edits and deletes their own message, never someone else's", async () => {
  const page = await open(mine);
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(6);
  expect(await chat.locator("[part~=message-action-edit]").count()).toBe(1);
  expect(await chat.locator("[part~=message-action-delete]").count()).toBe(1);
  const own = chat.locator("[part~=message-mine]");
  expect(await own.locator("[part~=message-action-edit]").count()).toBe(1);

  await own.locator("[part~=message-action-edit]").click();
  const editor = chat.locator("[part=edit-input]");
  expect(await editor.inputValue()).toBe("My plan");
  expect(await shadowActive(page)).toBe("edit-input");
  await page.keyboard.press("Escape");
  await expect.poll(() => editor.count()).toBe(0);
  expect(await own.locator("[part~=message-body]").textContent()).toBe("My plan");

  await own.locator("[part~=message-action-edit]").click();
  await editor.fill("My better plan");
  await editor.press("Enter");
  await expect.poll(() => own.locator("[part~=message-body]").textContent()).toBe("My better plan (edited)");
  expect(await calls(page, "edit")).toEqual([["edit", "interaction:root:m1", "My better plan"]]);

  await own.locator("[part~=message-action-delete]").click();
  const confirm = chat.locator("[part=delete-confirm]");
  expect(await confirm.textContent()).toContain("Delete this message?");
  await confirm.locator("[part=delete-confirm-no]").click();
  await expect.poll(() => confirm.count()).toBe(0);
  await own.locator("[part~=message-action-delete]").click();
  await chat.locator("[part=delete-confirm-yes]").click();
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  expect(await calls(page, "remove")).toEqual([["remove", "interaction:root:m1"]]);
  await page.waitForTimeout(100);
  expect(await chat.locator("[part~=message-mine]").count()).toBe(0);
  await page.close();
});

test("Reply opens the thread in its reply box, which posts with replyTo and says where it's typing", async () => {
  const page = await open();
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  const target = chat.locator("[part~=message]").nth(3);
  expect(await target.locator("[part~=message-body]").textContent()).toBe("I'm in");
  await target.locator("[part~=message-action-reply]").click();
  const panel = chat.locator("[part=thread-panel]");
  await expect.poll(() => panel.locator("[part~=message-body]").count()).toBe(3);
  expect(await shadowActive(page)).toBe("composer-input");
  const reply = panel.locator("[part=composer-input]");
  expect(await reply.getAttribute("placeholder")).toBe("Reply…");
  await page.keyboard.type("Count me in");
  expect((await calls(page, "typing")).at(-1)).toEqual(["typing", "general", true, "interaction:root:4"]);
  await page.keyboard.press("Enter");
  await expect.poll(() => panel.locator("[part~=message-body]").last().textContent()).toBe("Count me in");
  const [, slug, text, options] = (await calls(page, "post"))[0];
  expect([slug, text, options.replyTo]).toEqual(["general", "Count me in", "interaction:root:4"]);
  await expect.poll(() => chat.locator("[part=replies]").textContent()).toBe("3 replies");
  // The channel's own box is untouched.
  expect(await chat.locator("[part=footer] [part=composer-input]").inputValue()).toBe("");
  await page.close();
});

test("a reply sent in a thread the read doesn't wholly cover stays on screen until a read holds it", async () => {
  const page = await open((fake) => {
    const root = fake.feeds.general[3] as { ref: string; reply_count: number };
    const replies = Array.from({ length: 6 }, (_, i) => ({
      ...post("t" + i, human("Sam", "sam"), minutes(8 - i / 10), "Reply " + i), ref: "interaction:reply:t" + i, object_type: "reply" }));
    root.reply_count = replies.length;
    fake.threads[root.ref] = [fake.threads[root.ref][0], ...replies];
    fake.threadCap = 5;
  });
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  await chat.locator("[part~=message]").nth(3).locator("[part~=message-action-reply]").click();
  const panel = chat.locator("[part=thread-panel]");
  await expect.poll(() => panel.locator("[part~=message-body]").count()).toBe(5);
  await page.keyboard.type("Late to this");
  await page.keyboard.press("Enter");
  await expect.poll(() => calls(page, "post")).toHaveLength(1);
  // The reads after the send stop short of it: the reply stays, never vanishes.
  await expect.poll(async () => (await calls(page, "thread")).length).toBeGreaterThan(1);
  await emit(page, "general", { changed: true, typing: [] });
  await page.waitForTimeout(300);
  expect(await panel.locator("[part~=message-body]").last().textContent()).toBe("Late to this");
  expect(await panel.locator("[part~=message-pending]").count()).toBe(1);
  // A read that holds it settles it: one copy, the server's.
  await page.evaluate(() => { (window as any).fake.threadCap = 0; });
  await emit(page, "general", { changed: true, typing: [] });
  await expect.poll(() => panel.locator("[part~=message-pending]").count()).toBe(0);
  expect(await panel.locator("[part~=message-body]").last().textContent()).toBe("Late to this");
  expect(await panel.locator("[part~=message-body]").evaluateAll((nodes) => nodes.filter((n) => n.textContent === "Late to this").length)).toBe(1);
  await page.close();
});

test("React offers common emoji; picking one adds the member's reaction", async () => {
  const page = await open();
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  const message = chat.locator("[part~=message]").nth(1);
  const add = message.locator("[part~=reaction-add]");
  await add.click();
  expect(await add.getAttribute("aria-expanded")).toBe("true");
  const picker = message.locator("[part=reaction-picker]");
  expect(await picker.locator("[part=reaction-option]").count()).toBe(8);
  await picker.locator("[aria-label='thumbs up']").click();
  await expect.poll(() => message.locator("[part~=reaction]").first().getAttribute("aria-label")).toBe("👍 1 reaction");
  expect(await calls(page, "react")).toEqual([["react", "interaction:root:2", "👍", true]]);
  expect(await picker.count()).toBe(0);
  await page.close();
});

test("on a touch screen Enter is a new line, the button sends, and message actions sit behind •••", async () => {
  const page = await open(mine, PAGE, "/", { hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(6);
  const input = chat.locator("[part=footer] [part=composer-input]");
  await input.focus();
  await page.keyboard.type("Two");
  await page.keyboard.press("Enter");
  await page.keyboard.type("lines");
  expect(await input.inputValue()).toBe("Two\nlines");
  expect(await calls(page, "post")).toEqual([]);
  await chat.locator("[part=footer] [part~=composer-send]").tap();
  await expect.poll(() => calls(page, "post")).toHaveLength(1);

  const own = chat.locator("[part~=message-mine]").first();
  expect(await own.locator("[part~=message-action-edit]").isVisible()).toBe(false);
  await own.locator("[part=message-more]").tap();
  await expect.poll(() => own.locator("[part~=message-action-edit]").isVisible()).toBe(true);
  await page.close();
});

// Members and profiles.
const MEMBERS_PAGE = `<!doctype html><html lang="en"><head><title>x</title><script type="module" src="/__polynet/ui.js"></script></head>
  <body style="font-family: Georgia, serif"><polynet-members style="width:320px"></polynet-members></body></html>`;
const crowd = (fake: ReturnType<typeof fixture>) => {
  fake.members = [
    { name: "Sam Rivera", handle: "sam", ref: "user:sam", avatar_url: null, online: false, role: "admin" },
    { name: "Ana Ito", handle: "ana", ref: "user:ana", avatar_url: null, online: true, role: "member" },
    { name: "Bea Chen", handle: "bea", ref: "user:bea", avatar_url: null, online: false, role: "member" },
    { name: "Olu Ade", handle: "olu", ref: "user:olu", avatar_url: null, online: true, role: "owner" },
    { name: "Max Moss", handle: "max", ref: "user:max", avatar_url: null, online: false, role: "moderator" },
    { name: "Me", handle: "me", ref: "user:me", avatar_url: null, online: true, role: "member" },
  ];
};
const panel = (page: Page) => page.locator("polynet-profile [part=panel]");
const deepActive = (page: Page) => page.evaluate(() => {
  let node: Element | null = document.activeElement;
  while (node && node.shadowRoot && node.shadowRoot.activeElement) node = node.shadowRoot.activeElement;
  return node ? (node.getAttribute("data-key") || node.getAttribute("part")) : null;
});

test("members: online first with a presence dot, role badges, and search by name or handle", async () => {
  const page = await open(crowd, MEMBERS_PAGE);
  const members = page.locator("polynet-members");
  await expect.poll(() => members.getAttribute("state")).toBe("ready");
  const names = (section: string) => members.locator(`[part~=section-${section}] [part=member-name]`).allTextContents();
  // Online first; within each, owners, admins and moderators lead, then by name.
  expect(await names("online")).toEqual(["Olu Ade", "Ana Ito", "Me"]);
  expect(await names("everyone")).toEqual(["Sam Rivera", "Max Moss", "Bea Chen"]);
  expect(await members.locator("[part~=section-online] [part=section-title]").textContent()).toBe("Online3");
  expect(await members.locator("[part~=section-everyone] [part=section-title]").textContent()).toBe("Everyone else3");
  expect(await members.locator("[part~=member-online]").count()).toBe(3);
  expect(await members.locator("[part~=section-online] [part=presence-dot]").count()).toBe(3);
  expect(await members.locator("[part~=section-everyone] [part=presence-dot]").count()).toBe(0);
  expect(await members.locator("[part~=role-badge]").allTextContents()).toEqual(["Owner", "Admin", "Moderator"]);
  expect(await members.locator("[part~=member]").first().textContent()).toContain(", online, Owner");
  expect(await members.locator("[part~=member-you] [part=member-name]").textContent()).toBe("Me");
  expect(await members.locator("[part~=member]").first().getAttribute("href")).toBe("?member=olu");

  const search = members.locator("[part=search]");
  await search.fill("sa");
  expect(await members.locator("[part=member-name]").allTextContents()).toEqual(["Sam Rivera"]);
  await search.fill("@an");
  expect(await members.locator("[part=member-name]").allTextContents()).toEqual(["Ana Ito"]);
  expect(await members.locator("[part~=section-everyone]").count()).toBe(0);
  await search.fill("zzz");
  expect(await members.locator("[part=no-results]").textContent()).toBe("No one matches “zzz”.");
  await search.fill("");
  // The keyboard: from the search box into the list, one tab stop, arrows move.
  await search.focus();
  await page.keyboard.press("ArrowDown");
  expect(await deepActive(page)).toBe("user:olu");
  await page.keyboard.press("ArrowDown");
  expect(await deepActive(page)).toBe("user:ana");
  expect(await members.locator("[part~=member][tabindex='0']").count()).toBe(1);
  expect(await calls(page, "members")).toHaveLength(1);
  await page.close();
});

test("members: live when who's online changes, and large communities render a page at a time", async () => {
  const page = await open(crowd, MEMBERS_PAGE);
  const members = page.locator("polynet-members");
  await expect.poll(() => members.locator("[part~=member-online]").count()).toBe(3);
  await page.evaluate(() => {
    const fake = (window as any).fake;
    fake.members.find((m: any) => m.handle === "sam").online = true;
    for (const f of fake.onlineWatchers) f();
  });
  await expect.poll(() => members.locator("[part~=section-online] [part=member-name]").allTextContents(), { timeout: 5000 })
    .toEqual(["Olu Ade", "Sam Rivera", "Ana Ito", "Me"]);
  await page.close();

  const big = await open((fake) => {
    fake.members = Array.from({ length: 450 }, (_, i) => ({ name: `Runner ${i}`, handle: `r${i}`, ref: `user:r${i}`, avatar_url: null, online: false, role: "member" }));
  }, MEMBERS_PAGE);
  const list = big.locator("polynet-members");
  await expect.poll(() => list.locator("[part~=member]").count()).toBe(200);
  expect(await list.locator("[part~=section-everyone] [part=section-title]").textContent()).toBe("Everyone450");
  expect(await list.locator("[part=more]").textContent()).toBe("Show 200 more");
  await list.locator("[part=more]").scrollIntoViewIfNeeded();
  await expect.poll(() => list.locator("[part~=member]").count()).toBeGreaterThanOrEqual(400);
  await big.close();
});

test("members placed after another block read the members show who's online now, not that older read", async () => {
  const page = await open(crowd);
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(5);
  // The composer reads the members for tagging; then Sam comes online.
  await chat.locator("[part=footer] [part=composer-input]").focus();
  await expect.poll(() => calls(page, "members")).toHaveLength(1);
  await page.evaluate(() => { (window as any).fake.members.find((m: any) => m.handle === "sam").online = true; });
  await page.waitForTimeout(1100);
  await page.evaluate(() => document.body.append(document.createElement("polynet-members")));
  const members = page.locator("polynet-members");
  await expect.poll(() => members.getAttribute("state")).toBe("ready");
  expect(await members.locator("[part~=section-online] [part=member-name]").allTextContents()).toEqual(["Olu Ade", "Sam Rivera", "Ana Ito", "Me"]);
  expect(await calls(page, "members")).toHaveLength(2);
  await page.close();
});

test("members mounted together share one read", async () => {
  const page = await open(crowd, MEMBERS_PAGE.replace("</body>", "<polynet-members></polynet-members></body>"));
  await expect.poll(() => page.locator("polynet-members[state=ready]").count()).toBe(2);
  expect(await calls(page, "members")).toHaveLength(1);
  await page.close();
});

test("members in a narrow column: names and handles truncate, the role badge stays inside its row", async () => {
  const page = await open((fake) => {
    crowd(fake);
    fake.members[3] = { ...fake.members[3], name: "Oluwaseun Adebayo-Fitzgerald", handle: "oluwaseun_adebayo_fitzgerald" };
    fake.members[4] = { ...fake.members[4], name: "Maximilian Moss-Worthington", handle: "maximilian_moss" };
  }, MEMBERS_PAGE.replace("width:320px", "width:180px"));
  const members = page.locator("polynet-members");
  await expect.poll(() => members.getAttribute("state")).toBe("ready");
  const rows = await members.evaluate((host) => {
    const right = (node: Element | null | undefined) => (node ? node.getBoundingClientRect().right : null);
    const edge = host.getBoundingClientRect().right;
    return Array.from(host.shadowRoot!.querySelectorAll(".member")).map((row) => ({
      edge, row: right(row), badge: right(row.querySelector(".badge")), badgeLeft: row.querySelector(".badge")?.getBoundingClientRect().left ?? null,
      name: right(row.querySelector(".name")), handle: right(row.querySelector(".handle")),
      clipped: (row.querySelector(".name") as HTMLElement).scrollWidth > (row.querySelector(".name") as HTMLElement).clientWidth,
    }));
  });
  expect(rows).toHaveLength(6);
  for (const row of rows) {
    expect(row.row!).toBeLessThanOrEqual(row.edge + 0.5);
    if (row.badge !== null) {
      expect(row.badge).toBeLessThanOrEqual(row.row! + 0.5);
      expect(row.name!).toBeLessThanOrEqual(row.badgeLeft! + 0.5);
      expect(row.handle!).toBeLessThanOrEqual(row.badgeLeft! + 0.5);
    } else {
      expect(row.name!).toBeLessThanOrEqual(row.row! + 0.5);
    }
  }
  // The long names are cut with an ellipsis rather than pushing the row wider.
  expect(rows.filter((row) => row.clipped).length).toBeGreaterThanOrEqual(2);
  expect(await members.locator("[part~=role-badge]").allTextContents()).toEqual(["Owner", "Admin", "Moderator"]);
  await page.close();
});

test("members signed out: no names, no members read, a way in", async () => {
  const page = await open((fake) => { crowd(fake); fake.session = { signed_in: false, community: "run-club", community_name: "Run Club", join_url: "https://polynet.test/c/run-club" } as any; }, MEMBERS_PAGE);
  const members = page.locator("polynet-members");
  await expect.poll(() => members.getAttribute("state")).toBe("signed-out");
  expect(await members.locator("[part=sign-in]").textContent()).toBe("Sign in");
  expect(await members.locator("[part=join]").getAttribute("href")).toBe("https://polynet.test/c/run-club");
  const text = await page.evaluate(() => document.querySelector("polynet-members")!.shadowRoot!.textContent);
  for (const name of ["Sam", "Ana", "Olu"]) expect(text).not.toContain(name);
  expect(await calls(page, "members")).toEqual([]);
  expect(await calls(page, "watchOnline")).toEqual([]);
  await page.close();
});

test("a member opens their profile: text-only bio, safe links, Message to Studio, ?member= in the URL; Esc closes and returns focus", async () => {
  const page = await open(crowd, MEMBERS_PAGE);
  const members = page.locator("polynet-members");
  const sam = members.locator("[part~=member][data-key='user:sam']");
  await sam.click();
  const sheet = panel(page);
  await expect.poll(() => page.locator("polynet-profile").getAttribute("state")).toBe("ready");
  expect(await sheet.isVisible()).toBe(true);
  expect(await page.evaluate(() => location.search)).toBe("?member=sam");
  expect(await sheet.getAttribute("aria-labelledby")).toBe(await sheet.locator("[part=name]").getAttribute("id"));
  expect(await sheet.locator("[part=name]").textContent()).toBe("Sam Rivera");
  expect(await sheet.locator("[part=handle]").textContent()).toBe("@sam");
  expect(await sheet.locator("[part~=role-badge]").textContent()).toBe("Admin");
  expect(await sheet.locator("[part=online]").count()).toBe(0);
  // The bio is text: markup in it shows as typed, never as elements.
  expect(await sheet.locator("[part=bio]").textContent()).toBe("Trail runner.\n<b>not bold</b>");
  expect(await sheet.locator("[part=bio] b").count()).toBe(0);
  // javascript: and data: links are dropped; web links open apart from the site.
  const links = sheet.locator("[part=link]");
  expect(await links.allTextContents()).toEqual(["YouTube"]);
  expect(await links.first().getAttribute("href")).toBe("https://youtube.com/@samruns");
  expect(await links.first().getAttribute("rel")).toBe("noopener noreferrer");
  expect(await links.first().getAttribute("target")).toBe("_blank");
  const message = sheet.locator("[part=message]");
  await expect.poll(() => message.count()).toBe(1);
  expect(await message.getAttribute("href")).toBe("https://polynet.test/?dm=inbox");
  expect(await message.getAttribute("target")).toBe(null);
  expect(await calls(page, "profile")).toEqual([["profile", "sam"]]);
  // Wide screens: a side sheet at the right edge, full height (once it has slid in).
  await expect.poll(async () => { const box = (await sheet.boundingBox())!; return [Math.round(box.x + box.width), Math.round(box.height)]; }).toEqual([1100, 760]);

  // Focus starts on Close and Tab stays in the panel.
  expect(await deepActive(page)).toBe("close");
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("POLYNET-PROFILE");
  }
  await page.keyboard.press("Escape");
  await expect.poll(() => sheet.isVisible()).toBe(false);
  await expect.poll(() => page.evaluate(() => location.search)).toBe("");
  expect(await deepActive(page)).toBe("user:sam");
  await page.close();
});

test("site code opens a profile with polynet:profile; Message is hidden on your own; Back closes; a phone gets a bottom sheet", async () => {
  const page = await open(crowd, MEMBERS_PAGE, "/", { viewport: { width: 390, height: 800 } });
  await expect.poll(() => page.locator("polynet-members").getAttribute("state")).toBe("ready");
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("polynet:profile", { detail: { handle: "me" } })));
  const sheet = panel(page);
  await expect.poll(() => page.locator("polynet-profile").getAttribute("state")).toBe("ready");
  expect(await sheet.locator("[part=name]").textContent()).toBe("Me");
  expect(await sheet.locator("[part=you]").textContent()).toBe("You");
  // A profile without links shows nothing for them (no stray text).
  expect(await sheet.textContent()).not.toContain("null");
  await page.waitForTimeout(100);
  expect(await sheet.locator("[part=message]").count()).toBe(0);
  await expect.poll(async () => { const box = (await sheet.boundingBox())!; return [Math.round(box.x), Math.round(box.width), Math.round(box.y + box.height)]; })
    .toEqual([0, 390, 800]);

  // Another member, then Back: the panel closes with the URL.
  await sheet.locator("[part=close]").click();
  await expect.poll(() => sheet.isVisible()).toBe(false);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("polynet:profile", { detail: { handle: "ana" } })));
  await expect.poll(() => sheet.locator("[part=name]").textContent()).toBe("Ana Ito");
  // The URL follows once the close's own Back has landed.
  await expect.poll(() => page.evaluate(() => location.search)).toBe("?member=ana");
  expect(await sheet.locator("[part=online]").textContent()).toBe("Online");
  await page.goBack();
  await expect.poll(() => sheet.isVisible()).toBe(false);
  expect(await page.evaluate(() => location.search)).toBe("");

  // Unknown members and anything that isn't a handle or ref.
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("polynet:profile", { detail: { handle: "../secret" } })));
  await page.waitForTimeout(100);
  expect(await sheet.isVisible()).toBe(false);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("polynet:profile", { detail: { handle: "ghost" } })));
  await expect.poll(() => page.locator("polynet-profile").getAttribute("state")).toBe("missing");
  expect(await sheet.locator("[part=state]").textContent()).toBe("This profile isn't available.");
  expect((await calls(page, "profile")).map((c: any) => c[1])).toEqual(["me", "ana", "ghost"]);
  await page.close();
});

test("?member= on arrival opens that profile; signed out it shows a way in and nothing about them", async () => {
  const page = await open(() => {}, PAGE, "/?channel=crew&member=sam");
  const sheet = panel(page);
  await expect.poll(() => page.locator("polynet-profile").getAttribute("state")).toBe("ready");
  expect(await sheet.locator("[part=name]").textContent()).toBe("Sam Rivera");
  await sheet.locator("[part=close]").click();
  await expect.poll(() => sheet.isVisible()).toBe(false);
  // Closing keeps the rest of the address.
  expect(await page.evaluate(() => location.search)).toBe("?channel=crew");
  await page.close();

  const out = await open((fake) => { fake.session = { signed_in: false, community: "run-club", community_name: "Run Club", join_url: "https://polynet.test/c/run-club" } as any; }, MEMBERS_PAGE, "/?member=sam");
  const gate = panel(out);
  await expect.poll(() => out.locator("polynet-profile").getAttribute("state")).toBe("signed-out");
  expect(await gate.textContent()).not.toContain("Sam");
  expect(await calls(out, "profile")).toEqual([]);
  await gate.locator("[part=sign-in]").click();
  expect(await calls(out, "signIn")).toEqual([["signIn", "/?member=sam"]]);
  await out.close();
});

test("chat authors and @-tagged members open their profile; focus comes back to the name", async () => {
  const page = await open((fake) => {
    fake.feeds.general.push(post("t1", ME, minutes(1), "Thanks @ana, see `@sam` and @nobody (mail a@b.com)", { by_me: true }));
  });
  const chat = page.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message]").count()).toBe(6);
  // The agent has no profile.
  expect(await chat.locator("[part~=message-agent] button[part=message-author]").count()).toBe(0);
  const ana = chat.locator("[part~=message]").nth(3);
  await ana.locator("[part=message-author]").click();
  const sheet = panel(page);
  await expect.poll(() => sheet.locator("[part=name]").textContent()).toBe("Ana Ito");
  await page.keyboard.press("Escape");
  await expect.poll(() => sheet.isVisible()).toBe(false);
  expect(await deepActive(page)).toBe("author");

  // Only known members' tags become links, and not inside code.
  const tagged = chat.locator("[part~=message]").last();
  await expect.poll(() => tagged.locator("[part=mention]").allTextContents()).toEqual(["@ana"]);
  expect(await tagged.locator("[part=message-body]").textContent()).toBe("Thanks @ana, see @sam and @nobody (mail a@b.com)");
  expect(await tagged.locator("[part=message-body] code").textContent()).toBe("@sam");
  expect(await tagged.locator("[part=mention]").getAttribute("href")).toBe("?member=ana");
  // Straight after a close (its Back still on the way), the new profile keeps the panel and the URL.
  await tagged.locator("[part=mention]").click();
  await expect.poll(() => sheet.isVisible()).toBe(true);
  await expect.poll(() => page.locator("polynet-profile").getAttribute("state")).toBe("ready");
  expect(await sheet.locator("[part=name]").textContent()).toBe("Ana Ito");
  await page.waitForTimeout(100);
  expect(await sheet.isVisible()).toBe(true);
  expect(await page.evaluate(() => location.search)).toBe("?member=ana");
  await page.close();
});

test("a thread's authors open profiles too", async () => {
  const page = await open();
  const chat = page.locator("polynet-chat");
  await chat.locator("[part=replies]").click();
  const thread = chat.locator("[part=thread-panel]");
  await expect.poll(() => thread.locator("[part~=message-body]").count()).toBe(3);
  await thread.locator("[part=message-author]").nth(1).click();
  await expect.poll(() => panel(page).locator("[part=name]").textContent()).toBe("Sam Rivera");
  await page.close();
});

// A site's frame: its own header, navigation and footer around one <polynet-page>.
const frame = (inside = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Run Club</title>
<link rel="stylesheet" href="/__polynet/ui.css"><script type="module" src="/__polynet/ui.js"></script></head>
<body style="font-family: Georgia, serif; margin: 0">
<header><nav aria-label="Run Club"><a href="/">Home</a> <a href="/chat">Talk</a> <a href="/people/">Crew</a></nav><polynet-account></polynet-account></header>
<main style="padding: 16px"><polynet-page>${inside}</polynet-page></main>
</body></html>`;
const box = async (locator: ReturnType<Page["locator"]>) => (await locator.boundingBox())!;

test("<polynet-page> at /chat: channels beside a chat with a height, in the page's own DOM; one column on a phone", async () => {
  const page = await open(() => {}, frame(), "/chat?channel=crew");
  const host = page.locator("polynet-page");
  await expect.poll(() => host.getAttribute("page")).toBe("chat");
  expect(await host.evaluate((el) => el.shadowRoot)).toBeNull();
  expect(await host.locator(".pn-page-header > h1.pn-page-heading").textContent()).toBe("Chat");
  const body = host.locator(".pn-page-body.pn-page-chat");
  expect(await body.evaluate((el) => Array.from(el.children).map((c) => c.tagName.toLowerCase()))).toEqual(["polynet-channels", "polynet-chat"]);
  const chat = body.locator("polynet-chat");
  await expect.poll(() => chat.locator("[part~=message-body]").count()).toBe(1);
  expect(await chat.locator("[part~=message-body]").textContent()).toBe("Crew only: Saturday plan");
  const [channels, feed] = [await box(body.locator("polynet-channels")), await box(chat)];
  expect(feed.x).toBeGreaterThan(channels.x + channels.width);
  expect(feed.height).toBeGreaterThanOrEqual(384);
  // The frame's own navigation marks this page.
  expect(await page.locator("header nav a[href='/chat']").getAttribute("aria-current")).toBe("page");
  expect(await page.locator("header nav a[href='/people/']").getAttribute("aria-current")).toBeNull();
  await page.close();

  const phone = await open(() => {}, frame(), "/chat/", { viewport: { width: 390, height: 800 } });
  const narrow = phone.locator("polynet-page .pn-page-chat");
  await expect.poll(() => narrow.locator("polynet-chat").getAttribute("state")).toBe("ready");
  const [top, below] = [await box(narrow.locator("polynet-channels")), await box(narrow.locator("polynet-chat"))];
  expect(below.y).toBeGreaterThanOrEqual(top.y + top.height);
  expect(Math.round(below.width)).toBe(Math.round(top.width));
  await phone.close();
});

test("<polynet-page> at /people: the members, the site's own heading and block slots; the site's CSS wins", async () => {
  const style = "<style>polynet-page[page=people] .pn-page-heading { color: rgb(200, 0, 0); } polynet-page .pn-page-people { max-width: 300px; }</style>";
  const page = await open(crowd, frame('<h2 slot="people-heading" class="crew">The crew</h2><p data-block="polynet-members" slot="empty">Nobody yet.</p>' +
    '<h2 slot="chat-heading">The wall</h2><p>Loading</p>').replace("</head>", style + "</head>"), "/people");
  const host = page.locator("polynet-page");
  await expect.poll(() => host.getAttribute("page")).toBe("people");
  // The site's heading replaces Polynet's; another page's heading and stray content go.
  expect(await host.locator(".pn-page-header").innerHTML()).toBe('<h2 class="crew">The crew</h2>');
  expect(await host.textContent()).not.toContain("The wall");
  expect(await host.textContent()).not.toContain("Loading");
  const members = host.locator(".pn-page-people > polynet-members");
  await expect.poll(() => members.getAttribute("state")).toBe("ready");
  expect(await members.locator("> p[slot=empty]").textContent()).toBe("Nobody yet.");
  expect(await members.locator("[part=member-name]").count()).toBe(6);
  expect(Math.round((await box(host.locator(".pn-page-people"))).width)).toBe(300);
  await page.close();

  const bare = await open(crowd, frame().replace("<polynet-page>", "<polynet-page no-heading>"), "/people");
  await expect.poll(() => bare.locator("polynet-page").getAttribute("page")).toBe("people");
  expect(await bare.locator("polynet-page .pn-page-header").count()).toBe(0);
  await bare.close();
});

test("<polynet-page> at /people/<handle> opens that profile over the list; Close and Back both land on /people", async () => {
  const page = await open(crowd, frame(), "/people/Sam");
  const sheet = panel(page);
  await expect.poll(() => page.locator("polynet-profile").getAttribute("state")).toBe("ready");
  expect(await sheet.locator("[part=name]").textContent()).toBe("Sam Rivera");
  expect(await page.evaluate(() => location.pathname + location.search)).toBe("/people?member=sam");
  await expect.poll(() => page.locator("polynet-page polynet-members").getAttribute("state")).toBe("ready");
  await sheet.locator("[part=close]").click();
  await expect.poll(() => sheet.isVisible()).toBe(false);
  await expect.poll(() => page.evaluate(() => location.pathname + location.search)).toBe("/people");
  await page.close();

  const back = await open(crowd, frame(), "/people/ana");
  await expect.poll(() => back.locator("polynet-profile").getAttribute("state")).toBe("ready");
  await back.goBack();
  await expect.poll(() => panel(back).isVisible()).toBe(false);
  expect(await back.evaluate(() => location.pathname + location.search)).toBe("/people");
  expect((await calls(back, "profile")).map((c: any) => c[1])).toEqual(["ana"]);
  await back.close();
});

test("<polynet-page> at an address with no page: a quiet not-found inside the frame, with the way to every page", async () => {
  const page = await open(() => {}, frame(), "/frame");
  const host = page.locator("polynet-page");
  await expect.poll(() => host.getAttribute("page")).toBe("not-found");
  expect(await host.locator("h1").textContent()).toBe("Page not found");
  const links = host.locator(".pn-page-missing nav[aria-label='Pages here'] a");
  expect(await links.evaluateAll((all) => all.map((a) => [a.textContent, a.getAttribute("href")]))).toEqual([["Home", "/"], ["Chat", "/chat"], ["People", "/people"],
    ["Events", "/events"], ["Learn", "/learn"], ["Knowledge", "/knowledge"], ["Ask", "/ask"], ["Discover", "/discover"]]);
  expect(await page.locator("polynet-chat, polynet-members").count()).toBe(0);
  await page.close();
});

test("the account menu: In this club links to the site's own pages, marking the current one; Manage goes to Studio's settings", async () => {
  const page = await open((fake) => {
    (fake as any).account = { member: { name: "Me" }, community: { role: "owner", studio_url: "https://polynet.test/c/run-club/settings/community" },
      links: { messages: "https://polynet.test/?dm=inbox", communities: "https://polynet.test/", discover: "https://polynet.test/discover", settings: "https://polynet.test/settings/profile" } };
  }, frame(), "/people/");
  const shell = page.locator("polynet-account");
  await shell.locator("[part=trigger]").click();
  const group = shell.locator("[part=group]");
  expect(await group.getAttribute("role")).toBe("group");
  expect(await group.locator(".group-title").textContent()).toBe("In this club");
  const here = group.locator("a[part=item]");
  expect(await here.evaluateAll((all) => all.map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("aria-current")])))
    .toEqual([["Chat", "/chat", null], ["People", "/people", "page"], ["Events", "/events", null], ["Learn", "/learn", null],
      ["Knowledge", "/knowledge", null], ["Ask", "/ask", null]]);
  const manage = shell.locator("[part=panel] a", { hasText: "Manage this community" });
  await expect.poll(() => manage.count()).toBe(1);
  expect(await manage.getAttribute("href")).toBe("https://polynet.test/c/run-club/settings/community");
  // Discover isn't this club's page, but it is on this site: /discover, never Polynet's.
  expect(await shell.locator("[part=panel] a", { hasText: "Discover communities" }).getAttribute("href")).toBe("/discover");
  // The keyboard reaches them: the first item is Chat.
  await page.keyboard.press("Escape");
  await shell.locator("[part=trigger]").press("ArrowDown");
  expect(await shell.evaluate((el) => el.shadowRoot!.activeElement!.textContent)).toBe("Chat");
  await page.close();

  const home = await open(() => {}, PAGE, "/");
  await home.locator("polynet-account [part=trigger]").click();
  expect(await home.locator("polynet-account [part=group] [aria-current]").count()).toBe(0);
  await home.close();
});

// The calendar, around now: one under way, two coming (one next month), one
// recent, one long past. Times are in New York; the member reads them in London.
const HOUR = 3_600_000;
const DAYS = 24 * HOUR;
function calendar(fake: ReturnType<typeof fixture>) {
  const at = (ms: number) => new Date(Math.round(ms / 60_000) * 60_000);
  const make = (id: string, title: string, start: Date, extra: object = {}) => ({
    ref: `event:${id}:${start.getTime()}`, path: `/communities/run-club/events/event:${id}:${start.getTime()}.md`, title,
    starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 90 * 60_000).toISOString(), timezone: "America/New_York",
    location_type: "physical", location_label: "Riverside steps", url: null, description_md: null, recurrence_frequency: "none", recurrence_interval: 1,
    ...extra,
  });
  const now = Date.now();
  fake.events = [
    make("k0", "Ancient relay", at(now - 200 * DAYS)),
    make("k1", "Hill repeats", at(now - 10 * DAYS)),
    make("k2", "Sunrise loop", at(now - 30 * 60_000)),
    make("k3", "Group run", at(now + 7 * DAYS), { location_type: "online", location_label: "Zoom", url: "https://zoom.example/j/1",
      description_md: "Bring water, a headlamp and `grit`.", recurrence_frequency: "weekly", recurrence_interval: 2 }),
    make("k4", "Trail day", at(now + 45 * DAYS), { ends_at: null }),
  ];
}
const LONDON = { timezoneId: "Europe/London" };
const eventsOf = (page: Page) => page.locator("polynet-events");
const titles = (locator: ReturnType<Page["locator"]>) => locator.evaluateAll((all) => all.map((node) => node.textContent));

test("events: under way and upcoming by month in the event's zone and the member's, past folded below; never the long past", async () => {
  const page = await open(calendar, frame(), "/events", LONDON);
  await expect.poll(() => page.locator("polynet-page").getAttribute("page")).toBe("events");
  expect(await page.locator("polynet-page .pn-page-header h1").textContent()).toBe("Events");
  const events = eventsOf(page);
  await expect.poll(() => events.getAttribute("state")).toBe("ready");
  const upcoming = events.locator("[part=events] > [part=month] [part~=event-title]");
  expect(await titles(upcoming)).toEqual(["NowSunrise loop", "Group run", "Trail day"]);
  expect(await events.locator("[part~=event-now] [part=now-badge]").textContent()).toBe("Now");
  expect(await events.locator("[part=events] > [part=month] [part=month-title]").count()).toBeGreaterThanOrEqual(2);
  // Each in New York's time, with London's beside it.
  const group = events.locator("[part~=event]", { hasText: "Group run" });
  expect(await group.locator("[part=event-time]").textContent()).toMatch(/E[SD]T$/);
  expect(await group.locator("[part=event-local-time]").textContent()).toMatch(/(GMT|BST)(\+1)? your time$/);
  expect(await group.locator("[part=event-place]").textContent()).toBe("Online · Zoom");
  const ref = (await page.evaluate(() => (window as any).fake.events[3].ref)) as string;
  expect(await group.getAttribute("href")).toBe("/events/" + ref.slice(6).replace(/:(\d+)$/, "~$1"));
  // Past: folded, newest first, the last 90 days only.
  const past = events.locator("[part=past]");
  expect(await past.getAttribute("open")).toBeNull();
  expect(await past.locator("[part=past-summary]").textContent()).toBe("Past events (1)");
  expect(await titles(past.locator("[part~=event-title]"))).toEqual(["Hill repeats"]);
  expect((await calls(page, "events")).map((c: any) => c[1]).sort()).toEqual(["from", "from", "now"]);
  await page.close();

  // In New York there's no second clock.
  const local = await open(calendar, frame(), "/events", { timezoneId: "America/New_York" });
  await expect.poll(() => eventsOf(local).getAttribute("state")).toBe("ready");
  expect(await eventsOf(local).locator("[part=event-local-time]").count()).toBe(0);
  await local.close();
});

test("an event opens at its own address: when, where, the description, an .ics file and its link; Back returns to the list", async () => {
  const page = await open(calendar, frame(), "/events", { ...LONDON, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  const events = eventsOf(page);
  await expect.poll(() => events.getAttribute("state")).toBe("ready");
  await events.locator("[part~=event]", { hasText: "Group run" }).click();
  const detail = events.locator("[part=detail]");
  await expect.poll(() => detail.locator("[part=detail-title]").textContent()).toBe("Group run");
  const address = await page.evaluate(() => location.pathname);
  expect(address).toMatch(/^\/events\/k3~\d+$/);
  // Focus follows the move.
  expect(await events.evaluate((el) => el.shadowRoot!.activeElement?.getAttribute("part"))).toBe("detail-title");
  expect(await detail.locator("[part=detail-when]").textContent()).toMatch(/E[SD]T.*your time.*Repeats every 2 weeks$/);
  expect(await detail.locator("[part=detail-where]").textContent()).toBe("Online · ZoomJoin online");
  const join = detail.locator("[part=detail-link]");
  expect([await join.getAttribute("href"), await join.getAttribute("target"), await join.getAttribute("rel")]).toEqual(["https://zoom.example/j/1", "_blank", "noopener noreferrer"]);
  expect(await detail.locator("[part=detail-description] code").textContent()).toBe("grit");

  const [download] = await Promise.all([page.waitForEvent("download"), detail.locator("[part=add-to-calendar]").click()]);
  expect(download.suggestedFilename()).toBe("group-run.ics");
  const ics = readFileSync((await download.path())!, "utf8");
  const start = await page.evaluate(() => (window as any).fake.events[3].starts_at);
  expect(ics).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n");
  expect(ics).toContain("DTSTART:" + start.replace(/[-:]/g, "").replace(/\.\d{3}/, "") + "\r\n");
  expect(ics).toContain("SUMMARY:Group run\r\n");
  expect(ics).toContain("LOCATION:Online · Zoom\r\n");
  expect(ics.replace(/\r\n /g, "")).toContain("DESCRIPTION:Bring water\\, a headlamp and `grit`.\\n\\n" + SITE + address);
  expect(ics.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  expect(ics.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n")).toBe(true);

  await detail.locator("[part=share]").click();
  await expect.poll(() => detail.locator("[part=share-status]").textContent()).toBe("Link copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(SITE + address);

  await page.goBack();
  await expect.poll(() => events.locator("[part=events] > [part=month]").count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => location.pathname)).toBe("/events");
  await page.close();

  // A shared link opens the event straight away; one that's gone says so, with the way back.
  const direct = await open(calendar, frame(), address, LONDON);
  await expect.poll(() => eventsOf(direct).locator("[part=detail-title]").textContent()).toBe("Group run");
  await direct.close();
  const gone = await open(calendar, frame(), "/events/k9~1700000000000", LONDON);
  await expect.poll(() => eventsOf(gone).getAttribute("state")).toBe("missing");
  expect(await eventsOf(gone).locator("[part=detail-title]").textContent()).toBe("This event isn't on the calendar");
  expect(await eventsOf(gone).locator("[part=back]").getAttribute("href")).toBe("/events");
  expect((await calls(gone, "event")).map((c: any) => c[1])).toEqual(["event:k9:1700000000000"]);
  await gone.close();
});

test("events: in a busy community the one under way and the recent past still show", async () => {
  const page = await open((fake) => {
    calendar(fake);
    const busy = Array.from({ length: 270 }, (_, i) => {
      const start = new Date(Date.now() - 89 * DAYS + i * 6 * HOUR);
      return { ...fake.events[1], ref: `event:b${i}:${start.getTime()}`, path: `/x/b${i}.md`, title: "Busy " + i, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + HOUR).toISOString() };
    });
    fake.events = fake.events.concat(busy);
  }, frame(), "/events");
  const events = eventsOf(page);
  await expect.poll(() => events.getAttribute("state")).toBe("ready");
  expect(await events.locator("[part~=event-now]").count()).toBe(1);
  expect(await events.locator("[part~=event-now]").textContent()).toContain("Sunrise loop");
  await page.close();
});

test("events: an event that began days ago and is still running shows as under way", async () => {
  const page = await open((fake) => {
    calendar(fake);
    const start = new Date(Date.now() - 4 * DAYS);
    fake.events.push({ ...fake.events[1], ref: `event:long:${start.getTime()}`, path: "/x/long.md", title: "Week-long trip", starts_at: start.toISOString(), ends_at: new Date(Date.now() + DAYS).toISOString() });
  }, frame(), "/events");
  const events = eventsOf(page);
  await expect.poll(() => events.getAttribute("state")).toBe("ready");
  expect((await titles(events.locator("[part~=event-now] [part=event-title]"))).some((t: string) => t.includes("Week-long trip"))).toBe(true);
  await page.close();
});

test("events: a saved link to a cancelled event says so, with nothing to join or add", async () => {
  const page = await open((fake) => {
    fake.events = [{ ref: "event:ev9:1893456000000", title: "Harbour swim", starts_at: new Date(1893456000000).toISOString(), timezone: "UTC", status: "cancelled", url: "https://example.com/join" }];
  }, frame(), "/events/ev9~1893456000000");
  const events = page.locator("polynet-events");
  await expect.poll(() => events.getAttribute("state")).toBe("cancelled");
  expect(await events.locator("[part=cancelled]").textContent()).toBe("This event was cancelled.");
  expect(await events.locator("[part=detail-title]").textContent()).toBe("Harbour swim");
  expect(await events.locator("a[href='https://example.com/join']").count()).toBe(0);
  expect(await events.getByText("Add to calendar").count()).toBe(0);
  await page.close();
});

test("events elsewhere: limit shows the next few and a link to /events; signed out shows no event; empty says so", async () => {
  const home = await open(calendar, `<!doctype html><html lang="en"><head><title>Run Club</title><script type="module" src="/__polynet/ui.js"></script></head>
<body><polynet-events limit="2"></polynet-events></body></html>`, "/", LONDON);
  const events = eventsOf(home);
  await expect.poll(() => events.getAttribute("state")).toBe("ready");
  expect(await titles(events.locator("[part~=event-title]"))).toEqual(["NowSunrise loop", "Group run"]);
  expect(await events.locator("[part=past], [part=more]").count()).toBe(0);
  expect(await events.locator("[part=all]").getAttribute("href")).toBe("/events");
  await home.close();

  const out = await open((fake) => { calendar(fake); fake.session = { signed_in: false, community: "run-club", join_url: "https://polynet.test/c/run-club" } as any; }, frame(), "/events");
  await expect.poll(() => eventsOf(out).getAttribute("state")).toBe("signed-out");
  expect(await eventsOf(out).locator("[part=gate-text]").textContent()).toBe("Sign in to see what's on.");
  expect(await eventsOf(out).locator("[part=join]").getAttribute("href")).toBe("https://polynet.test/c/run-club");
  expect(await calls(out, "events")).toEqual([]);
  expect(await calls(out, "event")).toEqual([]);
  await out.close();

  const empty = await open(() => {}, frame('<p data-block="polynet-events" slot="empty">No runs planned.</p>'), "/events");
  await expect.poll(() => eventsOf(empty).getAttribute("state")).toBe("ready");
  expect(await eventsOf(empty).locator("[part=empty] slot").evaluate((slot: HTMLSlotElement) => slot.assignedNodes().map((n) => n.textContent).join(""))).toBe("No runs planned.");
  await empty.close();

  const broken = await open((fake) => { fake.failEvents = true; }, frame(), "/events");
  await expect.poll(() => eventsOf(broken).getAttribute("state")).toBe("error");
  await broken.evaluate(() => { (window as any).fake.failEvents = false; });
  await eventsOf(broken).locator("[part=retry]").click();
  await expect.poll(() => eventsOf(broken).getAttribute("state")).toBe("ready");
  await broken.close();
});

const COURSES = "/communities/run-club/resources/";
function courses(fake: ReturnType<typeof fixture>) {
  const start = COURSES + "start-here~m1/";
  fake.resources = {
    "": [
      { path: start, kind: "directory", name: "Start here", ref: "resources://community/c/modules/m1" },
      { path: COURSES + "pace-work~m2/", kind: "directory", name: "Pace work", ref: "resources://community/c/modules/m2" },
      { path: COURSES + "Not.A.Course/", kind: "directory", name: "Odd" },
    ],
    [start]: [
      { path: start + "first-steps~r1.md", kind: "document", name: "First steps" },
      { path: start + "shoes~r2.md", kind: "document", name: "Shoes" },
      { path: start + "your-first-5k~r3.md", kind: "document", name: "Your first 5k" },
    ],
    [COURSES + "pace-work~m2/"]: [],
  };
  fake.texts = { [start + "first-steps~r1.md"]: "Welcome to the club.", [start + "shoes~r2.md"]: "Pick shoes that `fit`.", [start + "your-first-5k~r3.md"]: "Go easy." };
}
const learnOf = (page: Page) => page.locator("polynet-learn");

test("learn: the catalogue with lesson counts, a course's lessons in order, and the reader with previous and next; Back walks back", async () => {
  const page = await open(courses, frame(), "/learn");
  await expect.poll(() => page.locator("polynet-page").getAttribute("page")).toBe("learn");
  const learn = learnOf(page);
  await expect.poll(() => learn.getAttribute("state")).toBe("ready");
  const cards = learn.locator("[part=course]");
  expect(await titles(cards.locator("[part=course-title]"))).toEqual(["Start here", "Pace work"]);
  await expect.poll(() => titles(cards.locator("[part=course-count]"))).toEqual(["3 lessons", "0 lessons"]);
  expect(await cards.first().getAttribute("href")).toBe("/learn/start-here~m1");

  await cards.first().click();
  await expect.poll(() => learn.locator("[part=course-heading]").textContent()).toBe("Start here");
  expect(await page.evaluate(() => location.pathname)).toBe("/learn/start-here~m1");
  expect(await titles(learn.locator("[part=lesson]"))).toEqual(["1First steps", "2Shoes", "3Your first 5k"]);
  expect(await learn.evaluate((el) => el.shadowRoot!.activeElement?.getAttribute("part"))).toBe("course-heading");

  await learn.locator("[part=lesson]", { hasText: "Shoes" }).click();
  await expect.poll(() => learn.locator("[part=lesson-heading]").textContent()).toBe("Shoes");
  expect(await page.evaluate(() => location.pathname)).toBe("/learn/start-here~m1/shoes~r2");
  expect(await learn.locator("[part=lesson-position]").textContent()).toBe("Lesson 2 of 3");
  expect(await learn.locator("[part=lesson-body] code").textContent()).toBe("fit");
  expect(await learn.locator("[part=back]").textContent()).toBe("Start here");
  expect(await learn.locator("[part=previous]").textContent()).toBe("PreviousFirst steps");
  expect(await learn.locator("[part=next]").textContent()).toBe("NextYour first 5k");

  await learn.locator("[part=next]").click();
  await expect.poll(() => learn.locator("[part=lesson-heading]").textContent()).toBe("Your first 5k");
  expect(await learn.locator("[part=next]").count()).toBe(0);
  await page.goBack();
  await expect.poll(() => learn.locator("[part=lesson-heading]").textContent()).toBe("Shoes");
  await page.goBack();
  await expect.poll(() => learn.locator("[part=course-heading]").textContent()).toBe("Start here");
  // Folders are read once a visit; each lesson once it opens.
  expect((await calls(page, "resources")).map((c: any) => c[1])).toEqual([null, COURSES + "start-here~m1/", COURSES + "pace-work~m2/"]);
  expect((await calls(page, "readText")).map((c: any) => c[1].split("/").pop())).toEqual(["shoes~r2.md", "your-first-5k~r3.md", "shoes~r2.md"]);
  await page.close();
});

test("learn: a renamed course keeps its links; a missing course or lesson says so; signed out shows nothing; no courses says so", async () => {
  const renamed = await open(courses, frame(), "/learn/old-name~m1/old-shoes~r2");
  await expect.poll(() => learnOf(renamed).locator("[part=lesson-heading]").textContent()).toBe("Shoes");
  expect(await renamed.evaluate(() => location.pathname)).toBe("/learn/start-here~m1/shoes~r2");
  await renamed.close();

  const lost = await open(courses, frame(), "/learn/start-here~m1/gone~r9");
  await expect.poll(() => learnOf(lost).getAttribute("state")).toBe("missing");
  expect(await learnOf(lost).locator("[part=heading]").textContent()).toBe("This lesson isn't here");
  expect(await learnOf(lost).locator("[part=back]").getAttribute("href")).toBe("/learn/start-here~m1");
  expect(await calls(lost, "readText")).toEqual([]);
  await lost.close();

  const noCourse = await open(courses, frame(), "/learn/nowhere~m9");
  await expect.poll(() => learnOf(noCourse).getAttribute("state")).toBe("missing");
  expect(await learnOf(noCourse).locator("[part=heading]").textContent()).toBe("This course isn't here");
  await noCourse.close();

  const out = await open((fake) => { courses(fake); fake.signedOut = true; }, frame(), "/learn/start-here~m1/shoes~r2");
  await expect.poll(() => learnOf(out).getAttribute("state")).toBe("signed-out");
  expect(await learnOf(out).locator("[part=gate-text]").textContent()).toBe("Sign in to see the courses.");
  expect(await learnOf(out).evaluate((el) => el.shadowRoot!.textContent)).not.toContain("Shoes");
  await out.close();

  const none = await open(() => {}, frame(), "/learn");
  await expect.poll(() => learnOf(none).getAttribute("state")).toBe("ready");
  expect(await learnOf(none).locator("[part=empty]").textContent()).toBe("No courses yet.");
  await none.close();
});

function memory(fake: ReturnType<typeof fixture>) {
  fake.memories = [
    { title: "Easy pace is conversational", type: "insight", applies_when: "Base weeks", path: "/communities/run-club/memory/n1.md", updated_at: "2026-10-03T12:00:00.000Z" },
    { title: "Start the long run slow", type: "playbook", applies_when: null, path: "/communities/run-club/memory/n2.md", updated_at: null },
  ];
  fake.texts = { "/communities/run-club/memory/n1.md": "If you can't talk, **slow** down." };
}
const knowledgeOf = (page: Page) => page.locator("polynet-knowledge");

test("knowledge: the community's memory, each readable in place, and a search", async () => {
  const page = await open(memory, frame(), "/knowledge");
  await expect.poll(() => page.locator("polynet-page").getAttribute("page")).toBe("knowledge");
  const knowledge = knowledgeOf(page);
  await expect.poll(() => knowledge.getAttribute("state")).toBe("ready");
  expect(await knowledge.locator("[part=knowledge]").getAttribute("aria-label")).toBe("Community memory");
  expect(await knowledge.locator("[part=intro]").textContent()).toContain("The community's memory");
  expect(await titles(knowledge.locator("[part=memory-title]"))).toEqual(["Easy pace is conversational", "Start the long run slow"]);
  expect(await titles(knowledge.locator("[part=memory-type]"))).toEqual(["Insight", "Playbook"]);
  expect(await knowledge.locator("[part=memory-applies]").textContent()).toBe("When: Base weeks");
  // Nothing is read until one opens.
  expect(await calls(page, "readText")).toEqual([]);
  const toggle = knowledge.locator("[part=memory-toggle]").first();
  await toggle.click();
  expect(await toggle.getAttribute("aria-expanded")).toBe("true");
  const body = knowledge.locator("[part=memory-body]").first();
  await expect.poll(() => body.locator("[part=memory-text]").textContent()).toBe("If you can't talk, **slow** down.");
  expect(await body.locator("[part=memory-source]").textContent()).toMatch(/^From the community's memory · updated Oct 3, 2026$/);
  await toggle.click();
  expect(await body.isVisible()).toBe(false);
  await toggle.click();
  expect((await calls(page, "readText")).length).toBe(1);

  const search = knowledge.locator("[part=search-input]");
  await search.fill("long run");
  await search.press("Enter");
  await expect.poll(() => titles(knowledge.locator("[part=memory-title]"))).toEqual(["Start the long run slow"]);
  expect(await knowledge.locator("[part=showing]").textContent()).toBe("Results for “long run”Show top memories");
  await search.fill("marathon");
  await knowledge.locator("[part=search-button]").click();
  await expect.poll(() => knowledge.locator("[part=no-results]").textContent()).toBe("Nothing in the community's memory matches “marathon”.");
  await knowledge.locator("[part=clear]").click();
  await expect.poll(() => knowledge.locator("[part=memory-title]").count()).toBe(2);
  expect((await calls(page, "knowledge")).map((c: any) => c[1])).toEqual([null, "long run", "marathon", null]);
  await page.close();

  const out = await open((fake) => { memory(fake); fake.signedOut = true; }, frame(), "/knowledge");
  await expect.poll(() => knowledgeOf(out).getAttribute("state")).toBe("signed-out");
  expect(await knowledgeOf(out).evaluate((el) => el.shadowRoot!.textContent)).not.toContain("Easy pace");
  await out.close();

  const empty = await open(() => {}, frame(), "/knowledge");
  await expect.poll(() => knowledgeOf(empty).getAttribute("state")).toBe("ready");
  expect(await knowledgeOf(empty).locator("[part=empty]").textContent()).toBe("Nothing in the community's memory yet.");
  await empty.close();
});

const askOf = (page: Page) => page.locator("polynet-ask");
function conversation(fake: ReturnType<typeof fixture>) {
  fake.agent = { history: [
    { role: "user", text: "When is the long run?", created_at: minutes(30) },
    { role: "assistant", text: "Sunday at `7:00`.", created_at: minutes(29) },
  ], reply: "Tuesdays and Thursdays at six.", fail: 0, hold: false };
}

test("ask: the member's private conversation, the reply streaming in, and a failed question back in the box", async () => {
  const page = await open((fake) => { conversation(fake); fake.agent.hold = true; }, frame(), "/ask");
  await expect.poll(() => page.locator("polynet-page").getAttribute("page")).toBe("ask");
  const ask = askOf(page);
  await expect.poll(() => ask.getAttribute("state")).toBe("ready");
  expect(await ask.locator("[part=privacy]").textContent()).toContain("Only you can see this conversation.");
  expect(await titles(ask.locator("[part=message-author]"))).toEqual(["You", "Run Club agent"]);
  expect(await ask.locator("[part~=message-agent] [part=message-body] code").textContent()).toBe("7:00");
  // With a conversation under way, no starters; the agent gets its mark.
  expect(await ask.locator("[part=starters]").isVisible()).toBe(false);
  expect(await ask.locator("[part~=message-agent] [part~=avatar-agent]").count()).toBe(1);
  const box = await ask.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(384);

  const input = ask.locator("[part=input]");
  await input.fill("When are the track sessions?");
  await input.press("Enter");
  expect((await calls(page, "askAgent")).map((c: any) => c[1])).toEqual(["When are the track sessions?"]);
  expect(await input.inputValue()).toBe("");
  const last = ask.locator("[part~=message-agent]").last();
  await expect.poll(() => last.locator("[part=message-body]").textContent()).toBe("Tuesdays and Th");
  expect(await last.getAttribute("aria-busy")).toBe("true");
  expect(await ask.locator("[part=send]").isDisabled()).toBe(true);
  await page.evaluate(() => (window as any).fake.agent.release());
  await expect.poll(() => last.locator("[part=message-body]").textContent()).toBe("Tuesdays and Thursdays at six.");
  expect(await last.getAttribute("aria-busy")).toBeNull();
  expect(await ask.locator("[part~=message]").count()).toBe(4);

  await page.evaluate(() => { (window as any).fake.agent.fail = 1; (window as any).fake.agent.hold = false; });
  await input.fill("And hills?");
  await ask.locator("[part=send]").click();
  await expect.poll(() => ask.locator("[part=problem]").textContent()).toBe("Not answered. The agent is busy right now. Try again");
  expect(await input.inputValue()).toBe("And hills?");
  expect(await ask.locator("[part~=message]").count()).toBe(4);
  await ask.locator("[part=problem] [part=retry]").click();
  await expect.poll(() => ask.locator("[part~=message]").count()).toBe(6);
  expect(await ask.locator("[part=problem]").textContent()).toBe("");
  expect((await calls(page, "askAgent")).map((c: any) => c[1])).toEqual(["When are the track sessions?", "And hills?", "And hills?"]);
  // The retry keeps the failed question's key, so the server saves it once.
  const keys = (await calls(page, "askAgent")).map((c: any) => c[2]);
  expect(keys[2]).toBe(keys[1]);
  expect(keys[1]).not.toBe(keys[0]);
  await page.close();
});

test("ask: starters while the conversation is empty, the site's own too; signed out never reads it", async () => {
  const page = await open((fake) => { conversation(fake); fake.agent.history = []; }, frame(), "/ask");
  const ask = askOf(page);
  await expect.poll(() => ask.getAttribute("state")).toBe("ready");
  const starters = ask.locator("[part=starter]");
  expect(await starters.count()).toBe(3);
  await starters.first().click();
  await expect.poll(() => ask.locator("[part~=message]").count()).toBe(2);
  expect((await calls(page, "askAgent")).map((c: any) => c[1])).toEqual(["What's coming up here?"]);
  expect(await ask.locator("[part=starters]").isVisible()).toBe(false);
  await page.close();

  const own = await open((fake) => { conversation(fake); fake.agent.history = []; },
    frame('<div data-block="polynet-ask" slot="starters"><button type="button">Who runs Tuesdays?</button></div><p data-block="polynet-ask" slot="privacy">Just you and the coach.</p>'), "/ask");
  const mine = askOf(own);
  await expect.poll(() => mine.getAttribute("state")).toBe("ready");
  // The site's starters replace Polynet's.
  expect(await mine.locator("[part=starter]").first().isVisible()).toBe(false);
  await mine.locator("button", { hasText: "Who runs Tuesdays?" }).click();
  await expect.poll(async () => (await calls(own, "askAgent")).map((c: any) => c[1])).toEqual(["Who runs Tuesdays?"]);
  expect(await mine.locator("[part=privacy] slot").evaluate((slot: HTMLSlotElement) => slot.assignedNodes().map((n) => n.textContent).join(""))).toBe("Just you and the coach.");
  await own.close();

  const out = await open((fake) => { conversation(fake); fake.signedOut = true; }, frame(), "/ask");
  await expect.poll(() => askOf(out).getAttribute("state")).toBe("signed-out");
  expect(await askOf(out).locator("[part=gate-text]").textContent()).toBe("Sign in to ask the community's agent.");
  expect(await askOf(out).locator("[part=input]").isVisible()).toBe(false);
  expect(await askOf(out).evaluate((el) => el.shadowRoot!.textContent)).not.toContain("long run");
  expect(await calls(out, "askAgent")).toEqual([]);
  await out.close();
});

const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
// Published communities as the edge lists them: this one, one with its own
// site, one without (its card opens Polynet), and enough for a preview to cut.
function communities(fake: ReturnType<typeof fixture>) {
  const card = (slug: string, name: string, extra: object = {}) => ({
    slug, name, one_liner: null, avatar_url: null, member_count: 0, url: `https://${slug}.polynet.page`, has_site: true, here: false, ...extra,
  });
  fake.discover = [
    card("run-club", "Run Club", { one_liner: "Miles before breakfast.", member_count: 12, here: true }),
    card("trail-crew", "Trail Crew", { one_liner: "Dirt, hills and the occasional bear.", member_count: 1, avatar_url: PIXEL }),
    card("cafe-racers", "Café Racers", { one_liner: "Bikes, espresso, no lycra.", member_count: 2400, url: "https://polynet.test/c/cafe-racers", has_site: false }),
    card("sunrise-climbers", "Sunrise Climbers", { one_liner: "Chalk up at dawn; trail talk welcome." }),
  ];
}
const discoverOf = (page: Page) => page.locator("polynet-discover");

test("discover: every published community as a card linking to its own site or Polynet, this one marked, with a search", async () => {
  const page = await open(communities, frame(), "/discover");
  await expect.poll(() => page.locator("polynet-page").getAttribute("page")).toBe("discover");
  expect(await page.locator("polynet-page .pn-page-header h1").textContent()).toBe("Discover");
  const discover = discoverOf(page);
  await expect.poll(() => discover.getAttribute("state")).toBe("ready");
  expect(await discover.locator("[part=discover]").getAttribute("aria-label")).toBe("Discover communities");
  expect(await titles(discover.locator("[part=community-name]"))).toEqual(["Run Club", "Trail Crew", "Café Racers", "Sunrise Climbers"]);
  const cards = discover.locator("a[part=community]");
  // Same tab, straight to the community: its own site, or its page on Polynet.
  expect(await cards.evaluateAll((all) => all.map((a) => [a.getAttribute("href"), a.getAttribute("target")]))).toEqual([
    ["https://run-club.polynet.page", null], ["https://trail-crew.polynet.page", null],
    ["https://polynet.test/c/cafe-racers", null], ["https://sunrise-climbers.polynet.page", null],
  ]);
  expect(await titles(discover.locator("[part=community-members]"))).toEqual(["12 members", "1 member", `${(2400).toLocaleString()} members`, "0 members"]);
  expect(await discover.locator("[part=community-here]").textContent()).toBe("You're here");
  expect(await cards.nth(0).locator("[part=community-here]").count()).toBe(1);
  expect(await cards.nth(2).locator("[part=community-elsewhere]").textContent()).toBe("On Polynet");
  expect(await cards.nth(1).locator("[part=community-elsewhere]").count()).toBe(0);
  // A picture, else initials.
  expect(await cards.nth(1).locator("img[part=avatar]").getAttribute("src")).toBe(PIXEL);
  expect(await cards.nth(0).locator("[part=avatar]").textContent()).toBe("RC");

  // Search: by name or one-liner, ignoring case and accents, names that start with it first.
  const search = discover.locator("[part=search]");
  await search.fill("cafe");
  expect(await titles(discover.locator("[part=community-name]"))).toEqual(["Café Racers"]);
  await search.fill("TRAIL");
  expect(await titles(discover.locator("[part=community-name]"))).toEqual(["Trail Crew", "Sunrise Climbers"]);
  expect(await discover.locator("[role=status]").textContent()).toBe("2 communities");
  await search.fill("knitting");
  expect(await discover.locator("[part=no-results]").textContent()).toBe("No communities match “knitting”.");
  await search.fill("");
  expect(await discover.locator("a[part=community]").count()).toBe(4);
  // One read, with no session asked for.
  expect((await calls(page, "discover")).length).toBe(1);
  await page.close();
});

test("discover: signed out it works the same; a preview shows the first few and the way to the rest; empty and failure say so", async () => {
  const out = await open((fake) => { communities(fake); fake.signedOut = true; fake.session = { signed_in: false, community: "run-club", join_url: "https://polynet.test/c/run-club" } as any; }, frame(), "/discover");
  await expect.poll(() => discoverOf(out).getAttribute("state")).toBe("ready");
  expect(await discoverOf(out).locator("a[part=community]").count()).toBe(4);
  await out.close();

  const home = await open(communities, `<!doctype html><html lang="en"><head><title>Run Club</title><script type="module" src="/__polynet/ui.js"></script></head>
    <body><polynet-discover limit="2"><h2 slot="header">Neighbours</h2></polynet-discover></body></html>`, "/");
  const preview = discoverOf(home);
  await expect.poll(() => preview.getAttribute("state")).toBe("ready");
  expect(await titles(preview.locator("[part=community-name]"))).toEqual(["Run Club", "Trail Crew"]);
  expect(await preview.locator("[part=search]").isVisible()).toBe(false);
  expect(await preview.locator("a[part=all]").getAttribute("href")).toBe("/discover");
  expect(await preview.locator("h2[slot=header]").textContent()).toBe("Neighbours");
  await home.close();

  const empty = await open(() => {}, frame('<p data-block="polynet-discover" slot="empty">Just us out here.</p>'), "/discover");
  await expect.poll(() => discoverOf(empty).getAttribute("state")).toBe("ready");
  // The site's own words fill the empty slot.
  expect(await discoverOf(empty).evaluate((el) => (el.shadowRoot!.querySelector("[part=empty] slot") as HTMLSlotElement).assignedNodes().map((n) => n.textContent).join(""))).toBe("Just us out here.");
  await empty.close();

  const failing = await open((fake) => { communities(fake); fake.failDiscover = 1; }, frame(), "/discover");
  const block = discoverOf(failing);
  await expect.poll(() => block.getAttribute("state")).toBe("error");
  expect(await block.locator("[role=alert] p").textContent()).toBe("Couldn't load communities.");
  await block.locator("[part=retry]").click();
  await expect.poll(() => block.getAttribute("state")).toBe("ready");
  expect(await block.locator("a[part=community]").count()).toBe(4);
  await failing.close();
});

// A site whose Content-Security-Policy allows only its own stylesheets and
// scripts: the blocks and the shell still style themselves (adopted sheets).
test("blocks and the shell are styled under a strict style-src, with a <style> fallback where sheets can't be adopted", async () => {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Run Club</title>
<link rel="stylesheet" href="/__polynet/ui.css"><script type="module" src="/__polynet/ui.js"></script></head>
<body><header><polynet-account></polynet-account></header><main><polynet-page></polynet-page></main></body></html>`;
  const csp = { "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' https: data:" };
  const styledProbe = async (page: Page) => {
    const members = page.locator("polynet-members");
    await expect.poll(() => members.getAttribute("state")).toBe("ready");
    await expect.poll(() => page.locator("polynet-account [part=trigger]").count()).toBe(1);
    return {
      search: await members.locator("[part=search]").evaluate((el) => [getComputedStyle(el).borderTopStyle, getComputedStyle(el).display]),
      trigger: await page.locator("polynet-account [part=trigger]").evaluate((el) => getComputedStyle(el).borderTopLeftRadius),
      styles: await page.evaluate(() => Array.from(document.querySelectorAll("*")).filter((el) => el.shadowRoot).map((el) => el.shadowRoot!.querySelectorAll("style").length)),
    };
  };
  const strict = await open(() => {}, html, "/people", {}, csp);
  const seen = await styledProbe(strict);
  expect(seen.search).toEqual(["solid", "block"]);
  expect(seen.trigger).toBe("999px");
  expect(seen.styles.every((n) => n === 0)).toBe(true);
  await strict.close();

  // The same page with violations recorded from the start: none.
  const watched = await browser.newPage();
  const violations: string[] = [];
  watched.on("console", (message) => { if (/Content Security Policy/i.test(message.text())) violations.push(message.text()); });
  await watched.route(`${SITE}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const files: Record<string, string> = { "/__polynet/ui.js": UI_SOURCE, "/__polynet/ui.css": UI_CSS, "/__polynet/sdk.js": FAKE_SDK,
      "/__polynet/blocks/kit.js": KIT_SOURCE, "/__polynet/blocks/page.js": PAGE_SOURCE, "/__polynet/blocks/discover.js": DISCOVER_SOURCE };
    if (files[path] !== undefined) return route.fulfill({ body: files[path], contentType: path.endsWith(".css") ? "text/css" : "text/javascript" });
    return route.fulfill({ body: html, contentType: "text/html", headers: csp });
  });
  const fake = fixture();
  communities(fake);
  await watched.addInitScript((state) => { (window as any).fake = state; }, fake);
  await watched.goto(SITE + "/discover");
  await expect.poll(() => discoverOf(watched).getAttribute("state")).toBe("ready");
  expect(await discoverOf(watched).locator("ul[part=communities]").evaluate((el) => getComputedStyle(el).display)).toBe("grid");
  expect(violations).toEqual([]);
  await watched.close();

  // A browser without adoptable sheets gets a <style> in each shadow root instead.
  const legacy = await browser.newPage();
  await legacy.addInitScript(() => { delete (ShadowRoot.prototype as any).adoptedStyleSheets; });
  await legacy.route(`${SITE}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const files: Record<string, string> = { "/__polynet/ui.js": UI_SOURCE, "/__polynet/ui.css": UI_CSS, "/__polynet/sdk.js": FAKE_SDK,
      "/__polynet/blocks/kit.js": KIT_SOURCE, "/__polynet/blocks/page.js": PAGE_SOURCE, "/__polynet/blocks/members.js": MEMBERS_SOURCE };
    if (files[path] !== undefined) return route.fulfill({ body: files[path], contentType: path.endsWith(".css") ? "text/css" : "text/javascript" });
    return route.fulfill({ body: html, contentType: "text/html" });
  });
  await legacy.addInitScript((state) => { (window as any).fake = state; }, fixture());
  await legacy.goto(SITE + "/people");
  const fallback = await styledProbe(legacy);
  expect(fallback.search).toEqual(["solid", "block"]);
  expect(fallback.trigger).toBe("999px");
  expect(fallback.styles.every((n) => n === 1)).toBe(true);
  await legacy.close();
});
