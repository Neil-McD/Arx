// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// <polynet-ask>, served at /__polynet/blocks/ask.js: the member's private
// conversation with the community agent. The history, a box to ask in, the
// reply as it streams, and starter questions while the conversation is
// empty. A question that fails stays in the box. It says plainly that only
// the member sees it. Kept as text (a String.raw literal: no backticks or
// template placeholders inside) so the edge serves exactly what is reviewed.
export const ASK_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block: <polynet-ask>. ui.js loads it on pages that place the tag.
// Your own starter questions (each button asks its text):
//   <polynet-ask><div slot="starters"><button>When's the next lantern night?</button></div></polynet-ask>
import polynet from "/__polynet/sdk.js";
import { BASE_STYLE, PROSE_STYLE, h, styled, avatar, timeLabel, signInGate } from "/__polynet/blocks/kit.js";

// A question's own key, kept across a retry.
function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return "ask_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const STYLE = BASE_STYLE + "\n" + PROSE_STYLE + "\n" + [
  // A conversation needs a height to scroll in; the site sets its own on the element.
  ":host { display: block; height: 70vh; min-height: 320px; }",
  ".ask { display: flex; flex-direction: column; height: 100%; min-height: 0; }",
  // Inset on every side, so a border or radius the site puts on the element never runs through it.
  ".privacy { margin: 0; padding: .75em .875em .625em; color: var(--pn-muted); font-size: .875em; line-height: 1.45; }",
  ".log { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; list-style: none; margin: 0; padding: .25em 0 .75em; }",
  ".message { display: grid; grid-template-columns: 2em minmax(0, 1fr); column-gap: .75em; padding: .5em .25em; }",
  ".who { display: flex; flex-wrap: wrap; align-items: baseline; gap: .5em; font-weight: 600; line-height: 1.35; }",
  ".agent .who .name { color: var(--pn-accent); }",
  ".time { color: var(--pn-muted); font-size: .8125em; font-weight: 400; font-variant-numeric: tabular-nums; }",
  ".text { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.55; }",
  ".thinking { color: var(--pn-muted); }",
  ".starters { display: flex; flex-wrap: wrap; gap: .5em; padding: .25em 0 .75em; }",
  ".starter, ::slotted([slot=starters]) { font: inherit; }",
  ".starter { background: none; border: 1px solid var(--pn-border); border-radius: 999px; padding: .375em .875em; text-align: left; line-height: 1.35; }",
  "@media (hover: hover) { .starter:hover { border-color: var(--pn-accent); } }",
  ".box { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: .25em; padding: .25em;",
  "  border: 1px solid var(--pn-border); border-radius: var(--pn-radius); }",
  ".box:focus-within { border-color: color-mix(in srgb, var(--pn-accent) 70%, var(--pn-border)); }",
  ".input { display: block; width: 100%; min-height: 2.5em; max-height: 10em; overflow-y: auto; resize: none; margin: 0; padding: .5em .375em;",
  "  font: inherit; line-height: 1.45; color: inherit; background: none; border: 0; outline: none; }",
  ".input::placeholder { color: var(--pn-muted); opacity: 1; }",
  ".send { min-height: 2.25em; padding: .35em 1em; }",
  ".send:disabled { opacity: .4; cursor: default; }",
  ".problem { margin: 0; padding: .375em .25em 0; font-size: .875em; }",
  ".problem:empty { display: none; }",
  "@media (pointer: coarse) { .send, .starter { min-height: 44px; } .input { font-size: max(1em, 16px); } }",
].join("\n");

// The server's limit for a question (httpCommunityApps.ts).
const MAX_TEXT_CHARS = 8000;
const STARTERS = ["What's coming up here?", "Where should a new member start?", "What does this community know about getting started?"];

function plain(fragment) {
  const holder = document.createElement("div");
  holder.append(fragment);
  return holder.textContent;
}

