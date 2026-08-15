import {
  extractTextFromContentJson,
  parseMessageAttachments,
} from "./communityMessageParsing.ts";
import { isAllowedMemberAgentImageMime } from "./memberAgentAttachments.ts";
import type { NativeToolInputContentPart } from "./nativeToolProtocol.ts";

export const MEMBER_AGENT_CONTEXT_MAX_MESSAGES = 60;

export type MemberAgentStoredMessage = {
  messageKey: string;
  seq: number;
  role: "user" | "assistant" | "system";
  contentJson: unknown;
};

export type MemberAgentConversationMessage = {
  role: "user" | "assistant";
  content: string | NativeToolInputContentPart[];
};

export type MemberAgentConversationContextResult =
  | {
      ok: true;
      expectedUserSeq: number;
      messages: MemberAgentConversationMessage[];
      characterCount: number;
      hasImageInput: boolean;
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
}): MemberAgentConversationContextResult {
  const expectedUserMessageKey = String(params.expectedUserMessageKey ?? "").trim();
  const expected = params.rows.find(
    (row) => String(row.messageKey ?? "").trim() === expectedUserMessageKey,
  );
  if (!expected) return { ok: false, code: "expected_user_message_missing" };
  if (expected.role !== "user") return { ok: false, code: "expected_message_not_user" };

  const expectedContent = extractTextFromContentJson(expected.contentJson).trim();
  const expectedImages = parseMessageAttachments(expected.contentJson).filter((attachment) => {
    const url = String(attachment.url ?? "").trim();
    return (
      attachment.type === "image" &&
      isAllowedMemberAgentImageMime(attachment.mime) &&
      /^https:\/\//i.test(url)
    );
  });
  if (!expectedContent && expectedImages.length === 0) {
    return { ok: false, code: "expected_user_message_empty" };
  }

  const maxMessages = normalizePositiveInteger(
    params.maxMessages,
    MEMBER_AGENT_CONTEXT_MAX_MESSAGES,
    MEMBER_AGENT_CONTEXT_MAX_MESSAGES,
  );
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
    const isExpected = row.messageKey === expectedUserMessageKey;
    if (!content && !(isExpected && expectedImages.length > 0)) continue;
    const multimodalContent: NativeToolInputContentPart[] = [];
    if (content) multimodalContent.push({ type: "text", text: content });
    if (isExpected) {
      for (const attachment of expectedImages) {
        multimodalContent.push({ type: "image", imageUrl: String(attachment.url).trim() });
      }
    }
    newestFirst.push({
      role: row.role,
      content: multimodalContent.some((part) => part.type === "image")
        ? multimodalContent
        : content,
    });
    characterCount += content.length;
  }

  if (
    newestFirst.length === 0 ||
    newestFirst[0]?.role !== "user" ||
    (typeof newestFirst[0]?.content === "string"
      ? newestFirst[0]?.content !== expectedContent
      : !newestFirst[0]?.content.some((part) => part.type === "image"))
  ) {
    return { ok: false, code: "expected_user_message_empty" };
  }

  return {
    ok: true,
    expectedUserSeq: expected.seq,
    messages: newestFirst.reverse(),
    characterCount,
    hasImageInput: expectedImages.length > 0,
  };
}
