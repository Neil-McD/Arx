// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// <polynet-chat>, served at /__polynet/blocks/chat.js: a channel's
// conversation, live. It follows the page's channel (?channel=<slug> and the
// "polynet:channel" event) unless channel="<slug>" pins one. The feed, threads,
// reactions and the member's own edits and deletes live here; the message boxes
// come from composer.js, and this block sends what they hand it (optimistic,
// with retry). Authors and @-tagged members open the profile panel. Kept as
// text (a String.raw literal: no backticks or template placeholders inside)
// so the edge serves exactly what is reviewed.
export const CHAT_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block: <polynet-chat>. ui.js loads it on pages that place the tag.
import polynet from "/__polynet/sdk.js";
import {
  BASE_STYLE, h, avatar, authorName, clockTime, fullTime, timeLabel, fileSize, typingText,
  feedItems, reconcile, channelFromUrl, pickChannel, readChannels,
  readMembers, memberHref, openProfile, plainClick, hasMention, linkMentions,
} from "/__polynet/blocks/kit.js";
import { Composer, COMPOSER_STYLE, autosize, enterSends } from "/__polynet/blocks/composer.js";

// The server's limit for a message (communityInteractions.ts).
const MAX_TEXT_CHARS = 8000;
const STYLE = BASE_STYLE + "\n" + COMPOSER_STYLE + "\n" + [
  // A chat needs a height to scroll in; the site sets its own on the element.
  ":host { display: block; height: 70vh; min-height: 320px; container-type: inline-size; }",
  ".chat { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); height: 100%; }",
  ".main { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; }",
  ".stage { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }",
  ".header { padding: 0 .5em .625em; border-bottom: 1px solid var(--pn-border); font-weight: 600; }",
  ".hash { color: var(--pn-muted); font-weight: 400; margin-right: .1em; }",
  ".feed { position: relative; flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 0 .5em; }",
  ".history { color: var(--pn-muted); font-size: .8125em; padding: 1.25em .625em .25em; }",
  ".history:empty { padding: 0; }",
  "ol { list-style: none; margin: 0; padding: 0; }",
  ".message { display: grid; grid-template-columns: 2.25em minmax(0, 1fr); column-gap: .75em; padding: .375em .625em .25em; margin-top: .5em; border-radius: calc(var(--pn-radius) * .6); }",
  ".message.grouped { margin-top: 0; padding-top: .0625em; }",
  ".message { position: relative; }",
  ".message.pending { opacity: .6; }",
  ".message.failed .body { color: var(--pn-muted); }",
  ".status-line { margin-top: .25em; font-size: .8125em; font-weight: 600; }",
  ".sending { display: flex; flex-wrap: wrap; gap: .375em; margin-top: .375em; }",
  ".sending span { padding: .25em .625em; border: 1px dashed var(--pn-border); border-radius: calc(var(--pn-radius) * .6); font-size: .8125em; }",
  "@media (hover: hover) { .message:hover { background: var(--pn-tint); } }",
  ".message:focus-within { background: var(--pn-tint); }",
  ".gutter { padding-top: .125em; }",
  ".gutter .time { display: block; opacity: 0; font-size: .6875em; text-align: right; line-height: 2.2; white-space: nowrap; }",
  ".message.grouped:hover .gutter .time, .message.grouped:focus-within .gutter .time { opacity: 1; }",
  ".head { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: .5em; line-height: 1.35; }",
  ".author { font-weight: 600; }",
  // People open their profile: the name is the control; the picture is a mouse shortcut to it.
  "button.author { background: none; border: 0; padding: 0; margin: 0; text-align: left; line-height: inherit; }",
  "@media (hover: hover) { button.author:hover { text-decoration: underline; text-underline-offset: .2em; } }",
  ".face { display: block; cursor: pointer; }",
  ".body a.mention { text-decoration: none; font-weight: 600; color: var(--pn-accent); border-radius: 4px; padding: 0 .125em;",
  "  background: color-mix(in srgb, var(--pn-accent) 10%, transparent); }",
  "@media (hover: hover) { .body a.mention:hover { text-decoration: underline; } }",
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
  ".jump { position: absolute; left: 50%; bottom: .75em; transform: translateX(-50%); z-index: 1; border: 1px solid var(--pn-border); border-radius: 999px;",
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
  // The member's own controls on a message: on hover or focus with a mouse, behind "•••" on touch.
  ".act { background: none; border: 0; border-radius: 999px; padding: .2em .6em; font-size: .75em; font-weight: 600; line-height: 1.6; color: var(--pn-muted); }",
  ".act[aria-expanded=true] { color: inherit; background: var(--pn-tint); }",
  ".more { display: none; }",
  "@media (hover: hover) {",
  "  .act:hover { color: inherit; background: var(--pn-tint); }",
  "  .tools { display: flex; gap: .125em; position: absolute; top: .125em; right: .375em; z-index: 1; padding: .125em; opacity: 0;",
  "    background: var(--pn-surface); color: var(--pn-surface-text); border: 1px solid var(--pn-border); border-radius: 999px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }",
  "  .message:hover .tools, .message:focus-within .tools { opacity: 1; }",
  "}",
  "@media (hover: none) {",
  "  .message:not(.pending):not(.failed) { padding-right: 2.75em; }",
  "  .tools { display: none; flex-wrap: wrap; gap: .25em; margin-top: .375em; }",
  "  .message.open .tools { display: flex; }",
  "  .more { display: block; position: absolute; top: 0; right: 0; width: 44px; height: 40px; border: 0; background: none; color: var(--pn-muted); font-size: .75em; letter-spacing: .1em; }",
  "  .act { min-height: 36px; padding: .4em .8em; border: 1px solid var(--pn-border); }",
  "}",
  ".picker { display: flex; flex-wrap: wrap; gap: .25em; margin-top: .375em; }",
  ".pick { border: 1px solid var(--pn-border); border-radius: 999px; background: none; padding: .0625em .5em; line-height: 1.6; }",
  ".pick[aria-pressed=true] { border-color: var(--pn-accent); background: color-mix(in srgb, var(--pn-accent) 12%, transparent); }",
  "@media (hover: hover) { .pick:hover { border-color: var(--pn-muted); } }",
  ".editor { margin-top: .25em; }",
  ".edit-input { display: block; width: 100%; max-height: 16em; overflow-y: auto; resize: none; margin: 0; padding: .5em .625em; font: inherit; line-height: 1.5;",
  "  color: inherit; background: none; border: 1px solid var(--pn-border); border-radius: calc(var(--pn-radius) * .6); }",
  ".edit-input:focus { outline: none; border-color: var(--pn-accent); }",
  ".edit-bar, .confirm { display: flex; flex-wrap: wrap; align-items: center; gap: .5em 1em; margin-top: .375em; font-size: .875em; }",
  ".edit-bar .primary, .confirm .primary { min-height: 2em; padding: .25em .9em; }",
  ".message-error { margin-top: .25em; font-size: .8125em; font-weight: 600; }",
  "@container (min-width: 720px) {",
  "  .chat.threaded { grid-template-columns: minmax(0, 1fr) minmax(16em, 40%); }",
  "  .thread { position: static; background: none; color: inherit; border-left: 1px solid var(--pn-border); margin-left: .75em; padding-left: .25em; }",
  "}",
  "@media (pointer: coarse) {",
  "  .reaction { min-height: 36px; } .reaction::after { content: ''; position: absolute; inset: -4px -2px; }",
  "  .replies, .jump, .close { min-height: 44px; } .close { width: 44px; }",
  "  .pick { min-width: 44px; min-height: 40px; } .edit-input { font-size: max(1em, 16px); }",
  "}",
  "@media (prefers-reduced-motion: no-preference) { .jump { animation: pn-rise .16s ease-out; } }",
  "@keyframes pn-rise { from { opacity: 0; transform: translate(-50%, 4px); } to { opacity: 1; transform: translate(-50%, 0); } }",
].join("\n");

