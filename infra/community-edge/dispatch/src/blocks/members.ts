// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// <polynet-members>, served at /__polynet/blocks/members.js: everyone in the
// community, online first, searchable, live. Each member opens the profile
// panel (profile.js). Kept as text (a String.raw literal: no backticks or
// template placeholders inside) so the edge serves exactly what is reviewed.
export const MEMBERS_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block: <polynet-members>. ui.js loads it on pages that place the tag.
import polynet from "/__polynet/sdk.js";
import { BASE_STYLE, h, styled, avatar, roleLabel, memberHref, openProfile, plainClick, readMembers } from "/__polynet/blocks/kit.js";

const STYLE = BASE_STYLE + "\n" + [
  ":host { display: block; }",
  ".search { display: block; width: 100%; margin: 0 0 .75em; padding: .5em .75em; font: inherit; color: inherit; background: none;",
  "  border: 1px solid var(--pn-border); border-radius: calc(var(--pn-radius) * .7); }",
  ".search::placeholder { color: var(--pn-muted); opacity: 1; }",
  ".search:focus { outline: none; border-color: var(--pn-accent); }",
  ".section + .section { margin-top: 1em; }",
  ".section-title { display: flex; gap: .5em; margin: 0 0 .25em; padding: 0 .625em; font-size: .75em; font-weight: 600; letter-spacing: .05em;",
  "  text-transform: uppercase; color: var(--pn-muted); }",
  ".count { font-variant-numeric: tabular-nums; font-weight: 400; }",
  // minmax(0, 1fr): a long name truncates instead of widening the column.
  "ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; }",
  "li { min-width: 0; }",
  ".member { display: flex; align-items: center; gap: .625em; width: 100%; min-height: 2.75em; padding: .3em .625em; margin: 0;",
  "  border: 0; border-radius: calc(var(--pn-radius) * .7); background: none; text-align: left; text-decoration: none; line-height: 1.3; }",
  "@media (hover: hover) { .member:hover { background: var(--pn-tint); } }",
  ".face { position: relative; width: 2em; flex: none; }",
  ".dot { position: absolute; right: -.0625em; bottom: -.0625em; width: .625em; height: .625em; border-radius: 50%; background: var(--pn-accent);",
  "  box-shadow: 0 0 0 2px var(--pn-surface); }",
  ".who { flex: 1; min-width: 0; display: flex; flex-direction: column; }",
  ".name, .handle { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  ".handle { color: var(--pn-muted); font-size: .8125em; }",
  ".badge { flex: 0 1 auto; min-width: 0; max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .6875em; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--pn-muted);",
  "  border: 1px solid var(--pn-border); border-radius: 999px; padding: .125em .55em; }",
  ".more { margin: .5em .625em 0; }",
  ".none { color: var(--pn-muted); padding: .5em .625em; margin: 0; }",
  ".status { color: var(--pn-muted); padding: .3em .625em; margin: 0; }",
  "@media (pointer: coarse) { .member { min-height: 44px; } .search { font-size: max(1em, 16px); } }",
].join("\n");

// Large communities render a page at a time, the next as the list scrolls.
const PAGE = 200;
const REFRESH_MS = 1500;
// Mounting reuses another block's members read only this recent: presence in
// an older one may be stale, and the watch's first call is skipped below.
const MOUNT_FRESH_MS = 1000;
const RANK = { owner: 0, admin: 1, moderator: 2 };
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
let counter = 0;

