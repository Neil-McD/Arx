import { extractTextFromContentJson } from "./communityMessageParsing.ts";

export const MEMBER_AGENT_CONTEXT_MAX_MESSAGES = 60;
export const MEMBER_AGENT_CONTEXT_MAX_CHARS = 60_000;
export const MEMBER_AGENT_CONTEXT_MAX_MESSAGE_CHARS = 20_000;

export type MemberAgentStoredMessage = {
  messageKey: string;
  seq: number;
  role: "user" | "assistant" | "system";
  contentJson: unknown;
};

export type MemberAgentConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type MemberAgentConversationContextResult =
  | {
      ok: true;
      expectedUserSeq: number;
      messages: MemberAgentConversationMessage[];
      characterCount: number;
    }
  | {
      ok: false;
      code:
        | "expected_user_message_missing"
        | "expected_message_not_user"
        | "expected_user_message_empty";
    };

function normalizePositiveInteger(raw: unknown, fallback: number, ceiling: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(ceiling, Math.floor(value)));
}

export function buildMemberAgentConversationContext(params: {
  rows: readonly MemberAgentStoredMessage[];
  expectedUserMessageKey: string;
  maxMessages?: number;
  maxCharacters?: number;
}): MemberAgentConversationContextResult {
  const expectedUserMessageKey = String(params.expectedUserMessageKey ?? "").trim();
  const expected = params.rows.find(
    (row) => String(row.messageKey ?? "").trim() === expectedUserMessageKey,
  );
  if (!expected) return { ok: false, code: "expected_user_message_missing" };
  if (expected.role !== "user") return { ok: false, code: "expected_message_not_user" };

  const expectedContent = extractTextFromContentJson(expected.contentJson).trim();
  if (!expectedContent) return { ok: false, code: "expected_user_message_empty" };

  const maxMessages = normalizePositiveInteger(
    params.maxMessages,
    MEMBER_AGENT_CONTEXT_MAX_MESSAGES,
    MEMBER_AGENT_CONTEXT_MAX_MESSAGES,
  );
  const maxCharacters = normalizePositiveInteger(
    params.maxCharacters,
    MEMBER_AGENT_CONTEXT_MAX_CHARS,
    MEMBER_AGENT_CONTEXT_MAX_CHARS,
  );
  const expectedBoundedContent = expectedContent
    .slice(0, Math.min(MEMBER_AGENT_CONTEXT_MAX_MESSAGE_CHARS, maxCharacters))
    .trimEnd();
  const eligible = params.rows
    .filter((row) => row.seq <= expected.seq)
    .slice()
    .sort((a, b) => b.seq - a.seq);

  const newestFirst: MemberAgentConversationMessage[] = [];
  let characterCount = 0;
  for (const row of eligible) {
    if (newestFirst.length >= maxMessages) break;
    if (row.role !== "user" && row.role !== "assistant") continue;
    const content = extractTextFromContentJson(row.contentJson).trim();
    if (!content) continue;
    const perMessageBounded = content.slice(0, MEMBER_AGENT_CONTEXT_MAX_MESSAGE_CHARS);
    const remaining = maxCharacters - characterCount;
    if (remaining <= 0) break;
    const bounded = perMessageBounded.slice(0, remaining).trimEnd();
    if (!bounded) break;
    newestFirst.push({ role: row.role, content: bounded });
    characterCount += bounded.length;
  }

  if (
    newestFirst.length === 0 ||
    newestFirst[0]?.role !== "user" ||
    newestFirst[0]?.content !== expectedBoundedContent
  ) {
    return { ok: false, code: "expected_user_message_empty" };
  }

  return {
    ok: true,
    expectedUserSeq: expected.seq,
    messages: newestFirst.reverse(),
    characterCount,
  };
}
