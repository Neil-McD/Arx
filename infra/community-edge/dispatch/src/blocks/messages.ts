// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// The Messages page of <polynet-personal page="messages">, served at
// /__polynet/blocks/messages.js on a site's private twin only (the site itself
// answers 404); personal.js loads it at /messages, /messages/<conversation>
// and /messages/new?to=<handle>. The member's whole direct-message inbox, as
// Studio shows it, and each conversation: attachments, typing both ways, read
// state, mute and block. Every read and write goes to /__polynet/me/messages*,
// which answers only the twin's own session, and the backend runs Studio's own
// DM helpers, so every rule, rate limit, block and refusal is Studio's.
//
// Live: the page subscribes to communityLive:watchMessages on Polynet's live
// updates with the twin session's watch token. The backend answers only a
// private session's token, and only with versions (and whether the other
// person is typing): never a message, a name or an id. When a version moves,
// the page re-reads through its own origin. Without live updates it still
// re-reads whenever the member comes back to the tab.
//
// Kept as text (a String.raw literal: no backticks or template placeholders
// inside) so the edge serves exactly what is reviewed.

// Studio's wording for each refusal (WebDirectMessagesHost's
// friendlyDirectMessageSendError), plus the twin's own.
export const MESSAGES_TEXT: Record<string, string> = {
  dm_rate_limited: "You're sending messages too quickly. Give it a minute and try again.",
  dm_conversation_access_required: "You can't message this person right now.",
  dm_target_not_found: "That person is no longer available.",
  dm_message_payload_required: "Write a message or attach a file first.",
  dm_attachment_invalid: "One of the attachments couldn't be sent. Remove it and try again.",
  dm_attachment_type_not_supported: "One of the attachments couldn't be sent. Remove it and try again.",
  dm_attachment_too_large: "One of the attachments couldn't be sent. Remove it and try again.",
  dm_attachment_limit_exceeded: "One of the attachments couldn't be sent. Remove it and try again.",
  dm_attachment_total_too_large: "One of the attachments couldn't be sent. Remove it and try again.",
  dm_target_self: "That's you. Message someone else from their profile.",
  dm_message_too_long: "Messages can be up to 4,000 characters.",
  dm_conversation_not_found: "This conversation isn't available.",
  not_a_member: "You're no longer a member of this community.",
  request_too_large: "That's too long to send.",
};

export const MESSAGES_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block module: the Messages page of <polynet-personal page="messages">.
// Only on a site's private twin. Style it with ::part() on <polynet-personal>:
// messages, inbox, search, conversations, conversation, conversation-name,
// conversation-time, conversation-preview, unread, muted-mark, empty, thread,
// thread-header, back, peer, peer-link, mute, block, confirm, older, log, day,
// message (with message-mine or message-theirs, and message-pending), bubble,
// attachment, attachment-image, meta, seen, typing, composer, input, attach,
// attachments, chip, send, error, blocked-note, placeholder.
import { h, styled, avatar, dayKey, dayLabel, clockTime, timeLabel, fullTime, fileSize, reconcile, plainClick } from "/__polynet/blocks/kit.js";

