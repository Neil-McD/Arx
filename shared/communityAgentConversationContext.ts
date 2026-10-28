import {
  extractTextFromContentJson,
  parseMessageAttachments,
} from "./communityMessageParsing.ts";
import { isAllowedCommunityAgentImageMime } from "./communityAgentAttachments.ts";
import type { NativeToolInputContentPart } from "./nativeToolProtocol.ts";

export const COMMUNITY_AGENT_CONTEXT_PAGE_SIZE = 60;

export type CommunityAgentStoredMessage = {
  messageKey: string;
  seq: number;
  role: "user" | "assistant" | "system";
  contentJson: unknown;
};

export type CommunityAgentConversationMessage = {
  role: "user" | "assistant";
  content: string | NativeToolInputContentPart[];
};

export type CommunityAgentConversationEntry = CommunityAgentConversationMessage & {
  messageKey: string;
  seq: number;
};

export type CommunityAgentRuntimeHistoryPage = {
  expectedUserSeq: number;
  rows: CommunityAgentStoredMessage[];
  hasMore: boolean;
  nextBeforeSeq: number | null;
};

export type CommunityAgentPersistedHistorySeed = CommunityAgentRuntimeHistoryPage & {
  expectedUserMessageKey: string;
};

export type CommunityAgentConversationEntriesResult =
  | {
      ok: true;
      expectedUserSeq: number;
      entries: CommunityAgentConversationEntry[];
      hasImageInput: boolean;
    }
  | {
      ok: false;
      code:
        | "expected_user_message_missing"
        | "expected_message_not_user"
        | "expected_user_message_empty";
    };

export type CommunityAgentConversationContextResult =
  | {
      ok: true;
      expectedUserSeq: number;
      messages: CommunityAgentConversationMessage[];
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

export function buildCommunityAgentConversationEntries(params: {
  rows: readonly CommunityAgentStoredMessage[];
  expectedUserMessageKey: string;
}): CommunityAgentConversationEntriesResult {
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
      isAllowedCommunityAgentImageMime(attachment.mime) &&
      /^https:\/\//i.test(url)
    );
  });
  if (!expectedContent && expectedImages.length === 0) {
    return { ok: false, code: "expected_user_message_empty" };
  }

  const eligible = params.rows
    .filter((row) => row.seq <= expected.seq)
    .slice()
    .sort((a, b) => b.seq - a.seq);

  const newestFirst: CommunityAgentConversationEntry[] = [];
  for (const row of eligible) {
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
      messageKey: row.messageKey,
      seq: row.seq,
      role: row.role,
      content: multimodalContent.some((part) => part.type === "image")
        ? multimodalContent
        : content,
    });
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
    entries: newestFirst.reverse(),
    hasImageInput: expectedImages.length > 0,
  };
}

export function buildCommunityAgentConversationContext(params: {
  rows: readonly CommunityAgentStoredMessage[];
  expectedUserMessageKey: string;
  maxMessages?: number;
}): CommunityAgentConversationContextResult {
  const built = buildCommunityAgentConversationEntries(params);
  if (!built.ok) return built;
  const maxMessages = normalizePositiveInteger(
    params.maxMessages,
    Math.max(1, built.entries.length),
    Math.max(1, built.entries.length),
  );
  const entries = built.entries.slice(-maxMessages);
  return {
    ok: true,
    expectedUserSeq: built.expectedUserSeq,
    messages: entries.map(({ role, content }) => ({ role, content })),
    characterCount: entries.reduce((total, entry) => {
      const text =
        typeof entry.content === "string"
          ? entry.content
          : entry.content
              .filter((part): part is Extract<NativeToolInputContentPart, { type: "text" }> =>
                part.type === "text",
              )
              .map((part) => part.text)
              .join("");
      return total + text.length;
    }, 0),
    hasImageInput: built.hasImageInput,
  };
}
