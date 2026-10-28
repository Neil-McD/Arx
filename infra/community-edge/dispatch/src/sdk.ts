// SPDX-License-Identifier: MIT (see LICENSING.md and ./LICENSE-MIT)
// The Polynet SDK for community front ends, served by the edge at
// /__polynet/sdk.js on every community's own domain. It is plain JavaScript
// (an ES module) kept as text so the edge serves exactly what the tests run.
// No backticks or template placeholders inside: this is a String.raw literal.
export const SDK_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet SDK: everything a community front end needs, on this community's own domain.
// Usage:  import polynet from "/__polynet/sdk.js";
// Docs:   /__polynet/llms.txt
// The member's session lives in an HttpOnly cookie that this page never sees.

const VERSION = "1";

export class PolynetError extends Error {
  constructor(code, message, status) {
    super(message || code);
    this.name = "PolynetError";
    this.code = code;
    this.status = status || 0;
  }
}

let current = null;
let communityInfo = null;

// Who is here: { signed_in, community, community_name, community_one_liner,
// community_about, member_count, member, join_url, studio_url, live }.
// The community fields are public; member is { name, handle, avatar_url, role }
// when signed in, else null.
async function session(options) {
  if (!current || (options && options.refresh)) {
    const res = await fetch("/__polynet/auth/session", { credentials: "same-origin" });
    const edge = await res.json();
    current = Object.assign({ community_name: null, member: null }, edge);
    communityInfo = null;
    if (current.signed_in) {
      try {
        const value = await list(root());
        communityInfo = value.community || null;
        if (communityInfo) current.community_name = communityInfo.name;
        if (value.viewer) {
          current.member = {
            name: value.viewer.display_name || value.viewer.handle || "Member",
            handle: value.viewer.handle || null, avatar_url: value.viewer.avatar_url || null, role: value.viewer.role || "member",
          };
        }
      } catch (error) {
        // An expired session reads as signed out; anything else leaves member unknown.
        if (error.code === "sign_in_required") current = Object.assign({ community_name: null }, edge, { signed_in: false, member: null, live: undefined });
      }
    }
    keepPresence();
  }
  return current;
}

function root() {
  if (!current || !current.community) throw new PolynetError("not_ready", "Await polynet.session() first.");
  return "/communities/" + current.community + "/";
}

function signIn(returnPath) {
  location.href = "/__polynet/auth/start?return=" + encodeURIComponent(returnPath || location.pathname || "/");
}

async function signOut() {
  await fetch("/__polynet/auth/logout", { method: "POST" });
  current = null;
  await session({ refresh: true });
}

function newKey() {
  return crypto.randomUUID().replace(/-/g, "");
}

// The door: the five verbs every Polynet surface uses.
async function door(tool, input) {
  const res = await fetch("/__polynet/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: tool, input: input }),
  });
  const body = await res.json().catch(function () { return {}; });
  if (res.status === 401) {
    if (current) current.signed_in = false;
    throw new PolynetError("sign_in_required", "Sign in to this community.", 401);
  }
  if (!body.ok) throw new PolynetError(body.code || "request_failed", body.message, res.status);
  return body.value;
}

const list = function (path, options) { return door("polynet_list", Object.assign({ path: path }, options || {})); };
const read = function (path) { return door("polynet_read", { path: path }); };
const search = function (path, query) { return door("polynet_search", { path: path, query: query }); };
const write = function (input) { return door("polynet_write", Object.assign({ idempotency_key: newKey() }, input)); };
const call = function (operation, input) {
  return door("polynet_call", {
    target: root() + "capabilities/" + operation + ".json",
    operation: operation, version: 1, idempotencyKey: newKey(), input: input,
  });
};

// Every entry in a folder, following pages (capped).
async function listAll(path) {
  let entries = [];
  let cursor = null;
  for (let page = 0; page < 20; page += 1) {
    const value = await list(path, cursor ? { cursor: cursor } : {});
    entries = entries.concat(value.entries || []);
    if (!value.truncated || !value.next_cursor) break;
    cursor = value.next_cursor;
  }
  return entries;
}

function channelPath(channel) {
  return root() + "channels/" + channel + "/";
}

function rootIdOf(ref) {
  return String(ref || "").replace("interaction:root:", "");
}

// The community: { name, slug }. Works signed out (from the public identity).
async function community() {
  if (communityInfo) return communityInfo;
  const s = await session();
  if (!s.signed_in && s.community_name) return { name: s.community_name, slug: s.community };
  communityInfo = (await list(root())).community;
  return communityInfo;
}

