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
import { UI_SOURCE } from "./ui";

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
    const posts = all.slice(-((options && options.limit) || 50));
    posts.cursor = null;
    return posts;
  },
  thread: async (slug, ref) => { fail(); record("thread", [slug, ref]); return (fake.threads[ref] || []).map((p) => Object.assign({}, p)); },
  react: async (ref, emoji, on) => { record("react", [ref, emoji, on]); return { reacted: on }; },
  markRead: async (slug) => { record("markRead", [slug]); return {}; },
  watch: async (slug, onChange) => {
    record("watch", [slug]);
    (fake.watchers[slug] = fake.watchers[slug] || []).push(onChange);
    onChange({ changed: true, typing: [] });
    return () => { fake.watchers[slug] = fake.watchers[slug].filter((f) => f !== onChange); };
  },
  fileUrl: (file) => "/__polynet/files/" + String(file.ref || file).replace("attachment:", ""),
  markdown: (text) => { const p = document.createElement("p"); p.textContent = text; const f = document.createDocumentFragment(); f.append(p); return f; },
  account: async () => ({ member: {}, community: {}, links: {} }),
  signOut: async () => {},
};
`;

const minutes = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const human = (name: string, id: string) => ({ type: "human", display_name: name, handle: id, avatar_url: null, user_id: id });
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
    session: { signed_in: true, community: "run-club", community_name: "Run Club", join_url: "https://polynet.test/c/run-club", member: { name: "Me" } },
    signedOut: false,
    channels: [
      { slug: "general", name: "General", isGeneral: true, canPost: true, unread: true, mentioned: false, seenThroughAt: Date.now() - 30 * 60_000 },
      { slug: "crew", name: "Crew", isGeneral: false, canPost: true, unread: true, mentioned: true, seenThroughAt: null },
      { slug: "routes", name: "Routes", isGeneral: false, canPost: true, unread: false, mentioned: false, seenThroughAt: null },
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

async function open(setup: (fake: ReturnType<typeof fixture>) => void = () => {}, html = PAGE, path = "/") {
  const fake = fixture();
  setup(fake);
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  const files: Record<string, string> = {
    "/__polynet/ui.js": UI_SOURCE, "/__polynet/sdk.js": FAKE_SDK, "/__polynet/blocks/kit.js": KIT_SOURCE,
    "/__polynet/blocks/channels.js": CHANNELS_SOURCE, "/__polynet/blocks/chat.js": CHAT_SOURCE,
  };
  await page.route(`${SITE}/**`, async (route) => {
    const url = new URL(route.request().url());
    const body = files[url.pathname];
    if (body !== undefined) return route.fulfill({ body, contentType: "text/javascript" });
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

test("ui.js loads a block only when its tag is on the page, including one added later", async () => {
  const page = await open(() => {}, `<!doctype html><html lang="en"><head><title>x</title><script type="module" src="/__polynet/ui.js"></script></head><body><p>Hi</p></body></html>`);
  await page.waitForTimeout(200);
  const loaded = () => page.evaluate(() => performance.getEntriesByType("resource").map((e) => new URL(e.name).pathname).filter((p) => p.startsWith("/__polynet/blocks/")));
  expect(await loaded()).toEqual([]);
  await page.evaluate(() => document.body.append(document.createElement("polynet-chat")));
  await expect.poll(() => page.evaluate(() => !!customElements.get("polynet-chat"))).toBe(true);
  expect((await loaded()).sort()).toEqual(["/__polynet/blocks/chat.js", "/__polynet/blocks/kit.js"]);
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
