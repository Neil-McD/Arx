// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// The Join page of <polynet-personal page="join">, served at
// /__polynet/blocks/join.js on a site's private twin only (the site itself
// answers 404); personal.js loads it. The community's pitch, readable signed
// out, and its gate exactly as Studio's public funnel decides it: the backend
// projects it with Studio's own functions and every action runs Studio's own
// core, so this page only draws what it's told. Free: sign in, then Join.
// Approval: sign in, ask, then wait (or withdraw). Paid, cash first: pick a
// plan, then Stripe's own checkout (the address the backend returned, never one
// built here), signed in or not; back here, sign in if they weren't (this
// browser holds the payment until then), and "Finishing your membership…"
// until Polynet has the payment from Stripe. Joined: into the site, signed in
// there too. Kept as text (a
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
  setup_done: "You're all set. Now join {name}.",
  failed: "That didn't work. Try again.",
};

export const JOIN_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block module: the Join page of <polynet-personal page="join">. Only
// on a site's private twin. The community's doorstep: its promise, what members
// get, its story, and a join card that stays in reach. Style it with ::part()
// on <polynet-personal>: join, doorstep-head, doorstep-body, join-eyebrow,
// join-name, join-host, join-one-liner, join-count, join-video, join-fit,
// join-for, join-not-for, join-steps, join-step, join-courses, join-course,
// join-results, join-result, join-founder, join-objections, join-objection,
// join-about, gate, join-banner, join-price, join-guarantee, gate-title, gate-note, join-terms,
// setup-done, plans, plan, join-action, join-enter, join-cancel, join-setup,
// join-signin, join-status, join-error, retry.
import { h, styled, avatar } from "/__polynet/blocks/kit.js";

