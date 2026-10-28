// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// <polynet-discover>, served at /__polynet/blocks/discover.js: the published
// communities on Polynet, in this site's style, signed in or not. Each card
// opens that community's own site when it has one, else its page on Polynet,
// in the same tab. Public data only (the edge's /__polynet/discover), so it
// never reads the session. Kept as text (a String.raw literal: no backticks or
// template placeholders inside) so the edge serves exactly what is reviewed.
export const DISCOVER_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block: <polynet-discover>. ui.js loads it on pages that place the tag.
//   <polynet-discover></polynet-discover>            every community, with a search
//   <polynet-discover limit="3"></polynet-discover>  the first three and a link to /discover (for a home page)
import polynet from "/__polynet/sdk.js";
import { BASE_STYLE, h, styled, avatar } from "/__polynet/blocks/kit.js";

const STYLE = BASE_STYLE + "\n" + [
  ":host { display: block; }",
  ".discover { display: grid; gap: 1em; }",
  ".intro { margin: 0; color: var(--pn-muted); line-height: 1.5; }",
  ".search { display: block; width: 100%; padding: .5em .75em; font: inherit; color: inherit; background: none;",
  "  border: 1px solid var(--pn-border); border-radius: calc(var(--pn-radius) * .7); }",
  ".search::placeholder { color: var(--pn-muted); opacity: 1; }",
  ".search:focus { outline: none; border-color: var(--pn-accent); }",
  ".communities { list-style: none; margin: 0; padding: 0; display: grid; gap: .75em; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16em), 1fr)); }",
  ".community { display: grid; grid-template-columns: 2.75em minmax(0, 1fr); gap: .25em .875em; align-content: start; height: 100%;",
  "  padding: 1em 1.125em; border: 1px solid var(--pn-border); border-radius: var(--pn-radius); text-decoration: none; line-height: 1.35; }",
  "@media (hover: hover) { .community:hover { border-color: color-mix(in srgb, var(--pn-accent) 60%, var(--pn-border)); } }",
  ".face { grid-row: span 3; width: 2.75em; }",
  ".name { font-weight: 600; font-size: 1.0625em; overflow-wrap: anywhere; }",
  ".one-liner { color: var(--pn-muted); font-size: .9375em; overflow-wrap: anywhere; }",
  ".meta { display: flex; flex-wrap: wrap; gap: .25em .75em; color: var(--pn-muted); font-size: .8125em; }",
  ".members { font-variant-numeric: tabular-nums; }",
  ".here { color: var(--pn-accent); font-weight: 600; }",
  ".none { color: var(--pn-muted); margin: 0; }",
  ".more-wrap { margin: 0; }",
  "@media (pointer: coarse) { .search { font-size: max(1em, 16px); } }",
].join("\n");

const BASE = "/discover";
const collator = new Intl.Collator(undefined, { sensitivity: "base" });

