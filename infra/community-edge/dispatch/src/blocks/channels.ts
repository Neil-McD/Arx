// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// <polynet-channels>, served at /__polynet/blocks/channels.js: the channels
// the member can read, with unread and mention marks. Selecting one puts it in
// the URL (?channel=<slug>) and fires "polynet:channel", which <polynet-chat>
// follows. Kept as text (a String.raw literal: no backticks or template
// placeholders inside) so the edge serves exactly what is reviewed.
export const CHANNELS_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block: <polynet-channels>. ui.js loads it on pages that place the tag.
import polynet from "/__polynet/sdk.js";
import { BASE_STYLE, h, styled, channelFromUrl, channelHref, selectChannel, pickChannel, readChannels } from "/__polynet/blocks/kit.js";

const STYLE = BASE_STYLE + "\n" + [
  ":host { display: block; }",
  "ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }",
  ".channel { display: flex; align-items: center; gap: .5em; min-height: 2.25em; padding: .3em .625em; border-radius: calc(var(--pn-radius) * .7);",
  "  text-decoration: none; color: var(--pn-muted); line-height: 1.3; }",
  "@media (hover: hover) { .channel:hover { color: inherit; background: var(--pn-tint); } }",
  ".channel.unread { color: inherit; font-weight: 600; }",
  ".channel[aria-current=page] { color: inherit; font-weight: 600; background: color-mix(in srgb, currentColor 8%, transparent); }",
  ".hash { opacity: .55; font-weight: 400; }",
  ".name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  ".dot { width: .5em; height: .5em; border-radius: 50%; background: var(--pn-accent); flex: none; }",
  ".mention { flex: none; min-width: 1.5em; height: 1.5em; padding: 0 .4em; border-radius: 999px; display: grid; place-items: center;",
  "  background: var(--pn-accent); color: var(--pn-on-accent); font-size: .75em; font-weight: 700; line-height: 1; }",
  ".status { color: var(--pn-muted); padding: .3em .625em; margin: 0; }",
  "@media (pointer: coarse) { .channel { min-height: 44px; } }",
].join("\n");

// Cheap upkeep: one live watch per channel (capped), and a re-read only when
// posts change somewhere, debounced.
const WATCH_LIMIT = 20;
const REFRESH_MS = 1200;

