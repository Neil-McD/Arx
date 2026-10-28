// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// The profile panel, served at /__polynet/blocks/profile.js: one member's
// profile over the page (a side sheet, or a bottom sheet on a phone), with a
// way to message them. Any block opens it (kit's openProfile); ui.js opens it
// for ?member=<handle> links and the "polynet:profile" event. Kept as text (a
// String.raw literal: no backticks or template placeholders inside) so the
// edge serves exactly what is reviewed.
export const PROFILE_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block part: the profile panel (<polynet-profile>). Blocks and ui.js open it.
import polynet from "/__polynet/sdk.js";
import { BASE_STYLE, h, avatar, roleLabel } from "/__polynet/blocks/kit.js";

const STYLE = BASE_STYLE + "\n" + [
  ":host { display: contents; }",
  ".sheet { position: fixed; inset: 0 0 0 auto; margin: 0; width: min(24em, 100vw); max-width: 100vw; height: 100%; max-height: none; padding: 0;",
  "  border: 0; border-left: 1px solid var(--pn-border); background: var(--pn-surface); color: var(--pn-surface-text);",
  "  box-shadow: -12px 0 40px rgba(0,0,0,.16); overflow-y: auto; overscroll-behavior: contain; }",
  ".sheet::backdrop { background: rgba(0,0,0,.32); }",
  ".inner { position: relative; padding: 1.25em 1.5em max(1.75em, env(safe-area-inset-bottom)); }",
  ".close { position: absolute; top: .75em; right: .75em; width: 2.25em; height: 2.25em; border: 0; border-radius: 50%; background: none; color: inherit; }",
  "@media (hover: hover) { .close:hover { background: var(--pn-tint); } }",
  ".close::before, .close::after { content: ''; position: absolute; left: 50%; top: 50%; width: .875em; height: 1.5px; background: currentColor; }",
  ".close::before { transform: translate(-50%, -50%) rotate(45deg); } .close::after { transform: translate(-50%, -50%) rotate(-45deg); }",
  ".face { position: relative; width: 4.5em; margin: .75em 0 1em; }",
  ".face .avatar { font-size: 1.375em; }",
  ".blank { display: block; width: 100%; aspect-ratio: 1; border-radius: 50%; background: var(--pn-tint); }",
  ".dot { position: absolute; right: .125em; bottom: .125em; width: .875em; height: .875em; border-radius: 50%; background: var(--pn-accent);",
  "  box-shadow: 0 0 0 2.5px var(--pn-surface); }",
  ".name { margin: 0; padding-right: 2em; font-size: 1.375em; line-height: 1.25; font-weight: 650; overflow-wrap: anywhere; }",
  ".name:focus { outline: none; }",
  ".meta { display: flex; flex-wrap: wrap; align-items: center; gap: .375em .75em; margin-top: .375em; color: var(--pn-muted); }",
  ".badge { font-size: .6875em; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; border: 1px solid var(--pn-border); border-radius: 999px; padding: .125em .55em; }",
  ".online { display: inline-flex; align-items: center; gap: .375em; }",
  ".online::before { content: ''; width: .5em; height: .5em; border-radius: 50%; background: var(--pn-accent); }",
  ".bio { margin: 1.25em 0 0; white-space: pre-line; line-height: 1.55; overflow-wrap: anywhere; }",
  ".links { display: flex; flex-wrap: wrap; gap: .5em 1.25em; margin: 1.25em 0 0; padding: 0; list-style: none; }",
  ".link { text-decoration: underline; text-decoration-color: var(--pn-border); text-underline-offset: .2em; }",
  ".link:hover { text-decoration-color: currentColor; }",
  ".reach { margin-top: 1.75em; }",
  ".reach .primary { display: inline-flex; align-items: center; text-decoration: none; }",
  ".note { margin: .5em 0 0; font-size: .8125em; color: var(--pn-muted); }",
  ".status { margin: 1em 0 0; color: var(--pn-muted); }",
  ".gate p { margin: 1em 0; line-height: 1.55; }",
  "@media (max-width: 640px) {",
  "  .sheet { inset: auto 0 0 0; width: 100%; height: auto; max-height: 85dvh; border-left: 0; border-top: 1px solid var(--pn-border);",
  "    border-radius: var(--pn-radius) var(--pn-radius) 0 0; box-shadow: 0 -12px 40px rgba(0,0,0,.16); }",
  "}",
  "@media (pointer: coarse) { .close { width: 44px; height: 44px; } }",
  "@media (prefers-reduced-motion: no-preference) {",
  "  .sheet[open] { animation: pn-side .18s ease-out; }",
  "  @media (max-width: 640px) { .sheet[open] { animation-name: pn-up; } }",
  "}",
  "@keyframes pn-side { from { transform: translateX(1.5em); opacity: 0; } to { transform: none; opacity: 1; } }",
  "@keyframes pn-up { from { transform: translateY(1.5em); opacity: 0; } to { transform: none; opacity: 1; } }",
].join("\n");