function fold(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function byRoleThenName(a, b) {
  const rank = (member) => (Object.hasOwn(RANK, member.role) ? RANK[member.role] : 3);
  return rank(a) - rank(b) || collator.compare(a.name, b.name);
}
function keyOf(member) {
  return member.ref || member.handle || member.name;
}

class PolynetMembers extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.uid = "pn-members-" + (++counter);
    this.status = "loading";
    this.list = [];
    this.limit = PAGE;
    this.generation = 0;
    this.stopWatch = null;
    this.watching = false;
    this.onFocus = () => { if (document.visibilityState === "visible" && this.status === "ready") this.refreshSoon(); };
    this.more = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) this.showMore();
    });
    this.build();
  }

  // The frame is built once, so the search box keeps its text and focus; renders fill the list.
  build() {
    this.search = h("input", {
      class: "search", part: "search", type: "search", placeholder: "Search members", "aria-label": "Search members",
      autocomplete: "off", spellcheck: "false", "aria-controls": this.uid + "-list",
      oninput: () => { this.limit = PAGE; this.renderList(); },
      onkeydown: (event) => {
        const first = this.items()[0];
        if (event.key === "ArrowDown" && first) { event.preventDefault(); this.focusItem(first); }
      },
    });
    this.found = h("p", { class: "sr", role: "status" });
    this.body = h("div", { class: "body", part: "list", id: this.uid + "-list", onkeydown: (event) => this.onKey(event) });
    this.frame = h("div", { class: "members", part: "members", role: "region", "aria-label": "Members", hidden: true }, [
      h("slot", { name: "header" }), this.search, this.found, this.body,
    ]);
    this.state = h("div", { class: "state", part: "state" });
    this.root.replaceChildren(...styled(this.root, STYLE), this.frame, this.state);
  }

  connectedCallback() {
    document.addEventListener("visibilitychange", this.onFocus);
    window.addEventListener("focus", this.onFocus);
    this.load(false);
  }

  disconnectedCallback() {
    document.removeEventListener("visibilitychange", this.onFocus);
    window.removeEventListener("focus", this.onFocus);
    clearTimeout(this.refreshTimer);
    this.more.disconnect();
    this.generation += 1;
    this.stopLive();
  }

  stopLive() {
    if (this.stopWatch) this.stopWatch();
    this.stopWatch = null;
    this.watching = false;
  }

  async load(fresh) {
    const generation = ++this.generation;
    if (this.status !== "ready") this.show("loading");
    try {
      const session = await polynet.session();
      if (generation !== this.generation) return;
      if (!session.signed_in) { this.signedOut(session); return; }
      this.me = session.member || null;
      const list = await readMembers(polynet, fresh ? true : MOUNT_FRESH_MS);
      if (generation !== this.generation) return;
      this.list = list.map((member) => Object.assign({}, member)).sort(byRoleThenName);
      if (this.status === "ready") this.renderList();
      else this.show("ready");
      this.watchOnline();
    } catch (error) {
      if (generation !== this.generation) return;
      if (error && error.code === "sign_in_required") this.signedOut(await polynet.session().catch(() => ({})));
      // A passing failure on a live re-read keeps the list on screen.
      else if (this.status !== "ready") this.show("error");
    }
  }

  // Never a name to someone who isn't a signed-in member.
  signedOut(session) {
    this.list = [];
    this.stopLive();
    this.session = session || {};
    this.show("signed-out");
  }

  // Who's online changes: re-read (debounced). The first call is the state just
  // read (load never reuses an older one on mount).
  async watchOnline() {
    if (this.watching) return;
    this.watching = true;
    const generation = this.generation;
    let first = true;
    try {
      const stop = await polynet.watchOnline(() => {
        if (first) { first = false; return; }
        this.refreshSoon();
      });
      if (!this.isConnected || !this.watching) { stop(); return; }
      this.stopWatch = stop;
    } catch (error) {
      // Without live updates the list still refreshes when the tab regains focus.
      if (generation === this.generation) this.watching = false;
    }
  }

  refreshSoon() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.load(true), REFRESH_MS);
  }

  show(status) {
    this.status = status;
    this.setAttribute("state", status);
    this.frame.hidden = status !== "ready";
    this.state.hidden = status === "ready";
    if (status === "ready") {
      this.state.replaceChildren();
      this.renderList();
      return;
    }
    this.body.replaceChildren();
    this.more.disconnect();
    if (status === "loading") {
      this.state.replaceChildren(h("p", { class: "status", role: "status", text: "Loading members…" }));
    } else if (status === "error") {
      this.state.replaceChildren(h("div", { class: "status", role: "alert" }, [
        "Couldn't load members. ",
        h("button", { class: "quiet", part: "retry", type: "button", onclick: () => this.load(true), text: "Try again" }),
      ]));
    } else if (status === "signed-out") {
      const join = this.session && this.session.join_url
        ? h("a", { class: "quiet", part: "join", href: this.session.join_url, text: "New here? Join" }) : null;
      this.state.replaceChildren(h("div", { class: "gate", part: "gate" }, [
        h("p", { part: "gate-text" }, [h("slot", { name: "signed-out" }, ["Sign in to see who's here."])]),
        h("div", { class: "actions" }, [
          h("button", { class: "primary", part: "sign-in", type: "button", onclick: () => polynet.signIn(), text: "Sign in" }),
          join,
        ]),
      ]));
    }
  }

  matches() {
    const query = fold(this.search.value.trim()).replace(/^@/, "");
    if (!query) return this.list;
    return this.list.filter((member) => fold(member.name).indexOf(query) !== -1 || (member.handle && member.handle.toLowerCase().indexOf(query) !== -1));
  }

  showMore() {
    if (this.status !== "ready" || this.limit >= this.matches().length) return;
    this.limit += PAGE;
    this.renderList();
  }

  renderList() {
    const focused = this.root.activeElement && this.root.activeElement.getAttribute("data-key");
    const query = this.search.value.trim();
    const shown = this.matches();
    const online = shown.filter((member) => member.online);
    const rest = shown.filter((member) => !member.online);
    let budget = this.limit;
    const take = (members) => { const page = members.slice(0, Math.max(0, budget)); budget -= page.length; return page; };
    const nodes = [];
    if (online.length) nodes.push(this.section("online", "Online", online.length, take(online)));
    const restPage = take(rest);
    if (restPage.length) nodes.push(this.section("everyone", online.length ? "Everyone else" : "Everyone", rest.length, restPage));
    if (!this.list.length) {
      nodes.push(h("div", { class: "none", part: "empty" }, [h("slot", { name: "empty" }, ["No members yet."])]));
    } else if (!shown.length) {
      nodes.push(h("p", { class: "none", part: "no-results", text: "No one matches “" + query + "”." }));
    }
    const remaining = shown.length - Math.min(shown.length, this.limit);
    const more = remaining > 0 ? h("button", {
      class: "quiet more", part: "more", type: "button", onclick: () => this.showMore(),
      text: "Show " + Math.min(PAGE, remaining) + " more",
    }) : null;
    if (more) nodes.push(more);
    this.body.replaceChildren(...nodes);
    this.found.textContent = query ? shown.length + (shown.length === 1 ? " member found" : " members found") : "";
    this.more.disconnect();
    if (more) this.more.observe(more);
    // One tab stop in the list: the member that had focus, else the first.
    const items = this.items();
    const keep = focused ? items.find((item) => item.getAttribute("data-key") === focused) : null;
    const stop = keep || items[0];
    if (stop) stop.setAttribute("tabindex", "0");
    if (keep) keep.focus();
  }

  section(kind, label, total, members) {
    const id = this.uid + "-" + kind;
    return h("section", { class: "section", part: "section section-" + kind }, [
      h("p", { class: "section-title", part: "section-title", id: id }, [label, h("span", { class: "count", text: String(total) })]),
      h("ul", { role: "list", "aria-labelledby": id }, members.map((member) => this.item(member))),
    ]);
  }

  item(member) {
    const key = keyOf(member);
    const role = roleLabel(member.role);
    const handle = member.handle || null;
    const mine = !!(this.me && this.me.handle && handle && handle.toLowerCase() === String(this.me.handle).toLowerCase());
    const parts = ["member"];
    if (member.online) parts.push("member-online");
    if (mine) parts.push("member-you");
    const state = [member.online ? "online" : null, role, mine ? "you" : null].filter(Boolean).join(", ");
    const attrs = {
      class: "member", part: parts.join(" "), "data-key": key, tabindex: "-1",
      onclick: (event) => this.open(event, member),
    };
    const children = [
      h("span", { class: "face" }, [
        avatar(member, member.name),
        member.online ? h("span", { class: "dot", part: "presence-dot", "aria-hidden": "true" }) : null,
      ]),
      h("span", { class: "who" }, [
        h("span", { class: "name", part: "member-name", text: member.name }),
        handle ? h("span", { class: "handle", part: "member-handle", text: "@" + handle }) : null,
      ]),
      state ? h("span", { class: "sr", text: ", " + state }) : null,
      role ? h("span", { class: "badge", part: "role-badge role-" + member.role, "aria-hidden": "true", text: role }) : null,
    ];
    // A member with a handle is a link (?member=<handle>), so it opens in a new tab too.
    const node = handle ? h("a", Object.assign(attrs, { href: memberHref(handle) }), children)
      : h("button", Object.assign(attrs, { type: "button" }), children);
    return h("li", {}, [node]);
  }

  open(event, member) {
    if (member.handle && !plainClick(event)) return;
    event.preventDefault();
    const key = keyOf(member);
    openProfile({ handle: member.handle, ref: member.ref, name: member.name, avatar_url: member.avatar_url },
      () => this.items().find((item) => item.getAttribute("data-key") === key) || this.search).catch(() => {});
  }

  items() {
    return Array.from(this.body.querySelectorAll(".member"));
  }

  focusItem(item) {
    for (const other of this.items()) other.setAttribute("tabindex", other === item ? "0" : "-1");
    item.focus();
  }

  onKey(event) {
    const items = this.items();
    const index = items.indexOf(this.root.activeElement);
    if (index === -1) return;
    let next = null;
    if (event.key === "ArrowDown") next = items[Math.min(index + 1, items.length - 1)];
    else if (event.key === "ArrowUp") next = index === 0 ? this.search : items[index - 1];
    else if (event.key === "Home") next = items[0];
    else if (event.key === "End") next = items[items.length - 1];
    if (!next) return;
    event.preventDefault();
    if (next === this.search) this.search.focus();
    else this.focusItem(next);
  }
}

if (!customElements.get("polynet-members")) customElements.define("polynet-members", PolynetMembers);
`;
