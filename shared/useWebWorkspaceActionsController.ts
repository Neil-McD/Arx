import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

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
  getSupabaseUrl: () => string | null;
  getSupabaseAuthUid: (session: SessionT) => string;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;
  buildCsv: (headers: string[], rows: Array<Record<string, unknown>>) => string;
  downloadTextFile: (filename: string, content: string, mime?: string) => void;
  parseMessageText: (content: unknown) => string;
  storeGuestThreadStorage: (storage: GuestThreadStorageV1) => void;
  focusWorkspaceInput: () => void;

  activeThreadId: string | null;
  guestModelId: string;

  setThreadError: Dispatch<SetStateAction<string | null>>;
  setMessageInput: Dispatch<SetStateAction<string>>;
  setWorkspaceAttachments: Dispatch<SetStateAction<AttachmentT[]>>;
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
    current.setMessageInput("");
    current.setWorkspaceAttachments([]);
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
    const url = current.getSupabaseUrl();
    if (!url) return;
    current.setExportError(null);
    current.setIsExporting(true);
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/threads?select=id,title,engine_id,model_id,project_id,community_id,created_at,updated_at&order=updated_at.desc&limit=1000`,
        {},
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));
      const rows = (await response.json()) as Array<Record<string, unknown>>;
      const csv = current.buildCsv(
        ["id", "title", "engine_id", "model_id", "project_id", "community_id", "created_at", "updated_at"],
        rows,
      );
      current.downloadTextFile("arx_threads.csv", csv);
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
    const url = current.getSupabaseUrl();
    if (!url) return;
    current.setExportError(null);
    current.setIsExporting(true);
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/messages?select=id,thread_id,seq,role,content_json,engine_id,model_id,run_id,created_at&order=thread_id.asc,seq.asc&limit=10000`,
        {},
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));
      const rawRows = (await response.json()) as ThreadMessageT[];
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
      current.downloadTextFile("arx_messages.csv", csv);
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
    const url = current.getSupabaseUrl();
    if (!url) return;
    current.setExportError(null);
    current.setIsExporting(true);
    try {
      const userId = current.getSupabaseAuthUid(session);
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/personal_memory_items?select=id,content,scope,scope_id,pinned,created_at,updated_at&user_id=eq.${encodeURIComponent(userId)}&order=pinned.desc,updated_at.desc&limit=2000`,
        {},
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));
      const rows = (await response.json()) as Array<Record<string, unknown>>;
      const csv = current.buildCsv(
        ["id", "scope", "scope_id", "pinned", "content", "created_at", "updated_at"],
        rows,
      );
      current.downloadTextFile("arx_personal_memory.csv", csv);
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
