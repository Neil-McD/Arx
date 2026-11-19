// Home's tag lines (docs/specs/agent-access-v0.md, "Home"): a tag of you in a
// channel or a pod that you haven't seen, at the top of what needs you, for
// every role. "Seen" is the unread dots' own rule (convex/communityAttention.ts):
// a tag newer than your read position in that room, in a room you can still
// read. Opening the room clears both. Pure: the server gathers the tags this
// person may see; this orders, caps and words them.

// How many tags get a line of their own; the rest share one "and N more".
export const HOME_TAGS_SHOWN = 3;
// How much of the message a line shows.
export const HOME_TAG_TEXT_MAX = 80;

export type HomeTag = {
  // The tag's own record, so each line keeps its place in a list.
  id: string;
  author: string;
  // Tagged as one of everybody (@everybody), not by name.
  everybody: boolean;
  // The room's name, and whether it is a pod (a pod is named as it is; a
  // channel gets its #).
  room: string;
  isPod: boolean;
  channelSlug: string;
  // The thread the tag is in: the post itself, or the post a reply is under.
  rootId: string;
  text: string;
  createdAt: number;
};

export type HomeTagLine = {
  key: string;
  title: string;
  detail: string;
  channelSlug: string;
  rootId: string;
};

export type HomeTagMore = {
  count: number;
  title: string;
  detail: string;
  action: string;
  // The room of the next tag: opening it clears every tag in it.
  channelSlug: string;
};

export type HomeTags = { lines: HomeTagLine[]; more: HomeTagMore | null };

export function tagPlace(tag: Pick<HomeTag, "room" | "isPod">): string {
  return tag.isPod ? tag.room : `#${tag.room}`;
}

export function tagLineTitle(tag: Pick<HomeTag, "author" | "everybody" | "room" | "isPod">): string {
  return `${tag.author} tagged ${tag.everybody ? "everybody" : "you"} in ${tagPlace(tag)}`;
}

// The start of the message. The tags it opens with are dropped (the title
// already says who was tagged); a message that is nothing but tags keeps them.
export function tagLineText(text: string, max = HOME_TAG_TEXT_MAX): string {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  const rest = clean.replace(/^(?:@[^\s,:;]+[,:;]?\s*)+/, "").trim();
  const said = rest || clean;
  if (said.length <= max) return said;
  const cut = said.slice(0, max - 1);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > max / 2 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}

// Newest first, three lines, then one line for the rest that opens the room
// of the next one.
export function homeTagLines(tags: HomeTag[], shown = HOME_TAGS_SHOWN): HomeTags {
  const ordered = [...tags].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  const lines = ordered.slice(0, shown).map((tag) => ({
    key: `tag:${tag.id}`,
    title: tagLineTitle(tag),
    detail: tagLineText(tag.text),
    channelSlug: tag.channelSlug,
    rootId: tag.rootId,
  }));
  const rest = ordered.slice(shown);
  const next = rest[0];
  return {
    lines,
    more: next ? {
      count: rest.length,
      title: `And ${rest.length} more ${rest.length === 1 ? "tag" : "tags"}`,
      detail: `The next is ${next.author}'s, in ${tagPlace(next)}.`,
      action: `Open ${tagPlace(next)}`,
      channelSlug: next.channelSlug,
    } : null,
  };
}
