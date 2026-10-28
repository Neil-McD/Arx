// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// <polynet-events>, served at /__polynet/blocks/events.js: the community's
// calendar. Upcoming first, grouped by month, each time in the event's own
// time zone (and the member's, when it differs); past events folded below.
// Each event opens at its own address, /events/<event>: when, where, the
// description, an .ics file for the member's calendar and a link to share.
// No RSVP: Polynet has none yet. Kept as text (a String.raw literal: no
// backticks or template placeholders inside) so the edge serves exactly what
// is reviewed; the address pattern comes from the one route table.
import { EVENT_ID } from "../../../../../packages/polynet-cli/checks.mjs";

export const EVENTS_SOURCE = String.raw`// SPDX-License-Identifier: MIT
// Polynet block: <polynet-events>. ui.js loads it on pages that place the tag.
//   <polynet-events></polynet-events>            the calendar; on /events/<event>, that event
//   <polynet-events limit="3"></polynet-events>  the next three and a link to /events (for a home page)
import polynet from "/__polynet/sdk.js";
import { BASE_STYLE, PROSE_STYLE, h, signInGate, pagePath, followLink } from "/__polynet/blocks/kit.js";

const STYLE = BASE_STYLE + "\n" + PROSE_STYLE + "\n" + [
  ":host { display: block; }",
  ".month + .month, .past, .more-wrap { margin-top: 1.5em; }",
  ".month-title { margin: 0 0 .5em; font-size: .75em; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--pn-muted); }",
  "ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .25em; }",
  ".event { display: grid; grid-template-columns: 3.25em minmax(0, 1fr); gap: .875em; align-items: start; padding: .625em;",
  "  border-radius: var(--pn-radius); text-decoration: none; line-height: 1.4; }",
  "@media (hover: hover) { .event:hover { background: var(--pn-tint); } }",
  ".date { display: grid; justify-items: center; padding: .3em 0; border: 1px solid var(--pn-border); border-radius: calc(var(--pn-radius) * .7); line-height: 1.1; }",
  ".date .weekday { font-size: .6875em; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--pn-muted); }",
  ".date .day { font-size: 1.25em; font-weight: 600; font-variant-numeric: tabular-nums; }",
  ".what { min-width: 0; display: grid; gap: .125em; }",
  ".title { font-weight: 600; overflow-wrap: anywhere; }",
  ".time, .place, .local, .repeat { color: var(--pn-muted); font-size: .875em; }",
  ".now-badge { display: inline-block; margin-right: .5em; font-size: .6875em; font-weight: 600; letter-spacing: .05em; text-transform: uppercase;",
  "  color: var(--pn-accent); border: 1px solid currentColor; border-radius: 999px; padding: .05em .5em; vertical-align: .1em; }",
  ".past summary { cursor: pointer; font-weight: 600; padding: .25em 0; }",
  ".past[open] summary { margin-bottom: .75em; }",
  ".none { color: var(--pn-muted); margin: 0 0 1em; }",
  ".detail { display: grid; gap: 1em; }",
  ".back { justify-self: start; }",
  ".detail-title { margin: 0; font-size: 1.5em; line-height: 1.25; overflow-wrap: anywhere; }",
  ".facts { margin: 0; display: grid; gap: .5em; }",
  ".fact { display: grid; grid-template-columns: 5.5em minmax(0, 1fr); gap: .75em; }",
  ".fact dt { color: var(--pn-muted); font-size: .875em; padding-top: .1em; }",
  ".fact dd { margin: 0; display: grid; gap: .125em; }",
  ".share-status { margin: 0; font-size: .875em; color: var(--pn-muted); }",
  "@media (pointer: coarse) { .event { min-height: 44px; } }",
].join("\n");

const BASE = "/events";
const EVENT_ID = new RegExp(__POLYNET_EVENT_ID__);
// Polynet's own refs: event:<id>:<start ms>. The address swaps the last ":" for "~".
const EVENT_REF = /^event:([A-Za-z0-9_-]{1,180}):([0-9]{1,16})$/;
const PAGE = 50;
// Past events: the last PAST_DAYS, read PAST_PAGES pages at most.
const PAST_DAYS = 90;
const RECENT_PAST_DAYS = 14;
// Long enough for multi-day events that are still going.
const ONGOING_DAYS = 3;
const PAST_PAGES = 5;
// An event with no end time lasts an hour (as in Polynet).
const DEFAULT_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOCAL_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function addressOf(ref) {
  const match = EVENT_REF.exec(String(ref || ""));
  return match ? match[1] + "~" + match[2] : null;
}
function refOf(address) {
  return EVENT_ID.test(address) ? "event:" + address.replace(/~([0-9]+)$/, ":$1") : null;
}
function startOf(event) { return new Date(event.starts_at); }
function endOf(event) {
  const end = event.ends_at ? new Date(event.ends_at) : null;
  return end && end.getTime() > startOf(event).getTime() ? end : new Date(startOf(event).getTime() + DEFAULT_MS);
}

// Dates and times in a time zone (the event's, or the member's when zone is
// null), in the member's own language. A zone the browser doesn't know reads
// as the member's own.
function formatter(zone, options) {
  try { return new Intl.DateTimeFormat(undefined, Object.assign({}, options, zone ? { timeZone: zone } : {})); }
  catch (error) { return new Intl.DateTimeFormat(undefined, options); }
}
function inZone(date, zone, options) { return formatter(zone, options).format(date); }
const TIME = { hour: "numeric", minute: "2-digit" };
const DAY = { weekday: "short", month: "short", day: "numeric" };
// "6:00 – 7:30 PM EST", or with the days when it runs past midnight.
function span(event, zone, withDay) {
  const start = startOf(event);
  const end = endOf(event);
  const sameDay = inZone(start, zone, { year: "numeric", month: "numeric", day: "numeric" }) === inZone(end, zone, { year: "numeric", month: "numeric", day: "numeric" });
  const options = Object.assign({}, withDay || !sameDay ? DAY : {}, TIME, { timeZoneName: "short" });
  const format = formatter(zone, options);
  return typeof format.formatRange === "function" ? format.formatRange(start, end) : format.format(start) + " – " + format.format(end);
}
// The member's own clock, when it reads differently from the event's.
function localSpan(event) {
  const zone = event.timezone || null;
  if (!zone || zone === LOCAL_ZONE) return null;
  const start = startOf(event);
  const wall = { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" };
  if (inZone(start, zone, wall) === inZone(start, null, wall)) return null;
  return span(event, null, true) + " your time";
}
function whereText(event) {
  const label = event.location_label ? String(event.location_label) : "";
  if (event.location_type === "online") return label ? "Online · " + label : "Online";
  if (event.location_type === "tbd") return label || "Place to be confirmed";
  return label || null;
}
function repeatText(event) {
  const every = Number(event.recurrence_interval) > 1 ? Number(event.recurrence_interval) : 1;
  const unit = { daily: "day", weekly: "week", monthly: "month" }[event.recurrence_frequency];
  if (!unit) return null;
  return every === 1 ? "Repeats every " + unit : "Repeats every " + every + " " + unit + "s";
}
function webLink(url) {
  try { const parsed = new URL(String(url)); return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null; }
  catch (error) { return null; }
}

// An .ics file (RFC 5545) for one event: times in UTC, text escaped, lines folded at 75 bytes.
function icsText(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function icsTime(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.[0-9]{3}/, "");
}
function icsFold(line) {
  const encoder = new TextEncoder();
  let out = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) { out += "\r\n "; bytes = 1; }
    out += char;
    bytes += size;
  }
  return out;
}
export function icsFor(event, link) {
  const where = whereText(event);
  const description = [event.description_md || "", link].filter(Boolean).join("\n\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Polynet//Community events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:" + icsText(event.ref + "@" + location.host),
    "DTSTAMP:" + icsTime(new Date()),
    "DTSTART:" + icsTime(startOf(event)),
    "DTEND:" + icsTime(endOf(event)),
    "SUMMARY:" + icsText(event.title || "Event"),
    description ? "DESCRIPTION:" + icsText(description) : null,
    where ? "LOCATION:" + icsText(where) : null,
    "URL:" + icsText(link),
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
function fileName(title) {
  return (String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "event") + ".ics";
}

class PolynetEvents extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.generation = 0;
    this.onPop = () => { if (this.follows()) this.load({ moved: true }); };
    this.view = h("div", { class: "view", part: "events" });
    this.status = h("p", { class: "sr", role: "status" });
    this.root.replaceChildren(h("style", { text: STYLE }), this.view, this.status);
  }

  connectedCallback() {
    window.addEventListener("popstate", this.onPop);
    this.load({});
  }

  disconnectedCallback() {
    window.removeEventListener("popstate", this.onPop);
    this.generation += 1;
  }

  // limit="n" is a preview (a home page's "what's on"): it never follows the address.
  limit() {
    const n = Number(this.getAttribute("limit"));
    return Number.isInteger(n) && n > 0 ? Math.min(n, PAGE) : null;
  }
  follows() {
    return this.limit() === null && pagePath(BASE) !== null;
  }

  setState(state) {
    this.setAttribute("state", state);
  }

  async load(options) {
    const generation = ++this.generation;
    this.setState("loading");
    this.view.replaceChildren(h("p", { class: "muted", part: "state", role: "status", text: "Loading events…" }));
    try {
      const session = await polynet.session();
      if (generation !== this.generation) return;
      if (!session.signed_in) { this.signedOut(session); return; }
      const at = this.follows() ? pagePath(BASE) : [];
      if (at.length) await this.detail(generation, at[0], options.moved);
      else await this.list(generation, options.moved);
    } catch (error) {
      if (generation !== this.generation) return;
      if (error && error.code === "sign_in_required") { this.signedOut(await polynet.session().catch(() => ({}))); return; }
      this.setState("error");
      this.view.replaceChildren(h("div", { class: "state", part: "state", role: "alert" }, [
        h("p", { text: "Couldn't load the events." }),
        h("button", { class: "quiet", part: "retry", type: "button", onclick: () => this.load({}), text: "Try again" }),
      ]));
    }
  }

  // Never an event to someone who isn't a signed-in member.
  signedOut(session) {
    this.setState("signed-out");
    this.view.replaceChildren(h("div", { class: "state", part: "state" }, [signInGate(polynet, session, "Sign in to see what's on.")]));
  }

  // Upcoming (from now), and what's under way or done (from PAST_DAYS ago, up
  // to now): two reads, so a long past never crowds out what's next.
  async list(generation, moved) {
    const limit = this.limit();
    const now = Date.now();
    // What's under way gets its own short read, so a crowded past can never
    // hide it; the past read falls back to recent weeks if it hits its cap.
    const [upcoming, current, recent] = await Promise.all([
      polynet.events({ limit: limit ? Math.min(PAGE, limit) : PAGE }),
      this.readRecent(now, ONGOING_DAYS * DAY_MS, 2),
      limit ? Promise.resolve({ entries: [], complete: true }) : this.readRecent(now, PAST_DAYS * DAY_MS, PAST_PAGES),
    ]);
    const past = limit || recent.complete ? recent : await this.readRecent(now, RECENT_PAST_DAYS * DAY_MS, PAST_PAGES);
    if (generation !== this.generation) return;
    const known = (list) => list.filter((event) => addressOf(event.ref));
    const started = (list) => known(list).filter((event) => startOf(event).getTime() < now);
    this.now = started(current.entries).filter((event) => endOf(event).getTime() > now);
    this.past = limit ? [] : started(past.entries).filter((event) => endOf(event).getTime() <= now).reverse();
    // One starting just as the reads ran can be in both.
    const under = new Set(this.now.map((event) => event.ref));
    this.upcoming = known(upcoming).filter((event) => !under.has(event.ref));
    this.cursor = limit ? null : upcoming.cursor || null;
    this.setState("ready");
    this.renderList(moved);
  }

  // Events from now - window up to now; complete is false when the page cap
  // stopped the read before it reached now.
  async readRecent(now, window, pages) {
    let entries = [];
    let cursor = null;
    for (let page = 0; page < pages; page += 1) {
      const list = await polynet.events(cursor ? { limit: PAGE, cursor: cursor } : { limit: PAGE, from: now - window });
      entries = entries.concat(list);
      cursor = list.cursor;
      if (!cursor || list.some((event) => startOf(event).getTime() >= now)) return { entries: entries, complete: true };
    }
    return { entries: entries, complete: false };
  }

  async more(button) {
    const generation = this.generation;
    button.disabled = true;
    try {
      const page = await polynet.events({ limit: PAGE, cursor: this.cursor });
      if (generation !== this.generation) return;
      this.upcoming = this.upcoming.concat(page.filter((event) => addressOf(event.ref)));
      this.cursor = page.cursor || null;
      this.renderList(false);
      this.status.textContent = page.length + (page.length === 1 ? " more event" : " more events");
    } catch (error) {
      button.disabled = false;
      this.status.textContent = "Couldn't load more events.";
    }
  }

  renderList(moved) {
    const limit = this.limit();
    const coming = this.now.concat(this.upcoming).slice(0, limit || undefined);
    const nodes = [];
    if (coming.length) nodes.push(...this.months(coming, "upcoming"));
    if (!coming.length && !this.past.length) {
      nodes.push(h("div", { class: "none", part: "empty" }, [h("slot", { name: "empty" }, ["Nothing on the calendar yet."])]));
    } else if (!coming.length) {
      nodes.push(h("p", { class: "none", part: "none", text: "Nothing coming up." }));
    }
    if (this.cursor) {
      nodes.push(h("div", { class: "more-wrap" }, [
        h("button", { class: "quiet", part: "more", type: "button", text: "More events", onclick: (event) => this.more(event.currentTarget) }),
      ]));
    }
    if (limit) nodes.push(h("p", { class: "more-wrap" }, [h("a", { class: "quiet", part: "all", href: BASE, text: "All events" })]));
    if (this.past.length) {
      nodes.push(h("details", { class: "past", part: "past" }, [
        h("summary", { part: "past-summary", text: "Past events (" + this.past.length + ")" }),
        ...this.months(this.past, "past"),
      ]));
    }
    this.view.replaceChildren(...nodes);
    if (moved) this.focusFirst();
  }

  // Grouped by month, in each event's own time zone (where it happens).
  months(events, kind) {
    const groups = [];
    for (const event of events) {
      const label = inZone(startOf(event), event.timezone, { month: "long", year: "numeric" });
      if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label: label, events: [] });
      groups[groups.length - 1].events.push(event);
    }
    return groups.map((group, index) => {
      const id = "pn-events-" + kind + "-" + index;
      return h("section", { class: "month", part: "month" }, [
        h("h2", { class: "month-title", part: "month-title", id: id, text: group.label }),
        h("ul", { role: "list", "aria-labelledby": id }, group.events.map((event) => h("li", {}, [this.item(event)]))),
      ]);
    });
  }

  item(event) {
    const zone = event.timezone || null;
    const start = startOf(event);
    const now = startOf(event).getTime() <= Date.now() && endOf(event).getTime() > Date.now();
    const local = localSpan(event);
    const where = whereText(event);
    const parts = ["event"];
    if (now) parts.push("event-now");
    return h("a", {
      class: "event", part: parts.join(" "), href: BASE + "/" + addressOf(event.ref),
      onclick: (click) => followLink(click, BASE, () => this.load({ moved: true })),
    }, [
      h("span", { class: "date", part: "event-date", "aria-hidden": "true" }, [
        h("span", { class: "weekday", text: inZone(start, zone, { weekday: "short" }) }),
        h("span", { class: "day", text: inZone(start, zone, { day: "numeric" }) }),
      ]),
      h("span", { class: "what" }, [
        h("span", { class: "title", part: "event-title" }, [
          now ? h("span", { class: "now-badge", part: "now-badge", text: "Now" }) : null,
          event.title || "Event",
        ]),
        h("span", { class: "time", part: "event-time", text: span(event, zone, true) }),
        local ? h("span", { class: "local", part: "event-local-time", text: local }) : null,
        where ? h("span", { class: "place", part: "event-place", text: where }) : null,
      ]),
    ]);
  }

  async detail(generation, address, moved) {
    const ref = refOf(address);
    let event = null;
    try {
      event = ref ? await polynet.event(ref) : null;
    } catch (error) {
      if (!error || error.code !== "semantic_not_found") throw error;
    }
    if (generation !== this.generation) return;
    const back = h("a", { class: "quiet back", part: "back", href: BASE, text: "All events", onclick: (click) => followLink(click, BASE, () => this.load({ moved: true })) });
    if (event && event.status === "cancelled") {
      // A saved link to a cancelled event says so, with nothing to join or add.
      this.setState("cancelled");
      this.view.replaceChildren(h("div", { class: "detail", part: "detail" }, [
        h("h2", { class: "detail-title", part: "detail-title", tabindex: "-1", text: event.title || "Event" }),
        h("p", { class: "muted", part: "cancelled", text: "This event was cancelled." }),
        back,
      ]));
      if (moved) this.focusFirst();
      return;
    }
    if (!event) {
      this.setState("missing");
      this.view.replaceChildren(h("div", { class: "detail", part: "detail" }, [
        h("h2", { class: "detail-title", part: "detail-title", tabindex: "-1", text: "This event isn't on the calendar" }),
        h("p", { class: "muted", part: "missing", text: "It may have been cancelled or moved." }),
        back,
      ]));
      if (moved) this.focusFirst();
      return;
    }
    const zone = event.timezone || null;
    const start = startOf(event);
    const local = localSpan(event);
    const where = whereText(event);
    const repeat = repeatText(event);
    const url = webLink(event.url);
    const link = location.origin + BASE + "/" + address;
    const fact = (label, part, children) => h("div", { class: "fact" }, [h("dt", { text: label }), h("dd", { part: part }, children)]);
    this.shareStatus = h("p", { class: "share-status", part: "share-status", role: "status" });
    const description = event.description_md ? h("div", { class: "prose", part: "detail-description" }, [polynet.markdown(event.description_md)]) : null;
    this.setState("ready");
    this.view.replaceChildren(h("article", { class: "detail", part: "detail", "aria-labelledby": "pn-event-title" }, [
      back,
      h("h2", { class: "detail-title", part: "detail-title", id: "pn-event-title", tabindex: "-1", text: event.title || "Event" }),
      h("dl", { class: "facts" }, [
        fact("When", "detail-when", [
          h("span", { text: inZone(start, zone, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) }),
          h("span", { class: "muted", text: span(event, zone, false) }),
          local ? h("span", { class: "local", part: "detail-local-time", text: local }) : null,
          repeat ? h("span", { class: "repeat", text: repeat }) : null,
        ]),
        where || url ? fact("Where", "detail-where", [
          where ? h("span", { text: where }) : null,
          url ? h("a", { part: "detail-link", href: url, target: "_blank", rel: "noopener noreferrer", text: event.location_type === "online" ? "Join online" : "Event link" }) : null,
        ]) : null,
      ]),
      description,
      h("div", { class: "actions" }, [
        h("button", { class: "primary", part: "add-to-calendar", type: "button", text: "Add to calendar", onclick: () => this.download(event, link) }),
        h("button", { class: "quiet", part: "share", type: "button", text: "Copy link", onclick: () => this.share(link) }),
      ]),
      this.shareStatus,
    ]));
    if (moved) this.focusFirst();
  }

  // Made here, never fetched: the file holds only what the member already sees.
  download(event, link) {
    const url = URL.createObjectURL(new Blob([icsFor(event, link)], { type: "text/calendar;charset=utf-8" }));
    const anchor = h("a", { href: url, download: fileName(event.title), hidden: true });
    this.root.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async share(link) {
    try {
      await navigator.clipboard.writeText(link);
      this.shareStatus.textContent = "Link copied.";
    } catch (error) {
      // No clipboard (an insecure context, a refusal): the link to copy by hand.
      this.shareStatus.replaceChildren("Copy this link: ", h("a", { href: link, text: link }));
    }
  }

  // After moving between the list and an event, focus lands on what's new.
  focusFirst() {
    const target = this.view.querySelector(".detail-title, .month-title, .event, .none");
    if (!target) return;
    if (!target.hasAttribute("tabindex") && target.tagName !== "A") target.setAttribute("tabindex", "-1");
    target.focus();
    this.scrollIntoView({ block: "start" });
  }
}

if (!customElements.get("polynet-events")) customElements.define("polynet-events", PolynetEvents);
`.replace("__POLYNET_EVENT_ID__", JSON.stringify(EVENT_ID.source));
