export const COMMUNITY_CONTEXT_BUNDLE_V1: {
  readonly version: 1;
  readonly limits: {
    readonly queryMaxChars: number;
    readonly compiledLimit: number;
    readonly chatLimit: number;
    readonly resourceLimit: number;
    readonly chatSnippetMaxChars: number;
    readonly chatSenderMaxChars: number;
    readonly resourceTitleMaxChars: number;
    readonly resourceSnippetMaxChars: number;
    readonly resourceUrlMaxChars: number;
  };
  readonly sourceTypes: {
    readonly chat: string;
    readonly resource: string;
    readonly memory: string;
  };
};

export const COMMUNITY_CONTEXT_OBSERVABILITY_CONTRACT_ID: string;
export const COMMUNITY_EVIDENCE_USED_CONTRACT_ID: string;

export function parseNumberOrNull(value: unknown): number | null;
export function truncateUtf8ForPrompt(input: unknown, maxChars: number): string;
export function buildCommunityContextSystemPrompt(params: {
  communityName?: unknown;
  chatItems?: unknown[];
  resourceItems?: unknown[];
}): {
  prompt: string | null;
  chatItemsUsed: number;
  resourceItemsUsed: number;
};
export function buildCommunityContextDiagnostics(
  bundle: {
    compiledAttempted?: unknown;
    compiledFetchOk?: unknown;
    compiledItemsUsed?: unknown;
    compileVersion?: unknown;
    fallbackUsed?: unknown;
    chatFetchOk?: unknown;
    resourceFetchOk?: unknown;
    retrievalLatencyMs?: unknown;
    failureClass?: unknown;
  },
  chatItemsUsed: number,
  resourceItemsUsed: number,
): Record<string, unknown>;
export function buildCommunityEvidenceUserMessage(communityContextPrompt: unknown): string | null;
