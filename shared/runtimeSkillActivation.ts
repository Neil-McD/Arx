export type RuntimeSkillInferenceRole = "user" | "assistant" | "system";

export type RuntimeSkillInferenceMessage = {
  role: RuntimeSkillInferenceRole;
  content: string;
};

export type ExplicitlyMentionedSkillCandidate<T> = {
  mentionToken: string;
  value: T;
};

export type ScopedExplicitlyMentionedSkillCandidate<
  TScope extends string,
  TValue,
> = {
  scope: TScope;
  mentionToken: string;
  value: TValue;
};

function normalizeMentionToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function extractExplicitSkillMentions(
  messages: RuntimeSkillInferenceMessage[],
): string[] {
  const latestUserMessage = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === "user" &&
        typeof message.content === "string" &&
        message.content.trim(),
    );
  if (!latestUserMessage) return [];
  const mentions = latestUserMessage.content.match(/\$[a-z0-9][a-z0-9-]*/gi) ?? [];
  return Array.from(
    new Set(
      mentions
        .map((mention) => normalizeMentionToken(mention.slice(1)))
        .filter(Boolean),
    ),
  );
}

export function selectExplicitlyMentionedSkills<T>(
  candidates: ExplicitlyMentionedSkillCandidate<T>[],
  requestedMentionTokens: string[],
): T[] {
  if (requestedMentionTokens.length === 0 || candidates.length === 0) return [];
  const requested = requestedMentionTokens
    .map((token) => normalizeMentionToken(token))
    .filter(Boolean);
  if (requested.length === 0) return [];
  const matchedByToken = new Map<string, T[]>();
  for (const candidate of candidates) {
    const mentionToken = normalizeMentionToken(candidate.mentionToken);
    if (!mentionToken || !requested.includes(mentionToken)) continue;
    const current = matchedByToken.get(mentionToken) ?? [];
    current.push(candidate.value);
    matchedByToken.set(mentionToken, current);
  }
  const resolved: T[] = [];
  for (const token of requested) {
    const matches = matchedByToken.get(token) ?? [];
    if (matches.length !== 1) continue;
    resolved.push(matches[0]);
  }
  return resolved;
}

export function resolveScopedExplicitlyMentionedSkills<
  TScope extends string,
  TValue,
>(
  candidates: ScopedExplicitlyMentionedSkillCandidate<TScope, TValue>[],
  requestedMentionTokens: string[],
): {
  selected: Array<{ scope: TScope; value: TValue }>;
  ambiguousMentionTokens: string[];
} {
  if (requestedMentionTokens.length === 0 || candidates.length === 0) {
    return {
      selected: [],
      ambiguousMentionTokens: [],
    };
  }
  const requested = requestedMentionTokens
    .map((token) => normalizeMentionToken(token))
    .filter(Boolean);
  if (requested.length === 0) {
    return {
      selected: [],
      ambiguousMentionTokens: [],
    };
  }
  const matchedByToken = new Map<
    string,
    Array<{ scope: TScope; value: TValue }>
  >();
  for (const candidate of candidates) {
    const mentionToken = normalizeMentionToken(candidate.mentionToken);
    if (!mentionToken || !requested.includes(mentionToken)) continue;
    const current = matchedByToken.get(mentionToken) ?? [];
    current.push({
      scope: candidate.scope,
      value: candidate.value,
    });
    matchedByToken.set(mentionToken, current);
  }
  const selected: Array<{ scope: TScope; value: TValue }> = [];
  const ambiguousMentionTokens: string[] = [];
  for (const token of requested) {
    const matches = matchedByToken.get(token) ?? [];
    if (matches.length === 1) {
      selected.push(matches[0]);
      continue;
    }
    if (matches.length > 1) {
      ambiguousMentionTokens.push(token);
    }
  }
  return {
    selected,
    ambiguousMentionTokens,
  };
}
