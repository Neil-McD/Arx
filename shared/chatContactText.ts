export type ChatContactToken =
  | { kind: "text"; text: string }
  | { kind: "email"; text: string; href: string }
  | { kind: "phone"; text: string; href: string };

type ContactCandidate = Exclude<ChatContactToken, { kind: "text" }> & {
  start: number;
  end: number;
};

const WEB_URL_RE = /\b(?:https?:\/\/|www\.)[^\s<]+/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(^|[^A-Za-z0-9_])((?:(?:\+\d{1,3}[ .-]?)|(?:1[ .-]))?(?:\(\d{2,4}\)|\d{2,4})[ .-]\d{3,4}[ .-]\d{4})(?![A-Za-z0-9_])/g;

function overlaps(start: number, end: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((range) => start < range.end && end > range.start);
}

function normalizedPhoneHref(value: string): string | null {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

export function tokenizeChatContactText(rawInput: unknown): ChatContactToken[] {
  const text = String(rawInput ?? "");
  if (!text) return [];

  const webRanges = Array.from(text.matchAll(WEB_URL_RE)).map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + String(match[0] ?? "").length,
  }));
  const candidates: ContactCandidate[] = [];

  for (const match of text.matchAll(EMAIL_RE)) {
    const value = String(match[0] ?? "");
    const start = match.index ?? 0;
    const end = start + value.length;
    if (overlaps(start, end, webRanges)) continue;
    candidates.push({ kind: "email", text: value, href: `mailto:${value}`, start, end });
  }

  for (const match of text.matchAll(PHONE_RE)) {
    const prefix = String(match[1] ?? "");
    const value = String(match[2] ?? "");
    const start = (match.index ?? 0) + prefix.length;
    const end = start + value.length;
    const href = normalizedPhoneHref(value);
    if (!href || overlaps(start, end, webRanges) || overlaps(start, end, candidates)) continue;
    candidates.push({ kind: "phone", text: value, href, start, end });
  }

  candidates.sort((left, right) => left.start - right.start || right.end - left.end);
  if (candidates.length === 0) return [{ kind: "text", text }];

  const tokens: ChatContactToken[] = [];
  let cursor = 0;
  for (const candidate of candidates) {
    if (candidate.start < cursor) continue;
    if (candidate.start > cursor) tokens.push({ kind: "text", text: text.slice(cursor, candidate.start) });
    if (candidate.kind === "email") {
      tokens.push({ kind: "email", text: candidate.text, href: candidate.href });
    } else {
      tokens.push({ kind: "phone", text: candidate.text, href: candidate.href });
    }
    cursor = candidate.end;
  }
  if (cursor < text.length) tokens.push({ kind: "text", text: text.slice(cursor) });
  return tokens;
}