function fold(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function memberCount(n) {
  return n === 1 ? "1 member" : Number(n || 0).toLocaleString() + " members";
}

class PolynetDiscover extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.generation = 0;
    this.all = [];
    this.search = h("input", { class: "search", part: "search", type: "search", placeholder: "Search communities",
      "aria-label": "Search communities", autocomplete: "off", spellcheck: "false", maxlength: "120",
      oninput: () => this.renderList() });
    this.intro = h("p", { class: "intro", part: "intro" }, [h("slot", { name: "intro" }, [
      "Communities on Polynet, each in its own world.",
    ])]);
    this.list = h("div", { class: "list", part: "list" });
    this.found = h("p", { class: "sr", role: "status" });
    this.frame = h("div", { class: "discover", part: "discover", role: "region", "aria-label": "Discover communities", hidden: true }, [
      h("slot", { name: "header" }), this.intro, this.search, this.found, this.list,
    ]);
    this.state = h("div", { class: "state", part: "state" });
    this.root.replaceChildren(...styled(this.root, STYLE), this.frame, this.state);
  }

  connectedCallback() {
    this.load();
  }

  disconnectedCallback() {
    this.generation += 1;
  }

  // limit="n" is a preview: the first few, no search, and the way to the rest.
  limit() {
    const n = Number(this.getAttribute("limit"));
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  show(status, children) {
    this.setAttribute("state", status);
    this.frame.hidden = status !== "ready";
    this.state.hidden = status === "ready";
    this.state.replaceChildren(...(children || []));
  }

  async load() {
    const generation = ++this.generation;
    this.show("loading", [h("p", { class: "muted", role: "status", text: "Loading…" })]);
    try {
      const communities = await polynet.discover();
      if (generation !== this.generation) return;
      this.all = (communities || []).filter((community) => community && community.url);
      this.search.hidden = this.limit() !== null;
      this.renderList();
      this.show("ready");
    } catch (error) {
      if (generation !== this.generation) return;
      this.show("error", [h("div", { role: "alert" }, [
        h("p", { text: "Couldn't load communities." }),
        h("button", { class: "quiet", part: "retry", type: "button", onclick: () => this.load(), text: "Try again" }),
      ])]);
    }
  }

  // A search matches a name or one-liner, ignoring case and accents; the best
  // matches (the name starts with it) come first.
  matches() {
    const query = this.limit() === null ? fold(this.search.value.trim()) : "";
    if (!query) return this.all;
    const hits = this.all.filter((community) => fold(community.name).indexOf(query) !== -1 || fold(community.one_liner).indexOf(query) !== -1);
    const starts = (community) => (fold(community.name).indexOf(query) === 0 ? 0 : 1);
    return hits.slice().sort((a, b) => starts(a) - starts(b) || collator.compare(a.name, b.name));
  }

  renderList() {
    const query = this.search.value.trim();
    const limit = this.limit();
    const shown = this.matches().slice(0, limit || undefined);
    const nodes = [];
    if (!this.all.length) {
      nodes.push(h("div", { class: "none", part: "empty" }, [h("slot", { name: "empty" }, ["No communities to discover yet."])]));
    } else if (!shown.length) {
      nodes.push(h("p", { class: "none", part: "no-results", text: "No communities match “" + query + "”." }));
    } else {
      nodes.push(h("ul", { class: "communities", part: "communities", role: "list", "aria-label": query ? "Communities matching " + query : "Communities" },
        shown.map((community) => this.card(community))));
    }
    if (limit && this.all.length > limit && location.pathname.replace(/\/$/, "") !== BASE) {
      nodes.push(h("p", { class: "more-wrap" }, [h("a", { class: "quiet", part: "all", href: BASE, text: "All communities" })]));
    }
    this.list.replaceChildren(...nodes);
    this.found.textContent = query ? (shown.length === 1 ? "1 community" : shown.length + " communities") : "";
  }

  card(community) {
    const meta = [h("span", { class: "members", part: "community-members", text: memberCount(community.member_count) })];
    if (community.here) meta.push(h("span", { class: "here", part: "community-here", text: "You're here" }));
    // Without its own site, the card opens the community's page on Polynet: say so before the hop.
    else if (!community.has_site) meta.push(h("span", { part: "community-elsewhere", text: "On Polynet" }));
    return h("li", { part: "community-item" }, [
      h("a", { class: "community", part: "community", href: community.url, "data-slug": community.slug }, [
        h("span", { class: "face", part: "community-avatar" }, [avatar({ avatar_url: community.avatar_url }, community.name)]),
        h("span", { class: "name", part: "community-name", text: community.name }),
        community.one_liner ? h("span", { class: "one-liner", part: "community-one-liner", text: community.one_liner }) : null,
        h("span", { class: "meta", part: "community-meta" }, meta),
      ]),
    ]);
  }
}

if (!customElements.get("polynet-discover")) customElements.define("polynet-discover", PolynetDiscover);
`;