class PolynetAsk extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.generation = 0;
    this.messages = [];
    this.busy = false;
    this.build();
  }

  // Built once, so the box keeps its text and focus through every render.
  build() {
    this.privacy = h("p", { class: "privacy", part: "privacy" }, [h("slot", { name: "privacy" }, [
      "Only you can see this conversation. The agent answers from what the community knows.",
    ])]);
    this.log = h("ol", { class: "log", part: "log", "aria-label": "Your conversation with the agent", tabindex: "0" });
    this.starters = h("div", { class: "starters", part: "starters", role: "group", "aria-label": "Questions to start with", hidden: true }, [
      h("slot", { name: "starters" }, STARTERS.map((text) => h("button", {
        class: "starter", part: "starter", type: "button", text: text, onclick: () => this.ask(text),
      }))),
    ]);
    this.input = h("textarea", {
      class: "input", part: "input", rows: "1", placeholder: "Ask the agent…", "aria-label": "Ask the community agent",
      oninput: () => { this.autosize(); this.problem.replaceChildren(); },
      onkeydown: (event) => {
        // Enter asks where there is a keyboard and mouse; on touch it is a new line.
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing && !matchMedia("(pointer: coarse)").matches) {
          event.preventDefault();
          this.ask(this.input.value);
        }
      },
    });
    this.send = h("button", { class: "primary send", part: "send", type: "submit", text: "Ask" });
    this.problem = h("p", { class: "problem", part: "problem", role: "alert" });
    this.form = h("form", { class: "composer", part: "composer", onsubmit: (event) => { event.preventDefault(); this.ask(this.input.value); } }, [
      h("div", { class: "box", part: "box" }, [this.input, this.send]),
      this.problem,
    ]);
    this.announce = h("p", { class: "sr", role: "status" });
    this.frame = h("div", { class: "ask", part: "ask", role: "region", "aria-label": "Ask the community agent", hidden: true }, [
      h("slot", { name: "header" }), this.privacy, this.log, this.starters, this.form, this.announce,
    ]);
    this.state = h("div", { class: "state", part: "state" });
    this.root.replaceChildren(...styled(this.root, STYLE), this.frame, this.state);
    // The site's own starter buttons (slot="starters") ask their text too.
    this.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      if (button && this.contains(button) && button.closest("[slot=starters]")) this.ask(button.textContent.trim());
    });
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
    const generation = ++this.generation;
    this.show("loading", [h("p", { class: "muted", role: "status", text: "Loading your conversation…" })]);
    try {
      const session = await polynet.session();
      if (generation !== this.generation) return;
      if (!session.signed_in) { this.signedOut(session); return; }
      this.communityName = session.community_name || "Community";
      const history = await polynet.agentHistory();
      if (generation !== this.generation) return;
      this.messages = history.filter((message) => message && (message.role === "user" || message.role === "assistant"));
      this.show("ready");
      this.render();
      this.toBottom();
    } catch (error) {
      if (generation !== this.generation) return;
      this.fail(error);
    }
  }

  async fail(error) {
    if (error && error.code === "sign_in_required") { this.signedOut(await polynet.session().catch(() => ({}))); return; }
    if (error && error.code === "not_a_member") { this.signedOut(await polynet.session().catch(() => ({})), "Join this community to ask its agent."); return; }
    this.show("error", [h("div", { role: "alert" }, [
      h("p", { text: "Couldn't load your conversation." }),
      h("button", { class: "quiet", part: "retry", type: "button", onclick: () => this.load(), text: "Try again" }),
    ])]);
  }

  // Never a word of the conversation, or a way to ask, to anyone else.
  signedOut(session, text) {
    this.messages = [];
    this.log.replaceChildren();
    this.show("signed-out", [signInGate(polynet, session, text || "Sign in to ask the community's agent.")]);
  }

  render() {
    this.log.replaceChildren(...this.messages.map((message) => this.item(message)));
    this.starters.hidden = this.messages.length > 0 || this.busy;
  }

  item(message) {
    const mine = message.role === "user";
    const name = mine ? "You" : this.communityName + " agent";
    const at = message.created_at ? new Date(message.created_at) : null;
    const body = mine
      ? h("div", { class: "text", part: "message-body", text: message.text })
      : h("div", { class: "prose", part: "message-body" }, message.pending && !message.text
        ? [h("p", { class: "thinking", part: "thinking", text: "Thinking…" })]
        : [polynet.markdown(message.text)]);
    return h("li", {
      class: "message " + (mine ? "user" : "agent"), part: "message " + (mine ? "message-user" : "message-agent"),
      "aria-busy": message.pending ? "true" : null,
    }, [
      mine ? h("span", { "aria-hidden": "true" }) : avatar({ type: "community_agent" }, name),
      h("div", {}, [
        h("div", { class: "who" }, [
          h("span", { class: "name", part: "message-author", text: name }),
          at && !isNaN(at) ? h("time", { class: "time", part: "message-time", datetime: at.toISOString(), text: timeLabel(at) }) : null,
        ]),
        body,
      ]),
    ]);
  }

  autosize() {
    this.input.style.height = "auto";
    if (this.input.scrollHeight) this.input.style.height = (this.input.scrollHeight + 1) + "px";
  }

  nearBottom() {
    return this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 80;
  }
  toBottom() {
    this.log.scrollTop = this.log.scrollHeight;
  }

  // One question at a time. The question shows at once and the reply streams
  // in under it; if it fails, both go and the question is back in the box.
  async ask(raw) {
    const text = String(raw || "").trim();
    if (!text || this.busy || this.getAttribute("state") !== "ready") return;
    if (text.length > MAX_TEXT_CHARS) {
      this.problem.textContent = "A question can be up to " + MAX_TEXT_CHARS.toLocaleString() + " characters; this one has " + text.length.toLocaleString() + ".";
      return;
    }
    const generation = this.generation;
    this.busy = true;
    this.send.disabled = true;
    this.problem.replaceChildren();
    this.input.value = "";
    this.autosize();
    const question = { role: "user", text: text, created_at: new Date().toISOString() };
    const reply = { role: "assistant", text: "", pending: true, created_at: null };
    this.messages.push(question, reply);
    this.render();
    this.toBottom();
    const replyNode = () => this.log.lastElementChild;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const follow = this.nearBottom();
      const node = replyNode();
      if (node) node.replaceWith(this.item(reply));
      if (follow) this.toBottom();
    };
    this.announce.textContent = "The agent is answering…";
    try {
      // A retry of the same question keeps its key, so the server keeps one copy.
      const key = this.failed && this.failed.text === text ? this.failed.key : newKey();
      this.failed = null;
      this.pendingKey = key;
      const answer = await polynet.askAgent(text, { key: key, onDelta: (soFar) => {
        if (generation !== this.generation) return;
        reply.text = soFar;
        if (!frame) frame = requestAnimationFrame(paint);
      } });
      if (generation !== this.generation) return;
      cancelAnimationFrame(frame);
      reply.text = answer || reply.text;
      reply.pending = false;
      reply.created_at = new Date().toISOString();
      paint();
      this.announce.textContent = "The agent answered: " + plain(polynet.markdown(reply.text));
    } catch (error) {
      if (generation !== this.generation) return;
      cancelAnimationFrame(frame);
      this.messages = this.messages.filter((message) => message !== question && message !== reply);
      this.failed = { text: text, key: this.pendingKey };
      this.render();
      // The question goes back in the box (unless the member started another).
      if (!this.input.value.trim()) this.input.value = text;
      this.autosize();
      if (error && error.code === "sign_in_required") { this.fail(error); return; }
      const why = error && error.message && error.message !== error.code ? error.message : "The agent couldn't answer just now.";
      this.problem.replaceChildren("Not answered. " + why + " ", h("button", {
        class: "quiet", part: "retry", type: "button", text: "Try again", onclick: () => this.ask(this.input.value),
      }));
      this.announce.textContent = "";
    } finally {
      if (generation === this.generation) {
        this.busy = false;
        this.send.disabled = false;
        this.starters.hidden = this.messages.length > 0;
      }
    }
  }
}

if (!customElements.get("polynet-ask")) customElements.define("polynet-ask", PolynetAsk);
`;
