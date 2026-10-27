// SPDX-License-Identifier: MIT (see LICENSING.md and ./LICENSE-MIT)
// The Polynet shell, served at /__polynet/ui.js on every community site:
// <polynet-account>, the member's way to their account, their
// communities, Discover, messages and settings. Its structure, keyboard
// behavior and accessibility are Polynet's; its look follows the site through
// CSS custom properties. Kept as text (a String.raw literal: no backticks or
// template placeholders inside) so the edge serves exactly what is reviewed.
export const UI_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet shell: <polynet-account>. Usage:
//   <script type="module" src="/__polynet/ui.js"></script>   (Polynet adds this to every page)
//   <polynet-account></polynet-account>                      (or Polynet adds one, top-right)
// Theme it from the site's CSS (all optional):
//   polynet-account { --polynet-accent: #c2410c; --polynet-surface: #111; --polynet-text: #f5f5f4;
//                     --polynet-radius: 12px; --polynet-font: inherit; }
import polynet from "/__polynet/sdk.js";

const STYLE = [
  ":host { --pa-accent: var(--polynet-accent, #4338ca); --pa-on-accent: var(--polynet-on-accent, #ffffff);",
  "  --pa-surface: var(--polynet-surface, Canvas); --pa-text: var(--polynet-text, CanvasText);",
  "  --pa-muted: var(--polynet-muted, color-mix(in srgb, var(--pa-text) 68%, transparent));",
  "  --pa-border: var(--polynet-border, color-mix(in srgb, var(--pa-text) 16%, transparent));",
  "  --pa-hover: color-mix(in srgb, var(--pa-text) 8%, transparent);",
  "  --pa-radius: var(--polynet-radius, 12px); display: inline-block; position: relative;",
  // No --polynet-font: font-family inherits the page's font, so the shell never looks foreign.
  "  font-size: 14px; line-height: 1.4; font-family: var(--polynet-font); color: var(--pa-text); }",
  "* { box-sizing: border-box; }",
  "button, a { font: inherit; color: inherit; }",
  ":focus-visible { outline: 2px solid var(--pa-accent); outline-offset: 2px; border-radius: 6px; }",
  ".row { display: flex; align-items: center; gap: 8px; }",
  ".signin { background: var(--pa-accent); color: var(--pa-on-accent); border: 0; border-radius: 999px; padding: 8px 16px; font-weight: 600; cursor: pointer; min-height: 36px; }",
  ".join { padding: 8px 10px; text-decoration: underline; text-underline-offset: 3px; min-height: 36px; display: inline-flex; align-items: center; }",
  ".trigger { display: inline-flex; align-items: center; gap: 6px; background: none; border: 1px solid var(--pa-border); border-radius: 999px; padding: 3px 8px 3px 3px; cursor: pointer; min-height: 40px; }",
  ".trigger:hover { background: var(--pa-hover); }",
  ".chevron { width: 10px; height: 10px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: translateY(-2px) rotate(45deg); opacity: .7; margin: 0 4px; }",
  ".avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex: none; display: inline-grid; place-items: center; background: var(--pa-accent); color: var(--pa-on-accent); font-weight: 700; font-size: 13px; }",
  ".panel { position: absolute; top: calc(100% + 8px); right: 0; z-index: 2147483000; width: min(340px, calc(100vw - 32px)); max-height: min(560px, calc(100vh - 96px)); overflow: auto;",
  "  background: var(--pa-surface); color: var(--pa-text); border: 1px solid var(--pa-border); border-radius: var(--pa-radius); box-shadow: 0 12px 32px rgba(0,0,0,.24); padding: 8px; }",
  ":host([align=start]) .panel { right: auto; left: 0; }",
  ".panel[hidden], .backdrop[hidden] { display: none; }",
  ".who { padding: 10px 8px 12px; border-bottom: 1px solid var(--pa-border); margin-bottom: 6px; }",
  ".name { font-weight: 650; }",
  ".muted { color: var(--pa-muted); font-size: 13px; }",
  ".item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 9px 8px; border-radius: 8px; text-decoration: none; background: none; border: 0; cursor: pointer; min-height: 44px; }",
  ".item:hover { background: var(--pa-hover); }",
  ".item .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  ".sep { height: 1px; background: var(--pa-border); margin: 6px 0; border: 0; }",
  ".status { padding: 12px 8px; }",
  ".backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 2147482999; }",
  "@media (max-width: 520px) {",
  "  .panel { position: fixed; top: auto; left: 0; right: 0; bottom: 0; width: 100%; max-height: 85vh; border-radius: var(--pa-radius) var(--pa-radius) 0 0; padding: 8px 8px max(12px, env(safe-area-inset-bottom)); }",
  "}",
  "@media (min-width: 521px) { .backdrop { display: none; } }",
  "@media (prefers-reduced-motion: no-preference) { .panel { animation: pa-in .14s ease-out; } }",
  "@keyframes pa-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }",
].join("\n");

