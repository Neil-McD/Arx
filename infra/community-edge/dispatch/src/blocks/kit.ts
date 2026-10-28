// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// The blocks kit, served at /__polynet/blocks/kit.js: what every Polynet block
// shares (the token style, a DOM helper, avatars, time labels, the channel URL
// contract and the feed's grouping). Pure helpers: it never calls Polynet, so
// tests import it as is. Kept as text (a String.raw literal: no backticks or
// template placeholders inside) so the edge serves exactly what is reviewed.
export const KIT_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet blocks kit: shared by /__polynet/blocks/*.js. Not for site code.

// The site's tokens, under the same names and fallbacks as the shell. Blocks
// never set a font: they always read in the page's own type.
export const BASE_STYLE = [
  ":host { --pn-accent: var(--polynet-accent, #4338ca); --pn-on-accent: var(--polynet-on-accent, #ffffff);",
  "  --pn-surface: var(--polynet-surface, Canvas); --pn-surface-text: var(--polynet-text, CanvasText);",
  "  --pn-muted: var(--polynet-muted, color-mix(in srgb, currentColor 62%, transparent));",
  "  --pn-border: var(--polynet-border, color-mix(in srgb, currentColor 14%, transparent));",
  "  --pn-tint: color-mix(in srgb, currentColor 5%, transparent);",
  "  --pn-radius: var(--polynet-radius, 10px);",
  // Unset, --polynet-text makes this invalid, so the color inherits from the page.
  "  color: var(--polynet-text); }",
  "* { box-sizing: border-box; }",
  "button, a { font: inherit; color: inherit; }",
  "button { cursor: pointer; }",
  ":focus-visible { outline: 2px solid var(--pn-accent); outline-offset: 2px; border-radius: 4px; }",
  "[hidden] { display: none !important; }",
  ".sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }",
  ".muted { color: var(--pn-muted); }",
  ".avatar { width: 100%; aspect-ratio: 1; border-radius: 50%; object-fit: cover; display: grid; place-items: center;",
  "  background: color-mix(in srgb, currentColor 9%, transparent); color: var(--pn-muted); font-size: .8125em; font-weight: 600; letter-spacing: .02em; }",
  ".avatar.agent { background: none; box-shadow: inset 0 0 0 1.5px var(--pn-accent); }",
  ".avatar.agent::before { content: ''; width: 46%; aspect-ratio: 1; background: var(--pn-accent);",
  "  clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%); }",
  ".state { padding: 1.5em .5em; max-width: 34em; line-height: 1.55; }",
  ".state p { margin: 0 0 .75em; }",
  ".actions { display: flex; flex-wrap: wrap; align-items: center; gap: .75em 1.25em; }",
  ".primary { background: var(--pn-accent); color: var(--pn-on-accent); border: 0; border-radius: 999px; padding: .5em 1.15em; font-weight: 600; min-height: 2.5em; }",
  ".quiet { background: none; border: 0; padding: .25em 0; text-decoration: underline; text-underline-offset: .2em; text-decoration-color: var(--pn-border); }",
  ".quiet:hover { text-decoration-color: currentColor; }",
  "@media (pointer: coarse) { .primary, .quiet { min-height: 44px; } }",
].join("\n");

export function h(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const key of Object.keys(attrs || {})) {
    const value = attrs[key];
    if (value === null || value === undefined || value === false) continue;
    if (key === "text") node.textContent = value;
    else if (key.indexOf("on") === 0) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children || []) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}

export function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

// A person's picture, their initials when there is none (or it fails), or the
// community agent's mark. Decorative: the name is always next to it.
export function avatar(actor, name) {
  if (actor && actor.type === "community_agent") return h("span", { class: "avatar agent", part: "avatar avatar-agent", "aria-hidden": "true" });
  const fallback = function () { return h("span", { class: "avatar", part: "avatar", "aria-hidden": "true", text: initials(name) }); };
  if (!actor || !actor.avatar_url) return fallback();
  const img = h("img", { class: "avatar", part: "avatar", src: actor.avatar_url, alt: "", loading: "lazy" });
  img.addEventListener("error", function () { img.replaceWith(fallback()); }, { once: true });
  return img;
}

// Who wrote something, as a reader sees it. The agent speaks as the community;
// when it acted for a member, it says so.
export function authorName(actor, communityName) {
  actor = actor || {};
  if (actor.type === "community_agent") {
    const agent = (communityName || "Community") + " agent";
    return actor.display_name ? agent + " · for " + actor.display_name : agent;
  }
  return actor.display_name || (actor.handle ? "@" + actor.handle : "Member");
}

export function authorKey(actor) {
  actor = actor || {};
  return [actor.type, actor.user_id || actor.handle || "", actor.agent_key || "", actor.display_name || ""].join("|");
}

// Times. Labels follow the reader's locale; datetime attributes stay ISO.
function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); }
export function dayKey(date) { return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate(); }
export function dayLabel(date, now) {
  now = now || new Date();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const options = { weekday: "long", month: "long", day: "numeric" };
  if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
  return date.toLocaleDateString(undefined, options);
}
export function clockTime(date) { return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
export function fullTime(date) { return date.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" }); }
// A short label that stands without a day divider: "9:41 AM", "Yesterday, 9:41 AM", "Oct 3, 9:41 AM".
export function timeLabel(date, now) {
  now = now || new Date();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (days === 0) return clockTime(date);
  if (days === 1) return "Yesterday, " + clockTime(date);
  const options = { month: "short", day: "numeric" };
  if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
  return date.toLocaleDateString(undefined, options) + ", " + clockTime(date);
}

export function fileSize(bytes) {
  if (typeof bytes !== "number" || !(bytes >= 0)) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "") + " MB";
}

export function typingText(people) {
  const names = (people || []).map(function (person) { return person.name || "Someone"; });
  if (!names.length) return "";
  if (names.length === 1) return names[0] + " is typing…";
  if (names.length === 2) return names[0] + " and " + names[1] + " are typing…";
  if (names.length === 3) return names[0] + ", " + names[1] + " and " + names[2] + " are typing…";
  return "Several people are typing…";
}

// The feed as it reads: a divider for each day, one "New" divider before the
// first post from someone else after the member's last read, and consecutive
// posts by one author within a few minutes grouped under one name.
const GROUP_MS = 5 * 60 * 1000;
export function feedItems(posts, options) {
  options = options || {};
  const seen = typeof options.seenThroughAt === "number" ? options.seenThroughAt : null;
  const now = options.now || new Date();
  const items = [];
  let previous = null;
  let day = null;
  let newShown = false;
  for (const post of posts) {
    const at = new Date(post.created_at);
    let fresh = false;
    if (dayKey(at) !== day) {
      day = dayKey(at);
      items.push({ type: "day", key: "day:" + day, label: dayLabel(at, now) });
      fresh = true;
    }
    if (!newShown && seen !== null && !post.by_me && at.getTime() > seen) {
      items.push({ type: "new", key: "new", label: "New" });
      newShown = true;
      fresh = true;
    }
    const grouped = !fresh && previous !== null && authorKey(previous.actor) === authorKey(post.actor)
      && at.getTime() - new Date(previous.created_at).getTime() < GROUP_MS;
    items.push({ type: "message", key: post.ref, post: post, grouped: grouped });
    previous = post;
  }
  return items;
}

// Puts nodes in parent in this order, touching only what changed, so screen
// readers hear new messages and nothing else.
export function reconcile(parent, nodes) {
  nodes.forEach(function (node, index) {
    if (parent.children[index] !== node) parent.insertBefore(node, parent.children[index] || null);
  });
  while (parent.children.length > nodes.length) parent.lastElementChild.remove();
}

// The page's channel lives in the URL (?channel=<slug>), so it survives a
// reload, a shared link and Back. Selecting one also fires "polynet:channel"
// on document, which every block on the page follows.
export function channelFromUrl() {
  return new URLSearchParams(location.search).get("channel");
}
export function channelHref(slug) {
  const params = new URLSearchParams(location.search);
  params.set("channel", slug);
  return "?" + params.toString();
}
export function selectChannel(slug) {
  if (channelFromUrl() !== slug) history.pushState(history.state, "", channelHref(slug) + location.hash);
  document.dispatchEvent(new CustomEvent("polynet:channel", { detail: { slug: slug } }));
}
export function pickChannel(channels, slug) {
  return channels.find(function (channel) { return channel.slug === slug; })
    || channels.find(function (channel) { return channel.isGeneral; }) || channels[0] || null;
}

// Blocks that load together share one channels() read.
let channelsRead = null;
export function readChannels(polynet, fresh) {
  if (fresh || !channelsRead || Date.now() - channelsRead.at > 2000) {
    const promise = polynet.channels();
    channelsRead = { at: Date.now(), promise: promise };
    promise.catch(function () { if (channelsRead && channelsRead.promise === promise) channelsRead = null; });
  }
  return channelsRead.promise;
}
`;
