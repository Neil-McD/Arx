// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// The Join page of <polynet-personal page="join">, served at
// /__polynet/blocks/join.js on a site's private twin only (the site itself
// answers 404); personal.js loads it. The community's pitch, readable signed
// out, and its gate exactly as Studio's public funnel decides it: the backend
// projects it with Studio's own functions and every action runs Studio's own
// core, so this page only draws what it's told. Free: sign in, then Join.
// Approval: sign in, ask, then wait (or withdraw). Paid: pick a plan, then
// Stripe's own checkout (the address the backend returned, never one built
// here), and back here "Finishing up…" until Polynet has the payment from
// Stripe itself. Joined: into the site, signed in there too. Kept as text (a
// String.raw literal: no backticks or template placeholders inside) so the
// edge serves exactly what is reviewed.

// Studio's words for each state and refusal (apps/web's funnel; a test keeps
// them equal), plus the twin's own.
export const JOIN_MESSAGES: Record<string, string> = {
  pending_title: "Request pending",
  pending: "You're waiting for approval to join {name}.",
  denied_title: "Request denied",
  denied: "Your join request for {name} was denied.",
  denied_until: "Your join request for {name} was denied. You can request access again on {date}.",
  cancel: "Cancel request",
  cancelling: "Cancelling…",
  paid_plan_required: "This community now requires a paid plan. Select a plan to continue.",
  community_checkout_unavailable: "Checkout is temporarily unavailable for this community.",
  community_temporarily_unavailable: "{name} isn't taking new members right now.",
  community_unavailable: "{name} isn't taking new members right now.",
  community_user_blocked: "You can't join {name}.",
  account_setup_required: "Finish setting up your Polynet account to join {name}.",
  failed: "That didn't work. Try again.",
};

export const JOIN_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block module: the Join page of <polynet-personal page="join">. Only
// on a site's private twin. Style it with ::part() on <polynet-personal>:
// join, pitch, join-avatar, join-name, join-one-liner, join-count, join-about,
// gate, gate-title, gate-note, plans, plan, join-action, join-enter, join-cancel,
// join-setup, join-status, join-error, retry.
import { h, styled, avatar } from "/__polynet/blocks/kit.js";

const STYLE = [
  ".join { display: grid; gap: 2em; max-width: 40em; }",
  ".pitch { display: grid; grid-template-columns: 4.5em minmax(0, 1fr); gap: .5em 1.25em; align-items: center; }",
  ".pitch .face { width: 4.5em; }",
  ".pitch h2 { margin: 0; font-size: 1.5em; line-height: 1.2; overflow-wrap: anywhere; }",
  ".one-liner { margin: .35em 0 0; font-size: 1.0625em; line-height: 1.45; }",
  ".count { margin: .35em 0 0; font-size: .875em; }",
  ".about { grid-column: 1 / -1; line-height: 1.6; overflow-wrap: anywhere; }",
  ".about p { margin: 0 0 .75em; white-space: pre-line; } .about p:last-child { margin-bottom: 0; }",
  ".gate { display: grid; gap: 1em; padding: 1.25em 1.375em; border: 1px solid var(--pn-border); border-radius: var(--pn-radius); }",
  ".gate h3 { margin: 0; font-size: 1.0625em; line-height: 1.3; }",
  ".gate p { margin: 0; line-height: 1.5; }",
  ".plans { display: grid; gap: .5em; margin: 0; padding: 0; border: 0; }",
  ".plans legend { padding: 0; margin-bottom: .35em; font-weight: 600; font-size: .875em; }",
  ".plan { display: flex; align-items: center; gap: .65em; padding: .65em .85em; border: 1px solid var(--pn-border); border-radius: calc(var(--pn-radius) * .7); cursor: pointer; }",
  ".plan:has(input:checked) { border-color: var(--pn-accent); box-shadow: inset 0 0 0 1px var(--pn-accent); }",
  ".plan input { accent-color: var(--pn-accent); margin: 0; }",
  ".error { color: var(--pn-danger); }",
  "a.primary { display: inline-flex; align-items: center; text-decoration: none; }",
  "button:disabled { opacity: .6; cursor: progress; }",
  ":host { --pn-danger: var(--polynet-danger, #c0392b); }",
].join("\n");

