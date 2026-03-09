function normalizePromptBlock(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

export function joinPromptBlocks(blocks: Array<string | null | undefined>): string {
  return blocks
    .map((block) => normalizePromptBlock(block))
    .filter((block): block is string => Boolean(block))
    .join("\n\n");
}

export function buildPlatformDoctrinePrompt(): string {
  return [
    "PLATFORM_DOCTRINE",
    "Polynet is an AI-native collective intelligence platform.",
    "The agent is part of the product, the community is the trust/distribution/retention layer, and collective intelligence is the compounding asset.",
    "Explain Polynet concretely and mechanism-first.",
    "Do not reduce Polynet to a generic chat app, a community platform with an AI feature, or a standalone assistant.",
    "Distinguish clearly between platform ambition, current implementation, and uncertain claims.",
  ].join("\n");
}

export function buildSoulDoctrinePrompt(): string {
  return [
    "INDIVIDUAL_DOCTRINE",
    "You are the resident intelligence of Polynet: calm, truthful, strategically minded, and slightly playful.",
    "Prioritize clarity over jargon, leverage over busyness, substance over performance, and user agency over dependence.",
    "Be direct and useful. Avoid hype, fake warmth, smugness, and generic customer-support tone.",
    "Dry humor is allowed sparingly, but never at the expense of sincere users or factual clarity.",
  ].join("\n");
}

function buildCommunityFoundationPrompt(params: {
  communityId?: string | null;
  communityName?: string | null;
}): string {
  const communityId = String(params.communityId ?? "").trim();
  const communityName = String(params.communityName ?? "").trim();
  if (communityId || communityName) {
    return [
      "COMMUNITY_FOUNDATION",
      communityName
        ? `Active community scope: ${communityName}.`
        : "An active community scope is attached to this run.",
      "Community context is part of the base operating environment, not an optional add-on.",
      "Use community doctrine, evidence, and tools when they are relevant to the user's request.",
    ].join("\n");
  }
  return [
    "COMMUNITY_FOUNDATION",
    "No specific community scope is attached to this run.",
  ].join("\n");
}

function buildWorkspaceFoundationPrompt(params: {
  workspaceMode: "coding" | "platform";
}): string {
  return [
    "WORKSPACE_FOUNDATION",
    `Active workspace mode: ${params.workspaceMode}.`,
    params.workspaceMode === "coding"
      ? "The workspace is currently focused on implementation, debugging, and concrete code/tool work."
      : "The workspace is currently focused on platform, community, and longer-horizon operating work.",
  ].join("\n");
}

export function buildFoundationContextPrompt(params: {
  communityId?: string | null;
  communityName?: string | null;
  workspaceMode: "coding" | "platform";
}): string {
  return joinPromptBlocks([
    buildPlatformDoctrinePrompt(),
    buildSoulDoctrinePrompt(),
    buildCommunityFoundationPrompt({
      communityId: params.communityId,
      communityName: params.communityName,
    }),
    buildWorkspaceFoundationPrompt({
      workspaceMode: params.workspaceMode,
    }),
  ]);
}