class PolynetChannels extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.status = "loading";
    this.list = [];
    this.selected = channelFromUrl();
    this.watches = new Map();
    this.generation = 0;
    this.onSelect = (event) => { this.selected = (event.detail && event.detail.slug) || channelFromUrl(); this.render(); };
    // Back and Forward change the channel too: say so, so every block follows.
    this.onPop = () => {
      this.selected = channelFromUrl();
      this.render();
      const current = this.current();
      if (current) document.dispatchEvent(new CustomEvent("polynet:channel", { detail: { slug: current.slug } }));
    };
    this.onRead = (event) => {
      const channel = this.list.find((entry) => entry.slug === (event.detail && event.detail.slug));
      if (channel && (channel.unread || channel.mentioned)) { channel.unread = false; channel.mentioned = false; this.render(); }
    };
    this.onFocus = () => { if (document.visibilityState === "visible" && this.status === "ready") this.refreshSoon(); };
  }

  connectedCallback() {
    document.addEventListener("polynet:channel", this.onSelect);
    document.addEventListener("polynet:read", this.onRead);
    document.addEventListener("visibilitychange", this.onFocus);
    window.addEventListener("popstate", this.onPop);
    window.addEventListener("focus", this.onFocus);
    this.load(false);
  }

  disconnectedCallback() {
    document.removeEventListener("polynet:channel", this.onSelect);
    document.removeEventListener("polynet:read", this.onRead);
    document.removeEventListener("visibilitychange", this.onFocus);
    window.removeEventListener("popstate", this.onPop);
    window.removeEventListener("focus", this.onFocus);
    clearTimeout(this.refreshTimer);
    this.generation += 1;
    this.unwatch(() => true);
  }

  current() {
    return pickChannel(this.list, this.selected);
  }

  async load(fresh) {
    const generation = ++this.generation;
    if (this.status !== "ready") this.show("loading");
    try {
      const session = await polynet.session();
      if (generation !== this.generation) return;
      if (!session.signed_in) { this.signedOut(); return; }
      const list = await readChannels(polynet, fresh);
      if (generation !== this.generation) return;
      this.list = list.map((channel) => Object.assign({}, channel));
      this.show("ready");
      this.watchAll();
    } catch (error) {
      if (generation !== this.generation) return;
      if (error && error.code === "sign_in_required") this.signedOut();
      else this.show("error");
    }
  }

  // Never a channel name to someone who isn't a signed-in member.
  signedOut() {
    this.list = [];
    this.unwatch(() => true);
    this.show("signed-out");
  }

  refreshSoon() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.load(true), REFRESH_MS);
  }

  watchAll() {
    const slugs = this.list.slice(0, WATCH_LIMIT).map((channel) => channel.slug);
    this.unwatch((slug) => slugs.indexOf(slug) === -1);
    for (const slug of slugs) {
      if (this.watches.has(slug)) continue;
      const watch = { stop: null };
      this.watches.set(slug, watch);
      let first = true;
      polynet.watch(slug, (update) => {
        // The first call is the state we just read.
        if (first) { first = false; return; }
        if (update.changed) this.refreshSoon();
      }).then((stop) => {
        if (this.watches.get(slug) === watch) watch.stop = stop;
        else stop();
      }, () => { if (this.watches.get(slug) === watch) this.watches.delete(slug); });
    }
  }

  unwatch(which) {
    for (const [slug, watch] of Array.from(this.watches)) {
      if (!which(slug)) continue;
      this.watches.delete(slug);
      if (watch.stop) watch.stop();
    }
  }

  show(status) {
    this.status = status;
    this.setAttribute("state", status);
    this.render();
  }

  links() {
    return Array.from(this.root.querySelectorAll("a.channel"));
  }

  onKey(event) {
    const links = this.links();
    const index = links.indexOf(this.root.activeElement);
    if (index === -1 || !links.length) return;
    let next = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (index + 1) % links.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (index - 1 + links.length) % links.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = links.length - 1;
    if (next === -1) return;
    event.preventDefault();
    links.forEach((link, i) => link.setAttribute("tabindex", i === next ? "0" : "-1"));
    links[next].focus();
  }

  onClick(event, slug) {
    // A new tab or window keeps the browser's own behavior.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    selectChannel(slug);
  }

  renderList() {
    const current = this.current();
    return h("ul", { part: "list", role: "list" }, this.list.map((channel) => {
      const isCurrent = current !== null && channel.slug === current.slug;
      const parts = ["channel"];
      if (isCurrent) parts.push("channel-current");
      if (channel.unread) parts.push("channel-unread");
      if (channel.mentioned) parts.push("channel-mentioned");
      const state = [channel.mentioned ? "mentions you" : null, channel.unread ? "unread" : null].filter(Boolean).join(", ");
      return h("li", {}, [h("a", {
        class: "channel" + (channel.unread ? " unread" : ""), part: parts.join(" "), href: channelHref(channel.slug),
        "data-slug": channel.slug, "aria-current": isCurrent ? "page" : null, tabindex: isCurrent ? "0" : "-1",
        onclick: (event) => this.onClick(event, channel.slug),
      }, [
        h("span", { class: "hash", part: "channel-hash", "aria-hidden": "true", text: "#" }),
        h("span", { class: "name", part: "channel-name", text: channel.name || channel.slug }),
        state ? h("span", { class: "sr", text: ", " + state }) : null,
        channel.mentioned ? h("span", { class: "mention", part: "mention-badge", "aria-hidden": "true", text: "@" }) : null,
        channel.unread && !channel.mentioned ? h("span", { class: "dot", part: "unread-dot", "aria-hidden": "true" }) : null,
      ])]);
    }));
  }

  render() {
    const focused = this.root.activeElement && this.root.activeElement.getAttribute("data-slug");
    const nodes = styled(this.root, STYLE);
    if (this.status === "ready") {
      nodes.push(h("nav", { part: "nav", "aria-label": "Channels", onkeydown: (event) => this.onKey(event) }, [
        h("slot", { name: "header" }),
        this.renderList(),
      ]));
    } else if (this.status === "loading") {
      nodes.push(h("p", { class: "status", part: "status", role: "status", text: "Loading channels…" }));
    } else if (this.status === "error") {
      nodes.push(h("div", { class: "status", part: "status", role: "alert" }, [
        "Couldn't load channels. ",
        h("button", { class: "quiet", part: "retry", type: "button", onclick: () => this.load(true), text: "Try again" }),
      ]));
    }
    this.root.replaceChildren(...nodes);
    if (focused) {
      const link = this.root.querySelector('a[data-slug="' + CSS.escape(focused) + '"]');
      if (link) { this.links().forEach((other) => other.setAttribute("tabindex", other === link ? "0" : "-1")); link.focus(); }
    }
  }
}

if (!customElements.get("polynet-channels")) customElements.define("polynet-channels", PolynetChannels);
`;
