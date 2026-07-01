// Pure tokenizer that re-matches a message's mention rows against the plain
// `@Display Name` tokens the composer inserted into the body text. Mentions
// arrive as separate rows (they do not carry the inserted label), so rendering
// chips means resolving each mentioned user's current display name and finding
// its `@` occurrences. Graceful by construction: anything that fails to match
// (renamed user, missing profile) stays plain text, and messages with no
// mentions render exactly as before.

export type ResolvedMentionForRendering = {
  // Stable key for React rendering (mention row id).
  key: string;
  // The label to match after "@" — the mentioned user's display name.
  label: string;
  kind: string;
  userId: string | null;
  isSelf: boolean;
};

export type MentionBodySegment =
  | { type: "plain"; text: string }
  | { type: "mention"; text: string; mention: ResolvedMentionForRendering };

function isWordChar(char: string | undefined): boolean {
  return typeof char === "string" && /[A-Za-z0-9_]/.test(char);
}

// Split `text` into plain and mention segments. Longest labels match first so
// "@Samantha Jones" can never be claimed by a shorter "@Sam"; a boundary check
// prevents a mentioned "Sam" from matching inside an unmentioned "@Samantha".
// Every occurrence of a mentioned label becomes a chip (tagging someone twice
// highlights both), and claimed ranges never overlap.
export function splitBodyIntoMentionSegments(
  text: string,
  mentions: readonly ResolvedMentionForRendering[],
): MentionBodySegment[] {
  const body = String(text ?? "");
  const candidates = mentions
    .filter((mention) => mention.label.trim().length > 0)
    .slice()
    .sort((a, b) => b.label.length - a.label.length);
  if (!body || candidates.length === 0) {
    return body ? [{ type: "plain", text: body }] : [];
  }

  const claimed: Array<{ start: number; end: number; mention: ResolvedMentionForRendering }> = [];
  const overlaps = (start: number, end: number): boolean =>
    claimed.some((range) => start < range.end && end > range.start);

  for (const mention of candidates) {
    const token = `@${mention.label}`;
    let searchFrom = 0;
    while (searchFrom < body.length) {
      const index = body.indexOf(token, searchFrom);
      if (index < 0) break;
      const end = index + token.length;
      const boundaryOk = !isWordChar(body[end]);
      if (boundaryOk && !overlaps(index, end)) {
        claimed.push({ start: index, end, mention });
      }
      searchFrom = index + 1;
    }
  }

  if (claimed.length === 0) {
    return [{ type: "plain", text: body }];
  }

  claimed.sort((a, b) => a.start - b.start);
  const segments: MentionBodySegment[] = [];
  let cursor = 0;
  for (const range of claimed) {
    if (range.start > cursor) {
      segments.push({ type: "plain", text: body.slice(cursor, range.start) });
    }
    segments.push({
      type: "mention",
      text: body.slice(range.start, range.end),
      mention: range.mention,
    });
    cursor = range.end;
  }
  if (cursor < body.length) {
    segments.push({ type: "plain", text: body.slice(cursor) });
  }
  return segments;
}
