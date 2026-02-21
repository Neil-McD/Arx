export type CommunityInferenceChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildChatgptCommunityEvidenceSystemMessage(evidenceUserMessage: string): string {
  const evidence = String(evidenceUserMessage ?? "").trim();
  if (!evidence) return "";
  return [
    "Community evidence is already available for this turn.",
    "Do not claim you cannot access community chat/resources/memory when this evidence is present.",
    "Answer community-scoped questions directly from this evidence.",
    "If evidence is insufficient, state what is missing and ask one concise follow-up.",
    "",
    evidence,
  ].join("\n");
}

function buildCommunityPreludeMessages(params: {
  systemPrompt?: string | null;
  communityEvidenceUserMessage?: string | null;
}): CommunityInferenceChatMessage[] {
  const prelude: CommunityInferenceChatMessage[] = [];
  const systemPrompt = toTrimmedString(params.systemPrompt);
  const communityEvidence = toTrimmedString(params.communityEvidenceUserMessage);
  if (systemPrompt) {
    prelude.push({
      role: "system",
      content: systemPrompt,
    });
  }
  if (communityEvidence) {
    prelude.push({
      role: "user",
      content: communityEvidence,
    });
  }
  return prelude;
}

export function prependCommunityPreludeMessages(params: {
  messages: CommunityInferenceChatMessage[];
  systemPrompt?: string | null;
  communityEvidenceUserMessage?: string | null;
}): CommunityInferenceChatMessage[] {
  const prelude = buildCommunityPreludeMessages({
    systemPrompt: params.systemPrompt,
    communityEvidenceUserMessage: params.communityEvidenceUserMessage,
  });
  if (prelude.length === 0) return [...params.messages];
  return [...prelude, ...params.messages];
}

export function buildChatgptLaneMessages(params: {
  messages: CommunityInferenceChatMessage[];
  communityEvidenceUserMessage?: string | null;
}): CommunityInferenceChatMessage[] {
  const evidence = toTrimmedString(params.communityEvidenceUserMessage);
  if (!evidence) return [...params.messages];
  const systemMessage = buildChatgptCommunityEvidenceSystemMessage(evidence);
  if (!systemMessage) return [...params.messages];

  const rewritten: CommunityInferenceChatMessage[] = [];
  let convertedExistingEvidenceMessage = false;
  for (const message of params.messages) {
    if (
      !convertedExistingEvidenceMessage &&
      message.role === "user" &&
      message.content.trim() === evidence
    ) {
      rewritten.push({ role: "system", content: systemMessage });
      convertedExistingEvidenceMessage = true;
      continue;
    }
    rewritten.push(message);
  }

  if (!convertedExistingEvidenceMessage) {
    rewritten.unshift({ role: "system", content: systemMessage });
  }
  return rewritten;
}

export function resolveLatestUserQueryFromInferenceMessages(params: {
  messages: CommunityInferenceChatMessage[];
  fallbackQuery?: string | null;
}): string {
  for (let i = params.messages.length - 1; i >= 0; i -= 1) {
    const message = params.messages[i];
    if (!message || message.role !== "user") continue;
    const content = toTrimmedString(message.content);
    if (content) return content;
  }
  return toTrimmedString(params.fallbackQuery);
}

export function resolveLatestUserQueryFromThreadMessages<MessageT>(params: {
  messages: MessageT[];
  fallbackQuery?: string | null;
  getRole: (message: MessageT) => string | null | undefined;
  getText: (message: MessageT) => string | null | undefined;
}): string {
  for (let i = params.messages.length - 1; i >= 0; i -= 1) {
    const message = params.messages[i];
    if (!message) continue;
    const role = toTrimmedString(params.getRole(message)).toLowerCase();
    if (role !== "user") continue;
    const content = toTrimmedString(params.getText(message));
    if (content) return content;
  }
  return toTrimmedString(params.fallbackQuery);
}