// Narrow: the promise, then the card, then the rest. Wide: the card beside
// everything, staying in view as the page scrolls.
const STYLE = [
  ".join { container-type: inline-size; }",
  ".doorstep { display: grid; gap: 2em; grid-template-columns: minmax(0, 1fr); grid-template-areas: 'head' 'card' 'body'; }",
  "@container (min-width: 46rem) {",
  "  .doorstep { grid-template-columns: minmax(0, 1fr) minmax(17rem, 22rem); grid-template-areas: 'head card' 'body card'; column-gap: clamp(2em, 5cqi, 4em); row-gap: 3em; align-items: start; }",
  "  .gate { position: sticky; top: 1.5em; }",
  "}",
  ".head { grid-area: head; display: grid; gap: .9em; }",
  ".body { grid-area: body; display: grid; gap: 3em; min-width: 0; }",
  ".eyebrow { margin: 0; font-size: .8125em; letter-spacing: .08em; text-transform: uppercase; color: var(--pn-muted); overflow-wrap: anywhere; }",
  ".promise { margin: 0; font-size: clamp(2em, 6.5cqi, 3.5em); line-height: 1.05; letter-spacing: -.015em; text-wrap: balance; overflow-wrap: anywhere; }",
  ".count { margin: 0; font-size: .9375em; }",
  ".section h3 { margin: 0 0 .9em; font-size: .8125em; letter-spacing: .08em; text-transform: uppercase; color: var(--pn-muted); }",
  ".courses { list-style: none; margin: 0; padding: 0; border: 1px solid var(--pn-border); border-radius: var(--pn-radius); overflow: hidden; }",
  ".courses li { display: grid; grid-template-columns: 2.5em minmax(0, 1fr); gap: .25em 1em; padding: 1em 1.15em; }",
  ".courses li + li { border-top: 1px solid var(--pn-border); }",
  ".courses .n { grid-row: span 2; font-size: 1.5em; font-weight: 700; line-height: 1.1; color: var(--pn-accent); }",
  ".courses .title { font-weight: 600; overflow-wrap: anywhere; }",
  ".courses .summary { font-size: .9375em; color: var(--pn-muted); overflow-wrap: anywhere; }",
  ".video { position: relative; aspect-ratio: 16 / 9; border-radius: var(--pn-radius); overflow: hidden; background: var(--pn-tint); }",
  ".video iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }",
  ".fit { display: grid; gap: 1em; grid-template-columns: repeat(auto-fit, minmax(15em, 1fr)); }",
  ".fit > div { padding: 1.15em 1.25em; border: 1px solid var(--pn-border); border-radius: var(--pn-radius); }",
  ".fit ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .6em; }",
  ".fit li { display: grid; grid-template-columns: 1.1em minmax(0, 1fr); gap: .6em; overflow-wrap: anywhere; }",
  ".fit li::before { content: '\\2713'; color: var(--pn-accent); font-weight: 700; }",
  ".fit .not li { color: var(--pn-muted); } .fit .not li::before { content: '\\2715'; color: var(--pn-muted); }",
  ".fit h3 { margin-bottom: .75em; }",
  ".steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 1em; grid-template-columns: repeat(auto-fit, minmax(11em, 1fr)); counter-reset: step; }",
  ".steps li { display: grid; gap: .3em; padding-top: .9em; border-top: 2px solid var(--pn-border); counter-increment: step; overflow-wrap: anywhere; }",
  ".steps li:last-child { border-top-color: var(--pn-accent); }",
  ".steps li::before { content: counter(step, decimal-leading-zero); font-size: 1.5em; font-weight: 700; color: var(--pn-muted); }",
  ".steps li:last-child::before { color: var(--pn-accent); }",
  ".steps strong { font-size: 1.0625em; } .steps span { color: var(--pn-muted); }",
  ".results { display: grid; gap: 1em; grid-template-columns: repeat(auto-fit, minmax(15em, 1fr)); }",
  ".results figure { margin: 0; padding: 1.25em; border-radius: var(--pn-radius); background: var(--pn-tint); display: grid; gap: .9em; align-content: start; }",
  ".results blockquote { margin: 0; font-size: 1.0625em; line-height: 1.5; overflow-wrap: anywhere; }",
  ".results figcaption { font-size: .875em; color: var(--pn-muted); overflow-wrap: anywhere; }",
  ".results figcaption strong { color: var(--pn-surface-text); }",
  ".results + .founder { margin-top: 1em; }",
  ".founder { display: grid; grid-template-columns: 3.5em minmax(0, 1fr); gap: 1em; align-items: center; padding: 1.15em 1.25em; border: 1px solid var(--pn-border); border-radius: var(--pn-radius); }",
  ".founder p { margin: .2em 0 0; color: var(--pn-muted); overflow-wrap: anywhere; }",
  ".objections { display: grid; gap: .75em; }",
  ".objections div { padding: 1.1em 1.25em; border-radius: var(--pn-radius); background: var(--pn-tint); overflow-wrap: anywhere; }",
  ".objections strong { display: block; margin-bottom: .3em; }",
  ".objections p { margin: 0; color: var(--pn-muted); }",
  ".guarantee { padding: .75em .9em; border-radius: calc(var(--pn-radius) * .7); background: var(--pn-tint); font-size: .875em; overflow-wrap: anywhere; }",
  ".about { line-height: 1.6; overflow-wrap: anywhere; max-width: 40em; }",
  ".about p { margin: 0 0 .9em; white-space: pre-line; } .about p:last-child { margin-bottom: 0; }",
  ".gate { grid-area: card; display: grid; border: 1px solid var(--pn-border); border-radius: calc(var(--pn-radius) * 1.4); background: var(--pn-surface); overflow: hidden; }",
  ".gate .banner { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-bottom: 1px solid var(--pn-border); }",
  ".gate .inside { display: grid; gap: 1em; padding: 1.4em; }",
  ".gate h3 { margin: 0; font-size: 1.0625em; line-height: 1.3; }",
  ".gate p { margin: 0; line-height: 1.5; }",
  ".price { display: flex; align-items: baseline; gap: .35em; margin: 0; }",
  ".price strong { font-size: 2.75em; line-height: 1; letter-spacing: -.02em; }",
  ".gate .primary { width: 100%; justify-content: center; min-height: 3.25em; font-size: 1.0625em; border-radius: calc(var(--pn-radius) * .9); }",
  ".plans { display: grid; gap: .5em; margin: 0; padding: 0; border: 0; }",
  ".plans legend { padding: 0; margin-bottom: .35em; font-weight: 600; font-size: .875em; }",
  ".plan { display: flex; align-items: center; gap: .65em; padding: .65em .85em; border: 1px solid var(--pn-border); border-radius: calc(var(--pn-radius) * .7); cursor: pointer; }",
  ".plan:has(input:checked) { border-color: var(--pn-accent); box-shadow: inset 0 0 0 1px var(--pn-accent); }",
  ".plan input { accent-color: var(--pn-accent); margin: 0; }",
  ".signin { font-size: .875em; }",
  ".error { color: var(--pn-danger); }",
  ".terms { font-size: .8125em; } .terms a { color: inherit; }",
  "a.primary { display: inline-flex; align-items: center; text-decoration: none; }",
  "button:disabled { opacity: .6; cursor: progress; }",
  ":host { --pn-danger: var(--polynet-danger, #c0392b); }",
].join("\n");

