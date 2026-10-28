// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// <polynet-chat>, served at /__polynet/blocks/chat.js: a channel's
// conversation, live. It follows the page's channel (?channel=<slug> and the
// "polynet:channel" event) unless channel="<slug>" pins one. This is the read
// side; the composer arrives in the same block below the typing line. Kept as
// text (a String.raw literal: no backticks or template placeholders inside) so
// the edge serves exactly what is reviewed.
export const CHAT_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block: <polynet-chat>. ui.js loads it on pages that place the tag.
import polynet from "/__polynet/sdk.js";
import {
  BASE_STYLE, h, avatar, authorName, clockTime, fullTime, timeLabel, fileSize, typingText,
  feedItems, reconcile, channelFromUrl, pickChannel, readChannels,
} from "/__polynet/blocks/kit.js";

const STYLE = BASE_STYLE + "\n" + [
  // A chat needs a height to scroll in; the site sets its own on the element.
  ":host { display: block; height: 70vh; min-height: 320px; container-type: inline-size; }",
  ".chat { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); height: 100%; }",
  ".main { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; }",
  ".header { padding: 0 .5em .625em; border-bottom: 1px solid var(--pn-border); font-weight: 600; }",
  ".hash { color: var(--pn-muted); font-weight: 400; margin-right: .1em; }",
  ".feed { position: relative; flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 0 .5em; }",
  ".history { color: var(--pn-muted); font-size: .8125em; padding: 1.25em .625em .25em; }",
  ".history:empty { padding: 0; }",
  "ol { list-style: none; margin: 0; padding: 0; }",
  ".message { display: grid; grid-template-columns: 2.25em minmax(0, 1fr); column-gap: .75em; padding: .375em .625em .25em; margin-top: .5em; border-radius: calc(var(--pn-radius) * .6); }",
  ".message.grouped { margin-top: 0; padding-top: .0625em; }",
  "@media (hover: hover) { .message:hover { background: var(--pn-tint); } }",
  ".message:focus-within { background: var(--pn-tint); }",
  ".gutter { padding-top: .125em; }",
  ".gutter .time { display: block; opacity: 0; font-size: .6875em; text-align: right; line-height: 2.2; white-space: nowrap; }",
  ".message.grouped:hover .gutter .time, .message.grouped:focus-within .gutter .time { opacity: 1; }",
  ".head { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: .5em; line-height: 1.35; }",
  ".author { font-weight: 600; }",
  ".agent .author { color: var(--pn-accent); }",
  ".time { color: var(--pn-muted); font-size: .8125em; font-variant-numeric: tabular-nums; }",
  ".body { line-height: 1.55; overflow-wrap: anywhere; }",
  ".body > :first-child { margin-top: 0; } .body > :last-child { margin-bottom: 0; }",
  ".body p { margin: 0 0 .5em; }",
  ".body h3, .body h4, .body h5 { margin: .75em 0 .25em; font-size: 1em; line-height: 1.3; } .body h3 { font-size: 1.125em; }",
  ".body ul, .body ol { margin: .25em 0 .5em; padding-left: 1.25em; } .body ul { list-style: disc; } .body ol { list-style: decimal; }",
  ".body blockquote { margin: .5em 0; padding-left: .875em; border-left: 2px solid var(--pn-border); color: var(--pn-muted); }",
  ".body code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .875em; background: var(--pn-tint); padding: .1em .3em; border-radius: 4px; }",
  ".body pre { margin: .5em 0; padding: .75em .875em; overflow-x: auto; background: var(--pn-tint); border-radius: calc(var(--pn-radius) * .6); }",
  ".body pre code { background: none; padding: 0; }",
  ".body a { text-decoration: underline; text-decoration-color: var(--pn-accent); text-underline-offset: .18em; }",
  ".edited { color: var(--pn-muted); font-size: .8125em; }",
  ".attachments { display: flex; flex-wrap: wrap; gap: .5em; margin-top: .5em; }",
  ".attachments img, .attachments video { display: block; max-width: min(100%, 22em); max-height: 20em; border-radius: calc(var(--pn-radius) * .6); border: 1px solid var(--pn-border); }",
  ".file { display: inline-flex; align-items: baseline; gap: .5em; padding: .5em .75em; border: 1px solid var(--pn-border); border-radius: calc(var(--pn-radius) * .6); text-decoration: none; max-width: 100%; }",
  ".file .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: underline; text-underline-offset: .18em; text-decoration-color: var(--pn-border); }",
  ".reactions { display: flex; flex-wrap: wrap; gap: .375em; margin-top: .375em; }",
  ".reaction { position: relative; display: inline-flex; align-items: center; gap: .3em; border: 1px solid var(--pn-border); border-radius: 999px; background: none;",
  "  padding: .0625em .55em; font-size: .8125em; line-height: 1.6; font-variant-numeric: tabular-nums; }",
  "@media (hover: hover) { .reaction:hover { border-color: var(--pn-muted); } }",
  ".reaction[aria-pressed=true] { border-color: var(--pn-accent); background: color-mix(in srgb, var(--pn-accent) 12%, transparent); }",
  ".replies { display: inline-block; margin-top: .25em; background: none; border: 0; padding: .125em 0; font-size: .8125em; font-weight: 600;",
  "  text-decoration: underline; text-decoration-color: var(--pn-border); text-underline-offset: .2em; }",
  ".replies:hover, .replies[aria-expanded=true] { text-decoration-color: currentColor; }",
  ".divider { display: flex; align-items: center; gap: .75em; font-size: .75em; letter-spacing: .02em; color: var(--pn-muted); margin: 1.5em .625em .25em; }",
  ".divider::after { content: ''; flex: 1; border-top: 1px solid var(--pn-border); }",
  ".divider.new { color: var(--pn-accent); font-weight: 600; flex-direction: row-reverse; margin-top: .75em; }",
  ".divider.new::after { border-color: var(--pn-accent); }",
  ".typing { min-height: 1.75em; padding: .25em .625em 0; color: var(--pn-muted); font-size: .8125em; }",
  ".jump { position: absolute; left: 50%; bottom: 2.5em; transform: translateX(-50%); z-index: 1; border: 1px solid var(--pn-border); border-radius: 999px;",
  "  background: var(--pn-surface); color: var(--pn-surface-text); padding: .4em 1em; font-size: .8125em; font-weight: 600; box-shadow: 0 4px 16px rgba(0,0,0,.12); }",
  ".thread { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; min-width: 0; min-height: 0;",
  "  background: var(--pn-surface); color: var(--pn-surface-text); }",
  ".thread-head { display: flex; align-items: center; justify-content: space-between; gap: .5em; padding: 0 0 .375em .625em; border-bottom: 1px solid var(--pn-border); }",
  ".thread-title { font-weight: 600; }",
  ".close { position: relative; width: 2.25em; height: 2.25em; border: 0; border-radius: 50%; background: none; flex: none; }",
  "@media (hover: hover) { .close:hover { background: var(--pn-tint); } }",
  ".close::before, .close::after { content: ''; position: absolute; left: 50%; top: 50%; width: .875em; height: 1.5px; background: currentColor; }",
  ".close::before { transform: translate(-50%, -50%) rotate(45deg); } .close::after { transform: translate(-50%, -50%) rotate(-45deg); }",
  ".thread-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-bottom: .5em; }",
  ".thread .status { color: var(--pn-muted); padding: 1em .625em; margin: 0; }",
  "@container (min-width: 720px) {",
  "  .chat.threaded { grid-template-columns: minmax(0, 1fr) minmax(16em, 40%); }",
  "  .thread { position: static; background: none; color: inherit; border-left: 1px solid var(--pn-border); margin-left: .75em; padding-left: .25em; }",
  "}",
  "@media (pointer: coarse) {",
  "  .reaction { min-height: 36px; } .reaction::after { content: ''; position: absolute; inset: -4px -2px; }",
  "  .replies, .jump, .close { min-height: 44px; } .close { width: 44px; }",
  "}",
  "@media (prefers-reduced-motion: no-preference) { .jump { animation: pn-rise .16s ease-out; } }",
  "@keyframes pn-rise { from { opacity: 0; transform: translate(-50%, 4px); } to { opacity: 1; transform: translate(-50%, 0); } }",
].join("\n");