const STYLE = [
  ".messages { container: pn-messages / inline-size; }",
  ".layout { display: grid; gap: 1.25em; align-items: start; }",
  ".layout[data-view=conversation] > .inbox, .layout[data-view=inbox] > .thread { display: none; }",
  ".inbox, .thread { display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--pn-border); border-radius: var(--pn-radius); }",
  ".inbox { padding: .75em; gap: .75em; }",
  ".search { font: inherit; color: inherit; background: var(--pn-surface); width: 100%; min-height: 2.5em; padding: .45em .75em;",
  "  border: 1px solid var(--pn-border); border-radius: 999px; }",
  ".list { list-style: none; margin: 0; padding: 0; display: grid; gap: .125em; }",
  ".conversation { display: grid; grid-template-columns: 2.5em minmax(0, 1fr) auto; gap: .1em .75em; align-items: center;",
  "  padding: .6em .65em; border-radius: calc(var(--pn-radius) * .7); text-decoration: none; }",
  ".conversation[aria-current=page] { background: var(--pn-tint); }",
  "@media (hover: hover) { .conversation:hover { background: var(--pn-tint); } }",
  ".conversation .face { grid-row: span 2; width: 2.5em; }",
  ".conversation .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  ".conversation[data-unread] .name, .conversation[data-unread] .preview { font-weight: 700; }",
  ".conversation .time { color: var(--pn-muted); font-size: .75em; white-space: nowrap; justify-self: end; }",
  ".conversation .preview { color: var(--pn-muted); font-size: .875em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  ".marks { display: flex; gap: .35em; align-items: center; justify-self: end; }",
  ".unread { min-width: 1.5em; padding: .05em .45em; border-radius: 999px; background: var(--pn-accent); color: var(--pn-on-accent); font-size: .75em; font-weight: 700; text-align: center; }",
  ".conversation[data-muted] .unread { background: var(--pn-border); color: inherit; }",
  ".muted-mark { color: var(--pn-muted); font-size: .75em; }",
  ".thread { height: min(78vh, 46em); min-height: 24em; }",
  ".thread-head { display: flex; align-items: center; gap: .75em; padding: .75em 1em; border-bottom: 1px solid var(--pn-border); flex-wrap: wrap; }",
  ".thread-head .face { width: 2.5em; flex: none; }",
  ".peer { flex: 1; min-width: 0; }",
  ".peer h2 { margin: 0; font-size: 1.0625em; line-height: 1.3; overflow-wrap: anywhere; }",
  ".peer a, .peer span { color: var(--pn-muted); font-size: .8125em; }",
  ".head-actions { display: flex; gap: .5em; flex-wrap: wrap; }",
  ".pill { background: none; color: inherit; border: 1px solid var(--pn-border); border-radius: 999px; padding: .35em .9em; font-weight: 600; min-height: 2.25em; }",
  ".pill[aria-pressed=true] { background: var(--pn-tint); }",
  ".danger { color: var(--pn-danger); }",
  ".confirm { display: grid; gap: .6em; margin: .75em 1em 0; padding: .85em 1em; border: 1px solid var(--pn-border); border-radius: var(--pn-radius); }",
  ".confirm p { margin: 0; }",
  ".row { display: flex; flex-wrap: wrap; gap: .5em 1em; align-items: center; }",
  ".solid { background: var(--pn-danger); color: #fff; border: 0; border-radius: 999px; padding: .45em 1.1em; font-weight: 600; min-height: 2.5em; }",
  ".scroll { flex: 1; overflow-y: auto; padding: .75em 1em; overscroll-behavior: contain; }",
  ".older { display: block; margin: 0 auto .75em; }",
  ".log { list-style: none; margin: 0; padding: 0; display: grid; gap: .35em; }",
  ".day { text-align: center; color: var(--pn-muted); font-size: .75em; margin: .75em 0 .25em; }",
  ".message { display: grid; justify-items: start; max-width: min(34em, 85%); }",
  ".message.mine { justify-self: end; justify-items: end; }",
  ".bubble { padding: .5em .8em; border-radius: calc(var(--pn-radius) * 1.2); background: var(--pn-tint); line-height: 1.45;",
  "  white-space: pre-wrap; overflow-wrap: anywhere; }",
  ".mine .bubble { background: var(--pn-accent); color: var(--pn-on-accent); }",
  ".mine .bubble a { color: inherit; }",
  ".pending .bubble { opacity: .7; }",
  ".files { display: grid; gap: .35em; margin-top: .35em; }",
  ".files:first-child { margin-top: 0; }",
  ".files img { display: block; max-width: min(18em, 100%); max-height: 18em; border-radius: calc(var(--pn-radius) * .7); }",
  ".file { display: inline-flex; gap: .5em; align-items: baseline; text-decoration: underline; text-underline-offset: .15em; }",
  ".file span { opacity: .75; font-size: .8125em; }",
  ".meta { color: var(--pn-muted); font-size: .6875em; margin: .15em .35em 0; display: flex; gap: .5em; align-items: center; }",
  ".meta .quiet { font-size: inherit; padding: 0; color: var(--pn-danger); }",
  ".seen { justify-self: end; color: var(--pn-muted); font-size: .6875em; margin-right: .35em; }",
  ".typing { min-height: 1.4em; margin: 0; padding: 0 1em; color: var(--pn-muted); font-size: .8125em; }",
  ".composer { display: grid; gap: .5em; padding: .75em 1em 1em; border-top: 1px solid var(--pn-border); }",
  ".compose-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .5em; align-items: end; }",
  ".input { font: inherit; color: inherit; background: var(--pn-surface); width: 100%; min-height: 2.6em; max-height: 10em; resize: none;",
  "  padding: .55em .8em; border: 1px solid var(--pn-border); border-radius: calc(var(--pn-radius) * 1.1); line-height: 1.4; }",
  ".input:focus-visible { outline: 2px solid var(--pn-accent); outline-offset: 1px; }",
  ".chips { display: flex; flex-wrap: wrap; gap: .4em; }",
  ".chip { display: inline-flex; align-items: center; gap: .4em; padding: .2em .35em .2em .7em; border: 1px solid var(--pn-border); border-radius: 999px; font-size: .8125em; max-width: 100%; }",
  ".chip .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 14em; }",
  ".chip[data-state=failed] { border-color: var(--pn-danger); color: var(--pn-danger); }",
  ".chip button { background: none; border: 0; padding: .1em .35em; min-height: 0; }",
  ".error { margin: 0; color: var(--pn-danger); font-size: .875em; }",
  ".note { margin: 0; padding: .85em 1em 1em; border-top: 1px solid var(--pn-border); color: var(--pn-muted); }",
  ".placeholder { margin: auto; padding: 2em; color: var(--pn-muted); text-align: center; }",
  ".back { align-self: center; }",
  "button:disabled { opacity: .6; cursor: progress; }",
  "@media (pointer: coarse) { .pill, .solid, .search, .chip button { min-height: 44px; } }",
  "@container pn-messages (min-width: 44em) {",
  "  .layout { grid-template-columns: minmax(15em, 21em) minmax(0, 1fr); }",
  "  .layout[data-view] > .inbox, .layout[data-view] > .thread { display: flex; }",
  "  .inbox { max-height: min(78vh, 46em); overflow-y: auto; }",
  "  .back { display: none; }",
  "}",
  ":host { --pn-danger: var(--polynet-danger, #c0392b); }",
].join("\n");

const TEXT = __POLYNET_MESSAGES_TEXT__;
function says(code, fallback) {
  return (code && TEXT[code]) || fallback;
}

const ID = /^[A-Za-z0-9]{20,40}$/;
const HANDLE = /^@?[A-Za-z0-9_-]{1,32}$/;
const MAX_TEXT = 4000;
// Studio's attachment rules (convex/directMessages.ts checks them again).
const MAX_FILES = 8;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const FILE_TYPES = ["application/json", "application/msword", "application/pdf", "application/rtf", "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/csv", "text/markdown", "text/plain"];
const FILE_ENDINGS = [".csv", ".doc", ".docx", ".json", ".md", ".pdf", ".ppt", ".pptx", ".rtf", ".txt", ".xls", ".xlsx"];
// Studio's typing lease: renewed every 2s while typing, gone 5s after the last renewal.
const TYPING_RENEW_MS = 2000;
const TYPING_IDLE_MS = 4000;
const NEAR_BOTTOM_PX = 96;

