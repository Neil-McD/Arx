import { extractTextFromContentJson } from "./communityMessageParsing.ts";

export const MEMBER_CONVERSATION_LIST_DEFAULT_LIMIT = 8;
export const MEMBER_CONVERSATION_LIST_MAX_LIMIT = 12;
export const MEMBER_CONVERSATION_READ_MAX_MESSAGES = 40;
export const MEMBER_CONVERSATION_READ_HEAD_MESSAGES = 4;
export const MEMBER_CONVERSATION_READ_MAX_CHARS = 16_000;
export const MEMBER_CONVERSATION_READ_HEAD_MAX_CHARS = 4_000;
export const MEMBER_CONVERSATION_READ_MAX_MESSAGE_CHARS = 4_000;

export type MemberConversationRecallStoredMessage = {
  messageKey: string;
  seq: number;
  role: "user" | "assistant" | "system";
  contentJson: unknown;
  runId?: string;
};

export type MemberConversationRecallMessage = {
  seq: number;
  role: "user" | "assistant";
  content: string;
  runId?: string;
};

function normalizeLimit(raw: unknown, fallback: number, ceiling: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(ceiling, Math.floor(value)));
}

function normalizeRecallRows(
  rows: readonly MemberConversationRecallStoredMessage[],
): MemberConversationRecallMessage[] {
  const seen = new Set<string>();
  const normalized: MemberConversationRecallMessage[] = [];
  for (const row of rows) {
    if (row.role !== "user" && row.role !== "assistant") continue;
    const key = String(row.messageKey ?? "").trim() || `seq:${row.seq}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const content = extractTextFromContentJson(row.contentJson).trim();
    if (!content) continue;
    normalized.push({
      seq: row.seq,
      role: row.role,
      content: content.slice(0, MEMBER_CONVERSATION_READ_MAX_MESSAGE_CHARS),
      runId: String(row.runId ?? "").trim() || undefined,
    });
  }
  return normalized.sort((a, b) => a.seq - b.seq);
}

function takeWithinCharacterBudget(
  rows: readonly MemberConversationRecallMessage[],
  maxCharacters: number,
  newestFirst: boolean,
): MemberConversationRecallMessage[] {
  const ordered = newestFirst ? rows.slice().reverse() : rows.slice();
  const selected: MemberConversationRecallMessage[] = [];
  let characterCount = 0;
  for (const row of ordered) {
    const remaining = maxCharacters - characterCount;
    if (remaining <= 0) break;
    const content = row.content.slice(0, remaining).trimEnd();
    if (!content) continue;
    selected.push({ ...row, content });
    characterCount += content.length;
  }
  return selected;
}

export function buildMemberConversationRecallTranscript(params: {
  headRows: readonly MemberConversationRecallStoredMessage[];
  tailRows: readonly MemberConversationRecallStoredMessage[];
  maxMessages?: number;
  maxCharacters?: number;
}): {
  messages: MemberConversationRecallMessage[];
  characterCount: number;
} {
  const maxMessages = normalizeLimit(
    params.maxMessages,
    MEMBER_CONVERSATION_READ_MAX_MESSAGES,
    MEMBER_CONVERSATION_READ_MAX_MESSAGES,
  );
  const maxCharacters = normalizeLimit(
    params.maxCharacters,
    MEMBER_CONVERSATION_READ_MAX_CHARS,
    MEMBER_CONVERSATION_READ_MAX_CHARS,
  );
  const headLimit = Math.min(MEMBER_CONVERSATION_READ_HEAD_MESSAGES, maxMessages);
  const normalizedHead = normalizeRecallRows(params.headRows).slice(0, headLimit);
  const headBudget = Math.min(MEMBER_CONVERSATION_READ_HEAD_MAX_CHARS, maxCharacters);
  const selectedHead = takeWithinCharacterBudget(normalizedHead, headBudget, false);
  const selectedHeadKeys = new Set(selectedHead.map((row) => `${row.seq}:${row.role}`));
  const headCharacterCount = selectedHead.reduce((sum, row) => sum + row.content.length, 0);

  const tailLimit = Math.max(0, maxMessages - selectedHead.length);
  const normalizedTail = tailLimit > 0
    ? normalizeRecallRows(params.tailRows)
        .filter((row) => !selectedHeadKeys.has(`${row.seq}:${row.role}`))
        .slice(-tailLimit)
    : [];
  const selectedTail = takeWithinCharacterBudget(
    normalizedTail,
    Math.max(0, maxCharacters - headCharacterCount),
    true,
  );
  const messages = [...selectedHead, ...selectedTail].sort((a, b) => a.seq - b.seq);
  return {
    messages,
    characterCount: messages.reduce((sum, row) => sum + row.content.length, 0),
  };
}

export function deriveMemberConversationTitle(params: {
  storedTitle?: string | null;
  communityName?: string | null;
  firstUserContentJson?: unknown;
  ordinal: number;
}): string {
  const storedTitle = String(params.storedTitle ?? "").trim().replace(/\s+/g, " ");
  const communityName = String(params.communityName ?? "Community").trim() || "Community";
  const legacyGenericTitle = `${communityName} agent`.toLowerCase();
  if (storedTitle && storedTitle.toLowerCase() !== legacyGenericTitle) {
    return storedTitle.slice(0, 80);
  }
  const firstUserText = extractTextFromContentJson(params.firstUserContentJson).trim().replace(/\s+/g, " ");
  if (firstUserText) return firstUserText.slice(0, 80);
  return `Conversation ${Math.max(1, Math.floor(params.ordinal))}`;
}
