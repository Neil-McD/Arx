// Community notes: what the community agent learns that is worth sharing with
// everyone. A note is a short markdown file the agent writes in its own voice
// from an Ask or a tag; every member (and the agent) reads it under memory/;
// the founder can edit or delete it. Nothing else decides what is kept.

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

// The rules the agent follows before it writes a note. Its instructions carry
// them; the code adds one lock it can enforce (a turn that read a private
// room or owner-only data can't write a note).
export const COMMUNITY_NOTES_SHARING_RULES = [
  "You can keep community notes: short markdown notes every member can read under memory/.",
  "Write one when you learn something the whole community would want to know and can't already find: how things work here, what the group decided, a useful tip, a correction to a note. Check memory/ first and add to a note that already covers it rather than starting a second one.",
  "Only community knowledge. Never write anything private about a person (contact details, health, money, relationships, anything they told you in confidence), anything from a private room or owner-only data, or anything the member asked to keep between the two of you. When unsure, don't write it.",
  "Write it plainly in your own words, without names unless the fact is about a role (\"Maya runs the dawn sessions\"). Tell the member in one short line when you've saved a note.",
  "To start a note: polynet_write mode create on memory/ with content.title and content.text. To add to one: mode append on its memory/<note>.md path with content.text. To correct one: mode update with the full new content.text.",
].join(" ");

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
