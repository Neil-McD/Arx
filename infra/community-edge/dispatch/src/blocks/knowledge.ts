// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// <polynet-knowledge>, served at /__polynet/blocks/knowledge.js: what the
// community knows, from its memory. The top memories, a search, and each one
// readable in place. Labelled as the community's memory throughout, so no one
// takes it for a member's post or an official page. Kept as text (a
// String.raw literal: no backticks or template placeholders inside) so the
// edge serves exactly what is reviewed.
export const KNOWLEDGE_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block: <polynet-knowledge>. ui.js loads it on pages that place the tag.
import polynet from "/__polynet/sdk.js";
import { BASE_STYLE, PROSE_STYLE, h, styled, signInGate } from "/__polynet/blocks/kit.js";

const STYLE = BASE_STYLE + "\n" + PROSE_STYLE + "\n" + [
  ":host { display: block; }",
  ".knowledge { display: grid; gap: 1em; }",
  ".intro { margin: 0; color: var(--pn-muted); line-height: 1.5; }",
  ".search { display: flex; gap: .5em; }",
  ".search input { flex: 1; min-width: 0; padding: .5em .75em; font: inherit; color: inherit; background: none;",
  "  border: 1px solid var(--pn-border); border-radius: calc(var(--pn-radius) * .7); }",
  ".search input::placeholder { color: var(--pn-muted); opacity: 1; }",
  ".search input:focus { outline: none; border-color: var(--pn-accent); }",
  ".search .primary { flex: none; }",
  ".showing { display: flex; flex-wrap: wrap; align-items: baseline; gap: .25em 1em; margin: 0; color: var(--pn-muted); font-size: .875em; }",
  ".memories { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--pn-border); }",
  ".memory { border-bottom: 1px solid var(--pn-border); }",
  ".toggle { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .25em 1em; align-items: baseline; width: 100%; padding: .75em 0;",
  "  background: none; border: 0; text-align: left; line-height: 1.4; }",
  ".toggle .title { font-weight: 600; overflow-wrap: anywhere; }",
  ".toggle .kind { color: var(--pn-muted); font-size: .75em; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; white-space: nowrap; }",
  ".toggle .applies { grid-column: 1 / -1; color: var(--pn-muted); font-size: .875em; }",
  "@media (hover: hover) { .toggle:hover .title { text-decoration: underline; text-underline-offset: .2em; text-decoration-color: var(--pn-border); } }",
  ".body { padding: 0 0 1em; display: grid; gap: .75em; }",
  ".source { margin: 0; color: var(--pn-muted); font-size: .8125em; }",
  ".none { color: var(--pn-muted); margin: 0; }",
  "@media (pointer: coarse) { .toggle { min-height: 44px; } .search input { font-size: max(1em, 16px); } }",
].join("\n");

// Polynet's memory types, as a member reads them.
const KINDS = { playbook: "Playbook", insight: "Insight", example: "Example", warning_failure: "Watch out",
  decision_judgment: "Decision", open_question: "Open question" };
