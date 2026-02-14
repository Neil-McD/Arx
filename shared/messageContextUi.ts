import type { CommunityEvidenceUsedV1 } from "./communityEvidence";

type MaybeList<T> = ReadonlyArray<T> | null | undefined;

export type MessageContextModalPayload<TMemory, THistory, TSuggestion> = {
  memory_used: TMemory[];
  history_used: THistory[];
  memory_suggestions: TSuggestion[];
  memory_added: TMemory[];
  community_evidence: CommunityEvidenceUsedV1 | null;
};

type BuildMessageContextModalPayloadParams<TMemory, THistory, TSuggestion> = {
  memoryUsed?: MaybeList<TMemory>;
  historyUsed?: MaybeList<THistory>;
  memorySuggestions?: MaybeList<TSuggestion>;
  memoryAdded?: MaybeList<TMemory>;
  communityEvidence?: CommunityEvidenceUsedV1 | null;
};

function normalizeList<T>(value: MaybeList<T>): T[] {
  return Array.isArray(value) ? [...value] : [];
}

export function buildMessageContextModalPayload<TMemory, THistory, TSuggestion>(
  params: BuildMessageContextModalPayloadParams<TMemory, THistory, TSuggestion>,
): MessageContextModalPayload<TMemory, THistory, TSuggestion> {
  return {
    memory_used: normalizeList(params.memoryUsed),
    history_used: normalizeList(params.historyUsed),
    memory_suggestions: normalizeList(params.memorySuggestions),
    memory_added: normalizeList(params.memoryAdded),
    community_evidence: params.communityEvidence ?? null,
  };
}

export function hasContextPayload<TMemory, THistory, TSuggestion>(
  payload: MessageContextModalPayload<TMemory, THistory, TSuggestion> | null | undefined,
): boolean {
  if (!payload) return false;
  return (
    payload.memory_used.length > 0 ||
    payload.history_used.length > 0 ||
    payload.memory_suggestions.length > 0 ||
    payload.memory_added.length > 0 ||
    payload.community_evidence !== null
  );
}

export function contextActionLabel(hasContext: boolean): "Memory & context" | "No memory/context" {
  return hasContext ? "Memory & context" : "No memory/context";
}

export function openMessageContextModal<TMemory, THistory, TSuggestion>(
  payload: MessageContextModalPayload<TMemory, THistory, TSuggestion> | null | undefined,
  setContextModal: (next: MessageContextModalPayload<TMemory, THistory, TSuggestion>) => void,
): boolean {
  if (!hasContextPayload(payload)) return false;
  if (!payload) return false;
  setContextModal(payload);
  return true;
}