const MESSAGES = __POLYNET_JOIN_MESSAGES__;
const CHECKOUT_SESSION = /^chk_[a-f0-9]{32}$/;
// Back from Stripe: ask every two seconds for a minute, then let the member ask.
const FINISH_EVERY_MS = 2000;
const FINISH_TRIES = 30;
// A pending request is re-read while the page is open, as Studio's funnel does.
const PENDING_EVERY_MS = 30000;

function say(key, name, date) {
  return String(MESSAGES[key] || MESSAGES.failed).split("{name}").join(name || "this community").split("{date}").join(date || "");
}

// GET for the read, a small JSON POST for each action. { status, body }; status 0 offline.
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
const ok = (res) => res.status === 200 && res.body.ok === true && res.body.community;

function members(count) {
  return new Intl.NumberFormat().format(count) + (count === 1 ? " member" : " members");
}

function signIn(plan) {
  const back = "/join" + (plan ? "?plan=" + encodeURIComponent(plan) : "");
  location.href = "/__polynet/auth/start?return=" + encodeURIComponent(back);
}

class Join {
  constructor(block, generation) {
    this.block = block;
    this.generation = generation;
    this.timer = 0;
    const params = new URLSearchParams(location.search);
    const checkout = params.get("checkout") || "";
    this.checkout = CHECKOUT_SESSION.test(checkout) ? checkout : null;
    this.canceled = checkout === "canceled";
    this.plan = params.get("plan") === "annual" ? "annual" : params.get("plan") === "monthly" ? "monthly" : null;
    block.teardown = () => this.stop();
  }

  current() {
    return this.generation === this.block.generation;
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = 0;
    if (this.onResume) {
      window.removeEventListener("focus", this.onResume);
      document.removeEventListener("visibilitychange", this.onResume);
      this.onResume = null;
    }
  }

  // The address keeps only what still matters: a checkout until it settles.
  address(search) {
    history.replaceState(history.state, "", location.pathname + search + location.hash);
  }

  async load() {
    const res = await call("/__polynet/me/join");
    if (!this.current()) return;
    if (!ok(res)) {
      return this.block.show("error", [h("div", { class: "state", role: "alert" }, [
        h("p", { text: "Couldn't load this page." }),
        h("button", { class: "quiet", part: "retry", type: "button", onclick: () => this.block.load(), text: "Try again" }),
      ])]);
    }
    this.data = res.body;
    if (this.checkout && this.data.signed_in) return this.finish(0);
    if (this.checkout) this.address("");
    this.render(this.canceled ? { note: "Checkout canceled. You haven't been charged." } : {});
    if (this.canceled) { this.canceled = false; this.address(""); }
  }

  name() {
    return this.data.community.name;
  }

  pitch() {
    const community = this.data.community;
    const about = String(community.about || "").split(/\n\s*\n/).map((text) => text.trim()).filter(Boolean);
    return h("section", { class: "pitch", part: "pitch", "aria-label": community.name }, [
      h("span", { class: "face", part: "join-avatar" }, [avatar({ avatar_url: community.avatar_url }, community.name)]),
      h("div", {}, [
        h("h2", { part: "join-name", text: community.name }),
        community.one_liner ? h("p", { class: "one-liner", part: "join-one-liner", text: community.one_liner }) : null,
        h("p", { class: "count muted", part: "join-count", text: members(community.member_count) }),
      ]),
      about.length ? h("div", { class: "about", part: "join-about" }, about.map((text) => h("p", { text: text }))) : null,
    ]);
  }

  // The page: the pitch, and the gate as it stands for this visitor.
  render(options) {
    this.stop();
    const gate = h("section", { class: "gate", part: "gate", "aria-live": "polite" }, this.gate(options || {}));
    this.block.show(this.state || "ready", [h("div", { class: "join", part: "join" }, [this.pitch(), gate])]);
  }