// GET for reads, a small JSON POST for writes. { status, body }; status 0 offline.
async function call(path, body) {
  try {
    const init = body === undefined ? { credentials: "same-origin" }
      : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const res = await fetch(path, init);
    const data = await res.json().catch(() => null);
    return { status: res.status, body: data && typeof data === "object" ? data : {} };
  } catch (error) {
    return { status: 0, body: {} };
  }
}
const ok = (res) => res.status === 200 && res.body.ok === true;

// Where this address is: the inbox, one conversation, or a new one with a handle.
function where() {
  const path = location.pathname.length > 1 ? location.pathname.replace(/\/$/, "") : location.pathname;
  const rest = path.indexOf("/messages/") === 0 ? path.slice("/messages/".length) : null;
  if (rest === "new") return { view: "new", handle: String(new URLSearchParams(location.search).get("to") || "").replace(/^@/, "") };
  if (rest && ID.test(rest)) return { view: "conversation", id: rest };
  return { view: "inbox" };
}

function personName(person) {
  return (person && (person.name || (person.handle ? "@" + person.handle : null))) || "Someone";
}

function messageKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function attachmentKind(file) {
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  if (IMAGE_TYPES.indexOf(type) !== -1) return "image";
  if (type.indexOf("image/") === 0) return null;
  if (FILE_TYPES.indexOf(type) !== -1 || FILE_ENDINGS.some((ending) => name.endsWith(ending))) return "file";
  return null;
}

// Text as text, with http(s) addresses as links (never any other scheme).
const URL_PATTERN = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;
function richText(text) {
  const nodes = [];
  let last = 0;
  for (const match of String(text || "").matchAll(URL_PATTERN)) {
    let url = null;
    try { url = new URL(match[0]); } catch (error) { url = null; }
    if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) continue;
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(h("a", { href: url.href, target: "_blank", rel: "noopener noreferrer nofollow", text: match[0] }));
    last = match.index + match[0].length;
  }
  if (last < String(text || "").length) nodes.push(String(text).slice(last));
  return nodes;
}

// Polynet's live updates, as the twin's own session sees them: versions only.
let liveClient = null;
let liveToken = null;
function loadConvex() {
  if (globalThis.convex) return Promise.resolve(globalThis.convex);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/__polynet/live.js";
    script.onload = () => resolve(globalThis.convex);
    script.onerror = () => reject(new Error("live_unavailable"));
    document.head.appendChild(script);
  });
}
async function watchMessages(live, conversation, onResult) {
  if (!live || typeof live.url !== "string" || typeof live.token !== "string") return null;
  let convex = null;
  try { convex = await loadConvex(); } catch (error) { convex = null; }
  if (!convex || typeof convex.ConvexClient !== "function") return null;
  if (!liveClient || liveToken !== live.token) {
    if (liveClient) liveClient.close();
    liveClient = new convex.ConvexClient(live.url);
    liveToken = live.token;
  }
  const args = conversation ? { token: live.token, conversation: conversation } : { token: live.token };
  return liveClient.onUpdate("communityLive:watchMessages", args, (result) => onResult(result && result.ok ? result : null));
}

class Messages {
  constructor(block, generation) {
    this.block = block;
    this.generation = generation;
    this.conversations = null;
    this.search = "";
    this.view = null;
    this.messages = [];
    this.pending = [];
    this.attachments = [];
    this.nodes = new Map();
    this.stops = [];
    this.typingSentAt = 0;
    this.readSent = 0;
    this.onPop = () => this.route();
    this.onVisible = () => {
      if (document.visibilityState !== "visible") return;
      this.loadInbox();
      if (this.view && this.view.view === "conversation") this.loadConversation(false);
    };
  }

  current() {
    return this.generation === this.block.generation;
  }

  async start() {
    const session = await call("/__polynet/auth/session");
    if (!this.current()) return;
    this.session = session.body || {};
    if (session.status === 200 && this.session.signed_in === false) return this.signedOut();
    this.build();
    window.addEventListener("popstate", this.onPop);
    document.addEventListener("visibilitychange", this.onVisible);
    this.block.teardown = () => this.stop();
    const stopInbox = await watchMessages(this.session.live, null, (result) => this.inboxSignal(result));
    if (!this.current()) { if (stopInbox) stopInbox(); return; }
    if (stopInbox) this.stops.push(stopInbox);
    await Promise.all([this.loadInbox(), this.route()]);
  }

  stop() {
    window.removeEventListener("popstate", this.onPop);
    document.removeEventListener("visibilitychange", this.onVisible);
    for (const stop of this.stops) stop();
    this.stops = [];
    this.stopConversationWatch();
    clearTimeout(this.typingTimer);
    clearTimeout(this.typistTimer);
    this.sendTyping(false);
  }

  build() {
    this.searchInput = h("input", { class: "search", part: "search", type: "search", placeholder: "Search by name", "aria-label": "Search conversations",
      autocomplete: "off", oninput: () => { this.search = this.searchInput.value.trim().toLowerCase(); this.renderInbox(); } });
    this.inboxStatus = h("p", { class: "error", role: "alert", hidden: true });
    this.list = h("ul", { class: "list", part: "conversations", role: "list", "aria-label": "Conversations" });
    this.empty = h("p", { class: "muted", part: "empty", hidden: true });
    this.inbox = h("section", { class: "inbox", part: "inbox", "aria-label": "Your conversations" }, [this.searchInput, this.inboxStatus, this.list, this.empty]);
    this.thread = h("section", { class: "thread", part: "thread", "aria-label": "Conversation" });
    this.layout = h("div", { class: "layout", "data-view": "inbox" }, [this.inbox, this.thread]);
    this.block.show("ready", [h("div", { class: "messages", part: "messages" }, [this.layout])]);
  }