const MESSAGES = __POLYNET_JOIN_MESSAGES__;
const CHECKOUT_SESSION = /^chk_[a-f0-9]{32}$/;
// Back from Stripe: ask every two seconds for a minute, then let the member ask.
const FINISH_EVERY_MS = 2000;
const FINISH_TRIES = 30;
const FINISHING = "Finishing your membership…";
// A pending request is re-read while the page is open, as Studio's funnel does.
const PENDING_EVERY_MS = 30000;
// A small count makes people hesitate: it shows once it helps.
const MEMBER_COUNT_SHOWN_FROM = 25;
// The founder's intro video, in its own player (the edge allows only these, only here).
const PLAYERS = {
  youtube: (id) => "https://www.youtube-nocookie.com/embed/" + id,
  vimeo: (id) => "https://player.vimeo.com/video/" + id + "?dnt=1",
  loom: (id) => "https://www.loom.com/embed/" + id,
};

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

// Back to Join after signing in, with the plan picked or the checkout to finish.
function signIn(plan, checkout) {
  const back = "/join" + (checkout ? "?checkout=" + encodeURIComponent(checkout) : plan ? "?plan=" + encodeURIComponent(plan) : "");
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
    // Paid before signing in: straight on to sign in, then it's theirs.
    if (this.checkout) return this.signInToFinish();
    this.render(this.canceled ? { note: "Checkout canceled. You haven't been charged." } : {});
    if (this.canceled) { this.canceled = false; this.address(""); }
  }

  name() {
    return this.data.community.name;
  }

  // The doorstep around the card: the promise up top, then what members get and the story.
  page(state, card) {
    const community = this.data.community;
    const host = community.host && community.host.name ? community.host.name : null;
    const eyebrow = community.one_liner
      ? [h("span", { part: "join-name", text: community.name }), host ? h("span", { part: "join-host", text: " · by " + host }) : null]
      : host ? [h("span", { part: "join-host", text: "by " + host })] : [];
    const head = h("section", { class: "head", part: "doorstep-head", "aria-label": community.name }, [
      eyebrow.length ? h("p", { class: "eyebrow", part: "join-eyebrow" }, eyebrow) : null,
      community.one_liner ? h("h2", { class: "promise", part: "join-one-liner", text: community.one_liner })
        : h("h2", { class: "promise", part: "join-name", text: community.name }),
      community.member_count >= MEMBER_COUNT_SHOWN_FROM ? h("p", { class: "count muted", part: "join-count", text: members(community.member_count) }) : null,
      this.video(),
    ]);
    const sales = community.page || {};
    const forYou = sales.for_you || [];
    const notFor = sales.not_for || [];
    const steps = sales.first_steps || [];
    const results = sales.results || [];
    const objections = sales.objections || [];
    const courses = community.courses || [];
    const about = String(community.about || "").split(/\n\s*\n/).map((text) => text.trim()).filter(Boolean);
    // The founder's sections, each only when it has something in it.
    const body = h("div", { class: "body", part: "doorstep-body" }, [
      forYou.length || notFor.length ? h("section", { class: "fit", part: "join-fit" }, [
        forYou.length ? h("div", { part: "join-for" }, [h("h3", { text: "This is for you if" }), h("ul", {}, forYou.map((text) => h("li", { text: text })))]) : null,
        notFor.length ? h("div", { class: "not", part: "join-not-for" }, [h("h3", { text: "It's not for you if" }), h("ul", {}, notFor.map((text) => h("li", { text: text })))]) : null,
      ]) : null,
      steps.length ? h("section", { class: "section" }, [h("h3", { text: "Your first steps" }),
        h("ol", { class: "steps", part: "join-steps" }, steps.map((step) => h("li", { part: "join-step" }, [
          h("strong", { text: step.title }), step.text ? h("span", { text: step.text }) : null,
        ])))]) : null,
      courses.length ? h("section", { class: "section" }, [h("h3", { text: "What you get" }),
        h("ul", { class: "courses", part: "join-courses" }, courses.map((course) => h("li", { part: "join-course" }, [
          h("span", { class: "n", "aria-hidden": "true", text: String(course.lessons) }),
          h("span", { class: "title", text: course.title + " · " + course.lessons + (course.lessons === 1 ? " lesson" : " lessons") }),
          course.summary ? h("span", { class: "summary", text: course.summary }) : null,
        ])))]) : null,
      results.length || sales.founder_bio ? h("section", { class: "section" }, [h("h3", { text: results.length ? "Results" : "Your host" }),
        results.length ? h("div", { class: "results", part: "join-results" }, results.map((result) => h("figure", { part: "join-result" }, [
          h("blockquote", { text: "\u201c" + result.quote + "\u201d" }),
          h("figcaption", {}, [h("strong", { text: result.name }), result.role ? " \u00b7 " + result.role : null]),
        ]))) : null,
        sales.founder_bio ? h("div", { class: "founder", part: "join-founder" }, [
          avatar(null, community.host ? community.host.name : community.name),
          h("div", {}, [h("strong", { text: community.host ? community.host.name + ", your host" : "Your host" }), h("p", { text: sales.founder_bio })]),
        ]) : null,
      ]) : null,
      objections.length ? h("section", { class: "section" }, [h("h3", { text: "Fair questions" }),
        h("div", { class: "objections", part: "join-objections" }, objections.map((item) => h("div", { part: "join-objection" }, [
          h("strong", { text: item.question }), h("p", { text: item.answer }),
        ])))]) : null,
      about.length ? h("section", { class: "section" }, [h("h3", { text: "About" }),
        h("div", { class: "about", part: "join-about" }, about.map((text) => h("p", { text: text })))]) : null,
    ]);
    const banner = community.banner_url ? h("img", { class: "banner", part: "join-banner", src: community.banner_url, alt: "", loading: "lazy" }) : null;
    if (banner) banner.addEventListener("error", () => banner.remove(), { once: true });
    const gate = h("section", { class: "gate", part: "gate", "aria-live": "polite" }, [banner, h("div", { class: "inside" }, card)]);
    this.block.show(state, [h("div", { class: "join", part: "join" }, [h("div", { class: "doorstep" }, [head, gate, body])])]);
  }

  // The founder's intro video, when there is one: in its own player, from its id alone.
  video() {
    const video = this.data.community.page && this.data.community.page.video;
    const player = video && Object.prototype.hasOwnProperty.call(PLAYERS, video.provider) ? PLAYERS[video.provider] : null;
    if (!player || !/^[A-Za-z0-9_-]{6,32}$/.test(String(video.id))) return null;
    return h("div", { class: "video", part: "join-video" }, [h("iframe", {
      src: player(video.id), title: "Intro video: " + this.data.community.name, loading: "lazy",
      allow: "fullscreen; picture-in-picture; encrypted-media", allowfullscreen: true,
      referrerpolicy: "strict-origin-when-cross-origin",
      sandbox: "allow-scripts allow-same-origin allow-presentation allow-popups",
    })]);
  }

  // The founder's guarantee, said right under the button, when they give one.
  guarantee() {
    const text = this.data.community.page && this.data.community.page.guarantee;
    return text ? h("p", { class: "guarantee", part: "join-guarantee", text: text }) : null;
  }

  // The page: the doorstep, and the card as it stands for this visitor.
  render(options) {
    this.stop();
    const card = this.gate(options || {});
    this.page(this.state || "ready", card);
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
    // Back from setting up their Polynet account: say so, then the one step left.
    if (viewer && viewer.state === "visitor" && new URLSearchParams(location.search).get("setup") === "done") {
      out.push(h("p", { part: "setup-done", role: "status", text: say("setup_done", name) }));
    }
    if (data.gate === "checkout") return out.concat(this.checkoutGate());
    // What it costs, said first, as a paid card says its price.
    out.push(h("p", { class: "price", part: "join-price" }, [h("strong", { text: "Free" }),
      data.gate === "request_access" ? h("span", { class: "muted", text: "· membership by approval" }) : null]));
    const action = h("button", { class: "primary", part: "join-action", type: "button", text: data.action_label });
    action.addEventListener("click", () => (viewer ? this.join(action) : signIn(null)));
    out.push(h("div", { class: "actions" }, [action]));
    out.push(this.guarantee());
    if (!viewer) out.push(h("p", { class: "muted", part: "gate-note", text: "You'll sign in with Polynet first." }));
    out.push(this.terms());
    if (!viewer) out.push(this.memberSignIn());
    return out;
  }

  // Someone who already has access (a member, or a buyer in the community's own
  // app), signed out here: sign in, and the card says they're in.
  memberSignIn() {
    return h("p", { class: "muted signin" }, ["Already have access? ",
      h("button", { class: "quiet", part: "join-signin", type: "button", text: "Sign in", onclick: () => signIn(null) })]);
  }

  // A paid plan: Studio's prices, one per billing period, then Stripe's own checkout.
  checkoutGate() {
    const plans = this.data.plans || [];
    if (!plans.length) return [h("p", { text: say("community_checkout_unavailable") })];
    const chosen = plans.find((plan) => plan.billing_period === this.plan) || plans[0];
    this.plan = chosen.billing_period;
    const action = h("button", { class: "primary", part: "join-action", type: "button", text: chosen.label });
    const price = h("strong", { text: chosen.price || "" });
    const per = h("span", { class: "muted", text: chosen.billing_period === "annual" ? "/ year" : "/ month" });
    const out = chosen.price ? [h("p", { class: "price", part: "join-price" }, [price, per])] : [];
    if (plans.length > 1) {
      out.push(h("fieldset", { class: "plans", part: "plans" }, [h("legend", { text: "Choose a plan" })].concat(plans.map((plan) => {
        const input = h("input", { type: "radio", name: "pn-join-plan", value: plan.billing_period, checked: plan === chosen });
        input.addEventListener("change", () => {
          this.plan = plan.billing_period;
          action.textContent = plan.label;
          price.textContent = plan.price || "";
          per.textContent = plan.billing_period === "annual" ? "/ year" : "/ month";
        });
        return h("label", { class: "plan", part: "plan" }, [input, h("span", { text: plan.label.replace(/^Join /, "") })]);
      }))));
    }
    action.addEventListener("click", () => this.startCheckout(action));
    out.push(h("div", { class: "actions" }, [action]));
    out.push(this.guarantee());
    out.push(h("p", { class: "muted", part: "gate-note", text: this.data.viewer ? "You'll pay on Stripe's secure checkout, then come back here."
      : "You'll pay on Stripe's secure checkout, then sign in to get in." }));
    out.push(this.terms());
    if (!this.data.viewer) out.push(this.memberSignIn());
    return out;
  }

  // Join's click is the acceptance (Polynet records it): said under the button.
  terms() {
    const link = (href, text) => href ? h("a", { href: href, target: "_blank", rel: "noopener noreferrer", text: text }) : h("span", { text: text });
    return h("p", { class: "muted terms", part: "join-terms" }, [
      "By joining you agree to Polynet's ", link(this.data.terms_url, "Terms"),
      " and ", link(this.data.privacy_url, "Privacy & AI Data Policy"), ".",
    ]);
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

  // Cash first: signed in or not, straight to Stripe. Signed out, this
  // browser keeps the payment (an HttpOnly cookie) until they sign in.
  async startCheckout(button) {
    button.disabled = true;
    const guest = !this.data.viewer;
    const res = await call(guest ? "/__polynet/me/join/guest-checkout" : "/__polynet/me/join/checkout", { billing_period: this.plan });
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
    if (tries === 0) this.finishing();
    const res = await call("/__polynet/me/join/finish", { session_id: this.checkout });
    if (!this.current()) return;
    if (res.status === 401) return signIn(null, this.checkout);
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
    this.page("finishing", [
      h("p", { part: "join-status", role: "status", text: "Still finishing up. A payment can take a minute to confirm." }),
      h("div", { class: "actions" }, [again]),
    ]);
  }

  // From Stripe to chat it's one screen, whatever runs underneath (signing in,
  // Stripe's confirmation, signing in on the site).
  finishing() {
    this.page("finishing", [h("p", { part: "join-status", role: "status", text: FINISHING })]);
  }

  // Back from Stripe signed out: straight on to sign in, which brings them back to finish.
  signInToFinish() {
    this.finishing();
    signIn(null, this.checkout);
  }

  // A member now: into the site, through its own sign-in (silent, since they're signed in to Polynet).
  enter() {
    this.state = "member";
    this.address("");
    const url = String(this.data.enter_url || "");
    if (!/^https?:\/\//.test(url)) return this.render({});
    this.finishing();
    location.assign(url);
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
