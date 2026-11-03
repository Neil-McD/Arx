// Search text for community posts and replies: what the full-text index sees.
// The index matches whole words only (no stemming, prefix on the last word),
// so each document also carries word stems and queries are stemmed the same
// way: "climbing", "climbs" and "climb" meet at "climb". A context line (where
// it was said, the thread it answers, who said it) makes short replies findable.

export const COMMUNITY_SEARCH_TEXT_MAX_CHARS = 8_000;
const BODY_MAX_CHARS = 6_000;
const CONTEXT_PART_MAX_CHARS = 160;
// The index accepts at most 16 query terms of at most 32 characters.
export const COMMUNITY_SEARCH_QUERY_MAX_TERMS = 16;
const TERM_MAX_CHARS = 32;

export function searchWords(text: string): string[] {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// Conservative English suffix stripping. It only has to be consistent: the
// same word always yields the same stem on both sides of the search.
export function stemSearchWord(word: string): string {
  let stem = String(word ?? "").toLowerCase();
  if (stem.length < 4 || !/^[a-z]+$/.test(stem)) return stem;
  if (stem.endsWith("ies") && stem.length > 4) stem = `${stem.slice(0, -3)}y`;
  else if (stem.endsWith("sses")) stem = stem.slice(0, -2);
  else {
    for (const suffix of ["ings", "ing", "ers", "er", "edly", "ed", "es", "ly", "s"]) {
      if (!stem.endsWith(suffix)) continue;
      const rest = stem.slice(0, -suffix.length);
      if (rest.length < 3) break;
      // "class", "status", "basis" keep their s.
      if (suffix === "s" && /[sui]$/.test(rest)) break;
      stem = rest;
      // "running" -> "runn" -> "run"; "falling" keeps its double l.
      if (/([b-df-hj-kmnp-rtv-z])\1$/.test(stem) && !/(ll|ss|zz)$/.test(stem)) stem = stem.slice(0, -1);
      break;
    }
  }
  // "tape" and "taped" both end at "tap".
  if (stem.length > 3 && stem.endsWith("e")) stem = stem.slice(0, -1);
  return stem;
}

function oneLine(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function buildCommunitySearchText(args: {
  channelName?: string | null;
  threadOpening?: string | null;
  authorName?: string | null;
  body: string;
}): string {
  const context = [
    args.channelName ? `#${oneLine(args.channelName, CONTEXT_PART_MAX_CHARS)}` : "",
    args.threadOpening ? `re: ${oneLine(args.threadOpening, CONTEXT_PART_MAX_CHARS)}` : "",
    args.authorName ? `by ${oneLine(args.authorName, CONTEXT_PART_MAX_CHARS)}` : "",
  ].filter(Boolean).join(" · ");
  const body = String(args.body ?? "").replace(/\s+/g, " ").trim().slice(0, BODY_MAX_CHARS);
  const base = [context, body].filter(Boolean).join("\n");
  const stems = new Set<string>();
  for (const word of searchWords(base)) {
    const stem = stemSearchWord(word);
    if (stem !== word) stems.add(stem);
  }
  const text = stems.size ? `${base}\n${[...stems].join(" ")}` : base;
  return text.slice(0, COMMUNITY_SEARCH_TEXT_MAX_CHARS);
}

// The query the index runs: stemmed, deduplicated, bounded words.
export function buildCommunitySearchQuery(query: string): string {
  const terms: string[] = [];
  for (const word of searchWords(query)) {
    const term = stemSearchWord(word).slice(0, TERM_MAX_CHARS);
    if (term && !terms.includes(term)) terms.push(term);
    if (terms.length >= COMMUNITY_SEARCH_QUERY_MAX_TERMS) break;
  }
  return terms.join(" ");
}