  // The address decides what shows; the inbox stays beside it on a wide page.
  async route() {
    const next = where();
    const same = this.view && next.view === this.view.view && next.id === this.view.id && next.handle === this.view.handle;
    if (same) return;
    this.view = next;
    // Only navigation makes in-flight writes stale; re-reading the same thread doesn't.
    this.threadGen = (this.threadGen || 0) + 1;
    this.carryDraft = false;
    this.stopConversationWatch();
    this.sendTyping(false);
    this.conversation = null;
    this.messages = [];
    this.pending = [];
    this.attachments = [];
    this.nodes = new Map();
    this.readSent = 0;
    this.layout.setAttribute("data-view", next.view === "inbox" ? "inbox" : "conversation");
    this.renderInbox();
    if (next.view === "inbox") {
      this.thread.replaceChildren(h("p", { class: "placeholder", part: "placeholder", text: "Choose a conversation to read it here." }));
      return;
    }
    this.thread.replaceChildren(h("p", { class: "placeholder muted", role: "status", text: "Loading…" }));
    if (next.view === "new") return this.startNew(next.handle);
    await this.openConversation(next.id);
  }

  go(path, replace) {
    if (replace) history.replaceState(history.state, "", path);
    else history.pushState(history.state, "", path);
    return this.route();
  }

  // ---- The inbox

  inboxSignal(result) {
    if (!this.current()) return;
    if (!result || result.version !== this.inboxVersion) {
      this.inboxVersion = result ? result.version : undefined;
      this.loadInbox();
    }
  }

  async loadInbox() {
    const res = await call("/__polynet/me/messages");
    if (!this.current()) return;
    if (res.status === 401) return this.signedOut();
    if (res.status === 403 && res.body.code === "not_a_member") return this.notMember();
    if (!ok(res) || !Array.isArray(res.body.conversations)) {
      this.inboxStatus.textContent = "Couldn't load your messages. They'll show again when you come back.";
      this.inboxStatus.hidden = this.conversations !== null;
      if (this.conversations === null) this.conversations = [];
      return this.renderInbox();
    }
    this.inboxStatus.hidden = true;
    this.conversations = res.body.conversations;
    this.renderInbox();
  }

  // Signed out here (the session ended): nothing more to watch; the page's own sign-in.
  signedOut() {
    this.stop();
    this.block.signedOut("Sign in to see your messages.");
  }

  notMember() {
    this.stop();
    this.block.show("not-member", [h("div", { class: "state", part: "empty" }, [
      h("p", { text: TEXT.not_a_member }),
      h("a", { class: "quiet", href: "/communities", text: "Your communities" }),
    ])]);
  }

  renderInbox() {
    if (!this.list || this.conversations === null) return;
    const active = this.view && this.view.view === "conversation" ? this.view.id : null;
    const shown = this.conversations.filter((row) => {
      if (!this.search) return true;
      const peer = row.peer || {};
      return [peer.name, peer.handle].filter(Boolean).join(" ").toLowerCase().indexOf(this.search) !== -1;
    });
    this.list.replaceChildren(...shown.map((row) => this.inboxRow(row, row.id === active)));
    this.empty.hidden = shown.length > 0;
    this.empty.textContent = this.conversations.length
      ? "No conversations match."
      : "No messages yet. Message someone from their profile.";
  }

  inboxRow(row, current) {
    const name = personName(row.peer);
    const at = row.last_message && row.last_message.at ? new Date(row.last_message.at) : null;
    const marks = [];
    if (row.muted) marks.push(h("span", { class: "muted-mark", part: "muted-mark", text: "Muted" }));
    if (row.unread_count > 0) marks.push(h("span", { class: "unread", part: "unread", text: String(row.unread_count), "aria-label": row.unread_count + " unread" }));
    const href = "/messages/" + row.id;
    return h("li", {}, [h("a", {
      class: "conversation", part: "conversation", href: href, "aria-current": current ? "page" : null,
      "data-unread": row.unread_count > 0 ? "" : null, "data-muted": row.muted ? "" : null,
      onclick: (event) => { if (!plainClick(event)) return; event.preventDefault(); this.go(href); },
    }, [
      h("span", { class: "face" }, [avatar(row.peer || {}, name)]),
      h("span", { class: "name", part: "conversation-name", text: name }),
      at && !isNaN(at) ? h("time", { class: "time", part: "conversation-time", datetime: at.toISOString(), title: fullTime(at), text: timeLabel(at) }) : h("span"),
      h("span", { class: "preview", part: "conversation-preview", text: row.last_message ? row.last_message.preview : (row.blocked ? "Blocked" : "No messages yet") }),
      h("span", { class: "marks" }, marks),
    ])]);
  }

  // ---- One conversation

  async startNew(handle) {
    if (!HANDLE.test(handle)) return this.threadProblem("Message someone from their profile to start a conversation.");
    const res = await call("/__polynet/me/messages/start?to=" + encodeURIComponent(handle));
    if (!this.current() || !this.view || this.view.handle !== handle) return;
    if (res.status === 401) return this.signedOut();
    if (res.status === 403 && res.body.code === "not_a_member") return this.notMember();
    if (!ok(res)) return this.threadProblem(says(res.body.code, "Couldn't start this conversation. Try again."));
    if (res.body.conversation_id) return this.go("/messages/" + res.body.conversation_id, true);
    // Nothing exists until the first message: who it's to, and a box to say hello.
    this.conversation = { id: null, peer: res.body.peer, blocked: false, muted: false, peer_read_seq: 0, read_seq: 0, last_seq: 0 };
    this.handle = handle;
    this.drawThread();
  }

  threadProblem(text) {
    this.thread.replaceChildren(h("div", { class: "placeholder", role: "alert" }, [
      h("p", { text: text }),
      h("a", { class: "quiet", href: "/messages", onclick: (event) => { if (plainClick(event)) { event.preventDefault(); this.go("/messages"); } }, text: "All messages" }),
    ]));
  }

