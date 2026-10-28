import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { MemberAgentStoredMessage } from "../shared/memberAgentConversationContext.ts";
import { selectMemberAgentHistoryForBudget } from "../shared/memberAgentHistorySelection.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const threads = read("convex/threads.ts");
const resolution = read("convex/runtimeTurnResolution.ts");
const handlers = read("convex/runtimeTurnHandlers.ts");
const runtimeLoop = read("convex/runtimeAgentLoop.ts");
const contextBuilder = read("shared/memberAgentConversationContext.ts");

assert.match(
  threads,
  /listMemberAgentRuntimeMessagesInternal = internalQuery[\s\S]*beforeSeq: v\.optional\(v\.number\(\)\)[\s\S]*lte\("seq", expected\.seq\)[\s\S]*lt\("seq", beforeSeq\)[\s\S]*take\(MEMBER_AGENT_CONTEXT_PAGE_SIZE \+ 1\)/,
  "persisted history must use an authorized newest-first page with lookahead",
);
assert.match(
  threads,
  /thread\.ownerId !== args\.ownerId[\s\S]*expected\.threadId !== thread\._id[\s\S]*expected\.role !== "user"/,
  "every persisted-history page must remain bound to the owner, thread, and exact user turn",
);
assert.match(
  resolution,
  /usesPersistedConversation = invocationSurface === "member_agent_dock"[\s\S]*persistedConversationHistory = \{[\s\S]*expectedUserMessageKey/,
  "member agent turns seed from persisted history",
);
assert.equal(
  (handlers.match(/persistedConversationHistory,/g) ?? []).length,
  3,
  "the resolved history seed must reach both streaming and non-streaming runtime calls",
);
assert.match(
  runtimeLoop,
  /while \(hasMore && !selection\.blockedByBudget\)[\s\S]*selectMemberAgentHistoryForBudget[\s\S]*runtime_persisted_history_selected[\s\S]*resolvedProviderToolSchemas/,
  "the runtime must page until model budget or history exhaustion and persist selection lineage",
);
assert.doesNotMatch(
  `${runtimeLoop}\n${contextBuilder}`,
  /MEMBER_AGENT_CONTEXT_MAX_PAGES_PER_TURN|max_pages_per_turn|page_limit/,
  "persisted history must not retain a fixed page-count ceiling under another name",
);
assert.match(
  runtimeLoop,
  /const resolvedProviderToolSchemas[\s\S]*toolSchemas: resolvedProviderToolSchemas[\s\S]*toolSchemas: resolvedProviderToolSchemas/,
  "history selection and the runtime kernel must use the same canonical provider tool schemas",
);
assert.doesNotMatch(
  contextBuilder,
  /MEMBER_AGENT_CONTEXT_MAX_MESSAGES/,
  "the old fixed message ceiling must not survive under a legacy name",
);

const beyondSixtyRows: MemberAgentStoredMessage[] = [];
let seq = 1;
for (let episode = 1; episode <= 31; episode += 1) {
  beyondSixtyRows.push({
    messageKey: `user-${episode}`,
    seq: seq++,
    role: "user",
    contentJson: { text: `question ${episode}` },
  });
  beyondSixtyRows.push({
    messageKey: `assistant-${episode}`,
    seq: seq++,
    role: "assistant",
    contentJson: { text: `answer ${episode}` },
  });
}
beyondSixtyRows.push({
  messageKey: "user-current",
  seq: seq++,
  role: "user",
  contentJson: { text: "current question" },
});

const beyondSixty = selectMemberAgentHistoryForBudget({
  rows: beyondSixtyRows,
  expectedUserMessageKey: "user-current",
  systemPrompt: "You are a governed community agent.",
  transport: "openai_responses",
  modelRef: "openai/gpt-6-luna",
  toolSchemas: [],
  reservedOutputTokens: 4_096,
});
assert.equal(beyondSixty.ok, true);
if (!beyondSixty.ok) throw new Error(beyondSixty.code);
assert.equal(beyondSixty.selectedEntries.length, 63);
assert.equal(beyondSixty.selectedEpisodeCount, 32);
assert.equal(beyondSixty.blockedByBudget, false);
assert.equal(beyondSixty.selectedEntries[0]?.messageKey, "user-1");
assert.equal(beyondSixty.selectedEntries.at(-1)?.messageKey, "user-current");

const beyondFormerPageCeilingRows: MemberAgentStoredMessage[] = [];
seq = 1;
for (let episode = 1; episode <= 970; episode += 1) {
  beyondFormerPageCeilingRows.push({
    messageKey: `deep-user-${episode}`,
    seq: seq++,
    role: "user",
    contentJson: { text: `q${episode}` },
  });
  beyondFormerPageCeilingRows.push({
    messageKey: `deep-assistant-${episode}`,
    seq: seq++,
    role: "assistant",
    contentJson: { text: `a${episode}` },
  });
}
beyondFormerPageCeilingRows.push({
  messageKey: "deep-user-current",
  seq: seq++,
  role: "user",
  contentJson: { text: "current" },
});

const beyondFormerPageCeiling = selectMemberAgentHistoryForBudget({
  rows: beyondFormerPageCeilingRows,
  expectedUserMessageKey: "deep-user-current",
  systemPrompt: "system",
  transport: "openai_responses",
  modelRef: "openai/gpt-5.6-sol",
  toolSchemas: [],
  reservedOutputTokens: 8_192,
});
assert.equal(beyondFormerPageCeiling.ok, true);
if (!beyondFormerPageCeiling.ok) {
  throw new Error(beyondFormerPageCeiling.code);
}
assert.equal(
  beyondFormerPageCeiling.selectedEntries.length,
  beyondFormerPageCeilingRows.length,
  "otherwise admissible history beyond the former 1,920-row page ceiling must remain selectable",
);
assert.equal(beyondFormerPageCeiling.blockedByBudget, false);

const budgetBoundary = selectMemberAgentHistoryForBudget({
  rows: [
    {
      messageKey: "old-user",
      seq: 1,
      role: "user",
      contentJson: { text: "q".repeat(1_440_000) },
    },
    {
      messageKey: "old-assistant",
      seq: 2,
      role: "assistant",
      contentJson: { text: "a".repeat(1_440_000) },
    },
    {
      messageKey: "current-user",
      seq: 3,
      role: "user",
      contentJson: { text: "current" },
    },
  ],
  expectedUserMessageKey: "current-user",
  systemPrompt: "system",
  transport: "openai_responses",
  modelRef: "openai/gpt-6-luna",
  toolSchemas: [],
  reservedOutputTokens: 4_096,
});
assert.equal(budgetBoundary.ok, true);
if (!budgetBoundary.ok) throw new Error(budgetBoundary.code);
assert.equal(budgetBoundary.blockedByBudget, true);
assert.deepEqual(
  budgetBoundary.selectedEntries.map((entry) => entry.messageKey),
  ["current-user"],
  "a large older episode must be omitted atomically without dropping the current turn",
);

const splitBoundary = selectMemberAgentHistoryForBudget({
  rows: [
    {
      messageKey: "orphan-assistant",
      seq: 1,
      role: "assistant",
      contentJson: { text: "page split" },
    },
    {
      messageKey: "prior-user",
      seq: 2,
      role: "user",
      contentJson: { text: "prior" },
    },
    {
      messageKey: "prior-assistant",
      seq: 3,
      role: "assistant",
      contentJson: { text: "answer" },
    },
    {
      messageKey: "current-user",
      seq: 4,
      role: "user",
      contentJson: { text: "current" },
    },
  ],
  expectedUserMessageKey: "current-user",
  systemPrompt: "system",
  transport: "openai_responses",
  modelRef: "openai/gpt-6-luna",
  toolSchemas: [],
  reservedOutputTokens: 4_096,
});
assert.equal(splitBoundary.ok, true);
if (!splitBoundary.ok) throw new Error(splitBoundary.code);
assert.equal(splitBoundary.ignoredLeadingMessageCount, 1);
assert.deepEqual(
  splitBoundary.selectedEntries.map((entry) => entry.messageKey),
  ["prior-user", "prior-assistant", "current-user"],
  "an orphan assistant at a page boundary must never become provider context",
);

const unknownCapacity = selectMemberAgentHistoryForBudget({
  rows: [
    {
      messageKey: "current-user",
      seq: 1,
      role: "user",
      contentJson: { text: "current" },
    },
  ],
  expectedUserMessageKey: "current-user",
  systemPrompt: "system",
  transport: "openai_responses",
  modelRef: "unknown/model",
  toolSchemas: [],
  reservedOutputTokens: 4_096,
});
assert.equal(unknownCapacity.ok, true);
if (!unknownCapacity.ok) throw new Error(unknownCapacity.code);
assert.equal(unknownCapacity.blockedByBudget, true);
assert.equal(
  unknownCapacity.budgetPlan.failureCode,
  "runtime_model_capacity_unknown",
);

console.log("runtime_persisted_history_pagination_contract_proof: ok");
