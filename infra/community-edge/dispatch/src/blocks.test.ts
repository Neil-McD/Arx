// @vitest-environment node
// The blocks in a real browser: the exact text the edge serves, on a page with
// a fake SDK the test drives (window.fake), so no Polynet backend is involved.
import { mkdtempSync, writeFileSync } from "node:fs";
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
  account: async () => ({ member: {}, community: {}, links: { messages: "https://polynet.test/?dm=inbox" } }),
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

async function open(setup: (fake: ReturnType<typeof fixture>) => void = () => {}, html = PAGE, path = "/", device: object = {}) {
  const fake = fixture();
  setup(fake);
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, ...device });
  const files: Record<string, string> = {
    "/__polynet/ui.js": UI_SOURCE, "/__polynet/sdk.js": FAKE_SDK, "/__polynet/blocks/kit.js": KIT_SOURCE,
    "/__polynet/blocks/channels.js": CHANNELS_SOURCE, "/__polynet/blocks/chat.js": CHAT_SOURCE, "/__polynet/blocks/composer.js": COMPOSER_SOURCE,
    "/__polynet/blocks/members.js": MEMBERS_SOURCE, "/__polynet/blocks/profile.js": PROFILE_SOURCE, "/__polynet/ui.css": UI_CSS,
  };
  await page.route(`${SITE}/**`, async (route) => {
    const url = new URL(route.request().url());
    const body = files[url.pathname];
    if (body !== undefined) return route.fulfill({ body, contentType: url.pathname.endsWith(".css") ? "text/css" : "text/javascript" });
    return route.fulfill({ body: html, contentType: "text/html" });
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
