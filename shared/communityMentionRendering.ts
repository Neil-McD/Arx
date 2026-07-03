// Pure tokenizer that re-matches mention rows against the visible `@token`
// text in a message body. User mentions resolve to handles; non-user mentions
// can resolve to their display label. Graceful by construction: anything that
// fails to match stays plain text, and messages with no mentions render exactly
// as before.

export type ResolvedMentionForRendering = {
  // Stable key for React rendering (mention row id).
  key: string;
  // The label to match after "@" — user handle for users, display label for
  // community-agent mentions.
  label: string;
  kind: string;
  userId: string | null;
  isSelf: boolean;
};

export type MentionBodySegment =
  | { type: "plain"; text: string }
  | { type: "mention"; text: string; mention: ResolvedMentionForRendering };

function isHandleChar(char: string | undefined): boolean {
  return typeof char === "string" && /[A-Za-z0-9_-]/.test(char);
}

function hasMentionStartBoundary(text: string, index: number): boolean {
  return index === 0 || /\s/.test(text[index - 1] ?? "");
}

export function textContainsMentionToken(text: string, token: string): boolean {
  const body = String(text ?? "");
  const mentionToken = String(token ?? "").trim();
  if (!body || !mentionToken.startsWith("@") || mentionToken.length <= 1) return false;
  let searchFrom = 0;
  while (searchFrom < body.length) {
    const index = body.indexOf(mentionToken, searchFrom);
    if (index < 0) return false;
    const end = index + mentionToken.length;
    if (hasMentionStartBoundary(body, index) && !isHandleChar(body[end])) return true;
    searchFrom = index + 1;
  }
  return false;
}

// Split `text` into plain and mention segments. Longest labels match first so
// "@Samantha Jones" can never be claimed by a shorter "@Sam"; a boundary check
// prevents a mentioned "Sam" from matching inside an unmentioned "@Samantha"
// or handle-like "@Sam-test".
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
      const boundaryOk = hasMentionStartBoundary(body, index) && !isHandleChar(body[end]);
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