// Every post and reply carries its whole text, and reply_count is a number.
function normalize(entry) {
  if (entry && entry.type === "interaction") {
    if (typeof entry.text !== "string") entry.text = entry.snippet || "";
    if (typeof entry.reply_count !== "number") entry.reply_count = 0;
    if (typeof entry.can_edit !== "boolean") entry.can_edit = false;
    // Every actor has the same keys; the agent's are null.
    entry.actor = Object.assign({ type: "human", display_name: null, handle: null, avatar_url: null }, entry.actor || {});
  }
  return entry;
}

async function channels() {
  return (await listAll(root() + "channels/"))
    .filter(function (entry) { return entry.type === "channel"; })
    .map(function (entry) {
      return {
        slug: entry.slug, name: entry.name, path: entry.path, isGeneral: entry.is_general === true,
        canPost: !entry.capabilities || entry.capabilities.canPost !== false,
        unread: entry.unread === true, mentioned: entry.mentioned === true,
        seenThroughAt: typeof entry.seen_through_at === "number" ? entry.seen_through_at : null,
      };
    });
}

// Mark a channel read, clearing its unread and mentioned: up to now, or up to
// throughAt (the newest post the member saw, or a time). Never moves back.
async function markRead(channel, throughAt) {
  const input = { channel: channel };
  if (throughAt !== undefined && throughAt !== null) {
    const at = typeof throughAt === "number" ? throughAt : Date.parse(throughAt.created_at || throughAt);
    if (!Number.isFinite(at)) throw new PolynetError("invalid_tool_args", "throughAt is a post or a time.");
    input.through_at = Math.floor(at);
  }
  return call("community.channel.mark_read", input);
}

// Posts in a channel, newest page, oldest first. Each has ref, path, snippet, actor,
// reactions, reacted_by_me, by_me, reply_count, attachments, created_at. The list's
// cursor fetches the page before it (feed(channel, { cursor: posts.cursor })); null
// at the start of the channel.
async function feed(channel, options) {
  options = options || {};
  const input = { limit: options.limit || 50 };
  if (options.cursor) input.cursor = options.cursor;
  const value = await list(channelPath(channel), input);
  const posts = (value.entries || []).filter(function (entry) { return entry.object_type === "root"; }).reverse().map(normalize);
  posts.cursor = value.next_cursor || null;
  return posts;
}

// A post and its replies, oldest first.
async function thread(channel, postRef) {
  const value = await list(channelPath(channel) + postRef + "/");
  return (value.entries || []).map(normalize);
}

async function upload(file, options) {
  const res = await fetch("/__polynet/upload", {
    method: "POST",
    headers: Object.assign({
      "Content-Type": file.type || "application/octet-stream",
      "x-polynet-file-name": encodeURIComponent(file.name || "file"),
      "x-polynet-channel": options.channel,
      "x-polynet-idempotency-key": options.key,
    }, options.replyTo ? { "x-polynet-root-id": rootIdOf(options.replyTo) } : {}),
    body: file,
  });
  const body = await res.json().catch(function () { return {}; });
  if (!res.ok || !body.attachment) throw new PolynetError(body.code || "upload_failed", "Couldn't upload " + (file.name || "the file") + ".", res.status);
  return { attachmentId: body.attachment.attachmentId };
}

// Post to a channel, or reply when replyTo is a post ref. files: File[] to attach.
// askAgent: true asks the community agent, which replies in the channel.
// mentions: members (from members(), or their refs) to notify; the text must
// contain each one's @handle.
async function post(channel, text, options) {
  options = options || {};
  const key = newKey();
  const attachments = [];
  for (const file of options.files || []) {
    attachments.push(await upload(file, { channel: channel, key: key, replyTo: options.replyTo }));
  }
  let body = String(text || "").trim();
  const mentions = (options.mentions || []).map(function (member) {
    return { userId: String((member && member.ref) || member).replace("user:", "") };
  });
  if (options.askAgent) {
    const name = (await community()).name;
    if (body.toLowerCase().indexOf(("@" + name).toLowerCase()) === -1) body = "@" + name + " " + body;
    mentions.push({ agentKey: "community_agent" });
  }
  const content = { text: body };
  if (options.replyTo) content.root_id = rootIdOf(options.replyTo);
  if (attachments.length) content.attachments = attachments;
  if (mentions.length) content.mentions = mentions;
  const result = await write({ path: channelPath(channel), mode: options.replyTo ? "append" : "create", content: content, idempotency_key: key });
  typing(channel, false, { thread: options.replyTo });
  return result;
}