const LINKS = [["youtube", "YouTube"], ["x", "X"], ["instagram", "Instagram"]];
let counter = 0;

// What can name a member: a handle (as Polynet makes them) or a user ref.
// Anything else (from a URL or site code) is ignored before it reaches a path.
export function cleanHandle(value) {
  const handle = String(value || "").trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(handle) ? handle : null;
}
function cleanRef(value) {
  const ref = String(value || "").trim();
  return /^user:[A-Za-z0-9_-]{1,128}$/.test(ref) ? ref : null;
}

// Only web links leave the site: javascript:, data: and the rest are dropped.
export function safeLink(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch (error) {
    return null;
  }
}

function memberFromUrl() {
  return cleanHandle(new URLSearchParams(location.search).get("member"));
}
function urlWith(handle) {
  const params = new URLSearchParams(location.search);
  if (handle) params.set("member", handle);
  else params.delete("member");
  const search = params.toString();
  return location.pathname + (search ? "?" + search : "") + location.hash;
}

// Message opens the member's Polynet inbox for now (Polynet has no link to one
// person's conversation yet). Read once per page.
let messagesRead = null;
function readMessagesLink() {
  if (!messagesRead) {
    const promise = polynet.account().then((account) => safeLink(account && account.links && account.links.messages));
    messagesRead = promise;
    promise.catch(() => { if (messagesRead === promise) messagesRead = null; });
  }
  return messagesRead;
}

