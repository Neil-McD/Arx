import {
  buildCommunityAgentConversationEntries,
  type CommunityAgentConversationEntry,
  type CommunityAgentStoredMessage,
} from "./communityAgentConversationContext.ts";
import {
  extractTextFromNativeToolMessageContent,
  type NativeToolAwareMessage,
} from "./nativeToolProtocol.ts";
import {
  planRuntimeInputBudget,
  type RuntimeInputBudgetPlan,
  type RuntimeProviderTransport,
} from "./runtimeInputBudget.ts";

export type CommunityAgentHistorySelectionResult =
  | {
      ok: true;
      selectedEntries: CommunityAgentConversationEntry[];
      selectedEpisodeCount: number;
      loadedCompleteEpisodeCount: number;
      ignoredLeadingMessageCount: number;
      blockedByBudget: boolean;
      budgetPlan: RuntimeInputBudgetPlan;
    }
  | {
      ok: false;
      code:
        | "expected_user_message_missing"
        | "expected_message_not_user"
        | "expected_user_message_empty"
        | "expected_user_episode_missing";
    };

function groupCompleteConversationEpisodes(
  entries: readonly CommunityAgentConversationEntry[],
): {
  episodes: CommunityAgentConversationEntry[][];
  ignoredLeadingMessageCount: number;
} {
  const episodes: CommunityAgentConversationEntry[][] = [];
  let ignoredLeadingMessageCount = 0;
  for (const entry of entries) {
    if (entry.role === "user") {
      episodes.push([entry]);
      continue;
    }
    const current = episodes[episodes.length - 1];
    if (!current) {
      ignoredLeadingMessageCount += 1;
      continue;
    }
    current.push(entry);
  }
  return { episodes, ignoredLeadingMessageCount };
}

function toProviderMessages(
  systemPrompt: string,
  episodes: readonly CommunityAgentConversationEntry[][],
): NativeToolAwareMessage[] {
  return [
    { role: "system", content: systemPrompt },
    ...episodes.flat().map(
      (entry): NativeToolAwareMessage =>
        entry.role === "user"
          ? { role: "user", content: entry.content }
          : {
              role: "assistant",
              content: extractTextFromNativeToolMessageContent(entry.content),
            },
    ),
  ];
}

export function selectCommunityAgentHistoryForBudget(params: {
  rows: readonly CommunityAgentStoredMessage[];
  expectedUserMessageKey: string;
  systemPrompt: string;
  transport: RuntimeProviderTransport;
  modelRef: string;
  toolSchemas: readonly unknown[];
  reservedOutputTokens: number;
}): CommunityAgentHistorySelectionResult {
  const built = buildCommunityAgentConversationEntries({
    rows: params.rows,
    expectedUserMessageKey: params.expectedUserMessageKey,
  });
  if (!built.ok) return built;

  const grouped = groupCompleteConversationEpisodes(built.entries);
  const currentEpisode = grouped.episodes[grouped.episodes.length - 1];
  if (
    !currentEpisode?.some(
      (entry) => entry.messageKey === params.expectedUserMessageKey,
    )
  ) {
    return { ok: false, code: "expected_user_episode_missing" };
  }

  let selectedEpisodes = [currentEpisode];
  let providerMessages = toProviderMessages(
    params.systemPrompt,
    selectedEpisodes,
  );
  let budgetPlan = planRuntimeInputBudget({
    transport: params.transport,
    modelRef: params.modelRef,
    messages: providerMessages,
    toolSchemas: params.toolSchemas,
    reservedOutputTokens: params.reservedOutputTokens,
  });
  let blockedByBudget = !budgetPlan.fits;

  if (!blockedByBudget) {
    let lowestCandidateCount = 2;
    let highestCandidateCount = grouped.episodes.length;
    while (lowestCandidateCount <= highestCandidateCount) {
      const candidateCount = Math.floor(
        (lowestCandidateCount + highestCandidateCount) / 2,
      );
      const candidateEpisodes = grouped.episodes.slice(-candidateCount);
      const candidateMessages = toProviderMessages(
        params.systemPrompt,
        candidateEpisodes,
      );
      const candidatePlan = planRuntimeInputBudget({
        transport: params.transport,
        modelRef: params.modelRef,
        messages: candidateMessages,
        toolSchemas: params.toolSchemas,
        reservedOutputTokens: params.reservedOutputTokens,
      });
      if (!candidatePlan.fits) {
        highestCandidateCount = candidateCount - 1;
        continue;
      }
      selectedEpisodes = candidateEpisodes;
      providerMessages = candidateMessages;
      budgetPlan = candidatePlan;
      lowestCandidateCount = candidateCount + 1;
    }
    blockedByBudget = selectedEpisodes.length < grouped.episodes.length;
  }

  return {
    ok: true,
    selectedEntries: selectedEpisodes.flat(),
    selectedEpisodeCount: selectedEpisodes.length,
    loadedCompleteEpisodeCount: grouped.episodes.length,
    ignoredLeadingMessageCount: grouped.ignoredLeadingMessageCount,
    blockedByBudget,
    budgetPlan,
  };
}