// Say the member is typing (on true) or has stopped (false), in a channel or,
// with { thread: post.ref }, in that post's thread. Call it on every keystroke:
// the SDK sends at most one renewal every couple of seconds. Others see it in
// watch(); it fades on its own a few seconds after the last renewal.
const typingSent = {};
function typing(channel, on, options) {
  const thread = options && options.thread ? String(options.thread.ref || options.thread) : null;
  const key = channel + " " + (thread || "");
  const now = Date.now();
  if (on !== false ? typingSent[key] && now - typingSent[key] < 2000 : !typingSent[key]) return Promise.resolve();
  if (on !== false) typingSent[key] = now;
  else delete typingSent[key];
  const input = { channel: channel, on: on !== false };
  if (thread) input.thread_ref = thread;
  return call("community.typing.set", input).then(function () {}, function () {});
}

// Edit or delete your own post or reply (entry from feed/thread, or its path).
const edit = function (entry, text) { return write({ path: entry.path || entry, mode: "update", content: { text: text } }); };
const remove = function (entry) { return write({ path: entry.path || entry, mode: "delete", content: {} }); };

// Set your reaction on a post or reply: on true adds it, false removes it.
const react = function (ref, emoji, on) { return call("community.interaction.react", { ref: ref, emoji: emoji, on: on !== false }); };

function fileUrl(attachment) {
  return "/__polynet/files/" + String(attachment.ref || attachment).replace("attachment:", "");
}

async function events(options) {
  const value = await list(root() + "events/", { limit: (options && options.limit) || 20 });
  return value.entries || [];
}

// Courses (folders) and lessons (documents). Pass an entry's path to open a folder.
async function resources(path) {
  return listAll(path || root() + "resources/");
}

// A document's text: a lesson, a memory, or a post (posts from feed/thread already have .text).
async function readText(entry) {
  if (entry && entry.type === "interaction" && typeof entry.text === "string") return entry.text;
  const value = await read(entry.path || entry);
  let text = (value && value.body) || "";
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.content_blocks)) {
      text = parsed.content_blocks.map(function (block) { return block.text || ""; }).filter(Boolean).join("\n\n");
    } else {
      text = parsed.body_md || parsed.bodyMd || text;
    }
  } catch (error) {
    // Markdown documents are already text.
  }
  return text;
}

// The community's members: [{ name, role, ref, path, handle, avatar_url, online }]
// (role "owner", "admin", "moderator", "member"; online: here right now).
async function members() {
  return (await listAll(root() + "members/"))
    .filter(function (entry) { return entry.type === "member"; })
    .map(function (entry) {
      return {
        name: entry.name || "Member", role: entry.role || "member", ref: entry.ref, path: entry.path,
        handle: entry.handle || null, avatar_url: entry.avatar_url || null, online: entry.online === true,
      };
    });
}

// One member's profile (a member from members(), or a handle): { ref, name,
// handle, avatar_url, role, online, bio, links { youtube, x, instagram } }.
// Only what any member of this community sees in Polynet.
async function profile(member) {
  const handle = typeof member === "string" ? member.replace(/^@/, "") : member && member.handle;
  const path = handle ? root() + "members/" + handle + ".json"
    : root() + "members/by-user/" + String((member && member.ref) || "").replace("user:", "") + ".json";
  return JSON.parse((await read(path)).body);
}

// Who is here right now: { online_count, online_count_capped, members: [{ ref,
// name, handle, avatar_url }] }. online_count_capped means "at least".
async function online() {
  return JSON.parse((await read(root() + "presence.json")).body);
}

// What the community knows: top memories, or a search.
async function knowledge(query) {
  if (query) return (await search(root() + "memory/", query)).results || [];
  return (await list(root() + "memory/")).entries || [];
}

// The community agent, in this member's private conversation.
async function agentHistory() {
  const res = await fetch("/__polynet/agent/messages");
  const body = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new PolynetError(body.code || "agent_unavailable", body.message, res.status);
  return body.messages || [];
}