function kindOf(memory) {
  const type = String(memory.type || "");
  return KINDS[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ") : "Memory");
}
function updated(memory) {
  const at = memory.updated_at ? new Date(memory.updated_at) : null;
  return at && !isNaN(at) ? at.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
}
let counter = 0;

class PolynetKnowledge extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.uid = "pn-knowledge-" + (++counter);
    this.generation = 0;
    this.query = "";
    this.input = h("input", { type: "search", name: "q", part: "search-input", placeholder: "Search what the community knows",
      "aria-label": "Search the community's memory", autocomplete: "off", maxlength: "512" });
    this.form = h("form", { class: "search", part: "search", role: "search", onsubmit: (event) => { event.preventDefault(); this.search(this.input.value.trim()); } }, [
      this.input,
      h("button", { class: "primary", part: "search-button", type: "submit", text: "Search" }),
    ]);
    this.intro = h("p", { class: "intro", part: "intro" }, [h("slot", { name: "intro" }, [
      "The community's memory: what members have worked out together, kept so anyone here can find it.",
    ])]);
    this.results = h("div", { class: "results", part: "results" });
    this.status = h("p", { class: "sr", role: "status" });
    this.frame = h("div", { class: "knowledge", part: "knowledge", role: "region", "aria-label": "Community memory", hidden: true }, [
      h("slot", { name: "header" }), this.intro, this.form, this.results, this.status,
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

  show(status, children) {
    this.setAttribute("state", status);
    this.frame.hidden = status !== "ready";
    this.state.hidden = status === "ready";
    this.state.replaceChildren(...(children || []));
  }

  async load() {
    this.show("loading", [h("p", { class: "muted", role: "status", text: "Loading…" })]);
    await this.search(this.query);
  }

  async search(query) {
    const generation = ++this.generation;
    if (this.getAttribute("state") === "ready") this.results.setAttribute("aria-busy", "true");
    try {
      const session = await polynet.session();
      if (generation !== this.generation) return;
      if (!session.signed_in) { this.signedOut(session); return; }
      const memories = await polynet.knowledge(query || undefined);
      if (generation !== this.generation) return;
      this.query = query;
      this.render(memories);
      this.show("ready");
      this.status.textContent = query ? (memories.length === 1 ? "1 memory found" : memories.length + " memories found") : "";
    } catch (error) {
      if (generation !== this.generation) return;
      if (error && error.code === "sign_in_required") { this.signedOut(await polynet.session().catch(() => ({}))); return; }
      if (this.getAttribute("state") === "ready") {
        // A failed search keeps what's on screen and says so.
        this.status.textContent = "";
        for (const old of this.results.querySelectorAll("[part=search-error]")) old.remove();
        this.results.prepend(h("p", { class: "none", part: "search-error", role: "alert" }, [
          "Couldn't search. ", h("button", { class: "quiet", part: "retry", type: "button", text: "Try again", onclick: () => this.search(query) }),
        ]));
      } else {
        this.show("error", [h("div", { role: "alert" }, [
          h("p", { text: "Couldn't load what the community knows." }),
          h("button", { class: "quiet", part: "retry", type: "button", onclick: () => this.load(), text: "Try again" }),
        ])]);
      }
    } finally {
      if (generation === this.generation) this.results.removeAttribute("aria-busy");
    }
  }

  // Never a memory to someone who isn't a signed-in member.
  signedOut(session) {
    this.results.replaceChildren();
    this.show("signed-out", [signInGate(polynet, session, "Sign in to see what the community knows.")]);
  }

  render(memories) {
    const nodes = [];
    if (this.query) {
      nodes.push(h("p", { class: "showing", part: "showing" }, [
        h("span", { text: "Results for “" + this.query + "”" }),
        h("button", { class: "quiet", part: "clear", type: "button", text: "Show top memories", onclick: () => { this.input.value = ""; this.search(""); } }),
      ]));
    }
    if (!memories.length) {
      nodes.push(this.query
        ? h("p", { class: "none", part: "no-results", text: "Nothing in the community's memory matches “" + this.query + "”." })
        : h("div", { class: "none", part: "empty" }, [h("slot", { name: "empty" }, ["Nothing in the community's memory yet."])]));
    } else {
      nodes.push(h("ul", { class: "memories", part: "memories", role: "list", "aria-label": this.query ? "Memories matching " + this.query : "Top memories" },
        memories.filter((memory) => memory && memory.path).map((memory, index) => this.item(memory, index))));
    }
    this.results.replaceChildren(...nodes);
  }

  item(memory, index) {
    const id = this.uid + "-" + this.generation + "-" + index;
    const body = h("div", { class: "body", part: "memory-body", id: id, hidden: true });
    const toggle = h("button", { class: "toggle", part: "memory-toggle", type: "button", "aria-expanded": "false", "aria-controls": id,
      onclick: () => this.toggle(memory, toggle, body) }, [
      h("span", { class: "title", part: "memory-title", text: memory.title || "Untitled memory" }),
      h("span", { class: "kind", part: "memory-type", text: kindOf(memory) }),
      memory.applies_when ? h("span", { class: "applies", part: "memory-applies", text: "When: " + memory.applies_when }) : null,
    ]);
    return h("li", { class: "memory", part: "memory" }, [toggle, body]);
  }

  // Read when first opened: browsing the list never reads every memory.
  async toggle(memory, toggle, body) {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    body.hidden = !open;
    if (!open || body.getAttribute("data-read") === "true" || body.getAttribute("aria-busy") === "true") return;
    body.setAttribute("aria-busy", "true");
    body.replaceChildren(h("p", { class: "muted", text: "Loading…" }));
    try {
      const text = await polynet.readText(memory);
      const when = updated(memory);
      body.setAttribute("data-read", "true");
      body.replaceChildren(
        h("div", { class: "prose", part: "memory-text" }, [polynet.markdown(text || "")]),
        h("p", { class: "source", part: "memory-source", text: "From the community's memory" + (when ? " · updated " + when : "") }),
      );
    } catch (error) {
      if (error && error.code === "sign_in_required") { this.signedOut(await polynet.session().catch(() => ({}))); return; }
      body.replaceChildren(h("p", { class: "none", role: "alert" }, [
        "Couldn't open this memory. ",
        h("button", { class: "quiet", part: "retry", type: "button", text: "Try again", onclick: () => {
          toggle.setAttribute("aria-expanded", "false");
          this.toggle(memory, toggle, body);
        } }),
      ]));
    } finally {
      body.removeAttribute("aria-busy");
    }
  }
}

if (!customElements.get("polynet-knowledge")) customElements.define("polynet-knowledge", PolynetKnowledge);
`;