const PAGE = 50;
const NEAR_BOTTOM = 48;
const NEAR_TOP = 160;
const READ_DELAY_MS = 600;
// "Add reaction" offers these; anything else members add elsewhere still shows and toggles.
const QUICK_REACTIONS = [["👍", "thumbs up"], ["❤️", "heart"], ["😂", "laughing"], ["🎉", "celebrate"], ["🔥", "fire"], ["👀", "eyes"], ["🙏", "thank you"], ["✅", "done"]];
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
    // What the member sent and the server hasn't shown yet, in every channel.
    this.outbox = [];
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
    // Deletes waiting on the server (ref -> when it confirmed), and what's open on which message.
    this.removing = new Map();
    this.editing = null;
    this.confirming = null;
    this.picking = null;
    this.menu = null;
    this.actionError = null;
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
    this.composer = new Composer({ id: this.uid + "-composer", slot: true, onSend: (payload) => this.send(payload), onDiscard: (scope) => this.discard(scope) });
    this.replyComposer = new Composer({ id: this.uid + "-reply", onSend: (payload) => this.send(payload), onDiscard: (scope) => this.discard(scope) });
    this.threadFooter = h("div", { class: "thread-footer", part: "thread-footer" }, [this.replyComposer.element]);
    this.threadPanel = h("aside", { class: "thread", part: "thread-panel", id: this.uid + "-panel", "aria-labelledby": this.uid + "-thread", hidden: true }, [
      h("div", { class: "thread-head", part: "thread-header" }, [
        this.threadTitle,
        h("button", { class: "close", part: "thread-close", type: "button", "aria-label": "Close thread", onclick: () => this.closeThread(true) }),
      ]),
      h("div", { class: "thread-body" }, [this.threadList, this.threadStatusLine]),
      this.threadTyping,
      this.threadFooter,
    ]);
    this.footer = h("div", { class: "footer", part: "footer" }, [this.composer.element]);
    this.header = h("div", { class: "header", part: "header" }, [h("slot", { name: "header" }, [this.headerTitle])]);
    this.main = h("div", { class: "main" }, [
      this.header,
      this.state, h("div", { class: "stage" }, [this.feed, this.jump]), this.typing, this.footer,
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
    // Says the member stopped typing.
    this.composer.show(null);
    this.replyComposer.show(null);
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
    this.footer.hidden = !ready;
    if (!ready) this.composer.show(null);
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
    // A failed members read is tried again with the next channel.
    if (!this.handles) this.handlesRead = false;
    try {
      const session = await polynet.session();
      if (generation !== this.generation) return;
      this.communityName = session.community_name;
      this.communitySlug = session.community;
      this.me = session.member;
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
      const startedAt = Date.now();
      const page = await polynet.feed(channel.slug, { limit: PAGE });
      if (generation !== this.generation) return;
      this.cursor = page.cursor || null;
      this.merge(page, true);
      this.settle(startedAt, null, page);
      // "New" marks what was unread on arrival; posts that come in while the
      // member watches don't get one.
      if (!page.some((post) => !post.by_me && at(post) > (this.seenThroughAt || 0))) this.seenThroughAt = null;
      this.setStatus("ready");
      this.composer.show(this.composerScope(null));
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
      const startedAt = Date.now();
      const page = await polynet.feed(this.channel.slug, { limit: PAGE });
      if (generation !== this.generation) return;
      const before = new Map(Array.from(this.posts.values(), (post) => [post.ref, post.reply_count]));
      const stick = this.pinned;
      this.merge(page, true);
      this.settle(startedAt, null, page);
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
  // history outside it stays, as long as the page connects to it.
  merge(page, newest) {
    // An empty page that still has a cursor read nothing it can vouch for.
    if (newest && !page.length && page.cursor) return;
    if (newest && !page.cursor) {
      // The page reaches the channel's start: it is the whole channel.
      this.posts.clear();
      this.cursor = null;
    } else if (newest) {
      const oldest = at(page[0]);
      let newestCached = -Infinity;
      for (const post of this.posts.values()) newestCached = Math.max(newestCached, at(post));
      if (oldest > newestCached) {
        // More arrived than one page holds (a sleeping tab): what lies between
        // wasn't read, so start over from this page and page back from it.
        this.posts.clear();
        this.cursor = page.cursor;
      } else {
        const fresh = new Set(page.map((post) => post.ref));
        for (const [ref, post] of this.posts) if (at(post) >= oldest && !fresh.has(ref)) this.posts.delete(ref);
      }
    }
    for (const post of page) this.posts.set(post.ref, post);
  }

  sorted() {
    return Array.from(this.posts.values()).filter((post) => !this.removing.has(post.ref))
      .sort((a, b) => at(a) - at(b) || (a.ref < b.ref ? -1 : 1));
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
      // Still looking? The member may have scrolled up or switched tabs meanwhile.
      if (this.status !== "ready" || document.visibilityState !== "visible" || !this.atBottom()) return;
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
    // What the member just sent follows the server's posts until a re-read shows it.
    const posts = this.sorted();
    this.wantHandles(posts);
    const items = feedItems(posts.concat(this.outgoing(null)), { seenThroughAt: this.seenThroughAt });
    const next = new Map();
    const nodes = items.map((item) => {
      const signature = this.signature(item, false);
      const old = this.nodes.get(item.key);
      const node = old && old.signature === signature ? old.node : this.buildItem(item, false);
      next.set(item.key, { signature: signature, node: node });
      return node;
    });
    this.nodes = next;
    reconcile(this.list, nodes);
    this.empty.hidden = items.length > 0;
    this.renderHistory();
    this.restoreFocus(focus);
    if (options.quiet) requestAnimationFrame(() => this.feed.removeAttribute("aria-busy"));
  }

  signature(item, inThread) {
    if (item.type !== "message") return item.type + ":" + item.label;
    const post = item.post;
    return JSON.stringify([item.grouped, post.text, post.edited_at, post.reactions, post.reacted_by_me, post.reply_count,
      post.attachments, post.actor, post.outgoing, post.files, this.threadRef === post.ref, this.canReply(), this.ui(post.ref, inThread),
      !!this.handles && hasMention(post.text)]);
  }

  // Which of the member's controls are open on a message (in the feed, or in the thread).
  ui(ref, inThread) {
    const here = (state) => !!state && state.ref === ref && state.inThread === inThread;
    return {
      editing: here(this.editing), editError: here(this.editing) ? this.editing.error : null,
      confirming: here(this.confirming), picking: here(this.picking), menu: here(this.menu),
      error: here(this.actionError) ? this.actionError.text : null,
    };
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
    const ui = this.ui(post.ref, inThread);
    const parts = ["message"];
    const classes = ["message"];
    if (grouped) { parts.push("message-grouped"); classes.push("grouped"); }
    if (agent) { parts.push("message-agent"); classes.push("agent"); }
    if (post.by_me) parts.push("message-mine");
    if (post.outgoing === "failed") { parts.push("message-failed"); classes.push("failed"); }
    else if (post.outgoing) { parts.push("message-pending"); classes.push("pending"); }
    if (ui.menu) classes.push("open");
    let body;
    if (ui.editing) {
      body = this.buildEditor();
    } else {
      body = h("div", { class: "body", part: "message-body" }, [this.renderText(post, inThread)]);
      if (post.edited_at) {
        const edited = h("span", { class: "edited", part: "message-edited", text: " (edited)" });
        const last = body.lastElementChild;
        if (last && last.tagName === "P") last.append(edited);
        else body.append(edited);
      }
    }
    const person = this.personOf(post);
    const profile = person ? () => this.showProfile(person, post.ref, inThread, "author") : null;
    return h("li", {
      class: classes.join(" "), part: parts.join(" "), "data-ref": post.ref,
      onkeydown: (event) => { if (event.key === "Escape" && this.dismiss(post.ref, inThread)) { event.preventDefault(); event.stopPropagation(); } },
    }, [
      h("div", { class: "gutter" }, [grouped ? time
        : profile ? h("span", { class: "face", "aria-hidden": "true", onclick: profile }, [avatar(post.actor, name)]) : avatar(post.actor, name)]),
      h("div", { class: "content" }, [
        grouped ? h("span", { class: "sr", text: name + ": " })
          : h("div", { class: "head" }, [profile
            ? h("button", { class: "author", part: "message-author", type: "button", "data-key": "author", "aria-label": name + ", profile", text: name, onclick: profile })
            : h("span", { class: "author", part: "message-author", text: name }), time]),
        post.outgoing === "pending" ? h("span", { class: "sr", text: "Sending: " }) : null,
        body,
        post.outgoing ? this.buildSending(post) : this.buildAttachments(post),
        this.buildReactions(post),
        !inThread && post.reply_count > 0 ? h("button", {
          class: "replies", part: "replies", type: "button", "data-key": "replies",
          "aria-expanded": this.threadRef === post.ref ? "true" : "false", "aria-controls": this.uid + "-panel",
          text: post.reply_count + (post.reply_count === 1 ? " reply" : " replies"),
          onclick: () => this.openThread(post.ref),
        }) : null,
        post.outgoing === "failed" ? h("div", { class: "status-line", part: "message-status", text: "Not sent. It's back in the message box." }) : null,
        ui.picking ? this.buildPicker(post, inThread) : null,
        ui.confirming ? this.buildConfirm(post, inThread) : null,
        ui.error ? h("div", { class: "message-error", part: "message-error", role: "alert", text: ui.error }) : null,
        post.outgoing || ui.editing ? null : this.buildTools(post, inThread, ui),
      ]),
    ]);
  }

  // Members with a handle open their profile; the agent and pending copies don't.
  personOf(post) {
    const actor = post.actor || {};
    if (post.outgoing || actor.type === "community_agent" || !actor.handle) return null;
    return { handle: actor.handle, name: authorName(actor, this.communityName), avatar_url: actor.avatar_url || null };
  }

  // The panel gives focus back to the control that opened it, found again after re-renders.
  showProfile(person, ref, inThread, key) {
    const scope = inThread ? this.threadList : this.list;
    openProfile(person, () => {
      for (const message of scope.querySelectorAll("[data-ref]")) {
        if (message.getAttribute("data-ref") !== ref) continue;
        for (const control of message.querySelectorAll("[data-key]")) if (control.getAttribute("data-key") === key) return control;
      }
      return null;
    }).catch(() => {});
  }

  // Post text as markdown; tags of this community's members link to their profile.
  renderText(post, inThread) {
    const content = polynet.markdown(post.text);
    if (!this.handles || !hasMention(post.text)) return content;
    return linkMentions(content, (handle) => this.handles.has(handle), (handle) => {
      const key = "mention:" + handle.toLowerCase();
      return h("a", {
        class: "mention", part: "mention", href: memberHref(handle.toLowerCase()), "data-key": key, text: "@" + handle,
        onclick: (event) => {
          if (!plainClick(event)) return;
          event.preventDefault();
          this.showProfile({ handle: handle }, post.ref, inThread, key);
        },
      });
    });
  }

  // Members are read only once a post tags someone; until then tags stay text.
  wantHandles(posts) {
    if (this.handles || this.handlesRead || !posts.some((post) => hasMention(post.text))) return;
    this.handlesRead = true;
    readMembers(polynet).then((members) => {
      this.handles = new Set(members.filter((member) => member.handle).map((member) => member.handle.toLowerCase()));
      this.rerender();
    }, () => {});
  }

  // Files still on their way: names only, until the server's copy replaces them.
  buildSending(post) {
    if (!post.files || !post.files.length) return null;
    return h("div", { class: "sending", part: "attachments" }, post.files.map((file) => h("span", { text: file.name || "Attachment" })));
  }

  // React for everyone; Reply on a post in the feed (where the member can
  // reply); Edit and Delete on the member's own words only.
  buildTools(post, inThread, ui) {
    const ref = post.ref;
    const act = (key, label, onclick, extra) => h("button", Object.assign({
      class: "act", part: "message-action message-action-" + key, type: "button", "data-key": "act:" + key, text: label, onclick: onclick,
    }, extra || {}));
    const buttons = [act("react", "React", () => this.toggleUi("picking", ref, inThread), {
      part: "message-action reaction-add", "aria-expanded": ui.picking ? "true" : "false",
    })];
    if (!inThread && this.canReply()) buttons.push(act("reply", "Reply", () => this.openThread(ref, true)));
    if (post.by_me && post.can_edit) buttons.push(act("edit", "Edit", () => this.startEdit(ref, inThread)));
    if (post.by_me) buttons.push(act("delete", "Delete", () => this.toggleUi("confirming", ref, inThread), { "aria-expanded": ui.confirming ? "true" : "false" }));
    const tools = document.createDocumentFragment();
    tools.append(
      h("button", {
        class: "more", part: "message-more", type: "button", "data-key": "more", "aria-label": "Message actions",
        "aria-expanded": ui.menu ? "true" : "false", text: "•••", onclick: () => this.toggleUi("menu", ref, inThread),
      }),
      h("div", { class: "tools", part: "message-actions", role: "group", "aria-label": "Message actions" }, buttons),
    );
    return tools;
  }

  buildPicker(post, inThread) {
    const mine = post.reacted_by_me || [];
    return h("div", { class: "picker", part: "reaction-picker", role: "group", "aria-label": "Add a reaction" }, QUICK_REACTIONS.map((entry) => h("button", {
      class: "pick", part: "reaction-option", type: "button", "data-key": "pick:" + entry[0], title: entry[1],
      "aria-label": entry[1], "aria-pressed": mine.indexOf(entry[0]) !== -1 ? "true" : "false",
      onclick: () => {
        this.picking = null;
        this.toggleReaction(post.ref, entry[0]);
        this.focusControl(post.ref, inThread, "act:react");
      },
    }, [entry[0]])));
  }

  buildConfirm(post, inThread) {
    return h("div", { class: "confirm", part: "delete-confirm", role: "group", "aria-label": "Delete this message?" }, [
      h("span", { text: "Delete this message?" }),
      h("button", { class: "primary", part: "delete-confirm-yes", type: "button", "data-key": "confirm:yes", text: "Delete", onclick: () => this.removePost(post.ref, inThread) }),
      h("button", { class: "quiet", part: "delete-confirm-no", type: "button", "data-key": "confirm:no", text: "Cancel", onclick: () => this.dismiss(post.ref, inThread) }),
    ]);
  }

  buildEditor() {
    const editing = this.editing;
    const input = h("textarea", {
      class: "edit-input", part: "edit-input", rows: 1, "data-key": "edit", "aria-label": "Edit message",
      oninput: () => { editing.text = input.value; autosize(input); },
      onkeydown: (event) => { if (enterSends(event)) { event.preventDefault(); this.saveEdit(); } },
    });
    input.value = editing.text;
    requestAnimationFrame(() => autosize(input));
    return h("div", { class: "editor", part: "editor" }, [input, h("div", { class: "edit-bar" }, [
      h("button", { class: "primary", part: "edit-save", type: "button", "data-key": "edit:save", text: "Save", onclick: () => this.saveEdit() }),
      h("button", { class: "quiet", part: "edit-cancel", type: "button", "data-key": "edit:cancel", text: "Cancel", onclick: () => this.dismiss(editing.ref, editing.inThread) }),
      editing.error ? h("span", { part: "edit-error", role: "alert", text: editing.error }) : null,
    ])]);
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
      const known = (post.reactions || []).some((reaction) => reaction.emoji === emoji);
      post.reactions = known ? post.reactions.map((reaction) => reaction.emoji === emoji
        ? { emoji: emoji, count: reaction.count + (mine ? -1 : 1) } : reaction)
        : (post.reactions || []).concat({ emoji: emoji, count: 1 });
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

  // Opens a post's thread; replyNow puts the member straight in its reply box.
  async openThread(ref, replyNow) {
    const post = this.posts.get(ref);
    if (!post) return;
    const fresh = this.threadRef !== ref;
    if (fresh) {
      if (this.threadRef) this.replyComposer.show(null);
      this.threadRef = ref;
      this.thread = [Object.assign({}, post)];
      this.threadNodes = new Map();
      this.threadList.replaceChildren();
      this.threadStatus = "loading";
      this.threadPanel.hidden = false;
      this.frame.classList.add("threaded");
      this.replyComposer.show(this.composerScope(ref));
      this.renderThread();
      this.renderFeed({});
      this.renderTyping();
    }
    if (replyNow && this.canReply()) this.replyComposer.focus();
    else this.threadTitle.focus();
    if (fresh) await this.loadThread();
  }

  async loadThread() {
    const ref = this.threadRef;
    const generation = this.generation;
    try {
      const startedAt = Date.now();
      const entries = await polynet.thread(this.channel.slug, ref);
      if (ref !== this.threadRef || generation !== this.generation) return;
      this.thread = entries;
      this.threadStatus = "ready";
      this.settle(startedAt, ref, entries);
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
    this.wantHandles(this.thread);
    const [root, ...replies] = this.thread.filter((post) => !this.removing.has(post.ref)).concat(this.outgoing(this.threadRef));
    const items = [];
    if (root) items.push({ type: "message", key: root.ref, post: root, grouped: false });
    if (replies.length) items.push({ type: "replies", key: "replies:" + replies.length, label: replies.length + (replies.length === 1 ? " reply" : " replies") });
    for (const reply of replies) items.push({ type: "message", key: reply.ref, post: reply, grouped: false });
    const next = new Map();
    const nodes = items.map((item) => {
      const signature = this.signature(item, true);
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
    this.replyComposer.show(null);
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

  // Sending. Fails closed: no capability, no box.
  canReply() {
    const channel = this.channel;
    return !!channel && (channel.canReply === true || (channel.canReply === undefined && channel.canPost === true));
  }

  composerScope(thread) {
    const channel = this.channel;
    return {
      community: this.communitySlug || "", channel: channel.slug, channelName: channel.name || channel.slug, thread: thread || null,
      canWrite: thread ? this.canReply() : channel.canPost === true, agentName: this.communityName || null, me: this.me || null,
    };
  }

  // The member as their own posts show them, so a pending post groups with the ones before it.
  myActor() {
    const mine = Array.from(this.posts.values()).concat(this.thread).reverse()
      .find((post) => post.by_me && post.actor && post.actor.type === "human");
    if (mine) return mine.actor;
    const me = this.me || {};
    return { type: "human", display_name: me.name || null, handle: me.handle || null, avatar_url: me.avatar_url || null, user_id: null };
  }

  // The outbox as posts, for the channel (thread null) or a thread.
  outgoing(thread) {
    const slug = this.channel && this.channel.slug;
    const shown = thread ? new Set(this.thread.map((post) => post.ref)) : this.posts;
    const items = this.outbox.filter((item) => item.channel === slug && item.thread === thread && !(item.ref && shown.has(item.ref)));
    if (!items.length) return [];
    const actor = this.myActor();
    return items.map((item) => ({
      ref: "pending:" + item.key, outgoing: item.state === "failed" ? "failed" : "pending", text: item.text, files: item.files,
      actor: actor, created_at: new Date(item.at).toISOString(), by_me: true, can_edit: false,
      reactions: [], reacted_by_me: [], reply_count: 0, attachments: [], edited_at: null,
    }));
  }

  // A read that started after the server confirmed a send (or a delete)
  // shows the truth: the pending copy (or the hiding) can go, once the read
  // covers it. A read covers a sent message when it holds its ref. A thread
  // read without it covers it only when it is the whole thread (then the reply
  // was deleted); a long thread's partial read keeps the pending copy rather
  // than lose the reply. The channel's read is its newest page, which holds
  // anything as new as a confirmed send unless a page of newer posts has
  // followed it, so it covers what it doesn't hold.
  settle(startedAt, thread, read) {
    const slug = this.channel && this.channel.slug;
    const refs = new Set(read.map((post) => post.ref));
    const covers = (item) => !item.ref || refs.has(item.ref) || !thread || read.complete !== false;
    this.outbox = this.outbox.filter((item) => !(item.state === "sent" && item.channel === slug && item.thread === thread
      && item.sentAt <= startedAt && covers(item)));
    if (!thread) for (const [ref, entry] of this.removing) if (entry.at <= startedAt) this.removing.delete(ref);
  }

  async send(payload) {
    const scope = payload.scope;
    const item = {
      key: payload.key, channel: scope.channel, thread: scope.thread, text: payload.text, state: "pending", at: Date.now(), ref: null,
      files: payload.files.map((entry) => ({ name: entry.file.name, size: entry.file.size })),
    };
    // A retry replaces what failed in the same place.
    this.outbox = this.outbox.filter((other) => other.key !== item.key
      && !(other.state === "failed" && other.channel === item.channel && other.thread === item.thread));
    this.outbox.push(item);
    const here = () => this.status === "ready" && this.channel && this.channel.slug === item.channel;
    if (here()) {
      this.rerender();
      if (!item.thread) this.toBottom(false);
    }
    const composer = item.thread ? this.replyComposer : this.composer;
    try {
      const result = await polynet.post(item.channel, payload.text, {
        files: payload.files.map((entry) => entry.file), replyTo: item.thread || undefined,
        mentions: payload.mentions, askAgent: payload.askAgent, key: item.key,
      });
      item.state = "sent";
      item.ref = (result && result.ref) || null;
      item.sentAt = Date.now();
      composer.sent(payload);
      if (here()) this.refresh();
    } catch (error) {
      item.state = "failed";
      composer.failed(payload, error);
      if (error && error.code === "sign_in_required") { this.fail(error); return; }
      if (here()) this.rerender();
    }
  }

  // The member emptied a box that held a failed message: it's no longer pending anywhere.
  discard(scope) {
    this.outbox = this.outbox.filter((item) => !(item.state === "failed" && item.channel === scope.channel && item.thread === scope.thread));
    this.rerender();
  }

  // One control open per kind; opening React closes Delete's question and back.
  toggleUi(kind, ref, inThread) {
    const open = !this.ui(ref, inThread)[kind];
    if (kind !== "menu") { this.picking = null; this.confirming = null; }
    else if (!open) { this.picking = null; this.confirming = null; }
    this.actionError = null;
    this[kind] = open ? { ref: ref, inThread: inThread } : null;
    this.rerender();
    if (kind === "picking" && open) this.focusControl(ref, inThread, "pick:" + QUICK_REACTIONS[0][0]);
    else if (kind === "confirming" && open) this.focusControl(ref, inThread, "confirm:no");
    else if (kind === "menu") this.focusControl(ref, inThread, "more");
  }

  // Esc and Cancel: closes what's open on a message and returns focus to its control.
  dismiss(ref, inThread) {
    const ui = this.ui(ref, inThread);
    let key = null;
    if (ui.editing) { this.editing = null; key = "act:edit"; }
    else if (ui.confirming) { this.confirming = null; key = "act:delete"; }
    else if (ui.picking) { this.picking = null; key = "act:react"; }
    else if (ui.menu) { this.menu = null; key = "more"; }
    if (!key) return false;
    this.rerender();
    this.focusControl(ref, inThread, key);
    return true;
  }

  focusControl(ref, inThread, key) {
    const scope = inThread ? this.threadList : this.list;
    for (const message of scope.querySelectorAll("[data-ref]")) {
      if (message.getAttribute("data-ref") !== ref) continue;
      for (const control of message.querySelectorAll("[data-key]")) {
        if (control.getAttribute("data-key") === key && control.getClientRects().length) { control.focus(); return; }
      }
    }
    // On touch the control may be folded away: keep focus in the conversation.
    (inThread ? this.threadTitle : this.feed).focus();
  }

  startEdit(ref, inThread) {
    const post = this.copies(ref)[0];
    if (!post || !post.can_edit) return;
    this.editing = { ref: ref, inThread: inThread, text: post.text, error: null };
    this.picking = null;
    this.confirming = null;
    this.actionError = null;
    this.rerender();
    this.focusControl(ref, inThread, "edit");
    const input = this.root.activeElement;
    if (input && input.tagName === "TEXTAREA") { autosize(input); input.setSelectionRange(input.value.length, input.value.length); }
  }

  // Saves at once on screen and settles with the server; a failure reopens the editor with the text.
  async saveEdit() {
    const editing = this.editing;
    if (!editing) return;
    const copies = this.copies(editing.ref);
    const text = editing.text.trim();
    if (!copies.length) { this.editing = null; this.rerender(); return; }
    if (!text) {
      this.editing = Object.assign({}, editing, { error: "A message can't be empty. Delete it instead." });
      this.rerender();
      this.focusControl(editing.ref, editing.inThread, "edit");
      return;
    }
    if (text.length > MAX_TEXT_CHARS) {
      // Longer would be cut short on the server; keep the editor open and say by how much.
      this.editing = Object.assign({}, editing, { error: "Messages can be up to " + MAX_TEXT_CHARS.toLocaleString("en-US") + " characters. Trim " + (text.length - MAX_TEXT_CHARS).toLocaleString("en-US") + " to save." });
      this.rerender();
      this.focusControl(editing.ref, editing.inThread, "edit");
      return;
    }
    if (text === copies[0].text) { this.dismiss(editing.ref, editing.inThread); return; }
    const before = copies.map((post) => ({ text: post.text, edited_at: post.edited_at }));
    for (const post of copies) { post.text = text; post.edited_at = new Date().toISOString(); }
    this.editing = null;
    this.rerender();
    this.focusControl(editing.ref, editing.inThread, "act:edit");
    try {
      await polynet.edit(copies[0], text);
    } catch (error) {
      copies.forEach((post, index) => Object.assign(post, before[index]));
      if (error && error.code === "sign_in_required") { this.fail(error); return; }
      this.editing = Object.assign({}, editing, { error: "Couldn't save your edit. Try again." });
      this.rerender();
      this.focusControl(editing.ref, editing.inThread, "edit");
    }
  }

  // Gone at once; back with a note if the server says no.
  async removePost(ref, inThread) {
    const post = this.copies(ref)[0];
    this.confirming = null;
    if (!post || !post.by_me) return;
    this.removing.set(ref, { at: Infinity });
    const generation = this.generation;
    if (this.threadRef === ref) this.closeThread(false);
    this.rerender();
    (inThread && this.threadRef ? this.threadTitle : this.feed).focus();
    try {
      await polynet.remove(post);
      if (generation !== this.generation) return;
      // Gone from the cache too: a post older than the newest page would
      // otherwise come back when the refresh drops its hiding.
      this.posts.delete(ref);
      this.removing.set(ref, { at: Date.now() });
      this.refresh();
    } catch (error) {
      if (generation !== this.generation) return;
      this.removing.delete(ref);
      if (error && error.code === "sign_in_required") { this.fail(error); return; }
      this.actionError = { ref: ref, inThread: inThread && this.threadRef ? true : false, text: "Couldn't delete it. Try again." };
      this.rerender();
    }
  }
}

if (!customElements.get("polynet-chat")) customElements.define("polynet-chat", PolynetChat);
`;