const PAGE = 50;
const NEAR_BOTTOM = 48;
const NEAR_TOP = 160;
const READ_DELAY_MS = 600;
let counter = 0;

function at(post) { return Date.parse(post.created_at) || 0; }

class PolynetChat extends HTMLElement {
  static get observedAttributes() { return ["channel"]; }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.uid = "pn-chat-" + (++counter);
    this.generation = 0;
    this.status = "loading";
    this.channel = null;
    this.reset();
    this.onChannel = (event) => this.follow(event.detail && event.detail.slug);
    this.onPop = () => this.follow(channelFromUrl());
    this.onFocus = () => {
      if (document.visibilityState !== "visible" || this.status !== "ready") return;
      this.refresh();
      this.markReadSoon();
    };
    this.build();
  }

  reset() {
    this.posts = new Map();
    this.nodes = new Map();
    this.threadNodes = new Map();
    this.cursor = null;
    this.olderFailed = false;
    this.loadingOlder = false;
    this.typists = [];
    this.needsRead = false;
    this.pinned = true;
    this.threadRef = null;
    this.thread = [];
    this.threadStatus = "loading";
  }

  // The frame is built once; renders fill its regions.
  build() {
    this.headerTitle = h("span", { part: "title" });
    this.history = h("div", { class: "history", part: "history" });
    this.list = h("ol", { part: "messages", role: "list" });
    this.empty = h("div", { class: "state", part: "empty", hidden: true }, [h("slot", { name: "empty" }, ["No posts here yet."])]);
    this.feed = h("div", {
      class: "feed", part: "feed", role: "log", "aria-live": "polite", "aria-relevant": "additions", tabindex: "0",
      onscroll: () => this.onScroll(),
    }, [this.history, this.list, this.empty]);
    this.state = h("div", { class: "state", part: "state", hidden: true });
    this.jump = h("button", { class: "jump", part: "jump", type: "button", hidden: true, onclick: () => this.toBottom(true) }, [
      "New messages ", h("span", { "aria-hidden": "true", text: "↓" }),
    ]);
    this.typing = h("div", { class: "typing", part: "typing" });
    this.threadTitle = h("div", { class: "thread-title", id: this.uid + "-thread", tabindex: "-1", text: "Thread" });
    this.threadList = h("ol", { part: "thread-messages", role: "list", "aria-live": "polite", "aria-relevant": "additions" });
    this.threadStatusLine = h("p", { class: "status", hidden: true });
    this.threadTyping = h("div", { class: "typing", part: "thread-typing" });
    // 2b: the reply composer mounts in threadFooter, under the thread's typing line.
    this.threadFooter = h("div", { class: "thread-footer", part: "thread-footer" });
    this.threadPanel = h("aside", { class: "thread", part: "thread-panel", id: this.uid + "-panel", "aria-labelledby": this.uid + "-thread", hidden: true }, [
      h("div", { class: "thread-head", part: "thread-header" }, [
        this.threadTitle,
        h("button", { class: "close", part: "thread-close", type: "button", "aria-label": "Close thread", onclick: () => this.closeThread(true) }),
      ]),
      h("div", { class: "thread-body" }, [this.threadList, this.threadStatusLine]),
      this.threadTyping,
      this.threadFooter,
    ]);
    // 2b: the channel composer mounts in this.footer, under the typing line.
    this.footer = h("div", { class: "footer", part: "footer" });
    this.header = h("div", { class: "header", part: "header" }, [h("slot", { name: "header" }, [this.headerTitle])]);
    this.main = h("div", { class: "main" }, [
      this.header,
      this.state, this.feed, this.jump, this.typing, this.footer,
    ]);
    this.frame = h("div", { class: "chat", part: "chat", onkeydown: (event) => {
      if (event.key === "Escape" && this.threadRef) { event.preventDefault(); this.closeThread(true); }
    } }, [this.main, this.threadPanel]);
    this.root.replaceChildren(h("style", { text: STYLE }), this.frame);
    // Images and late layout keep a reader at the bottom when they were there.
    this.resizer = new ResizeObserver(() => { if (this.pinned && this.status === "ready") this.feed.scrollTop = this.feed.scrollHeight; });
    this.resizer.observe(this.list);
  }

  connectedCallback() {
    document.addEventListener("polynet:channel", this.onChannel);
    document.addEventListener("visibilitychange", this.onFocus);
    window.addEventListener("popstate", this.onPop);
    window.addEventListener("focus", this.onFocus);
    this.open();
  }

  disconnectedCallback() {
    document.removeEventListener("polynet:channel", this.onChannel);
    document.removeEventListener("visibilitychange", this.onFocus);
    window.removeEventListener("popstate", this.onPop);
    window.removeEventListener("focus", this.onFocus);
    this.generation += 1;
    this.stopLive();
    clearTimeout(this.readTimer);
  }

  attributeChangedCallback() {
    if (this.isConnected) this.open();
  }

  follow(slug) {
    if (this.hasAttribute("channel") || !this.isConnected) return;
    if (this.channel && (slug === this.channel.slug || (!slug && this.channel.isGeneral))) return;
    this.open(slug);
  }

  stopLive() {
    if (this.stopWatch) this.stopWatch();
    this.stopWatch = null;
  }

  setStatus(status) {
    this.status = status;
    this.setAttribute("state", status);
    const ready = status === "ready";
    this.feed.hidden = !ready;
    this.state.hidden = ready;
    this.typing.hidden = !ready;
    // The site's own header stays; the default title waits for a channel.
    this.header.hidden = !ready && !this.querySelector(":scope > [slot=header]");
    if (!ready) {
      this.jump.hidden = true;
      this.hideThread();
    }
  }

  showState(nodes, role) {
    if (role) this.state.setAttribute("role", role);
    else this.state.removeAttribute("role");
    this.state.replaceChildren(...nodes);
  }

  async open(requested) {
    const generation = ++this.generation;
    this.stopLive();
    clearTimeout(this.readTimer);
    this.hideThread();
    this.reset();
    this.list.replaceChildren();
    this.threadList.replaceChildren();
    this.typing.textContent = "";
    this.setStatus("loading");
    this.showState([h("p", { class: "muted", text: "Loading…" })], "status");
    try {
      const session = await polynet.session();
      if (generation !== this.generation) return;
      this.communityName = session.community_name;
      if (!session.signed_in) { this.signedOut(session); return; }
      const pinned = this.getAttribute("channel");
      const channels = await readChannels(polynet);
      if (generation !== this.generation) return;
      const channel = pinned ? channels.find((entry) => entry.slug === pinned) || null
        : pickChannel(channels, requested || channelFromUrl());
      if (!channel) {
        this.channel = null;
        this.setStatus("unavailable");
        this.showState([h("p", { class: "muted", text: pinned ? "This channel isn't available." : "There are no channels here yet." })]);
        return;
      }
      this.channel = channel;
      this.seenThroughAt = channel.seenThroughAt;
      this.needsRead = channel.unread || channel.mentioned;
      this.headerTitle.replaceChildren(h("span", { class: "hash", "aria-hidden": "true", text: "#" }), channel.name || channel.slug);
      this.feed.setAttribute("aria-label", "Messages in " + (channel.name || channel.slug));
      const page = await polynet.feed(channel.slug, { limit: PAGE });
      if (generation !== this.generation) return;
      this.cursor = page.cursor || null;
      this.merge(page, true);
      // "New" marks what was unread on arrival; posts that come in while the
      // member watches don't get one.
      if (!page.some((post) => !post.by_me && at(post) > (this.seenThroughAt || 0))) this.seenThroughAt = null;
      this.setStatus("ready");
      this.renderFeed({ quiet: true });
      this.toFirstUnread();
      this.markReadSoon();
      this.fillViewport();
      this.startLive(generation);
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    }
  }

  async fail(error) {
    if (error && error.code === "sign_in_required") {
      this.signedOut(await polynet.session().catch(() => ({})));
      return;
    }
    this.setStatus("error");
    this.showState([
      h("p", { text: "Couldn't load the conversation." }),
      h("button", { class: "quiet", part: "retry", type: "button", onclick: () => this.open(), text: "Try again" }),
    ], "alert");
  }

  // Signed out or not a member: a calm way in, and never a word of the conversation.
  signedOut(session) {
    this.stopLive();
    this.hideThread();
    this.reset();
    this.list.replaceChildren();
    this.threadList.replaceChildren();
    this.channel = null;
    this.setStatus("signed-out");
    this.headerTitle.replaceChildren();
    const join = session && session.join_url
      ? h("a", { class: "quiet", part: "join", href: session.join_url, text: "New here? Join" }) : null;
    this.showState([h("div", { class: "gate", part: "gate" }, [
      h("p", { part: "gate-text" }, [h("slot", { name: "signed-out" }, ["Sign in to read and join the conversation."])]),
      h("div", { class: "actions" }, [
        h("button", { class: "primary", part: "sign-in", type: "button", onclick: () => polynet.signIn(), text: "Sign in" }),
        join,
      ]),
    ])]);
  }

  async startLive(generation) {
    const slug = this.channel.slug;
    try {
      const stop = await polynet.watch(slug, (update) => { if (generation === this.generation) this.onLive(update); });
      if (generation !== this.generation) { stop(); return; }
      this.stopWatch = stop;
    } catch (error) {
      // Without live updates the feed still refreshes when the tab regains focus.
    }
  }

  onLive(update) {
    this.typists = update.typing || [];
    this.renderTyping();
    if (update.changed) this.refresh();
  }

  // One re-read at a time; changes during one are picked up right after it.
  async refresh() {
    if (!this.channel || this.status !== "ready") return;
    if (this.refreshing) { this.refreshAgain = true; return; }
    this.refreshing = true;
    const generation = this.generation;
    try {
      const page = await polynet.feed(this.channel.slug, { limit: PAGE });
      if (generation !== this.generation) return;
      const before = new Map(Array.from(this.posts.values(), (post) => [post.ref, post.reply_count]));
      const stick = this.pinned;
      this.merge(page, true);
      const arrivals = page.filter((post) => !before.has(post.ref));
      if (arrivals.length || page.some((post) => before.has(post.ref) && post.reply_count > before.get(post.ref))) this.needsRead = true;
      this.renderFeed({});
      if (stick || arrivals.some((post) => post.by_me)) this.toBottom(false);
      else if (arrivals.some((post) => !post.by_me)) this.jump.hidden = false;
      this.markReadSoon();
      if (this.threadRef) this.loadThread();
    } catch (error) {
      // A passing failure keeps what's on screen; a lost session shows the way back in.
      if (generation === this.generation && error && error.code === "sign_in_required") this.fail(error);
    } finally {
      this.refreshing = false;
      if (this.refreshAgain && generation === this.generation) { this.refreshAgain = false; this.refresh(); }
    }
  }

  // The newest page replaces everything it covers (edits, deletions); older
  // history outside it stays.
  merge(page, newest) {
    if (newest) {
      const oldest = page.length ? at(page[0]) : -Infinity;
      const fresh = new Set(page.map((post) => post.ref));
      for (const [ref, post] of this.posts) if (at(post) >= oldest && !fresh.has(ref)) this.posts.delete(ref);
    }
    for (const post of page) this.posts.set(post.ref, post);
  }

  sorted() {
    return Array.from(this.posts.values()).sort((a, b) => at(a) - at(b) || (a.ref < b.ref ? -1 : 1));
  }

  atBottom() {
    const feed = this.feed;
    return feed.scrollHeight - feed.scrollTop - feed.clientHeight < NEAR_BOTTOM;
  }

  toBottom(smooth) {
    this.pinned = true;
    this.jump.hidden = true;
    const motion = smooth && matchMedia("(prefers-reduced-motion: no-preference)").matches;
    this.feed.scrollTo({ top: this.feed.scrollHeight, behavior: motion ? "smooth" : "auto" });
    this.markReadSoon();
  }

  // Opening a channel lands at the bottom, or at "New" when that is further up than a screen.
  toFirstUnread() {
    const marker = this.list.querySelector(".divider.new");
    const feed = this.feed;
    if (marker && feed.scrollHeight - marker.offsetTop > feed.clientHeight) {
      feed.scrollTop = Math.max(0, marker.offsetTop - 16);
      this.pinned = this.atBottom();
    } else {
      this.toBottom(false);
    }
  }

  onScroll() {
    this.pinned = this.atBottom();
    if (this.pinned) { this.jump.hidden = true; this.markReadSoon(); }
    if (this.feed.scrollTop < NEAR_TOP) this.loadOlder();
  }

  // Read state moves only when the member can see the newest posts.
  markReadSoon() {
    if (!this.needsRead || this.status !== "ready" || document.visibilityState !== "visible" || !this.atBottom()) return;
    clearTimeout(this.readTimer);
    const generation = this.generation;
    this.readTimer = setTimeout(async () => {
      if (generation !== this.generation || !this.needsRead) return;
      const slug = this.channel.slug;
      this.needsRead = false;
      try {
        await polynet.markRead(slug);
        document.dispatchEvent(new CustomEvent("polynet:read", { detail: { slug: slug } }));
      } catch (error) {
        if (generation === this.generation) this.needsRead = true;
      }
    }, READ_DELAY_MS);
  }

  // A short first page that doesn't fill the feed brings in more history.
  fillViewport() {
    if (this.cursor && !this.olderFailed && this.feed.scrollHeight <= this.feed.clientHeight + NEAR_TOP) this.loadOlder();
  }

  async loadOlder() {
    if (!this.cursor || this.loadingOlder || this.olderFailed || this.status !== "ready") return;
    this.loadingOlder = true;
    this.renderHistory();
    const generation = this.generation;
    const slug = this.channel.slug;
    try {
      let cursor = this.cursor;
      let added = [];
      // A page can hold only replies; keep going until it brings posts.
      for (let tries = 0; tries < 3 && cursor && !added.length; tries += 1) {
        const page = await polynet.feed(slug, { limit: PAGE, cursor: cursor });
        if (generation !== this.generation) return;
        cursor = page.cursor || null;
        added = page.filter((post) => !this.posts.has(post.ref));
      }
      this.cursor = cursor;
      const feed = this.feed;
      const height = feed.scrollHeight;
      const top = feed.scrollTop;
      this.merge(added, false);
      this.renderFeed({ quiet: true });
      feed.scrollTop = top + (feed.scrollHeight - height);
    } catch (error) {
      if (generation !== this.generation) return;
      if (error && error.code === "sign_in_required") { this.fail(error); return; }
      this.olderFailed = true;
    } finally {
      if (generation === this.generation) {
        this.loadingOlder = false;
        this.renderHistory();
        this.fillViewport();
      }
    }
  }

  renderHistory() {
    if (this.loadingOlder) {
      this.history.replaceChildren(h("span", { role: "status", text: "Loading earlier messages…" }));
    } else if (this.olderFailed) {
      this.history.replaceChildren("Couldn't load earlier messages. ", h("button", {
        class: "quiet", part: "retry", type: "button", text: "Try again",
        onclick: () => { this.olderFailed = false; this.loadOlder(); },
      }));
    } else if (!this.cursor && this.posts.size && this.channel) {
      this.history.replaceChildren("This is the beginning of #" + (this.channel.name || this.channel.slug) + ".");
    } else {
      this.history.replaceChildren();
    }
  }

  // History loads quietly (aria-busy); only posts that arrive live are announced.
  renderFeed(options) {
    const focus = this.focusKey();
    if (options.quiet) this.feed.setAttribute("aria-busy", "true");
    const items = feedItems(this.sorted(), { seenThroughAt: this.seenThroughAt });
    const next = new Map();
    const nodes = items.map((item) => {
      const signature = this.signature(item);
      const old = this.nodes.get(item.key);
      const node = old && old.signature === signature ? old.node : this.buildItem(item, false);
      next.set(item.key, { signature: signature, node: node });
      return node;
    });
    this.nodes = next;
    reconcile(this.list, nodes);
    this.empty.hidden = this.posts.size > 0;
    this.renderHistory();
    this.restoreFocus(focus);
    if (options.quiet) requestAnimationFrame(() => this.feed.removeAttribute("aria-busy"));
  }

  signature(item) {
    if (item.type !== "message") return item.type + ":" + item.label;
    const post = item.post;
    return JSON.stringify([item.grouped, post.text, post.edited_at, post.reactions, post.reacted_by_me, post.reply_count,
      post.attachments, post.actor, this.threadRef === post.ref]);
  }

  buildItem(item, inThread) {
    if (item.type === "day") return h("li", { class: "divider", part: "day-divider", role: "separator", text: item.label });
    if (item.type === "new") return h("li", { class: "divider new", part: "new-divider", role: "separator", text: "New" });
    return this.buildMessage(item.post, item.grouped, inThread);
  }

  buildMessage(post, grouped, inThread) {
    const agent = post.actor.type === "community_agent";
    const name = authorName(post.actor, this.communityName);
    const date = new Date(post.created_at);
    const time = h("time", {
      class: "time", part: "message-time", datetime: post.created_at, title: fullTime(date),
      text: inThread ? timeLabel(date) : clockTime(date),
    });
    const parts = ["message"];
    if (grouped) parts.push("message-grouped");
    if (agent) parts.push("message-agent");
    if (post.by_me) parts.push("message-mine");
    const body = h("div", { class: "body", part: "message-body" }, [polynet.markdown(post.text)]);
    if (post.edited_at) {
      const edited = h("span", { class: "edited", part: "message-edited", text: " (edited)" });
      const last = body.lastElementChild;
      if (last && last.tagName === "P") last.append(edited);
      else body.append(edited);
    }
    return h("li", { class: "message" + (grouped ? " grouped" : "") + (agent ? " agent" : ""), part: parts.join(" "), "data-ref": post.ref }, [
      h("div", { class: "gutter" }, [grouped ? time : avatar(post.actor, name)]),
      h("div", { class: "content" }, [
        grouped ? h("span", { class: "sr", text: name + ": " })
          : h("div", { class: "head" }, [h("span", { class: "author", part: "message-author", text: name }), time]),
        body,
        this.buildAttachments(post),
        this.buildReactions(post),
        !inThread && post.reply_count > 0 ? h("button", {
          class: "replies", part: "replies", type: "button", "data-key": "replies",
          "aria-expanded": this.threadRef === post.ref ? "true" : "false", "aria-controls": this.uid + "-panel",
          text: post.reply_count + (post.reply_count === 1 ? " reply" : " replies"),
          onclick: () => this.openThread(post.ref),
        }) : null,
      ]),
    ]);
  }

  buildAttachments(post) {
    const files = post.attachments || [];
    if (!files.length) return null;
    return h("div", { class: "attachments", part: "attachments" }, files.map((file) => {
      const url = polynet.fileUrl(file);
      const label = file.name || "Attachment";
      if (file.kind === "image") {
        return h("a", { href: url, target: "_blank", rel: "noopener", part: "attachment attachment-image" }, [
          h("img", { src: url, alt: label, loading: "lazy" }),
        ]);
      }
      if (file.kind === "video") return h("video", { src: url, controls: true, preload: "metadata", "aria-label": label, part: "attachment attachment-video" });
      return h("a", { class: "file", href: url, download: label, part: "attachment attachment-file" }, [
        h("span", { class: "name", text: label }),
        file.size ? h("span", { class: "muted", text: fileSize(file.size) }) : null,
      ]);
    }));
  }

  buildReactions(post) {
    const reactions = (post.reactions || []).filter((reaction) => reaction.count > 0);
    if (!reactions.length) return null;
    const mine = post.reacted_by_me || [];
    return h("div", { class: "reactions", part: "reactions", role: "group", "aria-label": "Reactions" }, reactions.map((reaction) => {
      const pressed = mine.indexOf(reaction.emoji) !== -1;
      return h("button", {
        class: "reaction", part: pressed ? "reaction reaction-mine" : "reaction", type: "button",
        "aria-pressed": pressed ? "true" : "false", "data-key": "reaction:" + reaction.emoji,
        "aria-label": reaction.emoji + " " + reaction.count + (reaction.count === 1 ? " reaction" : " reactions"),
        onclick: () => this.toggleReaction(post.ref, reaction.emoji),
      }, [h("span", { "aria-hidden": "true", text: reaction.emoji }), h("span", { "aria-hidden": "true", text: String(reaction.count) })]);
    }));
  }

  // The current copies of a post (the feed's and the thread's): rendered
  // nodes outlive re-reads, so handlers look posts up by ref.
  copies(ref) {
    return [this.posts.get(ref)].concat(this.thread.filter((entry) => entry.ref === ref)).filter(Boolean);
  }

  // Toggles at once and settles with the server; a failure puts it back.
  async toggleReaction(ref, emoji) {
    const copies = this.copies(ref);
    if (!copies.length) return;
    const mine = (copies[0].reacted_by_me || []).indexOf(emoji) !== -1;
    const before = copies.map((post) => ({ reactions: post.reactions, reacted_by_me: post.reacted_by_me }));
    for (const post of copies) {
      post.reacted_by_me = mine ? (post.reacted_by_me || []).filter((value) => value !== emoji) : (post.reacted_by_me || []).concat(emoji);
      post.reactions = (post.reactions || []).map((reaction) => reaction.emoji === emoji
        ? { emoji: emoji, count: reaction.count + (mine ? -1 : 1) } : reaction);
    }
    this.rerender();
    try {
      await polynet.react(ref, emoji, !mine);
    } catch (error) {
      copies.forEach((post, index) => Object.assign(post, before[index]));
      this.rerender();
      if (error && error.code === "sign_in_required") this.fail(error);
    }
  }

  rerender() {
    if (this.status !== "ready") return;
    this.renderFeed({});
    if (this.threadRef) this.renderThread();
  }

  // Which control had focus, so a re-render can give it back.
  focusKey() {
    const active = this.root.activeElement;
    const message = active && active.closest && active.closest("[data-ref]");
    if (!message || !active.getAttribute("data-key")) return null;
    return { inThread: this.threadPanel.contains(active), ref: message.getAttribute("data-ref"), key: active.getAttribute("data-key") };
  }

  restoreFocus(focus) {
    if (!focus || (this.root.activeElement && this.root.activeElement.isConnected && this.root.activeElement.getAttribute("data-key"))) return;
    const scope = focus.inThread ? this.threadList : this.list;
    for (const message of scope.querySelectorAll("[data-ref]")) {
      if (message.getAttribute("data-ref") !== focus.ref) continue;
      for (const control of message.querySelectorAll("[data-key]")) {
        if (control.getAttribute("data-key") === focus.key) { control.focus(); return; }
      }
    }
  }

  renderTyping() {
    this.typing.textContent = typingText(this.typists.filter((person) => !person.thread_ref));
    this.threadTyping.textContent = this.threadRef
      ? typingText(this.typists.filter((person) => person.thread_ref === this.threadRef)) : "";
  }

  async openThread(ref) {
    const post = this.posts.get(ref);
    if (!post) return;
    this.threadRef = ref;
    this.thread = [Object.assign({}, post)];
    this.threadNodes = new Map();
    this.threadList.replaceChildren();
    this.threadStatus = "loading";
    this.threadPanel.hidden = false;
    this.frame.classList.add("threaded");
    this.renderThread();
    this.renderFeed({});
    this.renderTyping();
    this.threadTitle.focus();
    await this.loadThread();
  }

  async loadThread() {
    const ref = this.threadRef;
    const generation = this.generation;
    try {
      const entries = await polynet.thread(this.channel.slug, ref);
      if (ref !== this.threadRef || generation !== this.generation) return;
      this.thread = entries;
      this.threadStatus = "ready";
    } catch (error) {
      if (ref !== this.threadRef || generation !== this.generation) return;
      if (error && error.code === "sign_in_required") { this.fail(error); return; }
      this.threadStatus = "error";
    }
    this.renderThread();
  }

  renderThread() {
    const focus = this.focusKey();
    const quiet = !this.threadNodes.size;
    if (quiet) this.threadList.setAttribute("aria-busy", "true");
    const [root, ...replies] = this.thread;
    const items = [];
    if (root) items.push({ type: "message", key: root.ref, post: root, grouped: false });
    if (replies.length) items.push({ type: "replies", key: "replies:" + replies.length, label: replies.length + (replies.length === 1 ? " reply" : " replies") });
    for (const reply of replies) items.push({ type: "message", key: reply.ref, post: reply, grouped: false });
    const next = new Map();
    const nodes = items.map((item) => {
      const signature = this.signature(item);
      const old = this.threadNodes.get(item.key);
      const node = old && old.signature === signature ? old.node
        : item.type === "replies" ? h("li", { class: "divider", part: "thread-divider", role: "separator", text: item.label })
        : this.buildItem(item, true);
      next.set(item.key, { signature: signature, node: node });
      return node;
    });
    this.threadNodes = next;
    reconcile(this.threadList, nodes);
    this.threadStatusLine.hidden = this.threadStatus === "ready";
    this.threadStatusLine.replaceChildren(...(this.threadStatus === "error"
      ? ["Couldn't load the replies. ", h("button", { class: "quiet", part: "retry", type: "button", text: "Try again", onclick: () => this.loadThread() })]
      : [this.threadStatus === "loading" ? "Loading replies…" : ""]));
    this.restoreFocus(focus);
    if (quiet) requestAnimationFrame(() => this.threadList.removeAttribute("aria-busy"));
  }

  hideThread() {
    this.threadRef = null;
    this.thread = [];
    this.threadPanel.hidden = true;
    this.frame.classList.remove("threaded");
    this.threadTyping.textContent = "";
  }

  closeThread(returnFocus) {
    if (!this.threadRef) return;
    const ref = this.threadRef;
    this.hideThread();
    if (this.status !== "ready") return;
    this.renderFeed({});
    if (!returnFocus) return;
    for (const message of this.list.querySelectorAll("[data-ref]")) {
      if (message.getAttribute("data-ref") === ref) {
        const opener = message.querySelector("[data-key=replies]");
        if (opener) opener.focus();
      }
    }
  }
}

if (!customElements.get("polynet-chat")) customElements.define("polynet-chat", PolynetChat);
`;
