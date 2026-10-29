// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// The moderation pages of <polynet-personal>, served at
// /__polynet/blocks/moderation.js on a site's private twin only (the site
// itself answers 404); personal.js loads it. /moderate removes one post after
// showing exactly what goes; /requests lists this community's join requests to
// approve or deny. Both run Studio's own cores through /__polynet/me/*, which
// answer only the twin's session of someone who moderates here (owner, admin,
// moderator), so a site's own code never moderates. Kept as text (a String.raw
// literal: no backticks or template placeholders inside) so the edge serves
// exactly what is reviewed.
export const MODERATION_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block module: <polynet-personal page="moderate|requests">. Only on a
// site's private twin. Style it with ::part() on <polynet-personal>:
// moderate, quote, quote-author, quote-text, moderate-remove, moderate-back,
// requests, request, request-avatar, request-name, request-approve,
// request-deny, request-status, moderation-status, moderation-error, empty,
// signin, retry.
import { h, styled, avatar } from "/__polynet/blocks/kit.js";

const STYLE = [
  ".moderate, .requests-page { display: grid; gap: 1.25em; max-width: 40em; }",
  ".quote { margin: 0; padding: 1em 1.25em; border-left: 3px solid var(--pn-border); background: color-mix(in srgb, var(--pn-border) 25%, transparent);",
  "  border-radius: 0 var(--pn-radius) var(--pn-radius) 0; line-height: 1.5; overflow-wrap: anywhere; white-space: pre-line; }",
  ".quote-author { display: block; font-weight: 600; margin-bottom: .35em; }",
  ".actions { display: flex; flex-wrap: wrap; gap: .75em; align-items: center; }",
  ".danger { background: var(--pn-danger); border-color: var(--pn-danger); color: #fff; }",
  ".requests { list-style: none; margin: 0; padding: 0; display: grid; gap: .5em; }",
  ".request { display: grid; grid-template-columns: 2.5em minmax(0, 1fr) auto; gap: .875em; align-items: center;",
  "  padding: .75em 1em; border: 1px solid var(--pn-border); border-radius: var(--pn-radius); }",
  ".request .face { width: 2.5em; }",
  ".who { display: grid; gap: .1em; min-width: 0; } .who strong { overflow-wrap: anywhere; }",
  ".error { color: var(--pn-danger); }",
  "button:disabled { opacity: .6; cursor: progress; }",
  ":host { --pn-danger: var(--polynet-danger, #c0392b); }",
].join("\n");

const REF = /^interaction:(root|reply):[A-Za-z0-9_-]{1,64}$/;

// GET for a read, a small JSON POST for each action. { status, body }; status 0 offline.
async function call(path, body) {
  try {
    const init = body === undefined ? { credentials: "same-origin" }
      : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const res = await fetch(path, init);
    const data = await res.json().catch(() => null);
    return { status: res.status, body: data && typeof data === "object" ? data : {} };
  } catch (error) {
    return { status: 0, body: {} };
  }
}

function signIn(back) {
  location.href = "/__polynet/auth/start?return=" + encodeURIComponent(back);
}

// Where "back" goes on the site: a path of the site's own, or its chat.
async function siteAddress(path) {
  const session = await call("/__polynet/auth/session");
  const origin = session.body && typeof session.body.site_origin === "string" && /^https?:\/\//.test(session.body.site_origin) ? session.body.site_origin : null;
  const safe = typeof path === "string" && /^\/(?!\/)[^\s\\]*$/.test(path) ? path : "/chat";
  return origin ? origin + safe : null;
}

function refusal(block, res, signInBack, words) {
  if (res.status === 401) {
    block.show("signin", [h("div", { class: "state", part: "signin" }, [
      h("p", { text: words.signin }),
      h("button", { class: "primary", type: "button", onclick: () => signIn(signInBack), text: "Sign in" }),
    ])]);
    return true;
  }
  if (res.status === 403) {
    block.show("forbidden", [h("p", { part: "moderation-error", role: "alert", text: words.forbidden })]);
    return true;
  }
  return false;
}

class Moderate {
  constructor(block, generation) {
    this.block = block;
    this.generation = generation;
    const params = new URLSearchParams(location.search);
    this.ref = params.get("ref") || "";
    this.back = params.get("back") || "/chat";
  }

  current() {
    return this.generation === this.block.generation;
  }

