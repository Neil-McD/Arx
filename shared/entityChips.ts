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
};

export type EntityTarget = {
  kind: EntityKind;
  name: string;
  path: string;
  startsAt?: string | null;
};

export const ENTITY_NAMES_MAX = 500;

// The pages everyone has, by the names the guide uses for them.
const PAGES: ReadonlyArray<{ name: string; segment: string }> = [
  { name: "Home", segment: "home" },
  { name: "Inbox", segment: "inbox" },
  { name: "Knowledge", segment: "knowledge" },
  { name: "Events", segment: "events" },
  { name: "Pods", segment: "pods" },
  { name: "Members", segment: "members" },
];

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
  for (const page of PAGES) {
    add({ kind: "page", name: page.name, path: `/c/${encodeURIComponent(slug)}/${page.segment}` });
  }
  for (const row of (rows ?? []).slice(0, ENTITY_NAMES_MAX)) {
    const path = entityPath(slug, row);
    if (!path || !String(row.name ?? "").trim()) continue;
    add({ kind: row.kind, name: row.name, path, startsAt: row.startsAt ?? null });
  }
  return index;
}

export function matchEntityName(index: ReadonlyMap<string, EntityTarget> | null | undefined, text: string): EntityTarget | null {
  if (!index || index.size === 0) return null;
  const key = entityNameKey(text);
  if (!key || key.length > 180) return null;
  return index.get(key) ?? null;
}
