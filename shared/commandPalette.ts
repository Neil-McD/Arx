// Design system v1: the command palette ("Search or ask", ⌘K), from the mock.
// Empty, it offers where to go, two questions for the guide and the other
// communities. Typed into, it narrows places and communities to what matches
// and always ends with asking the guide the words as typed. Pure, so what it
// shows for a query is tested.

export type PaletteIcon = "home" | "inbox" | "hash" | "lock" | "stars" | "cal" | "users" | "sliders" | "spark";

export type PalettePlace = {
  id: string;
  label: string;
  icon: PaletteIcon;
  // "3 new", "mentioned": shown on the right of the row.
  hint?: string | null;
  // Places with something new rise to the top of the empty palette.
  fresh?: boolean;
  // Channels only show in the empty palette when something is new in them.
  quiet?: boolean;
};

export type PaletteCommunity = { id: string; label: string; initials: string; fresh?: boolean };

export type PaletteItem =
  | { kind: "place"; id: string; label: string; icon: PaletteIcon; hint: string | null }
  | { kind: "ask"; id: string; label: string; question: string }
  | { kind: "community"; id: string; label: string; initials: string; hint: string | null };

export type PaletteSection = { key: "go" | "ask" | "community"; label: string; items: PaletteItem[] };

const MAX_PLACES = 6;
const MAX_COMMUNITIES = 4;

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, " ");
}

// 3: the label starts with the query, 2: a word in it does, 1: it contains it.
export function matchScore(label: string, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const text = normalize(label);
  if (text.startsWith(q)) return 3;
  if (text.split(/[\s\-_/·]+/).some((word) => word.startsWith(q))) return 2;
  return text.includes(q) ? 1 : 0;
}

function placeItem(place: PalettePlace): PaletteItem {
  return { kind: "place", id: place.id, label: place.label, icon: place.icon, hint: place.hint ?? null };
}

function communityItem(community: PaletteCommunity): PaletteItem {
  return { kind: "community", id: community.id, label: community.label, initials: community.initials, hint: community.fresh ? "new" : null };
}

function ranked<T extends { label: string }>(entries: T[], query: string): T[] {
  return entries
    .map((entry, index) => ({ entry, index, score: matchScore(entry.label, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.entry);
}

export function paletteSections(args: {
  query: string;
  places: PalettePlace[];
  suggestions: string[];
  communities: PaletteCommunity[];
  // A community without its agent: places and communities only, no asking.
  ask?: boolean;
}): PaletteSection[] {
  const canAsk = args.ask !== false;
  const query = args.query.trim();
  const sections: PaletteSection[] = [];
  if (!query) {
    // Fresh places first, then the rest in their own order; quiet channels wait to be typed for.
    const shown = args.places.filter((place) => !place.quiet || place.fresh);
    const ordered = [...shown.filter((place) => place.fresh), ...shown.filter((place) => !place.fresh)];
    const go = ordered.slice(0, MAX_PLACES).map(placeItem);
    if (go.length) sections.push({ key: "go", label: "Go to", items: go });
    const ask = (canAsk ? args.suggestions : []).slice(0, 2).map((question, index) => ({ kind: "ask" as const, id: `ask:${index}`, label: question, question }));
    if (ask.length) sections.push({ key: "ask", label: "Ask your guide", items: ask });
    const communities = args.communities.slice(0, MAX_COMMUNITIES).map(communityItem);
    if (communities.length) sections.push({ key: "community", label: "Switch community", items: communities });
    return sections;
  }
  const go = ranked(args.places, query).slice(0, MAX_PLACES).map(placeItem);
  if (go.length) sections.push({ key: "go", label: "Go to", items: go });
  const communities = ranked(args.communities, query).slice(0, MAX_COMMUNITIES).map(communityItem);
  if (communities.length) sections.push({ key: "community", label: "Switch community", items: communities });
  if (canAsk) sections.push({ key: "ask", label: "Ask your guide", items: [{ kind: "ask", id: "ask:typed", label: query, question: query }] });
  return sections;
}

export function paletteItems(sections: PaletteSection[]): PaletteItem[] {
  return sections.flatMap((section) => section.items);
}
