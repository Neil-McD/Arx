import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";
import type { ModelToggle } from "./modelCatalog";
import { parseModelRegistryRows } from "./modelRegistry";
import { deriveThreadTitleFromUserText, isMissingThreadTitleValue } from "./threadTitleUi";
import { formatWorkspaceRestoreErrorMessage } from "./appErrorMappings";
import {
  isConvexCloudThreadsEnabled,
  listConvexCloudThreadMessagesPageByThreadKey,
  listConvexCloudThreadRows,
} from "./daytonaCloudThreadsRead";

const MAX_DERIVED_THREAD_TITLES_PER_LIST = 120;
const TITLE_DERIVATION_CHUNK_SIZE = 25;

type ThreadTitleProbeRow = {
  thread_id: string;
  role: string;
  content_json: unknown;
  seq: unknown;
};

function chunkArray<T>(values: ReadonlyArray<T>, chunkSize: number): T[][] {
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) return [values.slice() as T[]];
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    out.push(values.slice(index, index + chunkSize) as T[]);
  }
  return out;
}

function extractTextFromCloudContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const record = content as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.content === "string") return record.content;
  }
  return "";
}

function deriveThreadTitleFromCloudMessage(content: unknown): string {
  const text = extractTextFromCloudContent(content).trim();
  if (!text) return "";
  return deriveThreadTitleFromUserText(text).trim();
}

type ThreadRecord = {
  id: string;
  title: string | null;
  model_id: string | null;
  project_id: string | null;
  community_id: string | null;
  context_version: number;
  agent_attention: boolean;
  last_seq: number;
  created_at: number;
  updated_at: number;
};

type ThreadMessageRecord = {
  id: string;
  thread_id: string;
  seq: number;
  created_at: string;
};

function compareThreadMessages(a: ThreadMessageRecord, b: ThreadMessageRecord): number {
  if (a.seq !== b.seq) return a.seq - b.seq;
  const createdAtDelta = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (Number.isFinite(createdAtDelta) && createdAtDelta !== 0) return createdAtDelta;
  return a.id.localeCompare(b.id);
}

type UseWebThreadDataControllerArgs<SessionT, ThreadMessageT> = {
  fetchModelRegistryRows?: (session: SessionT) => Promise<unknown[] | null>;
  toEpochSeconds: (value: string) => number;
  formatModelLabel: (modelId: string | null | undefined) => string | null;

  activeThreadId: string | null;
  threadsHydratedRef: MutableRefObject<boolean>;
  workspaceWantsNewChatRef: MutableRefObject<boolean>;

  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
  setWorkspaceWantsNewChatMode: (next: SetStateAction<boolean>) => void;
  setThreadError: Dispatch<SetStateAction<string | null>>;
  setThreads: Dispatch<SetStateAction<ThreadRecord[]>>;
  setThreadMessages: Dispatch<SetStateAction<ThreadMessageT[]>>;
  setModelToggles: Dispatch<SetStateAction<ModelToggle[]>>;
  setModelProviderById?: Dispatch<SetStateAction<Record<string, string>>>;
  isModelAllowed?: (modelId: string) => boolean;
  ensureSession?: EnsureSessionFn<SessionT>;
};

