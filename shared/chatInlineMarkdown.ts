// Chat inline markdown: the deliberately small human-message grammar shared by
// community chat and DMs. Block constructs (headings, lists, tables, images)
// are not part of the grammar, so their syntax always renders literally.
// Pure TS so Convex can import stripChatInlineMarkdown for previews/emails.

export type ChatInlineToken =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "strike"; text: string }
  | { kind: "code"; text: string }
  | { kind: "code_block"; text: string; language: string | null };

const FENCED_CODE_BLOCK_RE = /```([A-Za-z0-9_+-]*)\n?([\s\S]*?)```/g;

// Precedence via alternation order: code span, bold, strike, italic.
// Bold/strike/italic require non-space content edges so "2 * 3 * 4" and
// stray "**" render literally. Italic is asterisk-only (underscores stay
// literal so snake_case never formats).
const INLINE_TOKEN_RE =
  /`([^`\n]+)`|\*\*([^\s*](?:[^\n]*?[^\s*])?)\*\*|~~([^\s~](?:[^\n]*?[^\s~])?)~~|\*([^\s*](?:[^\n*]*?[^\s*])?)\*/g;

function tokenizeInlineRun(raw: string, out: ChatInlineToken[]): void {
  if (!raw) return;
  let lastIndex = 0;
  for (const match of raw.matchAll(INLINE_TOKEN_RE)) {
    const index = match.index ?? -1;
    if (index < 0) continue;
    if (index > lastIndex) {
      out.push({ kind: "text", text: raw.slice(lastIndex, index) });
    }
    if (typeof match[1] === "string") {
      out.push({ kind: "code", text: match[1] });
    } else if (typeof match[2] === "string") {
      out.push({ kind: "bold", text: match[2] });
    } else if (typeof match[3] === "string") {
      out.push({ kind: "strike", text: match[3] });
    } else if (typeof match[4] === "string") {
      out.push({ kind: "italic", text: match[4] });
    }
    lastIndex = index + (match[0]?.length ?? 0);
  }
  if (lastIndex < raw.length) {
    out.push({ kind: "text", text: raw.slice(lastIndex) });
  }
}

export function tokenizeChatInlineMarkdown(rawInput: unknown): ChatInlineToken[] {
  const raw = String(rawInput ?? "");
  if (!raw) return [];
  const out: ChatInlineToken[] = [];
  let lastIndex = 0;
  for (const match of raw.matchAll(FENCED_CODE_BLOCK_RE)) {
    const index = match.index ?? -1;
    if (index < 0) continue;
    if (index > lastIndex) {
      tokenizeInlineRun(raw.slice(lastIndex, index), out);
    }
    const language = String(match[1] ?? "").trim().toLowerCase() || null;
    const body = String(match[2] ?? "").replace(/\n$/, "");
    out.push({ kind: "code_block", text: body, language });
    lastIndex = index + (match[0]?.length ?? 0);
  }
  if (lastIndex < raw.length) {
    tokenizeInlineRun(raw.slice(lastIndex), out);
  }
  return out;
}

// Reduce formatted text to its plain content for previews and notifications.
export function stripChatInlineMarkdown(rawInput: unknown): string {
  return tokenizeChatInlineMarkdown(rawInput)
    .map((token) => token.text)
    .join("");
}

export function chatTextHasInlineMarkdown(rawInput: unknown): boolean {
  const tokens = tokenizeChatInlineMarkdown(rawInput);
  return tokens.some((token) => token.kind !== "text");
}
