// Chips (docs/specs/guide-chips-end-state.md, slice 1): when the guide names
// something in the community in bold, and the reader can open exactly one
// thing by that name, the bold words become a chip that opens it in place.
// No link syntax: the guide already bolds names, and the list of names is
// built for each reader, so a chip can only point somewhere they may go.

export type EntityKind = "course" | "lesson" | "channel" | "pod" | "event" | "page";

// What the server says this reader can open (communityEntityNames:listEntityNamesForViewer).
export type EntityNameRow = {
  kind: Exclude<EntityKind, "page">;
  name: string;
  id: string;
  // A lesson's course.
  parentId?: string | null;
  // A channel's or pod's address word.
  slug?: string | null;
  // An event's next time, ISO.
  startsAt?: string | null;
  // What the chip's card shows (slice 3), all for this reader.
  facts?: EntityFacts;
};

export type EntityFacts = {
  // A course's or channel's description, a pod's purpose (at most 140 characters).
  about?: string | null;
  // A course: its lessons, how many this reader finished, their next one.
  lessons?: number;
  done?: number;
  nextLessonId?: string | null;
  nextLessonTitle?: string | null;
  // A lesson: its course, whether this reader finished it, whether it has a video.
  courseName?: string | null;
  finished?: boolean;
  hasVideo?: boolean;
  // A pod's seats, when it has a limit.
  seats?: number | null;
  // An event: where, and how often it repeats.
  where?: "online" | "physical" | "tbd" | null;
  place?: string | null;
  repeats?: "daily" | "weekly" | "monthly" | null;
};

export const ENTITY_ABOUT_MAX = 140;

export function clipAbout(raw: unknown): string | null {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > ENTITY_ABOUT_MAX ? `${text.slice(0, ENTITY_ABOUT_MAX - 1).trimEnd()}…` : text;
}

export type EntityTarget = {
  kind: EntityKind;
  name: string;
  path: string;
  startsAt?: string | null;
  facts?: EntityFacts;
  // A course's next lesson, opened by its card.
  nextPath?: string | null;
  // A page's card: which page, a line about it, and the first few things on it
  // the reader can open (the next events, the courses, their pods).
  page?: PageId;
  summary?: string | null;
  items?: EntityTarget[];
};

export type PageId = "home" | "inbox" | "knowledge" | "events" | "pods" | "members";

export const PAGE_CARD_ITEMS_MAX = 3;

export const ENTITY_NAMES_MAX = 500;

// The pages everyone has, by the names the guide uses for them.
const PAGES: ReadonlyArray<{ name: string; segment: PageId }> = [
  { name: "Home", segment: "home" },
  { name: "Inbox", segment: "inbox" },
  { name: "Knowledge", segment: "knowledge" },
  { name: "Events", segment: "events" },
  { name: "Pods", segment: "pods" },
  { name: "Members", segment: "members" },
];

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

// What a page's card says, from the same list the chips come from.
export function pageCard(page: PageId, targets: readonly EntityTarget[]): { summary: string; items: EntityTarget[] } {
  if (page === "events") {
    const events = targets
      .filter((t) => t.kind === "event" && t.startsAt && !Number.isNaN(new Date(t.startsAt).getTime()))
      .sort((a, b) => new Date(a.startsAt as string).getTime() - new Date(b.startsAt as string).getTime());
    return {
      summary: events.length ? `${plural(events.length, "event", "events")} in the next five weeks` : "Nothing on the calendar in the next five weeks",
      items: events.slice(0, PAGE_CARD_ITEMS_MAX),
    };
  }
  if (page === "knowledge") {
    const courses = targets.filter((t) => t.kind === "course");
    return {
      summary: courses.length ? plural(courses.length, "course", "courses") : "No courses yet",
      items: courses.slice(0, PAGE_CARD_ITEMS_MAX),
    };
  }
  if (page === "pods") {
    const pods = targets.filter((t) => t.kind === "pod");
    return {
      summary: pods.length ? `${plural(pods.length, "pod", "pods")} open to you` : "Small groups inside the community",
      items: pods.slice(0, PAGE_CARD_ITEMS_MAX),
    };
  }
  if (page === "home") return { summary: "Talk with the guide and see what's new", items: [] };
  if (page === "inbox") return { summary: "Your direct messages", items: [] };
  return { summary: "Everyone in the community", items: [] };
}

// How a bold phrase is compared: case, surrounding space and punctuation, and
// a leading # (channels) do not matter.
export function entityNameKey(raw: string): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^#\s*/, "")
    .replace(/[.,:;!?]+$/, "")
    .toLowerCase();
}

// An event's address word: one time of a repeating event is "<event>:<start>",
// written "<event>_<start>" (shared/webAppRouteState.ts eventAddressKey).
function eventAddressKey(eventId: string): string {
  return String(eventId ?? "").replace(":", "_");
}

export function entityPath(communitySlug: string, row: EntityNameRow): string | null {
  const c = `/c/${encodeURIComponent(communitySlug)}`;
  const id = encodeURIComponent(String(row.id ?? ""));
  if (!row.id) return null;
  switch (row.kind) {
    case "course":
      return `${c}/knowledge/${id}`;
    case "lesson":
      return row.parentId ? `${c}/knowledge/${encodeURIComponent(row.parentId)}/${id}` : null;
    case "channel": {
      const slug = String(row.slug ?? "").trim().toLowerCase();
      if (!slug) return null;
      return slug === "general" ? `${c}/chat` : `${c}/chat/${encodeURIComponent(slug)}`;
    }
    case "pod": {
      const slug = String(row.slug ?? "").trim().toLowerCase();
      return slug ? `${c}/pods/${encodeURIComponent(slug)}` : null;
    }
    case "event":
      return `${c}/events/${encodeURIComponent(eventAddressKey(row.id))}`;
    default:
      return null;
  }
}

