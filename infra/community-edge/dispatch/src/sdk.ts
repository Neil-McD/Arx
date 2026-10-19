// The Polynet SDK for community front ends, served by the edge at
// /__polynet/sdk.js on every community's own domain. It is plain JavaScript
// (an ES module) kept as text so the edge serves exactly what the tests run.
// No backticks or template placeholders inside: this is a String.raw literal.
export const SDK_SOURCE = String.raw`// Polynet SDK: everything a community front end needs, on this community's own domain.
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

async function session(options) {
  if (!current || (options && options.refresh)) {
    const res = await fetch("/__polynet/auth/session", { credentials: "same-origin" });
    current = await res.json();
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
    current = null;
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

function channelPath(channel) {
  return root() + "channels/" + channel + "/";
}

function rootIdOf(ref) {
  return String(ref || "").replace("interaction:root:", "");
}

async function community() {
  const value = await list(root());
  return value.community;
}

async function channels() {
  const value = await list(root() + "channels/");
  return (value.entries || [])
    .filter(function (entry) { return entry.type === "channel"; })
    .map(function (entry) {
      return {
        slug: entry.slug, name: entry.name, path: entry.path, isGeneral: entry.is_general === true,
        canPost: !entry.capabilities || entry.capabilities.canPost !== false,
      };
    });
}

// Posts in a channel, oldest first. Each has ref, path, snippet, actor, reactions,
// reacted_by_me, by_me, reply_count, attachments, created_at.
async function feed(channel, options) {
  const value = await list(channelPath(channel), { limit: (options && options.limit) || 50 });
  return (value.entries || []).filter(function (entry) { return entry.object_type === "root"; }).reverse();
}

// A post and its replies, oldest first.
async function thread(channel, postRef) {
  const value = await list(channelPath(channel) + postRef + "/");
  return value.entries || [];
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
async function post(channel, text, options) {
  options = options || {};
  const key = newKey();
  const attachments = [];
  for (const file of options.files || []) {
    attachments.push(await upload(file, { channel: channel, key: key, replyTo: options.replyTo }));
  }
  let body = String(text || "").trim();
  let mentions;
  if (options.askAgent) {
    const name = (await community()).name;
    if (body.toLowerCase().indexOf(("@" + name).toLowerCase()) === -1) body = "@" + name + " " + body;
    mentions = [{ agentKey: "community_agent" }];
  }
  const content = { text: body };
  if (options.replyTo) content.root_id = rootIdOf(options.replyTo);
  if (attachments.length) content.attachments = attachments;
  if (mentions) content.mentions = mentions;
  return write({ path: channelPath(channel), mode: options.replyTo ? "append" : "create", content: content, idempotency_key: key });
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
  const value = await list(path || root() + "resources/");
  return value.entries || [];
}

// A document's text (a lesson, a memory). JSON documents give their body text.
async function readText(entry) {
  const value = await read(entry.path || entry);
  let text = (value && value.body) || "";
  try {
    const parsed = JSON.parse(text);
    text = parsed.body_md || parsed.bodyMd || text;
  } catch (error) {
    // Markdown documents are already text.
  }
  return text;
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
    script.src = "https://cdn.jsdelivr.net/npm/convex@1.42.1/dist/browser.bundle.js";
    script.onload = function () { resolve(globalThis.convex); };
    script.onerror = function () { reject(new PolynetError("live_unavailable", "Live updates couldn't load.")); };
    document.head.appendChild(script);
  });
}

// Live updates: onChange() runs whenever anything in the channel changes (posts,
// replies, edits, deletions, reactions). Re-read the channel then. Returns stop().
async function watch(channel, onChange) {
  const s = await session();
  if (!s.signed_in || !s.live) throw new PolynetError("sign_in_required", "Sign in to watch this community.");
  const convex = await loadConvex();
  if (!liveClient || liveToken !== s.live.token) {
    if (liveClient) liveClient.close();
    liveClient = new convex.ConvexClient(s.live.url);
    liveToken = s.live.token;
  }
  return liveClient.onUpdate("communityLive:watch", { token: s.live.token, path: channelPath(channel) }, function (result) {
    if (result && result.ok) onChange();
  });
}

const polynet = {
  version: VERSION, PolynetError: PolynetError,
  session: session, signIn: signIn, signOut: signOut, community: community,
  channels: channels, feed: feed, thread: thread, post: post, edit: edit, remove: remove, react: react, fileUrl: fileUrl, watch: watch,
  events: events, resources: resources, readText: readText, knowledge: knowledge,
  agentHistory: agentHistory, askAgent: askAgent,
  door: { list: list, read: read, search: search, write: write, call: call },
};

export default polynet;
`;