// Ask the community agent. onDelta(textSoFar) streams the reply; resolves with the full reply.
async function askAgent(text, options) {
  const onDelta = (options && options.onDelta) || function () {};
  const res = await fetch("/__polynet/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text, message_key: newKey() }),
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(function () { return {}; });
    throw new PolynetError(body.code || "agent_unavailable", body.message || "The community agent isn't available.", res.status);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let content = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += chunk.value;
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const eventMatch = /^event: (.*)$/m.exec(block);
      const dataMatch = /^data: (.*)$/m.exec(block);
      const event = eventMatch ? eventMatch[1] : "";
      const data = dataMatch ? JSON.parse(dataMatch[1]) : {};
      if (event === "delta" && data.delta) { content += data.delta; onDelta(content); }
      if (event === "done") { content = data.full_content || content; onDelta(content); }
      if (event === "error") throw new PolynetError(data.code || "agent_failed", data.message || data.error || "The agent couldn't finish.");
      boundary = buffer.indexOf("\n\n");
    }
  }
  return content;
}

let liveClient = null;
let liveToken = null;

function loadConvex() {
  if (globalThis.convex) return Promise.resolve(globalThis.convex);
  return new Promise(function (resolve, reject) {
    const script = document.createElement("script");
    script.src = "/__polynet/live.js";
    script.onload = function () { resolve(globalThis.convex); };
    script.onerror = function () { reject(new PolynetError("live_unavailable", "Live updates couldn't load.")); };
    document.head.appendChild(script);
  });
}

// The live signal for a path under this community (local, e.g. "presence.json").
async function subscribe(local, onResult) {
  const s = await session();
  if (!s.signed_in || !s.live) throw new PolynetError("sign_in_required", "Sign in to watch this community.");
  const convex = await loadConvex();
  if (!liveClient || liveToken !== s.live.token) {
    if (liveClient) liveClient.close();
    liveClient = new convex.ConvexClient(s.live.url);
    liveToken = s.live.token;
  }
  return liveClient.onUpdate("communityLive:watch", { token: s.live.token, path: root() + local }, function (result) {
    if ((!result || !result.ok) && current) current.signed_in = false;
    onResult(result && result.ok ? result : null);
  });
}

// Live updates: onChange(update) runs whenever anything in the channel changes
// (posts, replies, edits, deletions, reactions), when someone starts or stops
// typing there, and when the session ends, so the re-read surfaces
// sign_in_required. update.changed is true when posts changed: re-read the
// channel then. update.typing is who else is typing: [{ ref, name, avatar_url,
// thread_ref }] (thread_ref is the post they're replying to, or null).
// Returns stop().
async function watch(channel, onChange) {
  let version;
  let shown = "[]";
  let typists = [];
  let timer = null;
  function emit(changed) {
    const now = Date.now();
    typists = typists.filter(function (person) { return person.until > now; });
    const list = typists.map(function (person) {
      return { ref: person.ref, name: person.name, avatar_url: person.avatar_url, thread_ref: person.thread_ref };
    });
    clearTimeout(timer);
    // A typist who stops renewing fades without another server update.
    if (typists.length) timer = setTimeout(function () { emit(false); }, Math.min.apply(null, typists.map(function (person) { return person.until; })) - now + 50);
    if (!changed && JSON.stringify(list) === shown) return;
    shown = JSON.stringify(list);
    onChange({ changed: changed, typing: list });
  }
  const stop = await subscribe("channels/" + channel + "/", function (result) {
    const changed = !result || result.version !== version;
    version = result ? result.version : undefined;
    const now = Date.now();
    typists = ((result && result.typing) || []).map(function (person) {
      return Object.assign({}, person, { until: now + (person.expires_in_ms || 0) });
    });
    emit(changed);
  });
  return function () { clearTimeout(timer); stop(); };
}

// onChange() runs right away, whenever who's online changes, and when the
// session ends: call online() then. Returns stop().
async function watchOnline(onChange) {
  let version;
  return subscribe("presence.json", function (result) {
    if (result && result.version === version) return;
    version = result ? result.version : undefined;
    onChange();
  });
}

// Presence: while a signed-in member has the page open and visible, the
// community sees them online (a heartbeat about once a minute). Hidden, it
// pauses; signed out, it stops.
let heartbeat = null;
let presenceListening = false;
function beat() {
  if (!current || !current.signed_in) { clearInterval(heartbeat); heartbeat = null; return; }
  if (document.visibilityState === "visible") call("community.presence.heartbeat", {}).catch(function () {});
}
function keepPresence() {
  if (typeof document === "undefined" || !current || !current.signed_in || heartbeat !== null) return;
  if (!presenceListening) {
    presenceListening = true;
    document.addEventListener("visibilitychange", function () { if (heartbeat !== null && document.visibilityState === "visible") beat(); });
  }
  heartbeat = setInterval(beat, 60000);
  beat();
}

