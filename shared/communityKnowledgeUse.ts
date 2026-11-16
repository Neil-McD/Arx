// What the guide read to answer (docs/specs/agent-system-end-state.md, the
// community brain): the notes and lessons each answer opened in full, added
// to one row of counts per community per day. From those come how much a
// thing is used (its size on the map) and what is answered together (the
// arcs between things). No row stands for one answer, and an answer's counts
// are added hours later at a random time, so nothing can be traced to a
// conversation: no question, no answer, no person, no time. These are the rules, free of
// the database so they can be tested on their own.

export const KNOWLEDGE_USE_REFS_MAX = 12;
// How far back use is counted.
export const KNOWLEDGE_USE_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;
const REF = /^(note|resource):[A-Za-z0-9_-]+$/;

// The day a record belongs to (days since 1970, UTC).
export function knowledgeUseDay(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

// The note or lesson a polynet_read returned, from the tool's own answer: a
// document read names itself as "ref". A listing (which names many) and
// anything else is not a read of one thing.
export function knowledgeRefFromRead(outputText: unknown): string | null {
  const text = String(outputText ?? "");
  if (!text || /"entries"\s*:/.test(text)) return null;
  const found = /"ref"\s*:\s*"((?:note|resource):[A-Za-z0-9_-]+)"/.exec(text);
  return found ? found[1] : null;
}

// One answer's refs, as they are kept: real refs only, each once, a few at most.
export function knowledgeUseRefs(refs: Iterable<unknown>): string[] {
  const kept = new Set<string>();
  for (const raw of refs) {
    const ref = String(raw ?? "").trim();
    if (REF.test(ref)) kept.add(ref);
    if (kept.size >= KNOWLEDGE_USE_REFS_MAX) break;
  }
  return [...kept].sort();
}

// One community's day: how many answers read each thing, and how many read
// each pair. Answers add to it; no row stands for one answer.
export const KNOWLEDGE_USE_DAY_REFS_MAX = 300;
export const KNOWLEDGE_USE_DAY_PAIRS_MAX = 500;
export type KnowledgeUseCount = { ref: string; count: number };
export type KnowledgePairCount = { a: string; b: string; count: number };
export type KnowledgeUseDayCounts = { uses: KnowledgeUseCount[]; pairs: KnowledgePairCount[] };

function byCount<T extends { count: number }>(key: (row: T) => string) {
  return (x: T, y: T) => y.count - x.count || key(x).localeCompare(key(y));
}

// Adds one answer's refs to a day's counts. Past the caps, the least-read
// things and pairs go first.
export function addToKnowledgeUseDay(day: KnowledgeUseDayCounts, answerRefs: Iterable<unknown>): KnowledgeUseDayCounts {
  const refs = knowledgeUseRefs(answerRefs);
  const uses = new Map(day.uses.map((row) => [row.ref, row.count]));
  for (const ref of refs) uses.set(ref, (uses.get(ref) ?? 0) + 1);
  const pairs = new Map(day.pairs.map((row) => [`${row.a}|${row.b}`, row.count]));
  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) pairs.set(`${refs[i]}|${refs[j]}`, (pairs.get(`${refs[i]}|${refs[j]}`) ?? 0) + 1);
  }
  return {
    uses: [...uses].map(([ref, count]) => ({ ref, count })).sort(byCount<KnowledgeUseCount>((row) => row.ref)).slice(0, KNOWLEDGE_USE_DAY_REFS_MAX),
    pairs: [...pairs].map(([key, count]) => { const [a, b] = key.split("|"); return { a, b, count }; })
      .sort(byCount<KnowledgePairCount>((row) => `${row.a}|${row.b}`)).slice(0, KNOWLEDGE_USE_DAY_PAIRS_MAX),
  };
}

export type KnowledgeUse = {
  // How many answers read each thing.
  use: Record<string, number>;
  // Pairs read for the same answer, most often first.
  together: KnowledgePairCount[];
};

// A stretch of days, summed.
export function summarizeKnowledgeUse(days: KnowledgeUseDayCounts[]): KnowledgeUse {
  const use: Record<string, number> = {};
  const pairs = new Map<string, number>();
  for (const day of days) {
    for (const row of day.uses) use[row.ref] = (use[row.ref] ?? 0) + row.count;
    for (const row of day.pairs) pairs.set(`${row.a}|${row.b}`, (pairs.get(`${row.a}|${row.b}`) ?? 0) + row.count);
  }
  const together = [...pairs].map(([key, count]) => { const [a, b] = key.split("|"); return { a, b, count }; })
    .sort(byCount<KnowledgePairCount>((row) => `${row.a}|${row.b}`));
  return { use, together };
}