  async load() {
    if (!REF.test(this.ref)) return this.block.show("error", [h("p", { role: "alert", text: "There's no post to remove here." })]);
    this.block.show("loading", [h("p", { class: "muted", role: "status", text: "Loading…" })]);
    const [res, backUrl] = await Promise.all([
      call("/__polynet/me/moderation/post?ref=" + encodeURIComponent(this.ref)),
      siteAddress(this.back),
    ]);
    if (!this.current()) return;
    this.backUrl = backUrl;
    const here = location.pathname + location.search;
    if (refusal(this.block, res, here, { signin: "Sign in to moderate this community.", forbidden: "Only this community's moderators can remove posts." })) return;
    if (res.status === 404) return this.done("This post is already gone.");
    if (res.status !== 200 || !res.body.ok || !res.body.post) {
      return this.block.show("error", [h("div", { class: "state", role: "alert" }, [
        h("p", { text: "Couldn't load this post." }),
        h("button", { class: "quiet", part: "retry", type: "button", onclick: () => this.load(), text: "Try again" }),
      ])]);
    }
    const post = res.body.post;
    const status = h("p", { class: "muted", part: "moderation-status", role: "status" });
    const remove = h("button", { class: "primary danger", part: "moderate-remove", type: "button", text: "Remove post" });
    remove.addEventListener("click", () => this.remove(remove, status));
    const actions = [remove];
    if (this.backUrl) actions.push(h("a", { class: "quiet", part: "moderate-back", href: this.backUrl, text: "Cancel" }));
    this.block.show("ready", [h("div", { class: "moderate", part: "moderate" }, [
      h("p", { text: post.mine ? "Remove your post for everyone?" : "Remove this post for everyone? It's gone from the community for good." }),
      h("blockquote", { class: "quote", part: "quote" }, [
        h("span", { class: "quote-author", part: "quote-author", text: String(post.author || "A member") }),
        h("span", { part: "quote-text", text: String(post.text || "") }),
      ]),
      h("div", { class: "actions" }, actions),
      status,
    ])]);
  }

  async remove(button, status) {
    button.disabled = true;
    status.textContent = "Removing…";
    const res = await call("/__polynet/me/moderation/remove", { ref: this.ref });
    if (!this.current()) return;
    if (res.status === 200 && res.body.ok) return this.done("Post removed.");
    if (res.status === 404) return this.done("This post is already gone.");
    button.disabled = false;
    status.textContent = res.status === 403 ? "Only this community's moderators can remove posts." : "That didn't work. Try again.";
  }

  done(text) {
    const children = [h("p", { part: "moderation-status", role: "status", text: text })];
    if (this.backUrl) children.push(h("a", { class: "primary", part: "moderate-back", href: this.backUrl, text: "Back to the community" }));
    this.block.show("done", [h("div", { class: "moderate", part: "moderate" }, children)]);
  }
}

class Requests {
  constructor(block, generation) {
    this.block = block;
    this.generation = generation;
  }

  current() {
    return this.generation === this.block.generation;
  }

  async load() {
    this.block.show("loading", [h("p", { class: "muted", role: "status", text: "Loading…" })]);
    const res = await call("/__polynet/me/requests");
    if (!this.current()) return;
    if (refusal(this.block, res, "/requests", { signin: "Sign in to review who's asking to join.", forbidden: "Only this community's moderators review join requests." })) return;
    if (res.status !== 200 || !res.body.ok || !Array.isArray(res.body.requests)) {
      return this.block.show("error", [h("div", { class: "state", role: "alert" }, [
        h("p", { text: "Couldn't load the join requests." }),
        h("button", { class: "quiet", part: "retry", type: "button", onclick: () => this.load(), text: "Try again" }),
      ])]);
    }
    if (res.body.paid) {
      return this.block.show("empty", [h("p", { part: "empty", text: "People join this community by choosing a plan, so there are no requests to review." })]);
    }
    if (!res.body.requests.length) return this.block.show("empty", [h("p", { part: "empty", text: "No one is waiting to join." })]);
    const list = h("ul", { class: "requests", part: "requests", "aria-label": "Join requests" }, res.body.requests.map((request) => this.row(request)));
    this.block.show("ready", [h("div", { class: "requests-page" }, [list])]);
  }

  row(request) {
    const status = h("span", { class: "muted", part: "request-status", role: "status" });
    const approve = h("button", { class: "primary", part: "request-approve", type: "button", text: "Approve", "aria-label": "Approve " + request.name });
    const deny = h("button", { class: "quiet", part: "request-deny", type: "button", text: "Deny", "aria-label": "Deny " + request.name });
    const decide = async (path, done) => {
      approve.disabled = true;
      deny.disabled = true;
      const res = await call(path, { request_id: request.id });
      if (!this.current()) return;
      if (res.status === 200 && res.body.ok) {
        approve.remove();
        deny.remove();
        status.textContent = done;
        return;
      }
      approve.disabled = false;
      deny.disabled = false;
      status.textContent = res.status === 409 ? "Already decided." : res.status === 403 ? "Only moderators can decide this." : "That didn't work. Try again.";
      status.className = "error";
    };
    approve.addEventListener("click", () => decide("/__polynet/me/requests/approve", "Approved"));
    deny.addEventListener("click", () => decide("/__polynet/me/requests/deny", "Denied"));
    return h("li", { class: "request", part: "request" }, [
      h("span", { class: "face", part: "request-avatar" }, [avatar({ avatar_url: request.avatar_url }, request.name)]),
      h("span", { class: "who" }, [
        h("strong", { part: "request-name", text: String(request.name || "Someone") }),
        request.handle ? h("span", { class: "muted", text: "@" + request.handle }) : null,
      ]),
      h("span", { class: "actions" }, [approve, deny, status]),
    ]);
  }
}

export function mountModerate(block, generation) {
  block.root.prepend(...styled(block.root, STYLE));
  return new Moderate(block, generation).load();
}

export function mountRequests(block, generation) {
  block.root.prepend(...styled(block.root, STYLE));
  return new Requests(block, generation).load();
}
`;
