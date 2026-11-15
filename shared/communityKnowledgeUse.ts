// What the guide read to answer (docs/specs/agent-system-end-state.md, the
// community brain): each answer leaves one small record of the notes and
// lessons it opened in full. From those come how much a thing is used (its
// size on the map) and what is answered together (the arcs between things).
// A record holds no question, no answer, no person and no time finer than the
// day, so it can't be traced to a conversation. These are the rules, free of
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

export type KnowledgeUse = {
  // How many answers read each thing.
  use: Record<string, number>;
  // Pairs read for the same answer, most often first.
  together: Array<{ a: string; b: string; count: number }>;
  answers: number;
};

export function summarizeKnowledgeUse(records: Array<{ refs: string[] }>): KnowledgeUse {
  const use: Record<string, number> = {};
  const pairs = new Map<string, number>();
  for (const record of records) {
    const refs = knowledgeUseRefs(record.refs);
    for (const ref of refs) use[ref] = (use[ref] ?? 0) + 1;
    for (let i = 0; i < refs.length; i++) {
      for (let j = i + 1; j < refs.length; j++) pairs.set(`${refs[i]}|${refs[j]}`, (pairs.get(`${refs[i]}|${refs[j]}`) ?? 0) + 1);
    }
  }
  const together = [...pairs.entries()].map(([key, count]) => {
    const [a, b] = key.split("|");
    return { a, b, count };
  }).sort((x, y) => y.count - x.count || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
  return { use, together, answers: records.length };
}
