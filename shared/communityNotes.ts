// Community notes: short markdown files every member (and the agent) reads
// under memory/. The founder edits or deletes them in Studio; nothing else
// writes them. Older notes may come from earlier agent writes ("ask", "tag").

import { buildCommunitySearchText } from "./communitySearchText.ts";

export const COMMUNITY_NOTE_TITLE_MAX_CHARS = 120;
export const COMMUNITY_NOTE_BODY_MAX_CHARS = 4_000;
export const COMMUNITY_NOTES_MAX_PER_COMMUNITY = 500;
export const COMMUNITY_NOTE_SLUG_MAX_CHARS = 64;

export type CommunityNoteSource = "ask" | "tag" | "founder" | "migrated";

export type CommunityNote = {
  slug: string;
  title: string;
  bodyMd: string;
  source: CommunityNoteSource;
  createdAt: number;
  updatedAt: number;
};

const SOURCE_WORDS: Record<CommunityNoteSource, string> = {
  ask: "from a member's conversation with the community agent",
  tag: "from a conversation in a channel",
  founder: "written by the founder",
  migrated: "from earlier community memory",
};

// What the agent is told about community notes: read them, never write them.
export const COMMUNITY_NOTES_SHARING_RULES =
  "memory/ holds community notes the founder keeps: read them when they help. You never write, add to or change a note; if something seems worth keeping, suggest the member tell the founder.";

function oneLine(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizeCommunityNoteTitle(value: unknown): string | null {
  const title = oneLine(value, COMMUNITY_NOTE_TITLE_MAX_CHARS).replace(/^#+\s*/, "");
  return title || null;
}

export function normalizeCommunityNoteBody(value: unknown): string | null {
  const body = String(value ?? "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return body ? body.slice(0, COMMUNITY_NOTE_BODY_MAX_CHARS) : null;
}

// The note's file name: its title in lowercase words joined by dashes.
export function communityNoteSlug(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, COMMUNITY_NOTE_SLUG_MAX_CHARS)
    .replace(/-+$/g, "");
  return slug || "note";
}

export const COMMUNITY_NOTE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function buildCommunityNoteSearchText(note: { title: string; bodyMd: string }): string {
  return buildCommunitySearchText({ body: `${note.title}\n${note.bodyMd}` });
}

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function renderCommunityNote(note: CommunityNote): string {
  return [
    `# ${note.title}`,
    "",
    note.bodyMd,
    "",
    `_Community note, ${SOURCE_WORDS[note.source]}. Last updated ${formatDate(note.updatedAt)}._`,
  ].join("\n");
}

export function communityNoteSourceWords(source: CommunityNoteSource): string {
  return SOURCE_WORDS[source];
}