function h(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const key of Object.keys(attrs || {})) {
    const value = attrs[key];
    if (value === null || value === undefined || value === false) continue;
    if (key === "text") node.textContent = value;
    else if (key.indexOf("on") === 0) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children || []) if (child) node.append(child);
  return node;
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function avatar(url, name) {
  if (url) return h("img", { class: "avatar", src: url, alt: "" });
  return h("span", { class: "avatar", "aria-hidden": "true", text: initials(name) });
}

let counter = 0;

class PolynetAccount extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.panelId = "polynet-account-panel-" + (++counter);
    this.state = { session: null, account: null, loading: false, error: null, open: false };
    this.onDocumentPointer = (event) => { if (this.state.open && !event.composedPath().includes(this)) this.close(false); };
    this.onDocumentKey = (event) => { if (event.key === "Escape" && this.state.open) this.close(true); };
  }

  async connectedCallback() {
    // A shell the page placed itself replaces the fallback one.
    if (!this.hasAttribute("data-polynet-fallback")) {
      for (const fallback of document.querySelectorAll("polynet-account[data-polynet-fallback]")) fallback.remove();
    }
    document.addEventListener("pointerdown", this.onDocumentPointer, true);
    document.addEventListener("keydown", this.onDocumentKey);
    this.render();
    try {
      this.state.session = await polynet.session();
    } catch (error) {
      this.state.session = { signed_in: false };
    }
    this.render();
  }

  disconnectedCallback() {
    document.removeEventListener("pointerdown", this.onDocumentPointer, true);
    document.removeEventListener("keydown", this.onDocumentKey);
  }

  items() {
    return Array.from(this.root.querySelectorAll(".panel a.item, .panel button.item"));
  }

  async open(focusFirst) {
    this.state.open = true;
    this.render();
    if (!this.state.account && !this.state.loading) {
      this.state.loading = true;
      this.state.error = null;
      this.render();
      try {
        this.state.account = await polynet.account();
      } catch (error) {
        if (error && error.code === "sign_in_required") {
          this.state.session = await polynet.session({ refresh: true });
          this.state.open = false;
        } else {
          this.state.error = "Couldn't load your account.";
        }
      }
      this.state.loading = false;
      this.render();
    }
    if (focusFirst) {
      const first = this.items()[0];
      if (first) first.focus();
    }
  }

  close(returnFocus) {
    this.state.open = false;
    this.render();
    if (returnFocus) {
      const trigger = this.root.querySelector(".trigger");
      if (trigger) trigger.focus();
    }
  }

  onPanelKey(event) {
    const items = this.items();
    const index = items.indexOf(this.root.activeElement);
    if (event.key === "Escape") { event.preventDefault(); this.close(true); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!items.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length].focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (items.length) items[event.key === "Home" ? 0 : items.length - 1].focus();
    }
  }

  async signOut() {
    await polynet.signOut();
    location.reload();
  }

  renderSignedOut(session) {
    const signIn = h("button", { class: "signin", type: "button", part: "signin", onclick: () => polynet.signIn(), text: "Sign in" });
    const join = session.join_url ? h("a", { class: "join", href: session.join_url, part: "join", text: "Join" }) : null;
    return h("div", { class: "row" }, [join, signIn]);
  }

  renderPanel(session) {
    const account = this.state.account;
    const member = (account && account.member) || session.member || {};
    const children = [
      h("div", { class: "who row" }, [
        avatar(member.avatar_url, member.name),
        h("div", {}, [
          h("div", { class: "name", text: member.name || "Member" }),
          member.handle ? h("div", { class: "muted", text: "@" + member.handle }) : null,
        ]),
      ]),
    ];
    if (this.state.loading) children.push(h("p", { class: "status muted", role: "status", text: "Loading…" }));
    if (this.state.error) {
      children.push(h("div", { class: "status", role: "alert" }, [
        h("p", { class: "muted", text: this.state.error }),
        h("button", { class: "item", type: "button", onclick: () => { this.state.account = null; this.open(true); }, text: "Try again" }),
      ]));
    }
    if (account) {
      // Only this community: the member's other communities live in Polynet, one link away.
      const here = account.community || {};
      const links = account.links || {};
      const everyday = [];
      if ((here.role === "owner" || here.role === "admin") && here.studio_url) everyday.push([here.studio_url, "Manage this community"]);
      everyday.push([links.messages, "Messages"], [links.communities, "Your communities"], [links.discover, "Discover communities"], [links.settings, "Settings"]);
      for (const [href, label] of everyday) {
        if (href) children.push(h("a", { class: "item", href: href, part: "item" }, [h("span", { class: "label", text: label })]));
      }
    }
    children.push(h("hr", { class: "sep" }));
    children.push(h("button", { class: "item", type: "button", part: "item", onclick: () => this.signOut() }, [h("span", { class: "label", text: "Sign out" })]));
    return h("div", {
      class: "panel", id: this.panelId, part: "panel", role: "region", "aria-label": "Your Polynet account",
      hidden: !this.state.open, onkeydown: (event) => this.onPanelKey(event),
      onfocusout: (event) => { if (this.state.open && event.relatedTarget && !this.root.contains(event.relatedTarget)) this.close(false); },
    }, children);
  }

  render() {
    const session = this.state.session;
    const nodes = [h("style", { text: STYLE })];
    if (session && !session.signed_in) {
      nodes.push(this.renderSignedOut(session));
    } else if (session) {
      const member = session.member || {};
      nodes.push(h("button", {
        class: "trigger", type: "button", part: "trigger",
        "aria-expanded": this.state.open ? "true" : "false", "aria-controls": this.panelId,
        "aria-label": "Your account" + (member.name ? ", " + member.name : ""),
        onclick: () => (this.state.open ? this.close(false) : this.open(false)),
        onkeydown: (event) => {
          if (event.key === "Escape" && this.state.open) { event.preventDefault(); this.close(true); return; }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!this.state.open) { this.open(true); return; }
            const items = this.items();
            if (items.length) items[event.key === "ArrowDown" ? 0 : items.length - 1].focus();
          }
        },
      }, [avatar(member.avatar_url, member.name), h("span", { class: "chevron", "aria-hidden": "true" })]));
      nodes.push(h("div", { class: "backdrop", hidden: !this.state.open, onclick: () => this.close(true) }));
      nodes.push(this.renderPanel(session));
    }
    const focused = this.root.activeElement && this.root.activeElement.classList.contains("trigger");
    this.root.replaceChildren(...nodes);
    if (focused) {
      const trigger = this.root.querySelector(".trigger");
      if (trigger) trigger.focus();
    }
  }
}

if (!customElements.get("polynet-account")) customElements.define("polynet-account", PolynetAccount);

// Every page shows the shell. If the page hasn't placed one shortly after it
// loads, Polynet puts it in the top-right corner.
function ensureShell() {
  if (!document.body || document.querySelector("polynet-account")) return;
  const shell = document.createElement("polynet-account");
  shell.setAttribute("data-polynet-fallback", "");
  shell.style.cssText = "position: fixed; top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right)); z-index: 2147483000;";
  document.body.append(shell);
}
const FALLBACK_DELAY_MS = 1500;
if (document.readyState === "complete") setTimeout(ensureShell, FALLBACK_DELAY_MS);
else window.addEventListener("load", () => setTimeout(ensureShell, FALLBACK_DELAY_MS), { once: true });
`;