  async openConversation(id) {
    const loaded = await this.loadConversation(true);
    if (!loaded || !this.current() || !this.view || this.view.id !== id) return;
    const stop = await watchMessages(this.session.live, id, (result) => this.conversationSignal(id, result));
    if (!this.current() || !this.view || this.view.id !== id) { if (stop) stop(); return; }
    this.stopConversation = stop;
  }

  stopConversationWatch() {
    if (this.stopConversation) this.stopConversation();
    this.stopConversation = null;
    this.conversationVersion = undefined;
    clearTimeout(this.typistTimer);
  }

  conversationSignal(id, result) {
    if (!this.current() || !this.view || this.view.id !== id) return;
    if (!result || result.version !== this.conversationVersion) {
      this.conversationVersion = result ? result.version : undefined;
      this.loadConversation(false);
    }
    this.showTypist(result && result.typing ? result.typing : null);
  }

  // first: the conversation just opened (draw it whole, at the bottom); else a
  // re-read of the newest page, merged with any earlier pages already shown.
  async loadConversation(first) {
    const id = this.view && this.view.id;
    if (!id) return false;
    const res = await call("/__polynet/me/messages/conversation?id=" + encodeURIComponent(id));
    if (!this.current() || !this.view || this.view.id !== id) return false;
    if (res.status === 401) { this.signedOut(); return false; }
    if (res.status === 403 && res.body.code === "not_a_member") { this.notMember(); return false; }
    if (!ok(res) || !res.body.conversation) {
      if (first || res.status === 404) this.threadProblem(says(res.body.code, "Couldn't load this conversation. Try again."));
      return false;
    }
    const fresh = res.body.messages || [];
    const oldest = fresh.length ? fresh[0].seq : Infinity;
    const newestShown = this.messages.length ? this.messages[this.messages.length - 1].seq : 0;
    // More arrived than one page holds: the newest page no longer meets what's
    // shown, so start again from it and let "earlier" page back through the rest.
    const gap = !first && newestShown > 0 && oldest !== Infinity && oldest > newestShown + 1;
    const earlier = first || gap ? [] : this.messages.filter((message) => message.seq < oldest);
    this.conversation = res.body.conversation;
    this.messages = earlier.concat(fresh);
    if (first || gap) this.hasMore = res.body.has_more === true;
    else if (!earlier.length) this.hasMore = res.body.has_more === true;
    // A pending send the server now holds is the server's message.
    const keys = new Set(this.messages.map((message) => message.client_message_id).filter(Boolean));
    this.pending = this.pending.filter((item) => !keys.has(item.key));
    if (first || !this.log) this.drawThread();
    else this.renderLog(false);
    this.updateInboxRow(this.conversation);
    this.markRead();
    return true;
  }

  updateInboxRow(conversation) {
    if (!this.conversations || !conversation || !conversation.id) return;
    const index = this.conversations.findIndex((row) => row.id === conversation.id);
    if (index === -1) return;
    this.conversations[index] = Object.assign({}, this.conversations[index], conversation);
    this.renderInbox();
  }

  // Read when the member can see it: up to the newest message shown.
  async markRead() {
    const conversation = this.conversation;
    if (!conversation || !conversation.id || document.visibilityState !== "visible") return;
    const last = this.messages.length ? this.messages[this.messages.length - 1].seq : 0;
    if (last <= conversation.read_seq || last <= this.readSent) return;
    const before = this.readSent;
    this.readSent = last;
    const res = await call("/__polynet/me/messages/read", { conversation_id: conversation.id, through_seq: last });
    if (!this.current()) return;
    // Not acknowledged: the next refresh tries again.
    if (!ok(res) || !res.body.conversation) {
      if (this.readSent === last) this.readSent = before;
      return;
    }
    if (!this.conversation || this.conversation.id !== conversation.id) return;
    this.conversation = Object.assign({}, this.conversation, res.body.conversation);
    this.updateInboxRow(this.conversation);
  }

  drawThread() {
    // Adopting a just-made thread keeps what's in the composer at this moment.
    const carried = this.carryDraft && this.input ? { value: this.input.value, focused: this.block.root.activeElement === this.input } : null;
    this.carryDraft = false;
    const conversation = this.conversation;
    const peer = conversation.peer || {};
    const name = personName(peer);
    const headingId = "pn-dm-heading";
    const site = typeof this.session.site_origin === "string" && /^https?:\/\//.test(this.session.site_origin) ? this.session.site_origin : null;
    const handleLine = peer.handle
      ? (site ? h("a", { class: "quiet", part: "peer-link", href: site + "/people/" + encodeURIComponent(peer.handle), text: "@" + peer.handle }) : h("span", { text: "@" + peer.handle }))
      : null;
    this.muteButton = conversation.id ? h("button", { class: "pill", part: "mute", type: "button", "aria-pressed": conversation.muted ? "true" : "false",
      text: conversation.muted ? "Muted" : "Mute", title: conversation.muted ? "Unmute this conversation" : "Mute this conversation", onclick: () => this.toggleMute() }) : null;
    this.blockButton = conversation.id ? h("button", { class: "pill danger", part: "block", type: "button",
      text: conversation.blocked ? "Unblock" : "Block", onclick: () => this.confirmBlock() }) : null;
    this.confirmArea = h("div");
    this.head = h("header", { class: "thread-head", part: "thread-header" }, [
      h("a", { class: "quiet back", part: "back", href: "/messages", onclick: (event) => { if (plainClick(event)) { event.preventDefault(); this.go("/messages"); } }, text: "All messages" }),
      h("span", { class: "face" }, [avatar(peer, name)]),
      h("div", { class: "peer", part: "peer" }, [h("h2", { id: headingId, text: name }), handleLine]),
      h("div", { class: "head-actions" }, [this.muteButton, this.blockButton]),
    ]);
    this.olderButton = h("button", { class: "quiet older", part: "older", type: "button", text: "Load earlier messages", hidden: !this.hasMore, onclick: () => this.loadOlder() });
    this.log = h("ol", { class: "log", part: "log", role: "log", "aria-live": "polite", "aria-labelledby": headingId });
    this.scroller = h("div", { class: "scroll" }, [this.olderButton, this.log]);
    this.typistLine = h("p", { class: "typing", part: "typing", "aria-live": "polite" });
    this.thread.setAttribute("aria-labelledby", headingId);
    this.thread.replaceChildren(this.head, this.confirmArea, this.scroller, this.typistLine, this.composerFor(conversation));
    if (carried && this.input && this.input.isConnected) {
      this.input.value = carried.value;
      this.grow();
      if (carried.focused) this.input.focus();
    }
    this.renderLog(true);
  }

