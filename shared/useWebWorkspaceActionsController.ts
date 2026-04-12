import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { listCloudPersonalMemoryRows } from "./cloudPersonalMemoryGateway";
import {
  isConvexCloudThreadsEnabled,
  listConvexCloudThreadMessagesByThreadKey,
  listConvexCloudThreadRows,
} from "./daytonaCloudThreadsRead";

type ThreadMessage = {
  id: string;
  thread_id: string;
  seq: number;
  role: "user" | "assistant" | "system";
  content_json: unknown;
  created_at: string;
  engine_id: string | null;
  model_id: string | null;
  run_id: string | null;
};

type GuestStoredMessageV1 = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  run_id?: string | null;
};

type GuestThreadStorageV1 = {
  v: 1;
  model_id: string;
  messages: GuestStoredMessageV1[];
};

type UseWebWorkspaceActionsControllerArgs<SessionT, AttachmentT, ThreadMessageT extends ThreadMessage> = {
  getSession: () => SessionT | null;
  buildCsv: (headers: string[], rows: Array<Record<string, unknown>>) => string;
  downloadTextFile: (filename: string, content: string, mime?: string) => void;
  parseMessageText: (content: unknown) => string;
  storeGuestThreadStorage: (storage: GuestThreadStorageV1) => void;
  resetWorkspaceComposer: () => void;
  focusWorkspaceInput: () => void;

  activeThreadId: string | null;
  guestModelId: string;

  setThreadError: Dispatch<SetStateAction<string | null>>;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
  setWorkspaceWantsNewChatMode: Dispatch<SetStateAction<boolean>>;
  setThreadMessages: Dispatch<SetStateAction<ThreadMessageT[]>>;
  setExportError: Dispatch<SetStateAction<string | null>>;
  setIsExporting: Dispatch<SetStateAction<boolean>>;
};

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useWebWorkspaceActionsController<SessionT, AttachmentT, ThreadMessageT extends ThreadMessage>(
  args: UseWebWorkspaceActionsControllerArgs<SessionT, AttachmentT, ThreadMessageT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const resetGuestThread = useCallback(() => {
    const current = argsRef.current;
    current.setThreadError(null);
    current.resetWorkspaceComposer();
    if (current.activeThreadId !== null) current.setActiveThreadId(null);
    current.setWorkspaceWantsNewChatMode(true);
    current.storeGuestThreadStorage({ v: 1, model_id: current.guestModelId, messages: [] });
    current.setThreadMessages([]);
    current.focusWorkspaceInput();
  }, []);

  const exportThreadsCsv = useCallback(async () => {
    const current = argsRef.current;
    const session = current.getSession();
    if (!session) return;
    if (!isConvexCloudThreadsEnabled()) {
      current.setExportError("Convex is required for cloud exports in this build.");
      return;
    }
    current.setExportError(null);
    current.setIsExporting(true);
    try {
      const threadRows = await listConvexCloudThreadRows(session as any);
      if (!threadRows) {
        throw new Error("Failed to load cloud threads from Convex.");
      }
      const rows = threadRows.map((row) => ({
        id: row.id,
        title: row.title ?? null,
        model_id: row.model_id ?? null,
        project_id: row.project_id ?? null,
        community_id: row.community_id ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
      const csv = current.buildCsv(
        ["id", "title", "model_id", "project_id", "community_id", "created_at", "updated_at"],
        rows,
      );
      current.downloadTextFile("polynet_threads.csv", csv);
    } catch (error) {
      current.setExportError(toErrorMessage(error, "Failed to export threads."));
    } finally {
      current.setIsExporting(false);
    }
  }, []);

  const exportMessagesCsv = useCallback(async () => {
    const current = argsRef.current;
    const session = current.getSession();
    if (!session) return;
    if (!isConvexCloudThreadsEnabled()) {
      current.setExportError("Convex is required for cloud exports in this build.");
      return;
    }
    current.setExportError(null);
    current.setIsExporting(true);
    try {
      const threads = await listConvexCloudThreadRows(session as any);
      if (!threads) {
        throw new Error("Failed to load cloud threads from Convex.");
      }
      const maxRows = 10_000;
      const rawRows: ThreadMessageT[] = [];
      for (const thread of threads) {
        const remaining = maxRows - rawRows.length;
        if (remaining <= 0) break;
        const threadRows = await listConvexCloudThreadMessagesByThreadKey({
          session: session as any,
          threadKey: thread.id,
          limit: remaining,
        });
        if (!threadRows) {
          throw new Error("Failed to load cloud thread messages from Convex.");
        }
        rawRows.push(...(threadRows as unknown as ThreadMessageT[]));
      }
      rawRows.sort((a, b) => {
        const threadA = String(a.thread_id ?? "");
        const threadB = String(b.thread_id ?? "");
        if (threadA !== threadB) return threadA.localeCompare(threadB);
        return Number(a.seq ?? 0) - Number(b.seq ?? 0);
      });
      const rows = rawRows.map((row) => ({
        id: row.id,
        thread_id: row.thread_id,
        seq: row.seq,
        role: row.role,
        content: current.parseMessageText(row.content_json),
        engine_id: row.engine_id ?? "",
        model_id: row.model_id ?? "",
        run_id: row.run_id ?? "",
        created_at: row.created_at,
      }));
      const csv = current.buildCsv(
        ["id", "thread_id", "seq", "role", "content", "engine_id", "model_id", "run_id", "created_at"],
        rows,
      );
      current.downloadTextFile("polynet_messages.csv", csv);
    } catch (error) {
      current.setExportError(toErrorMessage(error, "Failed to export messages."));
    } finally {
      current.setIsExporting(false);
    }
  }, []);

  const exportMemoryCsv = useCallback(async () => {
    const current = argsRef.current;
    const session = current.getSession();
    if (!session) return;
    current.setExportError(null);
    current.setIsExporting(true);
    try {
      const rows = (await listCloudPersonalMemoryRows({
        session,
        limit: 2000,
      })) as Array<Record<string, unknown>>;
      const csv = current.buildCsv(
        ["id", "scope", "scope_id", "pinned", "content", "created_at", "updated_at"],
        rows,
      );
      current.downloadTextFile("polynet_personal_memory.csv", csv);
    } catch (error) {
      current.setExportError(toErrorMessage(error, "Failed to export memory."));
    } finally {
      current.setIsExporting(false);
    }
  }, []);

  return {
    resetGuestThread,
    exportThreadsCsv,
    exportMessagesCsv,
    exportMemoryCsv,
  };
}