// One map from a name to the one thing it names. A name two things share
// (a lesson called "Pods" and the Pods page) maps to nothing: no chip is
// better than the wrong one.
export function buildEntityNameIndex(communitySlug: string | null | undefined, rows: readonly EntityNameRow[] | null | undefined): Map<string, EntityTarget> {
  const index = new Map<string, EntityTarget>();
  const slug = String(communitySlug ?? "").trim();
  if (!slug) return index;
  const taken = new Set<string>();
  const add = (target: EntityTarget) => {
    const key = entityNameKey(target.name);
    if (!key || taken.has(key)) return;
    if (index.has(key)) {
      index.delete(key);
      taken.add(key);
      return;
    }
    index.set(key, target);
  };
  const pages: EntityTarget[] = PAGES.map((page) => ({
    kind: "page",
    name: page.name,
    page: page.segment,
    path: `/c/${encodeURIComponent(slug)}/${page.segment}`,
  }));
  for (const page of pages) add(page);
  const things: EntityTarget[] = [];
  for (const row of (rows ?? []).slice(0, ENTITY_NAMES_MAX)) {
    const path = entityPath(slug, row);
    if (!path || !String(row.name ?? "").trim()) continue;
    const nextPath = row.kind === "course" && row.facts?.nextLessonId
      ? entityPath(slug, { kind: "lesson", name: "", id: row.facts.nextLessonId, parentId: row.id })
      : null;
    const target: EntityTarget = { kind: row.kind, name: row.name, path, startsAt: row.startsAt ?? null, facts: row.facts, nextPath };
    things.push(target);
    add(target);
  }
  for (const page of pages) Object.assign(page, pageCard(page.page as PageId, things));
  return index;
}

export function matchEntityName(index: ReadonlyMap<string, EntityTarget> | null | undefined, text: string): EntityTarget | null {
  if (!index || index.size === 0) return null;
  const key = entityNameKey(text);
  if (!key || key.length > 180) return null;
  return index.get(key) ?? null;
}

// The short fact on a chip: a course's progress, an event's next time.
export function chipFact(target: EntityTarget, timeZone?: string): string | null {
  if (target.kind === "course" && typeof target.facts?.lessons === "number" && target.facts.lessons > 0) {
    return `${Math.min(target.facts.done ?? 0, target.facts.lessons)} of ${target.facts.lessons}`;
  }
  if (target.kind === "event" && target.startsAt) {
    const at = new Date(target.startsAt);
    if (Number.isNaN(at.getTime())) return null;
    const options: Intl.DateTimeFormatOptions = { weekday: "short", hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) };
    return new Intl.DateTimeFormat("en-US", options).format(at).replace(/,/g, "");
  }
  return null;
}

// The card's lines under its name, in order.
export function cardLines(target: EntityTarget, timeZone?: string): string[] {
  const f = target.facts ?? {};
  const lines: string[] = [];
  if (target.kind === "event" && target.startsAt) {
    const at = new Date(target.startsAt);
    if (!Number.isNaN(at.getTime())) {
      lines.push(new Intl.DateTimeFormat("en-US", {
        weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}),
      }).format(at));
    }
    const where = f.where === "online" ? "Online" : f.where === "physical" ? (f.place || "In person") : f.where === "tbd" ? "Place to be decided" : null;
    const repeats = f.repeats === "weekly" ? "Every week" : f.repeats === "daily" ? "Every day" : f.repeats === "monthly" ? "Every month" : null;
    const tail = [where, repeats].filter(Boolean).join(" · ");
    if (tail) lines.push(tail);
    return lines;
  }
  if (target.kind === "lesson") {
    if (f.courseName) lines.push(`In ${f.courseName}`);
    const bits = [f.finished ? "Finished" : "Not finished yet", f.hasVideo ? "Video" : null].filter(Boolean).join(" · ");
    lines.push(bits);
    return lines;
  }
  if (target.kind === "page") return target.summary ? [target.summary] : [];
  if (f.about) lines.push(f.about);
  if (target.kind === "pod" && typeof f.seats === "number") lines.push(`${f.seats} seats`);
  return lines;
}

// The card's one action: where it goes and what it says.
export function cardAction(target: EntityTarget): { label: string; path: string } {
  if (target.kind === "course") {
    const f = target.facts ?? {};
    if (target.nextPath && f.nextLessonTitle) {
      return { label: `${(f.done ?? 0) > 0 ? "Continue" : "Start"}: ${f.nextLessonTitle}`, path: target.nextPath };
    }
    return { label: (f.lessons ?? 0) > 0 && (f.done ?? 0) >= (f.lessons ?? 0) ? "Review the course" : "Open course", path: target.path };
  }
  const label = target.kind === "lesson" ? "Open lesson" : target.kind === "channel" ? "Open channel" : target.kind === "pod" ? "Open pod" : target.kind === "event" ? "Open event" : `Open ${target.name}`;
  return { label, path: target.path };
}
