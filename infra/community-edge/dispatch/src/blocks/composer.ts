// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// The composer inside <polynet-chat>, served at /__polynet/blocks/composer.js
// and imported by chat.js: the message box under a channel and under a thread.
// It owns typing, drafts, @-tagging and attachments; the chat owns sending
// (the outbox and its pending messages). Kept as text (a String.raw literal:
// no backticks or template placeholders inside) so the edge serves exactly
// what is reviewed.
export const COMPOSER_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block part: the composer of <polynet-chat>. Not for site code.
import polynet from "/__polynet/sdk.js";
import { h, avatar, fileSize, readMembers } from "/__polynet/blocks/kit.js";

export const COMPOSER_STYLE = [
  ".composer { position: relative; padding: .25em .5em 0; }",
  ".box { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: end; gap: .25em; padding: .25em;",
  "  border: 1px solid var(--pn-border); border-radius: var(--pn-radius); }",
  ".box:focus-within { border-color: color-mix(in srgb, var(--pn-accent) 70%, var(--pn-border)); }",
  ".box.dragging { border-style: dashed; border-color: var(--pn-accent); background: color-mix(in srgb, var(--pn-accent) 6%, transparent); }",
  ".chips { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: .375em; list-style: none; margin: 0; padding: .25em .25em 0; }",
  ".chips:empty { display: none; }",
  ".chip { display: inline-flex; align-items: center; gap: .5em; max-width: 100%; padding: .25em .25em .25em .375em; font-size: .8125em;",
  "  border: 1px solid var(--pn-border); border-radius: calc(var(--pn-radius) * .6); }",
  ".chip img, .chip .mark { width: 2.25em; height: 2.25em; flex: none; border-radius: calc(var(--pn-radius) * .4); object-fit: cover; }",
  ".chip .mark { display: grid; place-items: center; background: var(--pn-tint); color: var(--pn-muted); font-size: .75em; font-weight: 600; text-transform: uppercase; }",
  ".chip .name { min-width: 0; max-width: 14em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  ".input { display: block; width: 100%; min-height: 2.5em; max-height: 12em; overflow-y: auto; resize: none; margin: 0; padding: .5em .375em;",
  "  font: inherit; line-height: 1.45; color: inherit; background: none; border: 0; outline: none; }",
  ".input::placeholder { color: var(--pn-muted); opacity: 1; }",
  ".icon { position: relative; width: 2.25em; height: 2.25em; flex: none; border: 0; border-radius: 50%; background: none; color: var(--pn-muted); }",
  "@media (hover: hover) { .icon:hover { background: var(--pn-tint); color: inherit; } }",
  ".icon::before, .icon::after { content: ''; position: absolute; left: 50%; top: 50%; width: .875em; height: 1.5px; background: currentColor; transform: translate(-50%, -50%); }",
  ".icon::after { transform: translate(-50%, -50%) rotate(90deg); }",
  ".remove { width: 1.75em; height: 1.75em; }",
  ".remove::before { transform: translate(-50%, -50%) rotate(45deg); } .remove::after { transform: translate(-50%, -50%) rotate(-45deg); }",
  ".send { min-height: 2.25em; padding: .35em 1em; }",
  ".send:disabled { opacity: .4; cursor: default; }",
  ".problem { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 .75em; padding: .375em .25em 0; font-size: .8125em; }",
  ".problem:empty { display: none; }",
  ".note { margin: 0; padding: .625em .625em .25em; color: var(--pn-muted); font-size: .875em; }",
  ".mentions { position: absolute; left: .5em; right: .5em; bottom: calc(100% + .25em); z-index: 3; max-width: 24em; max-height: 16em; overflow-y: auto;",
  "  margin: 0; padding: .25em; list-style: none; background: var(--pn-surface); color: var(--pn-surface-text);",
  "  border: 1px solid var(--pn-border); border-radius: var(--pn-radius); box-shadow: 0 8px 24px rgba(0,0,0,.14); }",
  ".option { display: grid; grid-template-columns: 1.75em minmax(0, 1fr); align-items: center; gap: .625em; padding: .375em .5em; border-radius: calc(var(--pn-radius) * .6); cursor: pointer; line-height: 1.3; }",
  ".option[aria-selected=true] { background: color-mix(in srgb, var(--pn-accent) 14%, transparent); }",
  ".option .who { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  ".option .handle { color: var(--pn-muted); font-size: .875em; margin-left: .375em; }",
  ".option .online { display: inline-block; width: .5em; height: .5em; border-radius: 50%; background: var(--pn-accent); margin-left: .375em; vertical-align: .1em; }",
  ".mentions .empty { padding: .375em .5em; color: var(--pn-muted); }",
  // 16px keeps iOS from zooming into the box.
  "@media (pointer: coarse) { .icon, .send { min-width: 44px; min-height: 44px; } .option { min-height: 44px; } .input { font-size: max(1em, 16px); } }",
].join("\n");

// The backend's limits (shared/communityAttachmentPolicy.ts); it enforces them exactly.
const MAX_FILES = 8;
// The server's limit for a message (communityInteractions.ts).
const MAX_TEXT_CHARS = 8000;
const MB = 1024 * 1024;
function fileLimit(file) {
  const type = file.type || "";
  if (type.indexOf("image/") === 0) return { bytes: 25 * MB, label: "images" };
  if (/^(audio|video)\//.test(type)) return { bytes: 50 * MB, label: "video and audio" };
  return { bytes: 5 * MB, label: "other files" };
}
const ACCEPT = "image/*,video/*,audio/*,application/pdf,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.key,.pages,.numbers,.zip";
const MENTION_LIMIT = 8;
const TYPING_IDLE_MS = 3000;

export function newKey() {
  return crypto.randomUUID().replace(/-/g, "");
}

// Grows with its text up to the CSS max-height, then scrolls.
export function autosize(textarea) {
  textarea.style.height = "auto";
  if (textarea.scrollHeight) textarea.style.height = (textarea.scrollHeight + 1) + "px";
  else textarea.style.height = "";
}

// Enter sends where there is a keyboard and mouse; on touch it is a new line.
export function enterSends(event) {
  return event.key === "Enter" && !event.shiftKey && !event.altKey && !event.isComposing && event.keyCode !== 229
    && !matchMedia("(pointer: coarse)").matches;
}

// "@sam" counts only where the server counts it (communityInteractions.ts):
// at the start or after a space, and as a whole word. Not "@samuel", not
// "me@sam", not "(@sam".
export function hasToken(text, token) {
  const lower = String(text).toLowerCase();
  const needle = token.toLowerCase();
  for (let from = lower.indexOf(needle); from !== -1; from = lower.indexOf(needle, from + 1)) {
    const before = from ? lower[from - 1] : "";
    const after = lower[from + needle.length] || "";
    if ((!before || /\s/.test(before)) && !/[a-z0-9_-]/.test(after)) return true;
  }
  return false;
}

// Drafts live per channel and thread: in memory (with their files) and in
// sessionStorage (text and tags), so switching channels or reloading keeps them.
const drafts = new Map();
// Drafts belong to the signed-in member: another member signing in on the same
// tab never sees them. A member without a handle keeps drafts in memory only.
function draftOwner(scope) { return (scope.me && scope.me.handle) || ""; }
function draftId(scope) { return "polynet:draft:" + scope.community + ":" + draftOwner(scope) + ":" + scope.channel + ":" + (scope.thread || ""); }
function emptyDraft() { return { text: "", mentions: [], agent: false, files: [], failedKey: null, failedSend: null, error: null }; }
function draftFor(scope) {
  const id = draftId(scope);
  let draft = drafts.get(id);
  if (!draft) {
    draft = emptyDraft();
    try {
      const saved = draftOwner(scope) ? JSON.parse(sessionStorage.getItem(id) || "null") : null;
      if (saved && typeof saved.text === "string") {
        draft.text = saved.text;
        draft.mentions = Array.isArray(saved.mentions) ? saved.mentions.filter((m) => m && m.ref && m.handle) : [];
        draft.agent = saved.agent === true;
      }
    } catch (error) {
      // Storage can be off (private windows, blocked site data): memory still holds the draft.
    }
    drafts.set(id, draft);
  }
  return draft;
}
function saveDraft(scope, draft) {
  if (!draftOwner(scope)) return;
  try {
    if (draft.text) sessionStorage.setItem(draftId(scope), JSON.stringify({ text: draft.text, mentions: draft.mentions, agent: draft.agent }));
    else sessionStorage.removeItem(draftId(scope));
  } catch (error) {
    // See draftFor.
  }
}
// A failed send's key binds the exact request on the server, so a retry may
// reuse it only to resend exactly that: the same text, tags and agent ask, and
// the very same File objects in the same order. The SDK reuses an upload per
// File object, so a file removed and picked again (a new File, though its name,
// size and date match) uploads afresh, and the old key would then conflict.
function sameSend(failed, payload) {
  return !!failed && failed.text === payload.text && failed.askAgent === payload.askAgent
    && failed.mentions.join(" ") === payload.mentions.map((member) => member.ref).join(" ")
    && failed.files.length === payload.files.length
    && failed.files.every((file, index) => file === payload.files[index].file);
}

// One message box. options: { id, slot (the channel's own read-only words),
// onSend(payload), onDiscard(scope) }. The chat calls show(scope) with
// { community, channel, channelName, thread, canWrite, agentName, me }, or
// show(null) to put it away.
export class Composer {
  constructor(options) {
    this.options = options;
    this.scope = null;
    this.draft = null;
    this.choices = [];
    this.active = 0;
    this.mentionAt = null;
    const id = options.id;
    this.input = h("textarea", {
      class: "input", part: "composer-input", rows: 1, id: id + "-input",
      "aria-autocomplete": "list", "aria-controls": id + "-mentions", "aria-expanded": "false",
      oninput: () => this.changed(true), onkeydown: (event) => this.onKey(event), onclick: () => this.suggest(),
      onpaste: (event) => this.onPaste(event), onblur: () => this.onBlur(), onfocus: () => { clearTimeout(this.idleTimer); readMembers(polynet).catch(() => {}); },
    });
    this.list = h("ul", { class: "mentions", part: "mention-list", id: id + "-mentions", role: "listbox", "aria-label": "People to mention", hidden: true });
    this.chips = h("ul", { class: "chips", part: "attachment-chips", "aria-label": "Attachments" });
    this.picker = h("input", { type: "file", multiple: true, accept: ACCEPT, hidden: true, tabindex: "-1", onchange: () => {
      this.addFiles(this.picker.files);
      this.picker.value = "";
    } });
    this.attach = h("button", { class: "icon", part: "composer-attach", type: "button", "aria-label": "Attach files", title: "Attach files",
      onclick: () => this.picker.click() });
    this.sendButton = h("button", { class: "primary send", part: "composer-send", type: "button", text: "Send", onclick: () => this.send() });
    this.box = h("div", {
      class: "box", part: "composer-box",
      ondragover: (event) => this.onDrag(event, true), ondragleave: () => this.box.classList.remove("dragging"),
      ondrop: (event) => this.onDrop(event),
    }, [this.chips, this.attach, this.input, this.sendButton, this.picker]);
    this.problem = h("div", { class: "problem", part: "composer-error", role: "alert" });
    this.noteText = h("span");
    this.note = h("p", { class: "note", part: "composer-note", hidden: true }, [options.slot ? h("slot", { name: "read-only" }, [this.noteText]) : this.noteText]);
    this.element = h("div", { class: "composer", part: "composer", hidden: true }, [this.list, this.box, this.problem, this.note]);
  }

  show(scope) {
    const same = scope && this.scope && draftId(scope) === draftId(this.scope);
    if (this.scope && !same) this.stopTyping();
    if (!same) { this.closeList(); this.notice = ""; }
    this.scope = scope;
    this.element.hidden = !scope;
    if (!scope) { this.draft = null; return; }
    const label = scope.thread ? "Reply…" : "Message #" + scope.channelName;
    this.input.placeholder = label;
    this.input.setAttribute("aria-label", scope.thread ? "Reply" : "Message #" + scope.channelName);
    this.box.hidden = !scope.canWrite;
    this.note.hidden = scope.canWrite;
    this.noteText.textContent = scope.thread ? "Replies are off for you here." : "You can read this channel, but not post in it.";
    if (!scope.canWrite) { this.draft = null; this.problem.replaceChildren(); return; }
    if (same && this.draft) return;
    this.draft = draftFor(scope);
    this.input.value = this.draft.text;
    autosize(this.input);
    this.renderChips();
    this.renderProblem();
    this.updateSend();
  }

  focus() {
    if (this.scope && this.scope.canWrite) {
      this.input.focus();
      this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    }
  }

  // Every change to the text: keep the draft, grow, say we're typing, suggest.
  changed(typed) {
    if (!this.draft) return;
    this.draft.text = this.input.value;
    autosize(this.input);
    saveDraft(this.scope, this.draft);
    this.updateSend();
    // The length note goes once the message fits.
    if (this.notice && this.notice.indexOf("Messages can be up to") === 0 && this.input.value.trim().length <= MAX_TEXT_CHARS) {
      this.notice = "";
      this.renderProblem();
    }
    if (this.isEmpty() && this.draft.failedKey) this.discard();
    if (typed) {
      if (this.input.value.trim()) polynet.typing(this.scope.channel, true, this.typingScope());
      else this.stopTyping();
    }
    this.suggest();
  }

  isEmpty() { return !this.draft || (!this.draft.text.trim() && !this.draft.files.length); }

  updateSend() { this.sendButton.disabled = this.isEmpty(); }

  typingScope() { return this.scope && this.scope.thread ? { thread: this.scope.thread } : undefined; }

  stopTyping() {
    clearTimeout(this.idleTimer);
    if (this.scope) polynet.typing(this.scope.channel, false, this.typingScope());
  }

  onBlur() {
    clearTimeout(this.idleTimer);
    const scope = this.scope;
    this.idleTimer = setTimeout(() => { if (scope === this.scope) this.stopTyping(); }, TYPING_IDLE_MS);
    this.closeList();
  }

  // A failed message's content is in the box again: emptying the box drops it.
  discard() {
    this.draft.failedKey = null;
    this.draft.failedSend = null;
    this.draft.error = null;
    this.renderProblem();
    this.options.onDiscard(this.scope);
  }

  onKey(event) {
    if (!this.list.hidden && this.choices.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        this.moveTo(this.active + (event.key === "ArrowDown" ? 1 : -1));
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.pick(this.choices[this.active]);
        return;
      }
    }
    if (event.key === "Escape" && !this.list.hidden) {
      // The list closes; the thread around it stays open.
      event.preventDefault();
      event.stopPropagation();
      this.closeList();
      return;
    }
    if (enterSends(event)) {
      event.preventDefault();
      this.send();
    }
  }

  // The "@word" just before the caret, if the member is tagging someone. Only
  // where a tag counts (see hasToken), so a picked tag always sends.
  mentionQuery() {
    const caret = this.input.selectionStart;
    if (caret !== this.input.selectionEnd) return null;
    const match = /(^|\s)@([^\s@]{0,32})$/.exec(this.input.value.slice(0, caret));
    return match ? { start: caret - match[2].length - 1, query: match[2].toLowerCase() } : null;
  }

  async suggest() {
    const found = this.scope && this.scope.canWrite ? this.mentionQuery() : null;
    if (!found) { this.closeList(); return; }
    this.mentionAt = found;
    this.renderChoices(this.choicesFor(found.query, this.members || []));
    if (this.members) return;
    try {
      this.members = await readMembers(polynet);
    } catch (error) {
      return;
    }
    const again = this.mentionQuery();
    if (again && this.mentionAt && again.start === this.mentionAt.start) this.renderChoices(this.choicesFor(again.query, this.members));
  }

  choicesFor(query, members) {
    const scope = this.scope;
    const choices = [];
    const agentName = scope.agentName;
    if (agentName) {
      const words = (agentName + " agent").toLowerCase().split(/\s+/);
      if (!query || words.some((word) => word.indexOf(query) === 0) || agentName.toLowerCase().indexOf(query) === 0) {
        choices.push({ agent: true, name: agentName + " agent", token: "@" + agentName });
      }
    }
    const me = scope.me && scope.me.handle ? scope.me.handle.toLowerCase() : null;
    const rank = (member) => {
      const handle = member.handle.toLowerCase();
      const name = String(member.name || "").toLowerCase();
      if (!query || handle.indexOf(query) === 0 || name.split(/\s+/).some((word) => word.indexOf(query) === 0)) return 0;
      return handle.indexOf(query) !== -1 || name.indexOf(query) !== -1 ? 1 : -1;
    };
    // Only members with a handle can be tagged; online ones come first.
    members.filter((member) => member.handle && member.handle.toLowerCase() !== me)
      .map((member) => ({ member: member, rank: rank(member) }))
      .filter((entry) => entry.rank >= 0)
      .sort((a, b) => (b.member.online - a.member.online) || (a.rank - b.rank) || String(a.member.name).localeCompare(String(b.member.name)))
      .slice(0, MENTION_LIMIT)
      .forEach((entry) => choices.push({ member: entry.member, name: entry.member.name, token: "@" + entry.member.handle }));
    return choices;
  }

  renderChoices(choices) {
    this.choices = choices;
    this.active = 0;
    const id = this.options.id;
    this.list.replaceChildren(...(choices.length ? choices.map((choice, index) => h("li", {
      class: "option", part: "mention-option" + (choice.agent ? " mention-agent" : ""), role: "option", id: id + "-option-" + index,
      "aria-selected": index === 0 ? "true" : "false",
      // Keeps focus (and the caret) in the box.
      onmousedown: (event) => event.preventDefault(),
      onclick: () => this.pick(choice),
    }, [
      avatar(choice.agent ? { type: "community_agent" } : choice.member, choice.name),
      h("span", { class: "who" }, [
        h("span", { text: choice.name }),
        h("span", { class: "handle", text: choice.agent ? "community agent" : "@" + choice.member.handle }),
        choice.member && choice.member.online ? h("span", { class: "online", part: "mention-online", role: "img", "aria-label": "online" }) : null,
      ]),
    ])) : [h("li", { class: "empty", text: this.members ? "No one by that name" : "Loading members…" })]));
    this.list.hidden = false;
    this.input.setAttribute("aria-expanded", "true");
    this.moveTo(0);
  }

  moveTo(index) {
    if (!this.choices.length) { this.input.removeAttribute("aria-activedescendant"); return; }
    this.active = (index + this.choices.length) % this.choices.length;
    const options = this.list.querySelectorAll("[role=option]");
    options.forEach((option, i) => option.setAttribute("aria-selected", i === this.active ? "true" : "false"));
    const current = options[this.active];
    this.input.setAttribute("aria-activedescendant", current.id);
    // Scrolls the list only, never the page around it.
    const list = this.list;
    if (current.offsetTop < list.scrollTop) list.scrollTop = current.offsetTop;
    else if (current.offsetTop + current.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = current.offsetTop + current.offsetHeight - list.clientHeight;
  }

  closeList() {
    this.list.hidden = true;
    this.choices = [];
    this.mentionAt = null;
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
  }

  // Puts the tag in the text (and remembers who it is for).
  pick(choice) {
    const at = this.mentionAt;
    if (!choice || !at || !this.draft) return;
    const value = this.input.value;
    const head = value.slice(0, at.start) + choice.token + " ";
    this.input.value = head + value.slice(this.input.selectionStart).replace(/^ /, "");
    this.input.setSelectionRange(head.length, head.length);
    if (choice.agent) this.draft.agent = true;
    else if (!this.draft.mentions.some((member) => member.ref === choice.member.ref)) {
      this.draft.mentions.push({ ref: choice.member.ref, handle: choice.member.handle, name: choice.member.name });
    }
    this.closeList();
    this.changed(true);
    this.input.focus();
  }

  onPaste(event) {
    const files = event.clipboardData ? Array.from(event.clipboardData.files || []) : [];
    if (!files.length) return;
    // A copied picture attaches; copied text (even beside one) pastes as text.
    if (!event.clipboardData.getData("text/plain")) event.preventDefault();
    this.addFiles(files);
  }

  onDrag(event, over) {
    if (!this.draft || !event.dataTransfer || Array.from(event.dataTransfer.types || []).indexOf("Files") === -1) return;
    event.preventDefault();
    this.box.classList.toggle("dragging", over);
  }

  onDrop(event) {
    this.box.classList.remove("dragging");
    if (!this.draft || !event.dataTransfer || !event.dataTransfer.files.length) return;
    event.preventDefault();
    this.addFiles(event.dataTransfer.files);
    this.input.focus();
  }

  addFiles(list) {
    if (!this.draft) return;
    const problems = [];
    for (const file of Array.from(list || [])) {
      if (this.draft.files.length >= MAX_FILES) { problems.push("A message can carry up to " + MAX_FILES + " files."); break; }
      const limit = fileLimit(file);
      if (file.size > limit.bytes) { problems.push((file.name || "That file") + " is too big (" + limit.label + " up to " + fileSize(limit.bytes) + ")."); continue; }
      if (!file.size) { problems.push((file.name || "That file") + " is empty."); continue; }
      const image = /^image\/(jpeg|png|gif|webp|avif)$/.test(file.type || "");
      this.draft.files.push({ file: file, url: image ? URL.createObjectURL(file) : null });
    }
    this.notice = problems.join(" ");
    this.renderChips();
    this.renderProblem();
    this.updateSend();
  }

  removeFile(entry) {
    const index = this.draft.files.indexOf(entry);
    if (index === -1) return;
    this.draft.files.splice(index, 1);
    if (entry.url) URL.revokeObjectURL(entry.url);
    this.notice = "";
    this.renderChips();
    this.renderProblem();
    this.updateSend();
    if (this.isEmpty() && this.draft.failedKey) this.discard();
    const next = this.chips.querySelectorAll("button")[Math.min(index, this.draft.files.length - 1)];
    (next || this.input).focus();
  }

  renderChips() {
    const files = this.draft ? this.draft.files : [];
    this.chips.replaceChildren(...files.map((entry) => {
      const name = entry.file.name || "Attachment";
      const extension = (/\.([a-z0-9]{1,4})$/i.exec(name) || [])[1] || "file";
      const mark = () => h("span", { class: "mark", "aria-hidden": "true", text: extension });
      let thumb = mark();
      if (entry.url) {
        thumb = h("img", { src: entry.url, alt: "", part: "attachment-thumb" });
        thumb.addEventListener("error", () => thumb.replaceWith(mark()), { once: true });
      }
      return h("li", { class: "chip", part: "attachment-chip" }, [
        thumb,
        h("span", { class: "name", text: name }),
        h("span", { class: "muted", text: fileSize(entry.file.size) }),
        h("button", { class: "icon remove", part: "attachment-remove", type: "button", "aria-label": "Remove " + name, onclick: () => this.removeFile(entry) }),
      ]);
    }));
  }

  renderProblem() {
    const draft = this.draft;
    const nodes = [];
    if (this.notice) nodes.push(h("span", { text: this.notice }));
    if (draft && draft.error) {
      nodes.push(h("span", { text: draft.error }));
      nodes.push(h("button", { class: "quiet", part: "composer-retry", type: "button", text: "Retry", onclick: () => this.send() }));
    }
    this.problem.replaceChildren(...nodes);
  }

  // Hands the message to the chat and empties the box. A retry of exactly the
  // failed send (see sameSend) reuses its key, so it can't post twice.
  send() {
    const scope = this.scope;
    const draft = this.draft;
    if (!scope || !scope.canWrite || !draft || this.isEmpty()) return;
    this.closeList();
    if (draft.files.length > MAX_FILES) {
      this.notice = "A message can carry up to " + MAX_FILES + " files. Remove " + (draft.files.length - MAX_FILES) + " to send.";
      this.renderProblem();
      return;
    }
    const text = draft.text.trim();
    if (text.length > MAX_TEXT_CHARS) {
      // Longer would be cut short on the server; keep the draft and say by how much.
      this.notice = "Messages can be up to " + MAX_TEXT_CHARS.toLocaleString("en-US") + " characters. Trim " + (text.length - MAX_TEXT_CHARS).toLocaleString("en-US") + " to send.";
      this.renderProblem();
      return;
    }
    const payload = {
      scope: scope, text: text, files: draft.files.slice(), key: null,
      // Only tags still in the text count.
      mentions: draft.mentions.filter((member) => hasToken(text, "@" + member.handle)).map((member) => ({ ref: member.ref, handle: member.handle })),
      askAgent: draft.agent && !!scope.agentName && hasToken(text, "@" + scope.agentName),
    };
    payload.key = draft.failedKey && sameSend(draft.failedSend, payload) ? draft.failedKey : newKey();
    const fresh = emptyDraft();
    drafts.set(draftId(scope), fresh);
    this.draft = fresh;
    saveDraft(scope, fresh);
    this.notice = "";
    this.input.value = "";
    autosize(this.input);
    this.renderChips();
    this.renderProblem();
    this.updateSend();
    this.stopTyping();
    this.options.onSend(payload);
  }

  // The chat confirmed it: the previews can go.
  sent(payload) {
    for (const entry of payload.files) if (entry.url) URL.revokeObjectURL(entry.url);
  }

  // The chat couldn't send it: everything comes back to its box (before
  // anything typed since), with the reason and a Retry. Nothing is lost.
  failed(payload, error) {
    const draft = draftFor(payload.scope);
    const typed = draft.text.trim() ? "\n\n" + draft.text : "";
    draft.text = payload.text + typed;
    draft.files = payload.files.concat(draft.files.filter((entry) => payload.files.indexOf(entry) === -1));
    for (const member of payload.mentions) {
      if (!draft.mentions.some((entry) => entry.ref === member.ref)) draft.mentions.push(member);
    }
    draft.agent = draft.agent || payload.askAgent;
    draft.failedKey = payload.key;
    draft.failedSend = {
      text: payload.text, askAgent: payload.askAgent,
      mentions: payload.mentions.map((member) => member.ref), files: payload.files.map((entry) => entry.file),
    };
    draft.error = error && error.code === "upload_failed" && error.message ? error.message + " Your message wasn't sent."
      : error && error.code === "sign_in_required" ? "Your session ended, so this wasn't sent."
      : "Your message wasn't sent.";
    saveDraft(payload.scope, draft);
    if (this.scope && draftId(this.scope) === draftId(payload.scope)) {
      this.draft = draft;
      this.input.value = draft.text;
      autosize(this.input);
      this.renderChips();
      this.renderProblem();
      this.updateSend();
    }
  }
}
`;
