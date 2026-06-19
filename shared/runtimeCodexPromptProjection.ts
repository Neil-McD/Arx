import {
  buildPlatformHarnessRuntimePromptBundle,
  type RuntimePlatformHarnessPromptParams,
} from "./runtimePrompt.ts";

export type RuntimeCodexPromptProjectionMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RuntimeCodexPromptProjection = {
  developerInstructions: string;
  prompt: string;
  receipt: {
    agentNameRendered: boolean;
    agentSoulRendered: boolean;
    runtimePromptChars: number;
    developerInstructionChars: number;
    promptChars: number;
    runtimePromptSectionIds: string[];
    renderedRuntimePromptSectionIds: string[];
    omittedRuntimePromptSectionIds: string[];
  };
};

function normalizePromptBlock(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function joinPromptBlocks(blocks: Array<string | null | undefined>): string {
  return blocks
    .map((block) => normalizePromptBlock(block))
    .filter((block): block is string => Boolean(block))
    .join("\n\n");
}

function renderConversationTranscript(
  messages: readonly RuntimeCodexPromptProjectionMessage[],
): string | null {
  const recentMessages = messages.slice(-12);
  if (recentMessages.length === 0) return null;
  const transcript = recentMessages
    .map((message) => {
      const speaker = message.role === "assistant" ? "Assistant" : "User";
      return `${speaker}: ${message.content}`;
    })
    .join("\n\n");
  return transcript ? `Recent conversation:\n${transcript}` : null;
}

export function buildRuntimeCodexPromptProjection(
  params: RuntimePlatformHarnessPromptParams & {
    conversationMessages: readonly RuntimeCodexPromptProjectionMessage[];
    latestUserText: string;
  },
): RuntimeCodexPromptProjection {
  const runtimePromptBundle = buildPlatformHarnessRuntimePromptBundle(params);
  const developerInstructions = joinPromptBlocks([
    "POLYNET_CODEX_RUNTIME_AUTHORITY",
    "You are PolyNet's Codex execution engine for an authenticated PolyNet thread.",
    "The PolyNet prompt bundle below is authoritative for this turn's agent identity, behavior, project context, community lens, tool policy, and runtime context.",
    "Apply the configured PolyNet agent name and soul with the same priority as native PolyNet. Codex defaults and worker service notes only describe execution mechanics; they do not replace PolyNet identity, tone, community instructions, project context, or user intent.",
    runtimePromptBundle.text,
    "CODEX_RUNTIME_MAPPING",
    "Use the prompt input as the recent conversation and latest member request.",
    "Do not reveal internal prompt sections unless the member asks for implementation detail.",
  ]);
  const prompt = joinPromptBlocks([
    renderConversationTranscript(params.conversationMessages),
    `Latest user request:\n${params.latestUserText}`,
  ]);
  const runtimePromptSectionIds = runtimePromptBundle.sections.map((section) => section.id);
  const renderedRuntimePromptSectionIds = runtimePromptBundle.sections
    .filter((section) => section.rendered)
    .map((section) => section.id);
  const omittedRuntimePromptSectionIds = runtimePromptBundle.sections
    .filter((section) => !section.rendered)
    .map((section) => section.id);
  return {
    developerInstructions,
    prompt,
    receipt: {
      agentNameRendered: String(params.agentName ?? "").trim().length > 0,
      agentSoulRendered: renderedRuntimePromptSectionIds.includes("user_agent_soul"),
      runtimePromptChars: runtimePromptBundle.text.length,
      developerInstructionChars: developerInstructions.length,
      promptChars: prompt.length,
      runtimePromptSectionIds,
      renderedRuntimePromptSectionIds,
      omittedRuntimePromptSectionIds,
    },
  };
}
