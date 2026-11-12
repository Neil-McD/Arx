// Knowledge (design v1): the map of a community's notes, drawn the way the
// mock draws it (docs/design/hifi-mock/lib.py big_map). Pure, so the page and
// the tests agree: which notes are related, and where each point sits.

type NoteLike = { slug: string; title: string; body_md: string };

const STOP = new Set([
  "about", "after", "again", "also", "because", "before", "being", "between", "could", "every", "first", "from", "have",
  "into", "just", "like", "more", "most", "only", "other", "over", "should", "some", "than", "that", "their", "them",
  "then", "there", "these", "they", "this", "those", "through", "very", "what", "when", "where", "which", "while",
  "with", "would", "your", "yours", "will", "make", "made", "does", "done", "each", "here", "were", "been", "much",
  "many", "such", "same", "back", "still", "well", "want", "need", "good", "people", "member", "members", "community",
]);

export function noteWords(text: string): Set<string> {
  const words = String(text ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[a-z][a-z0-9]{3,}/g) ?? [];
  return new Set(words.map((word) => word.replace(/s$/, "")).filter((word) => !STOP.has(word) && word.length >= 4));
}

// Related: one note names the other's title, or their titles share a key word
// (or, failing both, their texts share several). Strongest first, at most
// `max` each. Only what the words say; nothing is guessed.
export function relatedNotes<T extends NoteLike>(notes: T[], max = 3): Map<string, string[]> {
  const titles = notes.map((note) => noteWords(note.title));
  const bodies = notes.map((note) => noteWords(`${note.title} ${note.body_md}`));
  const lowerBodies = notes.map((note) => note.body_md.toLowerCase());
  const out = new Map<string, string[]>();
  notes.forEach((note, i) => {
    const scored: Array<{ slug: string; score: number }> = [];
    notes.forEach((other, j) => {
      if (i === j) return;
      let score = 0;
      const otherTitle = other.title.trim().toLowerCase();
      if (otherTitle.length >= 6 && lowerBodies[i].includes(otherTitle)) score += 5;
      if (note.title.trim().length >= 6 && lowerBodies[j].includes(note.title.trim().toLowerCase())) score += 5;
      for (const word of titles[i]) if (titles[j].has(word)) score += 3;
      let shared = 0;
      for (const word of bodies[i]) if (bodies[j].has(word)) shared += 1;
      if (shared >= 3) score += shared;
      if (score > 0) scored.push({ slug: other.slug, score });
    });
    scored.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
    out.set(note.slug, scored.slice(0, max).map((entry) => entry.slug));
  });
  return out;
}

function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type MapPoint = { slug: string; x: number; y: number; labeled: boolean };

// Labeled notes first, spread across the middle; the rest fill around them.
// The same notes always land in the same places.
export function layoutNotes(slugs: string[], labeled: Set<string>, width: number, height: number): MapPoint[] {
  const rnd = seeded([...slugs].sort().join("|"));
  const points: MapPoint[] = [];
  const pad = 60;
  const place = (slug: string, isLabeled: boolean) => {
    const gap = isLabeled ? 130 : 46;
    const x0 = isLabeled ? width * 0.12 : pad;
    const x1 = isLabeled ? width * 0.78 : width - pad;
    for (let attempt = 0; attempt < 400; attempt++) {
      const x = x0 + rnd() * (x1 - x0);
      const y = pad + rnd() * (height - 2 * pad);
      const near = points.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < (p.labeled || isLabeled ? Math.max(gap, 70) : gap) ** 2);
      if (!near || attempt === 399) { points.push({ slug, x: Math.round(x), y: Math.round(y), labeled: isLabeled }); return; }
    }
  };
  const ordered = slugs.slice().sort();
  for (const slug of ordered) if (labeled.has(slug)) place(slug, true);
  for (const slug of ordered) if (!labeled.has(slug)) place(slug, false);
  return points;
}