  composerFor(conversation) {
    const name = personName(conversation.peer);
    if (conversation.blocked) {
      return h("p", { class: "note", part: "blocked-note", text: "You blocked " + name + ". Unblock them to message each other again." });
    }
    this.fileInput = h("input", { type: "file", multiple: true, class: "sr", tabindex: "-1", "aria-hidden": "true" });
    this.fileInput.addEventListener("change", () => {
      const files = Array.from(this.fileInput.files || []);
      this.fileInput.value = "";
      this.addFiles(files);
    });
    this.input = h("textarea", { class: "input", part: "input", rows: "1", "aria-label": "Message " + name, placeholder: "Message " + name });
    this.input.addEventListener("input", () => { this.grow(); this.typed(); this.composeError.hidden = true; });
    this.input.addEventListener("keydown", (event) => {
      // Enter sends; Shift+Enter is a new line (on a touch screen Enter is always a new line).
      if (event.key !== "Enter" || event.shiftKey || event.isComposing || matchMedia("(pointer: coarse)").matches) return;
      event.preventDefault();
      this.send();
    });
    this.input.addEventListener("paste", (event) => {
      const files = Array.from((event.clipboardData && event.clipboardData.files) || []);
      if (files.length) { event.preventDefault(); this.addFiles(files); }
    });
    this.chips = h("div", { class: "chips", part: "attachments", hidden: true });
    this.composeError = h("p", { class: "error", part: "error", role: "alert", hidden: true });
    this.sendButton = h("button", { class: "primary", part: "send", type: "submit", text: "Send" });
    return h("form", { class: "composer", part: "composer", novalidate: true, onsubmit: (event) => { event.preventDefault(); this.send(); } }, [
      this.chips,
      h("div", { class: "compose-row" }, [
        h("button", { class: "pill", part: "attach", type: "button", text: "Attach", "aria-label": "Attach files", onclick: () => this.fileInput.click() }),
        this.input, this.sendButton,
      ]),
      this.fileInput, this.composeError,
    ]);
  }

  grow() {
    this.input.style.height = "auto";
    this.input.style.height = Math.min(this.input.scrollHeight + 2, 160) + "px";
  }

  // The log as it reads: a divider for each day, each message once (kept by id
  // across re-reads, so a screen reader hears only what's new), then the
  // member's own sends still on their way.
  renderLog(toBottom) {
    if (!this.log) return;
    const nearBottom = this.scroller.scrollHeight - this.scroller.scrollTop - this.scroller.clientHeight < NEAR_BOTTOM_PX;
    const now = new Date();
    const nodes = [];
    let day = null;
    const keep = new Map();
    const reuse = (key, make) => {
      const node = this.nodes.get(key) || make();
      keep.set(key, node);
      nodes.push(node);
      return node;
    };
    for (const message of this.messages) {
      const at = new Date(message.created_at);
      if (!isNaN(at) && dayKey(at) !== day) {
        day = dayKey(at);
        reuse("day:" + day, () => h("li", { class: "day", part: "day", text: dayLabel(at, now) }));
      }
      reuse("m:" + message.id, () => this.messageNode(message, null));
    }
    const lastMessage = this.messages[this.messages.length - 1];
    if (lastMessage && lastMessage.from_me && !this.pending.length && this.conversation.peer_read_seq >= lastMessage.seq) {
      reuse("seen:" + lastMessage.seq, () => h("li", { class: "seen", part: "seen", text: "Seen" }));
    }
    // A pending send is redrawn as its state changes (sending, then failed).
    for (const item of this.pending) reuse("p:" + item.key + ":" + item.state + ":" + (item.error || ""), () => this.messageNode(item.message, item));
    if (!this.messages.length && !this.pending.length) {
      nodes.push(h("li", { class: "day", part: "empty", text: this.conversation.id ? "No messages yet." : "Say hello to " + personName(this.conversation.peer) + "." }));
    }
    this.nodes = keep;
    reconcile(this.log, nodes);
    if (this.olderButton) this.olderButton.hidden = !this.hasMore;
    if (toBottom || nearBottom) this.scroller.scrollTop = this.scroller.scrollHeight;
  }

  messageNode(message, pending) {
    const at = new Date(message.created_at);
    const children = [];
    if (message.text) children.push(...richText(message.text));
    const files = (message.attachments || []).map((file) => this.attachmentNode(file));
    if (files.length) children.push(h("div", { class: "files" }, files));
    const meta = [];
    if (pending && pending.state === "sending") meta.push(h("span", { text: "Sending…" }));
    else if (pending) {
      meta.push(h("span", { text: pending.error || "Not sent." }));
      meta.push(h("button", { class: "quiet", type: "button", text: "Retry", onclick: () => this.deliver(pending) }));
    } else if (!isNaN(at)) meta.push(h("time", { datetime: at.toISOString(), title: fullTime(at), text: clockTime(at) }));
    const mine = pending || message.from_me;
    return h("li", {
      class: "message" + (mine ? " mine" : "") + (pending ? " pending" : ""),
      part: "message " + (mine ? "message-mine" : "message-theirs") + (pending ? " message-pending" : ""),
      "data-seq": pending ? null : String(message.seq),
    }, [h("div", { class: "bubble", part: "bubble" }, children), h("div", { class: "meta", part: "meta" }, meta)]);
  }