class PolynetProfile extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.uid = "pn-profile-" + (++counter);
    this.generation = 0;
    this.isOpen = false;
    this.target = null;
    this.status = "loading";
    // How the URL holds the open profile: "pushed" (Back closes it) or "url" (it was there on arrival).
    this.entry = null;
    this.closeButton = h("button", { class: "close", part: "close", type: "button", "aria-label": "Close profile", onclick: () => this.close(false) });
    this.content = h("div", { class: "content" });
    this.dialog = h("dialog", {
      class: "sheet", part: "panel", "aria-labelledby": this.uid + "-name",
      // Esc: closed here, so the URL and focus are put back too.
      oncancel: (event) => { event.preventDefault(); this.close(false); },
      // The browser closed it (a close event can also arrive late, after it reopened).
      onclose: () => { if (this.isOpen && !this.dialog.open) this.close(false); },
      onclick: (event) => this.onBackdrop(event),
      onkeydown: (event) => this.onKey(event),
    }, [h("div", { class: "inner" }, [this.closeButton, this.content])]);
    this.root.replaceChildren(h("style", { text: STYLE }), this.dialog);
  }

  disconnectedCallback() {
    this.generation += 1;
    this.isOpen = false;
  }

  // who: { handle } or { ref }, plus name and avatar_url when the opener knows
  // them (shown while the rest loads). opener (an element, or a function that
  // finds it) gets focus back on close.
  show(who, opener, fromUrl) {
    who = who || {};
    const handle = cleanHandle(who.handle);
    const ref = cleanRef(who.ref);
    if (!handle && !ref) return;
    if (this.isOpen && this.target && (handle ? this.target.handle === handle : this.target.ref === ref)) return;
    if (!this.isOpen) this.opener = opener || null;
    this.target = { handle: handle, ref: ref };
    this.preview = who.name ? { name: String(who.name), avatar_url: who.avatar_url || null } : null;
    this.data = null;
    if (fromUrl) this.entry = this.entry || "url";
    else this.holdUrl(handle);
    this.setStatus("loading");
    if (!this.isOpen) {
      this.isOpen = true;
      this.setAttribute("open", "");
      if (!this.dialog.open) this.dialog.showModal();
      this.closeButton.focus();
    }
    this.load(++this.generation);
  }

  // The URL names the open profile, so it can be shared. While a close's
  // history.back() is on its way, the URL waits for it.
  holdUrl(handle) {
    if (this.backPending) { this.wantUrl = handle; return; }
    if (!handle || memberFromUrl() === handle) return;
    if (this.entry === "pushed") {
      history.replaceState(history.state, "", urlWith(handle));
    } else {
      history.pushState(history.state, "", urlWith(handle));
      this.entry = "pushed";
    }
  }

  // fromHistory: Back (or Forward) already changed the URL.
  close(fromHistory) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.generation += 1;
    this.removeAttribute("open");
    if (this.dialog.open) this.dialog.close();
    const entry = this.entry;
    this.entry = null;
    if (!fromHistory && memberFromUrl()) {
      if (entry === "pushed" && this.target && memberFromUrl() === this.target.handle) {
        this.backPending = true;
        history.back();
      } else {
        history.replaceState(history.state, "", urlWith(null));
      }
    }
    const opener = typeof this.opener === "function" ? this.opener() : this.opener;
    this.opener = null;
    if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus();
  }

  async load(generation) {
    try {
      const session = await polynet.session();
      if (generation !== this.generation) return;
      if (!session.signed_in) { this.signedOut(session); return; }
      const me = session.member || {};
      const data = await polynet.profile(this.target.handle || { ref: this.target.ref });
      if (generation !== this.generation) return;
      this.data = data || {};
      const handle = cleanHandle(this.data.handle);
      this.mine = !!(handle && me.handle && handle === String(me.handle).toLowerCase());
      if (!this.target.handle && handle) { this.target.handle = handle; this.holdUrl(handle); }
      this.setStatus("ready");
      // Nobody messages themselves.
      if (this.mine) return;
      const link = await readMessagesLink().catch(() => null);
      if (generation !== this.generation || !link || !this.reach) return;
      this.reach.replaceChildren(
        h("a", { class: "primary", part: "message", href: link, "aria-label": "Message " + (this.data.name || "@" + handle), text: "Message" }),
        h("p", { class: "note", part: "message-note", text: "Opens your messages in Polynet." }),
      );
    } catch (error) {
      if (generation !== this.generation) return;
      const code = error && error.code;
      if (code === "sign_in_required") this.signedOut(await polynet.session().catch(() => ({})));
      else this.setStatus(code === "semantic_not_found" || code === "not_found" ? "missing" : "error");
    }
  }

  // Signed out: a way in, and nothing about the member.
  signedOut(session) {
    if (!this.isOpen) return;
    this.session = session || {};
    this.data = null;
    this.preview = null;
    this.setStatus("signed-out");
  }

  setStatus(status) {
    this.status = status;
    this.setAttribute("state", status);
    this.render();
  }

  onBackdrop(event) {
    if (event.target !== this.dialog) return;
    const box = this.dialog.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) this.close(false);
  }

  // Tab stays in the panel.
  onKey(event) {
    if (event.key !== "Tab") return;
    const stops = Array.from(this.dialog.querySelectorAll("a[href], button:not([disabled])")).filter((node) => node.getClientRects().length);
    if (!stops.length) return;
    const active = this.root.activeElement;
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (event.shiftKey && (active === first || !stops.includes(active))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (active === last || !stops.includes(active))) { event.preventDefault(); first.focus(); }
  }

  title(text) {
    return h("h2", { class: "name", part: "name", id: this.uid + "-name", text: text });
  }

  render() {
    this.reach = null;
    const nodes = [];
    if (this.status === "ready") {
      nodes.push(...this.renderProfile(this.data).filter(Boolean));
    } else if (this.status === "signed-out") {
      const session = this.session || {};
      nodes.push(h("div", { class: "gate", part: "gate" }, [
        h("div", { class: "face" }, [h("span", { class: "blank", "aria-hidden": "true" })]),
        this.title("Member profile"),
        h("p", { part: "gate-text", text: "Sign in to see members' profiles." }),
        h("div", { class: "actions" }, [
          h("button", { class: "primary", part: "sign-in", type: "button", text: "Sign in", onclick: () => polynet.signIn(location.pathname + location.search) }),
          session.join_url ? h("a", { class: "quiet", part: "join", href: session.join_url, text: "New here? Join" }) : null,
        ]),
      ]));
    } else {
      const preview = this.preview;
      nodes.push(
        h("div", { class: "face" }, [preview ? avatar(preview, preview.name) : h("span", { class: "blank", "aria-hidden": "true" })]),
        this.title(preview ? preview.name : this.target && this.target.handle ? "@" + this.target.handle : "Profile"),
      );
      if (this.status === "loading") {
        nodes.push(h("p", { class: "status", part: "state", role: "status", text: "Loading…" }));
      } else if (this.status === "missing") {
        nodes.push(h("p", { class: "status", part: "state", role: "alert", text: "This profile isn't available." }));
      } else {
        nodes.push(h("div", { class: "status", part: "state", role: "alert" }, [
          "Couldn't load this profile. ",
          h("button", { class: "quiet", part: "retry", type: "button", text: "Try again", onclick: () => { this.setStatus("loading"); this.load(++this.generation); } }),
        ]));
      }
    }
    this.content.replaceChildren(...nodes);
  }

  // Text only: the bio and names go in as text, links only when they are web links.
  renderProfile(data) {
    const handle = cleanHandle(data.handle);
    const name = data.name || (handle ? "@" + handle : "Member");
    const role = roleLabel(data.role);
    const links = LINKS.map((entry) => [entry[1], safeLink(data.links && data.links[entry[0]])]).filter((entry) => entry[1]);
    this.reach = h("div", { class: "reach" });
    return [
      h("div", { class: "face" }, [
        avatar({ avatar_url: data.avatar_url || null }, name),
        data.online ? h("span", { class: "dot", part: "presence-dot", "aria-hidden": "true" }) : null,
      ]),
      this.title(name),
      h("div", { class: "meta" }, [
        handle ? h("span", { part: "handle", text: "@" + handle }) : null,
        role ? h("span", { class: "badge", part: "role-badge role-" + data.role, text: role }) : null,
        data.online ? h("span", { class: "online", part: "online", text: "Online" }) : null,
        this.mine ? h("span", { part: "you", text: "You" }) : null,
      ]),
      data.bio ? h("p", { class: "bio", part: "bio", text: String(data.bio) }) : null,
      links.length ? h("ul", { class: "links", part: "links", "aria-label": "Links" }, links.map((entry) => h("li", {}, [
        h("a", { class: "link", part: "link", href: entry[1], target: "_blank", rel: "noopener noreferrer", text: entry[0] }),
      ]))) : null,
      this.reach,
    ];
  }
}

if (!customElements.get("polynet-profile")) customElements.define("polynet-profile", PolynetProfile);

// One panel per page, added to the end of the body when first needed.
let panel = null;
function sheet() {
  if (!panel) panel = document.querySelector("polynet-profile") || document.createElement("polynet-profile");
  if (!panel.isConnected) document.body.append(panel);
  return panel;
}

export function openProfile(who, opener) {
  sheet().show(who, opener, false);
}

// Opens or closes the panel to match ?member= (on arrival, Back and Forward).
export function followUrl() {
  // The Back a close asked for: a profile opened since then takes the URL now.
  if (panel && panel.backPending) {
    const want = panel.wantUrl;
    panel.backPending = false;
    panel.wantUrl = null;
    if (panel.isOpen && want) panel.holdUrl(want);
    return;
  }
  const handle = memberFromUrl();
  if (handle) {
    const current = sheet();
    if (!current.isOpen || !current.target || current.target.handle !== handle) current.show({ handle: handle }, null, true);
  } else if (panel && panel.isOpen) {
    panel.close(true);
  }
}
window.addEventListener("popstate", followUrl);
`;
