import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  extractCommunityEvidenceUsedV1,
  type CommunityEvidenceUsedV1,
} from "../../../shared/communityEvidence";
import type { RuntimeClient } from "../../runtime/arp/client";

export type SourcesUsedThreadContext = {
  threadLane: string | null;
  projectId: string | null;
  communityId: string | null;
  contextVersion: number | null;
};

export type SourcesUsedCommunityContext = {
  communityId: string | null;
  injected: boolean;
  attempted: boolean;
  compiledFetchOk: boolean | null;
  compiledItemsUsed: number;
  compileVersion: number | null;
  fallbackUsed: boolean | null;
  chatFetchOk: boolean | null;
  resourceFetchOk: boolean | null;
  chatItemsUsed: number;
  resourceItemsUsed: number;
  retrievalLatencyMs: number | null;
  failureClass: string | null;
  qualityScore: number | null;
  qualityBand: string | null;
  contractId: string | null;
};

export type SourcesUsedState =
  | { open: false }
  | {
      open: true;
      turnId: string;
      isLoading: boolean;
      error: string | null;
      workspacePath: string | null;
      personalMemory: Array<{ id: string; content: string }>;
      threadContext: SourcesUsedThreadContext | null;
      communityContext: SourcesUsedCommunityContext | null;
      communityEvidence: CommunityEvidenceUsedV1 | null;
    };

type SourcesUsedTurn = {
  id: string;
  memory_retrieval_event_id: string | null;
};

type UseDesktopSourcesUsedArgs = {
  activeThreadId: string | null;
  runtimeClient: RuntimeClient;
  setSourcesUsed: Dispatch<SetStateAction<SourcesUsedState>>;
};

function toBooleanOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return null;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toTrimmedStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePersonalMemory(payload: unknown): Array<{ id: string; content: string }> {
  const personal = (payload as { personal_memory?: { items?: unknown } } | null)?.personal_memory?.items;
  if (!Array.isArray(personal)) return [];
  return personal
    .map((it) => {
      const item = it as { id?: unknown; content?: unknown };
      return {
        id: typeof item?.id === "string" ? item.id : "",
        content: typeof item?.content === "string" ? item.content : "",
      };
    })
    .filter((item) => item.id.length > 0 && item.content.length > 0);
}

function parseThreadContext(raw: unknown): SourcesUsedThreadContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  return {
    threadLane: toTrimmedStringOrNull(record.thread_lane),
    projectId: toTrimmedStringOrNull(record.project_id),
    communityId: toTrimmedStringOrNull(record.community_id),
    contextVersion: toNumberOrNull(record.context_version),
  };
}

function parseCommunityContext(raw: unknown): SourcesUsedCommunityContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  return {
    communityId: toTrimmedStringOrNull(record.community_id),
    injected: toBooleanOrNull(record.injected) ?? false,
    attempted: toBooleanOrNull(record.attempted) ?? false,
    compiledFetchOk: toBooleanOrNull(record.compiled_fetch_ok),
    compiledItemsUsed: Math.max(0, Math.floor(toNumberOrNull(record.compiled_items_used) ?? 0)),
    compileVersion: toNumberOrNull(record.compile_version),
    fallbackUsed: toBooleanOrNull(record.fallback_used),
    chatFetchOk: toBooleanOrNull(record.chat_fetch_ok),
    resourceFetchOk: toBooleanOrNull(record.resource_fetch_ok),
    chatItemsUsed: Math.max(0, Math.floor(toNumberOrNull(record.chat_items_used) ?? 0)),
    resourceItemsUsed: Math.max(0, Math.floor(toNumberOrNull(record.resource_items_used) ?? 0)),
    retrievalLatencyMs: toNumberOrNull(record.retrieval_latency_ms),
    failureClass: toTrimmedStringOrNull(record.failure_class),
    qualityScore: toNumberOrNull(record.quality_score),
    qualityBand: toTrimmedStringOrNull(record.quality_band),
    contractId: toTrimmedStringOrNull(record.contract_id),
  };
}

function makeClearedSourcesUsedState(turnId: string, error: string | null, isLoading: boolean): SourcesUsedState {
  return {
    open: true,
    turnId,
    isLoading,
    error,
    workspacePath: null,
    personalMemory: [],
    threadContext: null,
    communityContext: null,
    communityEvidence: null,
  };
}

export function useDesktopSourcesUsed(args: UseDesktopSourcesUsedArgs) {
  const { activeThreadId, runtimeClient, setSourcesUsed } = args;

  const handleOpenSourcesUsed = useCallback(
    async (turn: SourcesUsedTurn) => {
      setSourcesUsed(makeClearedSourcesUsedState(turn.id, null, true));

      if (!activeThreadId) {
        setSourcesUsed(makeClearedSourcesUsedState(turn.id, "No active thread.", false));
        return;
      }

      if (!turn.memory_retrieval_event_id) {
        setSourcesUsed(makeClearedSourcesUsedState(turn.id, null, false));
        return;
      }

      try {
        const event = await runtimeClient.getEvent({
          thread_id: activeThreadId,
          event_id: turn.memory_retrieval_event_id,
        });
        const payload = event?.payload_json ? JSON.parse(event.payload_json) : null;
        const payloadRecord =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : null;
        const workspacePath = payloadRecord?.workspace_path;
        const personalMemory = parsePersonalMemory(payload);
        const threadContext = parseThreadContext(payloadRecord?.thread_context);
        const communityContext = parseCommunityContext(payloadRecord?.community_context);
        const communityEvidence = extractCommunityEvidenceUsedV1(payloadRecord ?? payload);

        setSourcesUsed({
          open: true,
          turnId: turn.id,
          isLoading: false,
          error: null,
          workspacePath: typeof workspacePath === "string" ? workspacePath : null,
          personalMemory,
          threadContext,
          communityContext,
          communityEvidence,
        });
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to load sources.";
        setSourcesUsed(makeClearedSourcesUsedState(turn.id, message, false));
      }
    },
    [activeThreadId, runtimeClient, setSourcesUsed],
  );

  return { handleOpenSourcesUsed };
}