  gate(options) {
    const data = this.data;
    const viewer = data.viewer;
    const name = this.name();
    const out = [];
    const note = (text, error) => h("p", { class: error ? "error" : "muted", part: error ? "join-error" : "gate-note", role: error ? "alert" : "status", text: text });
    if (options.note) out.push(note(options.note, false));
    if (options.error) out.push(note(options.error, true));
    this.state = viewer ? viewer.state : "signed-out";
    if (viewer && viewer.state === "member") {
      return [h("h3", { part: "gate-title", text: "You're in." }), h("p", { text: "You're a member of " + name + "." }),
        h("div", { class: "actions" }, [h("a", { class: "primary", part: "join-enter", href: data.enter_url, text: "Go to " + name })])];
    }
    if (viewer && viewer.state === "blocked") return out.concat([h("p", { text: say("community_user_blocked", name) })]);
    if (!data.available) return out.concat([h("p", { text: say("community_temporarily_unavailable", name) })]);
    if (viewer && viewer.setup_required) {
      this.state = "setup";
      return out.concat([h("p", { text: say("account_setup_required", name) }),
        h("div", { class: "actions" }, [h("a", { class: "primary", part: "join-setup", href: data.setup_url, text: "Finish setting up" })])]);
    }
    if (viewer && viewer.state === "pending") {
      this.watchPending();
      const cancel = h("button", { class: "quiet", part: "join-cancel", type: "button", text: say("cancel") });
      cancel.addEventListener("click", () => this.cancel(cancel));
      return out.concat([h("h3", { part: "gate-title", text: say("pending_title") }), h("p", { text: say("pending", name) }),
        h("div", { class: "actions" }, [cancel])]);
    }
    if (viewer && viewer.state === "denied" && !viewer.can_request_again) {
      const date = viewer.reapply_at ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(viewer.reapply_at)) : null;
      return out.concat([h("h3", { part: "gate-title", text: say("denied_title") }), h("p", { text: say(date ? "denied_until" : "denied", name, date) })]);
    }
    if (data.gate === "checkout") return out.concat(this.checkoutGate());
    const action = h("button", { class: "primary", part: "join-action", type: "button", text: data.action_label });
    action.addEventListener("click", () => (viewer ? this.join(action) : signIn(null)));
    out.push(h("div", { class: "actions" }, [action]));
    if (!viewer) out.push(h("p", { class: "muted", part: "gate-note", text: "You'll sign in with Polynet first." }));
    return out;
  }

  // A paid plan: Studio's prices, one per billing period, then Stripe's own checkout.
  checkoutGate() {
    const plans = this.data.plans || [];
    if (!plans.length) return [h("p", { text: say("community_checkout_unavailable") })];
    const chosen = plans.find((plan) => plan.billing_period === this.plan) || plans[0];
    this.plan = chosen.billing_period;
    const action = h("button", { class: "primary", part: "join-action", type: "button", text: chosen.label });
    const out = [];
    if (plans.length > 1) {
      out.push(h("fieldset", { class: "plans", part: "plans" }, [h("legend", { text: "Choose a plan" })].concat(plans.map((plan) => {
        const input = h("input", { type: "radio", name: "pn-join-plan", value: plan.billing_period, checked: plan === chosen });
        input.addEventListener("change", () => { this.plan = plan.billing_period; action.textContent = plan.label; });
        return h("label", { class: "plan", part: "plan" }, [input, h("span", { text: plan.label.replace(/^Join /, "") })]);
      }))));
    }
    action.addEventListener("click", () => (this.data.viewer ? this.startCheckout(action) : signIn(this.plan)));
    out.push(h("div", { class: "actions" }, [action]));
    out.push(h("p", { class: "muted", part: "gate-note", text: this.data.viewer ? "You'll pay on Stripe's secure checkout, then come back here."
      : "You'll sign in with Polynet first, then pay on Stripe's secure checkout." }));
    return out;
  }

  // One action: Studio's join decides whether that's joining or asking to.
  async join(button) {
    button.disabled = true;
    button.textContent = "Joining…";
    const res = await call("/__polynet/me/join", {});
    if (!this.current()) return;
    if (res.status === 401) return signIn(null);
    if (!ok(res)) return this.refused(res);
    this.data = res.body;
    if (res.body.viewer && res.body.viewer.state === "member") return this.enter();
    this.render(res.body.outcome === "paid_plan_required" ? { error: say("paid_plan_required") } : {});
  }

  async cancel(button) {
    button.disabled = true;
    button.textContent = say("cancelling");
    const res = await call("/__polynet/me/join/cancel", {});
    if (!this.current()) return;
    if (!ok(res)) return this.refused(res);
    this.data = res.body;
    this.render({});
  }

  async startCheckout(button) {
    button.disabled = true;
    const res = await call("/__polynet/me/join/checkout", { billing_period: this.plan });
    if (!this.current()) return;
    if (res.status === 401) return signIn(this.plan);
    const url = res.status === 200 && res.body.ok === true && typeof res.body.checkout_url === "string" ? res.body.checkout_url : "";
    // Only where the backend said: Stripe's own page for this checkout.
    if (url.indexOf("https://checkout.stripe.com/") === 0) return location.assign(url);
    if (res.body.code === "already_member") return this.block.load();
    return this.refused(res);
  }

  refused(res) {
    const code = res.body && res.body.code;
    if (code === "account_setup_required" || code === "community_user_blocked") return this.block.load();
    const known = code === "community_checkout_unavailable" || code === "community_temporarily_unavailable" || code === "community_unavailable" || code === "paid_plan_required";
    this.render({ error: say(known ? code : "failed", this.name()) });
  }

  // Back from Stripe. The redirect proves nothing: only Polynet's record of the
  // payment, from Stripe's verified notice, makes the member a member.
  async finish(tries) {
    if (tries === 0) {
      this.block.show("finishing", [h("div", { class: "join", part: "join" }, [this.pitch(),
        h("section", { class: "gate", part: "gate" }, [h("p", { part: "join-status", role: "status", text: "Finishing up…" })])])]);
    }
    const res = await call("/__polynet/me/join/finish", { session_id: this.checkout });
    if (!this.current()) return;
    if (res.status === 401) return signIn(null);
    if (ok(res)) this.data = res.body;
    if (ok(res) && res.body.viewer && res.body.viewer.state === "member") return this.enter();
    if (ok(res) && (res.body.status === "expired" || res.body.status === "not_found")) {
      this.checkout = null;
      this.address("");
      return this.render({ error: "That payment didn't go through. You haven't joined yet." });
    }
    if (tries + 1 < FINISH_TRIES) {
      this.timer = setTimeout(() => this.finish(tries + 1), FINISH_EVERY_MS);
      return;
    }
    const again = h("button", { class: "quiet", part: "retry", type: "button", text: "Check again", onclick: () => this.finish(0) });
    this.block.show("finishing", [h("div", { class: "join", part: "join" }, [this.pitch(),
      h("section", { class: "gate", part: "gate" }, [
        h("p", { part: "join-status", role: "status", text: "Still finishing up. A payment can take a minute to confirm." }),
        h("div", { class: "actions" }, [again]),
      ])])]);
  }

  // A member now: into the site, through its own sign-in (silent, since they're signed in to Polynet).
  enter() {
    this.state = "member";
    this.address("");
    this.render({});
    const url = String(this.data.enter_url || "");
    if (/^https?:\/\//.test(url)) location.assign(url);
  }

  watchPending() {
    if (this.onResume) return;
    const check = async () => {
      if (!this.current() || document.visibilityState === "hidden" || this.checking) return;
      this.checking = true;
      const res = await call("/__polynet/me/join");
      this.checking = false;
      if (!this.current() || !ok(res)) return;
      const before = this.data.viewer && this.data.viewer.state;
      this.data = res.body;
      const now = res.body.viewer && res.body.viewer.state;
      if (now !== before) return now === "member" ? this.enter() : this.render({});
      clearTimeout(this.timer);
      this.timer = setTimeout(check, PENDING_EVERY_MS);
    };
    this.onResume = () => { check(); };
    window.addEventListener("focus", this.onResume);
    document.addEventListener("visibilitychange", this.onResume);
    this.timer = setTimeout(check, PENDING_EVERY_MS);
  }
}

export function mountJoin(block, generation) {
  block.root.prepend(...styled(block.root, STYLE));
  return new Join(block, generation).load();
}
`.replace("__POLYNET_JOIN_MESSAGES__", JSON.stringify(JOIN_MESSAGES));