export function useWebThreadDataController<SessionT, ThreadMessageT extends ThreadMessageRecord>(
  args: UseWebThreadDataControllerArgs<SessionT, ThreadMessageT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadThreads = useCallback(async (session: SessionT) => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) {
      current.setThreads([]);
      current.threadsHydratedRef.current = true;
      return;
    }
    const hasConvex = isConvexCloudThreadsEnabled();
    if (!hasConvex) {
      current.setThreadError("Convex is required for cloud threads in this build.");
      current.setThreads([]);
      current.threadsHydratedRef.current = true;
      return;
    }

    current.setThreadError(null);
    try {
      const applyLoadedThreadList = (nextList: ThreadRecord[]): void => {
        current.setThreads(nextList);

        if (current.workspaceWantsNewChatRef.current) {
          if (current.activeThreadId !== null) {
            current.setActiveThreadId(null);
          }
          current.threadsHydratedRef.current = true;
          return;
        }

        if (!current.activeThreadId) {
          current.setWorkspaceWantsNewChatMode(true);
          current.threadsHydratedRef.current = true;
          return;
        }

        const selected = nextList.find((thread) => thread.id === current.activeThreadId) ?? null;
        if (!selected) {
          current.setActiveThreadId(null);
          current.setWorkspaceWantsNewChatMode(true);
        }
        current.threadsHydratedRef.current = true;
      };

      const convexRows = await listConvexCloudThreadRows(usableSession as any);
      const convexList: ThreadRecord[] = (convexRows ?? [])
        .map((row) => ({
          id: row.id,
          title: row.title ?? null,
          model_id: row.model_id ?? null,
          project_id: row.project_id ?? null,
          community_id: row.community_id ?? null,
          context_version: Number.isFinite(row.context_version) ? row.context_version : 0,
          agent_attention: row.agent_attention === true,
          last_seq: Number.isFinite(row.last_seq) ? row.last_seq : 0,
          created_at: current.toEpochSeconds(row.created_at),
          updated_at: current.toEpochSeconds(row.updated_at),
        }));
      applyLoadedThreadList(convexList);
    } catch (error) {
      const message = formatWorkspaceRestoreErrorMessage(
        error,
        "Couldn't load your threads right now.",
      );
      current.setThreadError(message);
      current.threadsHydratedRef.current = true;
    }
  }, []);

  const loadThreadMessages = useCallback(async (threadId: string, session: SessionT) => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) {
      return;
    }
    const hasConvex = isConvexCloudThreadsEnabled();
    if (!hasConvex) {
      current.setThreadError("Convex is required for cloud threads in this build.");
      return;
    }

    try {
      const convexRows = await listConvexCloudThreadMessagesPageByThreadKey({
        session: usableSession as any,
        threadKey: threadId,
        pageSize: 1000,
        maxScan: 4000,
      });
      if (argsRef.current.activeThreadId !== threadId) return;
      const fetchedRows = ((convexRows ?? []) as unknown as ThreadMessageT[])
        .slice()
        .sort(compareThreadMessages);
      current.setThreadMessages(fetchedRows);
    } catch (error) {
      console.warn("Failed to load Convex thread messages:", error);
    }
  }, []);

  const loadModelRegistry = useCallback(async (session: SessionT): Promise<void> => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    const fetchRows = current.fetchModelRegistryRows;
    if (!fetchRows) return;
    try {
      const rows = await fetchRows(usableSession);
      if (!rows || !Array.isArray(rows)) return;
      const isModelAllowed = current.isModelAllowed ?? (() => true);
      const parsed = parseModelRegistryRows(rows, {
        isModelAllowed,
        formatModelLabel: current.formatModelLabel,
      });
      const catalog = parsed.catalog;

      if (
        parsed.diagnostics.dropped_empty_id > 0 ||
        parsed.diagnostics.dropped_duplicate_id > 0 ||
        parsed.diagnostics.dropped_invalid_row > 0 ||
        parsed.diagnostics.unknown_provider > 0
      ) {
        console.warn("[model-registry] ignored malformed rows (web)", parsed.diagnostics);
      }

      if (!catalog.length) return;
      if (current.setModelProviderById) {
        current.setModelProviderById(parsed.providerById);
      }
      current.setModelToggles((prev) => {
        const prevById = new Map((prev ?? []).map((toggle) => [toggle.id, toggle]));
        const nextById = new Map<string, ModelToggle>();
        for (const toggle of catalog) {
          const existing = prevById.get(toggle.id);
          nextById.set(toggle.id, existing ? { ...toggle, enabled: existing.enabled } : toggle);
        }
        for (const existing of prev ?? []) {
          if (!isModelAllowed(existing.id)) continue;
          if (!nextById.has(existing.id)) nextById.set(existing.id, existing);
        }
        return Array.from(nextById.values());
      });
    } catch {
      // ignore
    }
  }, []);

  return {
    loadThreads,
    loadThreadMessages,
    loadModelRegistry,
  };
}