  attachmentNode(file) {
    if (!file.url || !/^https:\/\//.test(file.url)) return h("span", { text: file.name });
    if (file.kind === "image") {
      return h("a", { class: "image", part: "attachment attachment-image", href: file.url, target: "_blank", rel: "noopener noreferrer" }, [
        h("img", { src: file.url, alt: file.name, loading: "lazy" }),
      ]);
    }
    return h("a", { class: "file", part: "attachment", href: file.url, target: "_blank", rel: "noopener noreferrer" }, [
      document.createTextNode(file.name), h("span", { text: fileSize(file.size) }),
    ]);
  }

  async loadOlder() {
    const id = this.view && this.view.id;
    const first = this.messages[0];
    if (!id || !first || this.loadingOlder) return;
    this.loadingOlder = true;
    this.olderButton.disabled = true;
    const res = await call("/__polynet/me/messages/conversation?id=" + encodeURIComponent(id) + "&before=" + first.seq);
    this.loadingOlder = false;
    if (!this.current() || !this.view || this.view.id !== id) return;
    this.olderButton.disabled = false;
    if (!ok(res)) return;
    const height = this.scroller.scrollHeight;
    const known = new Set(this.messages.map((message) => message.id));
    this.messages = (res.body.messages || []).filter((message) => !known.has(message.id)).concat(this.messages);
    this.hasMore = res.body.has_more === true;
    this.renderLog(false);
    // Keep the member's place: what they were reading stays where it was.
    this.scroller.scrollTop += this.scroller.scrollHeight - height;
  }

  showTypist(typing) {
    clearTimeout(this.typistTimer);
    if (!this.typistLine) return;
    if (!typing || !(typing.expires_in_ms > 0)) { this.typistLine.textContent = ""; return; }
    this.typistLine.textContent = personName(this.conversation && this.conversation.peer) + " is typing…";
    // A typist who stops renewing fades without another update.
    this.typistTimer = setTimeout(() => { if (this.typistLine) this.typistLine.textContent = ""; }, typing.expires_in_ms + 50);
  }

  // Typing, as Studio leases it: renewed while the member types, cleared when they stop or send.
  typed() {
    const conversation = this.conversation;
    if (!conversation || !conversation.id) return;
    clearTimeout(this.typingTimer);
    if (!this.input.value.trim()) return this.sendTyping(false);
    this.typingTimer = setTimeout(() => this.sendTyping(false), TYPING_IDLE_MS);
    if (Date.now() - this.typingSentAt < TYPING_RENEW_MS) return;
    this.typingSentAt = Date.now();
    this.typingId = conversation.id;
    call("/__polynet/me/messages/typing", { conversation_id: conversation.id, typing: true });
  }

  sendTyping(on) {
    if (on || !this.typingId) return;
    const id = this.typingId;
    this.typingId = null;
    this.typingSentAt = 0;
    clearTimeout(this.typingTimer);
    call("/__polynet/me/messages/typing", { conversation_id: id, typing: false });
  }

  // Studio's upload flow: an upload address from the twin, the file straight to Polynet's storage.
  addFiles(files) {
    if (!this.conversation || this.conversation.blocked) return;
    for (const file of files) {
      const kind = attachmentKind(file);
      const total = this.attachments.reduce((sum, item) => sum + item.size, 0) + file.size;
      const problem = !kind ? "That kind of file can't be sent."
        : file.size > MAX_FILE_BYTES ? "That file is over 10 MB."
          : total > MAX_TOTAL_BYTES ? "Attachments can add up to 25 MB."
            : this.attachments.length >= MAX_FILES ? "Up to 8 files at a time." : null;
      if (problem) { this.showComposeError(file.name + ": " + problem); continue; }
      const item = { key: messageKey(), name: file.name || "attachment", kind: kind, size: file.size, state: "uploading", storageId: null };
      this.attachments.push(item);
      this.upload(item, file);
    }
    this.renderChips();
  }

  async upload(item, file) {
    const conversation = this.conversation;
    const target = conversation.id ? { conversation_id: conversation.id } : { to: this.handle };
    const issued = await call("/__polynet/me/messages/upload", target);
    let storageId = null;
    if (ok(issued) && typeof issued.body.upload_url === "string") {
      try {
        const res = await fetch(issued.body.upload_url, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
        const data = await res.json().catch(() => null);
        storageId = res.ok && data && typeof data.storageId === "string" ? data.storageId : null;
      } catch (error) {
        storageId = null;
      }
    }
    if (!this.current() || this.attachments.indexOf(item) === -1) return;
    item.storageId = storageId;
    item.state = storageId ? "ready" : "failed";
    if (!storageId) this.showComposeError(says(issued.body.code, "The file didn't upload. Remove it and try again."));
    this.renderChips();
  }

  renderChips() {
    if (!this.chips) return;
    this.chips.hidden = !this.attachments.length;
    this.chips.replaceChildren(...this.attachments.map((item) => h("span", { class: "chip", part: "chip", "data-state": item.state }, [
      h("span", { class: "label", text: item.name }),
      h("span", { class: "muted", text: item.state === "uploading" ? "Uploading…" : item.state === "failed" ? "Failed" : fileSize(item.size) }),
      h("button", { type: "button", "aria-label": "Remove " + item.name, text: "×", onclick: () => {
        this.attachments = this.attachments.filter((other) => other !== item);
        this.renderChips();
        this.input.focus();
      } }),
    ])));
  }

  showComposeError(text) {
    if (!this.composeError) return;
    this.composeError.textContent = text;
    this.composeError.hidden = false;
  }

  send() {
    const conversation = this.conversation;
    if (!conversation || conversation.blocked || !this.input) return;
    const text = this.input.value.trim();
    if (this.attachments.some((item) => item.state === "uploading")) return this.showComposeError("Wait for the files to finish uploading.");
    if (this.attachments.some((item) => item.state === "failed")) return this.showComposeError("Remove the files that didn't upload first.");
    if (!text && !this.attachments.length) return;
    if (text.length > MAX_TEXT) return this.showComposeError("That's " + (text.length - MAX_TEXT).toLocaleString() + " characters over the 4,000 limit.");
    const files = this.attachments.map((item) => ({ storage_id: item.storageId, name: item.name, type: item.kind }));
    const item = {
      key: messageKey(), state: "sending", error: null, text: text, files: files,
      message: { id: "", text: text, from_me: true, created_at: new Date().toISOString(),
        attachments: this.attachments.map((file) => ({ name: file.name, kind: "file", size: file.size, url: null })) },
    };
    this.pending.push(item);
    this.input.value = "";
    this.grow();
    this.attachments = [];
    this.renderChips();
    this.sendTyping(false);
    this.renderLog(true);
    this.deliver(item);
  }

  // One send, or its retry with the same key, so the server never takes it twice.
  async deliver(item) {
    const conversation = this.conversation;
    const gen = this.threadGen;
    item.state = "sending";
    item.error = null;
    this.renderLog(true);
    const target = conversation.id ? { conversation_id: conversation.id } : { to: this.handle };
    const res = await call("/__polynet/me/messages/send", Object.assign(target, { text: item.text, attachments: item.files, client_message_id: item.key }));
    if (!this.current() || this.threadGen !== gen) return;
    if (!ok(res) || !res.body.message) {
      item.state = "failed";
      item.error = res.status === 401 ? "You were signed out. Sign in again to send." : says(res.body.code, "Not sent.");
      return this.renderLog(true);
    }
    this.pending = this.pending.filter((other) => other !== item);
    if (!this.conversation.id) return this.adoptConversation(res.body.conversation_id);
    if (!this.messages.some((message) => message.id === res.body.message.id)) {
      // Replies can land out of order; the log is always in sequence.
      this.messages.push(res.body.message);
      this.messages.sort((left, right) => left.seq - right.seq);
    }
    this.renderLog(true);
  }

  // The first message made the conversation: this is its address now. Sends
  // still in flight, the draft and its files stay; each send's server copy
  // replaces it as it lands.
  async adoptConversation(id) {
    history.replaceState(history.state, "", "/messages/" + id);
    this.view = where();
    this.conversation = Object.assign({}, this.conversation, { id: id });
    this.carryDraft = true;
    await this.openConversation(id);
    if (!this.current() || !this.view || this.view.id !== id) return;
    if (this.chips) this.renderChips();
    this.loadInbox();
  }

  async toggleMute() {
    const conversation = this.conversation;
    if (!conversation || !conversation.id || this.muteButton.disabled) return;
    this.muteButton.disabled = true;
    const gen = this.threadGen;
    const res = await call("/__polynet/me/messages/mute", { conversation_id: conversation.id, muted: !conversation.muted });
    if (!this.current() || this.threadGen !== gen) return;
    this.muteButton.disabled = false;
    if (!ok(res) || !res.body.conversation) return this.showComposeError(says(res.body.code, "That didn't work. Try again."));
    this.conversation = Object.assign({}, this.conversation, res.body.conversation);
    const muted = this.conversation.muted;
    this.muteButton.setAttribute("aria-pressed", muted ? "true" : "false");
    this.muteButton.textContent = muted ? "Muted" : "Mute";
    this.muteButton.title = muted ? "Unmute this conversation" : "Mute this conversation";
    this.updateInboxRow(this.conversation);
  }

  // Blocking and unblocking both ask first, inline.
  confirmBlock() {
    const conversation = this.conversation;
    if (!conversation || !conversation.id) return;
    const name = personName(conversation.peer);
    const blocking = !conversation.blocked;
    const gen = this.threadGen;
    const alert = h("p", { class: "error", role: "alert", hidden: true });
    const question = h("p", { tabindex: "-1", text: blocking
      ? "Block " + name + "? Neither of you will be able to message the other. You can unblock them later."
      : "Unblock " + name + "? You'll be able to message each other again." });
    const cancel = h("button", { class: "quiet", type: "button", text: "Cancel", onclick: () => { this.confirmArea.replaceChildren(); this.blockButton.focus(); } });
    const confirm = h("button", { class: blocking ? "solid" : "primary", part: "block-confirm", type: "button", text: blocking ? "Block" : "Unblock", onclick: async () => {
      confirm.disabled = true;
      cancel.disabled = true;
      const res = await call("/__polynet/me/messages/block", { conversation_id: conversation.id, blocked: blocking });
      if (!this.current() || this.threadGen !== gen) return;
      if (!ok(res) || !res.body.conversation) {
        confirm.disabled = false;
        cancel.disabled = false;
        alert.textContent = says(res.body.code, "That didn't work. Try again.");
        alert.hidden = false;
        return;
      }
      this.conversation = Object.assign({}, this.conversation, res.body.conversation);
      this.updateInboxRow(this.conversation);
      this.drawThread();
      this.blockButton.focus();
    } });
    this.confirmArea.replaceChildren(h("div", { class: "confirm", part: "confirm", role: "group", "aria-label": blocking ? "Confirm blocking" : "Confirm unblocking" }, [
      question, h("div", { class: "row" }, [confirm, cancel]), alert,
    ]));
    question.focus();
  }
}

export function mountMessages(block, generation) {
  block.root.prepend(...styled(block.root, STYLE));
  return new Messages(block, generation).start();
}
`.replace("__POLYNET_MESSAGES_TEXT__", JSON.stringify(MESSAGES_TEXT));
