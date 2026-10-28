// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// <polynet-personal>, served at /__polynet/blocks/personal.js on a site's
// private twin only (<slug>--me<suffix>.<sites domain>; the site itself answers
// 404): the member's own pages. <polynet-page> places it on /communities,
// /messages, /settings and /join there. The twin draws the site's frame with
// every script removed, so only Polynet's code runs beside it, and this block
// keeps its data in its shadow root, where the frame's CSS reaches only
// ::part(). Its data comes from /__polynet/me/*, which answers only the twin's
// own session (Join's read also answers signed out). Settings, Messages and
// Join are their own modules (blocks/settings.ts, blocks/messages.ts,
// blocks/join.ts), each loaded only on its page. Kept as text (a String.raw literal: no backticks or template
// placeholders inside) so the edge serves exactly what is reviewed.
export const PERSONAL_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block: <polynet-personal page="communities|messages|settings|join">.
// Only on a site's private twin, inside <polynet-page>. Style it with ::part():
// communities, community, community-avatar, community-name, community-role,
// community-here, community-elsewhere, empty, soon, signin, retry, and the
// settings, messages and join pages' parts (see /__polynet/blocks/settings.js,
// /__polynet/blocks/messages.js and /__polynet/blocks/join.js).
import { BASE_STYLE, h, styled, avatar } from "/__polynet/blocks/kit.js";

const STYLE = BASE_STYLE + "\n" + [
  ":host { display: block; }",
  ".communities { list-style: none; margin: 0; padding: 0; display: grid; gap: .75em; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16em), 1fr)); }",
  ".community { display: grid; grid-template-columns: 2.75em minmax(0, 1fr); gap: .25em .875em; align-content: start; height: 100%;",
  "  padding: 1em 1.125em; border: 1px solid var(--pn-border); border-radius: var(--pn-radius); text-decoration: none; line-height: 1.35; }",
  "@media (hover: hover) { .community:hover { border-color: color-mix(in srgb, var(--pn-accent) 60%, var(--pn-border)); } }",
  ".face { grid-row: span 2; width: 2.75em; }",
  ".name { font-weight: 600; font-size: 1.0625em; overflow-wrap: anywhere; }",
  ".meta { display: flex; flex-wrap: wrap; gap: .25em .75em; color: var(--pn-muted); font-size: .8125em; }",
  ".here { color: var(--pn-accent); font-weight: 600; }",
].join("\n");

const ROLES = { owner: "Owner", admin: "Admin", moderator: "Moderator", member: "Member" };

class PolynetPersonal extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.generation = 0;
    this.body = h("div", { class: "personal", part: "personal" });
    this.root.replaceChildren(...styled(this.root, STYLE), this.body);
  }

  connectedCallback() {
    this.load();
  }

  disconnectedCallback() {
    this.generation += 1;
    this.stop();
  }

  // A page module's live updates and timers end with the page (teardown is its own).
  stop() {
    const teardown = this.teardown;
    this.teardown = null;
    if (teardown) teardown();
  }

  show(status, children) {
    this.setAttribute("state", status);
    this.body.replaceChildren(...(children || []));
  }

  load() {
    const page = this.getAttribute("page");
    if (page === "communities") return this.loadCommunities();
    if (page === "settings") return this.loadModule("settings", "Couldn't load your settings.", (module, generation) => module.mountSettings(this, generation));
    if (page === "messages") return this.loadModule("messages", "Couldn't load your messages.", (module, generation) => module.mountMessages(this, generation));
    if (page === "join") return this.loadModule("join", "Couldn't load this page.", (module, generation) => module.mountJoin(this, generation));
    // The rest are built next; until then a quiet note in the site's own frame.
    this.show("soon", [h("div", { class: "state", part: "soon" }, [h("p", { class: "muted", text: "This page is coming soon." })])]);
  }

  async loadCommunities() {
    const generation = ++this.generation;
    this.show("loading", [h("p", { class: "muted", role: "status", text: "Loading…" })]);
    let res = null;
    let body = null;
    try {
      res = await fetch("/__polynet/me/communities", { credentials: "same-origin" });
      body = await res.json().catch(() => null);
    } catch (error) {
      res = null;
    }
    if (generation !== this.generation) return;
    if (res && res.status === 401) return this.signedOut("Sign in to see your communities.");
    if (!res || !res.ok || !body || !body.ok || !Array.isArray(body.communities)) {
      return this.show("error", [h("div", { class: "state", role: "alert" }, [
        h("p", { text: "Couldn't load your communities." }),
        h("button", { class: "quiet", part: "retry", type: "button", onclick: () => this.loadCommunities(), text: "Try again" }),
      ])]);
    }
    const communities = body.communities.filter((community) => community && /^https:\/\//.test(String(community.url || "")));
    if (!communities.length) {
      return this.show("empty", [h("div", { class: "state", part: "empty" }, [
        h("p", { text: "You're not in any communities yet." }),
      ])]);
    }
    this.show("ready", [h("ul", { class: "communities", part: "communities", role: "list", "aria-label": "Your communities" },
      communities.map((community) => this.card(community)))]);
  }

  // A page with its own module (settings, messages): loaded on that page only.
  async loadModule(name, failure, mount) {
    this.stop();
    const generation = ++this.generation;
    this.show("loading", [h("p", { class: "muted", role: "status", text: "Loading…" })]);
    let module = null;
    try {
      module = await import("/__polynet/blocks/" + name + ".js");
    } catch (error) {
      module = null;
    }
    if (generation !== this.generation) return;
    if (!module) {
      return this.show("error", [h("div", { class: "state", role: "alert" }, [
        h("p", { text: failure }),
        h("button", { class: "quiet", part: "retry", type: "button", onclick: () => this.load(), text: "Try again" }),
      ])]);
    }
    return mount(module, generation);
  }

  // Signed out here (the session ended): the same hop as the site's sign-in.
  signedOut(text) {
    const back = location.pathname + location.search;
    this.show("signed-out", [h("div", { class: "state" }, [
      h("p", { text: text }),
      h("div", { class: "actions" }, [
        h("button", { class: "primary", part: "signin", type: "button", text: "Sign in",
          onclick: () => { location.href = "/__polynet/auth/start?return=" + encodeURIComponent(back); } }),
      ]),
    ])]);
  }

  card(community) {
    const meta = [h("span", { part: "community-role", text: ROLES[community.role] || "Member" })];
    if (community.here) meta.push(h("span", { class: "here", part: "community-here", text: "You're here" }));
    else if (!community.has_site) meta.push(h("span", { part: "community-elsewhere", text: "On Polynet" }));
    return h("li", { part: "community-item" }, [
      h("a", { class: "community", part: "community", href: community.url, "data-slug": community.slug }, [
        h("span", { class: "face", part: "community-avatar" }, [avatar({ avatar_url: community.avatar_url }, community.name)]),
        h("span", { class: "name", part: "community-name", text: community.name }),
        h("span", { class: "meta", part: "community-meta" }, meta),
      ]),
    ]);
  }
}

if (!customElements.get("polynet-personal")) customElements.define("polynet-personal", PolynetPersonal);
`;