// The signed-in member's Polynet account, for the shell: { member { name,
// handle, avatar_url }, community { slug, name, role, studio_url }, links {
// communities, discover, settings, messages } }. It covers this community only;
// links.communities opens the member's own list in Polynet. Most sites use
// <polynet-account> instead.
async function account() {
  const res = await fetch("/__polynet/account", { credentials: "same-origin" });
  const body = await res.json().catch(function () { return {}; });
  if (res.status === 401) {
    if (current) current.signed_in = false;
    throw new PolynetError("sign_in_required", "Sign in to this community.", 401);
  }
  if (!res.ok || !body.ok) throw new PolynetError(body.code || "account_unavailable", body.message, res.status);
  return body.account;
}

// Markdown (post text, replies, agent answers, descriptions) as DOM nodes, built
// with createElement and textContent, never innerHTML, so Polynet text can't
// inject markup. Paragraphs, line breaks, headings (#..### as h3..h5), lists
// (- and 1.), quotes (>), code (inline and fenced), **bold**, *italic*, and
// web links, labelled or bare (http and https only). Returns a DocumentFragment.
const FENCE = "\x60\x60\x60";
const INLINE = /(\x60[^\x60]+\x60)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\(https?:\/\/[^\s)]+\))|(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g;
const LIST_ITEM = /^\s*([-*]|\d+\.)\s+/;

function markdownInline(text, parent) {
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) parent.append(text.slice(last, match.index));
    const token = match[0];
    let node;
    if (match[1]) {
      node = document.createElement("code");
      node.textContent = token.slice(1, -1);
    } else if (match[2] || match[3]) {
      const cut = match[2] ? 2 : 1;
      node = document.createElement(match[2] ? "strong" : "em");
      markdownInline(token.slice(cut, -cut), node);
    } else {
      const labelled = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      node = document.createElement("a");
      node.href = labelled ? labelled[2] : token;
      node.textContent = labelled ? labelled[1] : token;
      node.rel = "noopener noreferrer";
      node.target = "_blank";
    }
    parent.append(node);
    last = match.index + token.length;
  }
  if (last < text.length) parent.append(text.slice(last));
}

function markdown(source) {
  const root = document.createDocumentFragment();
  const lines = String(source == null ? "" : source).replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    if (line.startsWith(FENCE)) {
      const block = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith(FENCE)) block.push(lines[i++]);
      i += 1;
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = block.join("\n");
      pre.append(code);
      root.append(pre);
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const node = document.createElement("h" + (heading[1].length + 2));
      markdownInline(heading[2], node);
      root.append(node);
      i += 1;
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const list = document.createElement(/\d/.test(item[1]) ? "ol" : "ul");
      while (i < lines.length && LIST_ITEM.test(lines[i])) {
        const li = document.createElement("li");
        markdownInline(lines[i++].replace(LIST_ITEM, ""), li);
        list.append(li);
      }
      root.append(list);
      continue;
    }
    if (line.startsWith(">")) {
      const quote = document.createElement("blockquote");
      const parts = [];
      while (i < lines.length && lines[i].startsWith(">")) parts.push(lines[i++].replace(/^>\s?/, ""));
      markdownInline(parts.join(" "), quote);
      root.append(quote);
      continue;
    }
    const paragraph = document.createElement("p");
    const parts = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith(FENCE) && !/^(#{1,3}\s|>)/.test(lines[i]) && !LIST_ITEM.test(lines[i])) parts.push(lines[i++]);
    parts.forEach(function (part, index) {
      if (index) paragraph.append(document.createElement("br"));
      markdownInline(part, paragraph);
    });
    root.append(paragraph);
  }
  return root;
}

const polynet = {
  version: VERSION, PolynetError: PolynetError,
  session: session, signIn: signIn, signOut: signOut, community: community, account: account,
  channels: channels, feed: feed, thread: thread, post: post, edit: edit, remove: remove, react: react, fileUrl: fileUrl, watch: watch,
  markRead: markRead, typing: typing,
  events: events, resources: resources, readText: readText, knowledge: knowledge, members: members,
  profile: profile, online: online, watchOnline: watchOnline,
  agentHistory: agentHistory, askAgent: askAgent, markdown: markdown,
  door: { list: list, read: read, search: search, write: write, call: call },
};

export default polynet;
`;
