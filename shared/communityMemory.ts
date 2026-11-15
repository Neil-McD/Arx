// Community memory (docs/specs/agent-system-end-state.md, slice 1): what the
// guide learns from what was said in a community's open channels. Every note
// it writes cites the posts it came from; code checks each one. These are the
// rules, kept free of the database so they can be tested on their own.

// The most a review may add, and the size of memory.md (Hermes keeps its
// always-loaded memory near this size).
export const MEMORY_NEW_NOTES_PER_RUN = 5;
export const MEMORY_EVIDENCE_MAX_REFS = 20;
export const MEMORY_INDEX_MAX_CHARS = 2_200;

export type MemoryEvidenceRef = { kind: "post" | "reply"; id: string; raw: string };

// "post:<id>" or "reply:<id>", or the folder's own names for them
// ("interaction:root:<id>", "interaction:reply:<id>"). Anything else is not
// evidence. Stored as post:/reply:.
export function parseMemoryEvidenceRef(raw: unknown): MemoryEvidenceRef | null {
  const text = typeof raw === "string" ? raw.trim().replace(/\.md$/, "") : "";
  const match = /^(post|reply|interaction:root|interaction:reply):([A-Za-z0-9_-]{1,64})$/.exec(text);
  if (!match) return null;
  const kind = match[1] === "post" || match[1] === "interaction:root" ? "post" : "reply";
  return { kind, id: match[2], raw: `${kind}:${match[2]}` };
}

export function parseMemoryEvidenceRefs(raw: unknown): { refs: MemoryEvidenceRef[] } | { error: "evidence_required" | "evidence_invalid" | "evidence_too_many" } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "evidence_required" };
  if (raw.length > MEMORY_EVIDENCE_MAX_REFS) return { error: "evidence_too_many" };
  const seen = new Map<string, MemoryEvidenceRef>();
  for (const item of raw) {
    const ref = parseMemoryEvidenceRef(item);
    if (!ref) return { error: "evidence_invalid" };
    seen.set(ref.raw, ref);
  }
  return { refs: [...seen.values()] };
}

// What the server knows about one cited post or reply.
export type MemoryEvidenceFacts = {
  exists: boolean;
  communityMatches: boolean;
  live: boolean;
  byPerson: boolean;
  // In a channel open to every member, and shared with the community.
  openChannel: boolean;
  sharedVisibility: boolean;
};

export type MemoryEvidenceRefusal =
  | "evidence_missing"
  | "evidence_other_community"
  | "evidence_not_live"
  | "evidence_not_by_a_person"
  | "evidence_not_shared";

// Only what a person said in an open channel can become community memory.
// A pod, a private talk with the guide or a direct message never can.
export function memoryEvidenceRefusal(facts: MemoryEvidenceFacts): MemoryEvidenceRefusal | null {
  if (!facts.exists) return "evidence_missing";
  if (!facts.communityMatches) return "evidence_other_community";
  if (!facts.live) return "evidence_not_live";
  if (!facts.byPerson) return "evidence_not_by_a_person";
  if (!facts.openChannel || !facts.sharedVisibility) return "evidence_not_shared";
  return null;
}

// A builder removed a note learned from this evidence: the same posts don't
// bring it back. New evidence can.
export function memoryEvidenceWasRemoved(refs: string[], removals: Array<{ evidenceRefs: string[] }>): boolean {
  if (refs.length === 0) return false;
  return removals.some((removal) => {
    const removed = new Set(removal.evidenceRefs);
    return refs.every((ref) => removed.has(ref));
  });
}

export type NoteAuthorKind = "builder" | "guide";

// A note with no author recorded was written before the guide could write.
export function noteAuthorKind(note: { authorKind?: string | null }): NoteAuthorKind {
  return note.authorKind === "guide" ? "guide" : "builder";
}

// memory.md: within its size, and every link it makes is to a note that exists.
export function memoryIndexRefusal(bodyMd: string, existingSlugs: Set<string>): "index_empty" | "index_too_long" | "index_links_missing_note" | null {
  const body = String(bodyMd ?? "").trim();
  if (!body) return "index_empty";
  if (body.length > MEMORY_INDEX_MAX_CHARS) return "index_too_long";
  for (const match of body.matchAll(/memory\/([a-z0-9-]{1,64})\.md/g)) {
    if (!existingSlugs.has(match[1])) return "index_links_missing_note";
  }
  return null;
}

// What a refusal says to the guide, so it can fix the note and try again.
export const MEMORY_REFUSAL_WORDS: Record<string, string> = {
  evidence_required: "Cite at least one post or reply the note comes from (post:<id> or reply:<id>).",
  evidence_invalid: "Evidence is post:<id> or reply:<id>, from the posts you were shown.",
  evidence_too_many: `Cite at most ${MEMORY_EVIDENCE_MAX_REFS} posts.`,
  evidence_missing: "A cited post doesn't exist.",
  evidence_other_community: "A cited post is from another community.",
  evidence_not_live: "A cited post was removed or hidden.",
  evidence_not_by_a_person: "Cite what people said, not the guide's own posts.",
  evidence_not_shared: "Only posts in channels open to every member can become community memory.",
  evidence_removed: "A builder removed a note learned from these same posts. Don't learn it again from them.",
  builder_note: "A builder wrote that note. Add your own note beside it instead of changing it.",
  note_missing: "There is no note with that name to change.",
  run_note_limit: `A review adds at most ${MEMORY_NEW_NOTES_PER_RUN} new notes. Change an existing note instead.`,
  notes_full: "The community's memory is full. Merge or change notes instead of adding.",
  title_or_body_missing: "A note needs a title and a body.",
  run_not_open: "This review has finished; nothing more can be written.",
  index_empty: "memory.md can't be empty.",
  index_too_long: `memory.md must stay under ${MEMORY_INDEX_MAX_CHARS} characters.`,
  index_links_missing_note: "memory.md links to a note that doesn't exist.",
};

// When a community's nightly review runs: the next time it is this hour in
// the community's time zone (a quiet hour; 3 am by default).
export const MEMORY_REVIEW_LOCAL_HOUR = 3;

function localHourMinute(ms: number, timeZone: string): { hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    return { hour: hour === 24 ? 0 : hour, minute };
  } catch {
    const date = new Date(ms);
    return { hour: date.getUTCHours(), minute: date.getUTCMinutes() };
  }
}

export function nextMemoryReviewAtMs(nowMs: number, timeZone: string | null | undefined, hour = MEMORY_REVIEW_LOCAL_HOUR): number {
  const zone = timeZone || "UTC";
  const step = 15 * 60_000;
  // Start at the next quarter hour; look a little over a day ahead.
  let at = Math.ceil((nowMs + 60_000) / step) * step;
  for (let i = 0; i < 4 * 26; i++, at += step) {
    const local = localHourMinute(at, zone);
    if (local.hour === hour && local.minute < 15) return at - local.minute * 60_000;
  }
  return nowMs + 24 * 60 * 60_000;
}
