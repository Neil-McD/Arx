import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

type ThreadRecord = {
  id: string;
  title: string | null;
  engine_id: string;
  model_id: string | null;
  community_id: string | null;
  context_version: number;
  last_seq: number;
  created_at: number;
  updated_at: number;
};

type ModelToggle = {
  id: string;
  label: string;
  enabled: boolean;
};

type ModelRegistryListRow = {
  id: string;
  display_name: string | null;
  sort_order: number | null;
};

type UseWebThreadDataControllerArgs<SessionT, ThreadMessageT> = {
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;
  toEpochSeconds: (value: string) => number;
  formatModelLabel: (modelId: string | null | undefined) => string | null;

  activeThreadId: string | null;
  threadsHydratedRef: MutableRefObject<boolean>;
  workspaceWantsNewChatRef: MutableRefObject<boolean>;

  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
  setThreadError: Dispatch<SetStateAction<string | null>>;
  setThreads: Dispatch<SetStateAction<ThreadRecord[]>>;
  setThreadMessages: Dispatch<SetStateAction<ThreadMessageT[]>>;
  setModelToggles: Dispatch<SetStateAction<ModelToggle[]>>;
};

export function useWebThreadDataController<SessionT, ThreadMessageT>(
  args: UseWebThreadDataControllerArgs<SessionT, ThreadMessageT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadThreads = useCallback(async (session: SessionT) => {
    const current = argsRef.current;
    const url = current.getSupabaseUrl();
    if (!url) return;

    current.setThreadError(null);
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/threads?select=id,title,engine_id,model_id,community_id,context_version,created_at,updated_at,last_seq&engine_id=neq.community_chat&order=updated_at.desc&limit=200`,
        {},
        session,
      );
      if (!response.ok) {
        const message = await current.readSupabaseError(response);
        throw new Error(message);
      }
      const rows = (await response.json()) as Array<{
        id: string;
        title: string | null;
        engine_id: string;
        model_id: string | null;
        community_id: string | null;
        context_version: unknown;
        created_at: string;
        updated_at: string;
        last_seq: unknown;
      }>;
      const list: ThreadRecord[] = rows
        .filter((row) => (row.engine_id ?? "").trim() !== "community_chat")
        .map((row) => {
          const parsedLastSeq =
            typeof row.last_seq === "number"
              ? row.last_seq
              : typeof row.last_seq === "string"
                ? Number(row.last_seq)
                : Number.NaN;
          const parsedContextVersion =
            typeof row.context_version === "number"
              ? row.context_version
              : typeof row.context_version === "string"
                ? Number(row.context_version)
                : Number.NaN;
          return {
            id: row.id,
            title: row.title ?? null,
            engine_id: row.engine_id,
            model_id: row.model_id ?? null,
            community_id: row.community_id ?? null,
            context_version: Number.isFinite(parsedContextVersion) ? parsedContextVersion : 0,
            last_seq: Number.isFinite(parsedLastSeq) ? parsedLastSeq : 0,
            created_at: current.toEpochSeconds(row.created_at),
            updated_at: current.toEpochSeconds(row.updated_at),
          };
        });

      current.setThreads(list);
      const visible = list.filter((thread) => thread.last_seq > 0);

      if (!current.activeThreadId) {
        if (!current.threadsHydratedRef.current && !current.workspaceWantsNewChatRef.current) {
          current.setActiveThreadId(visible[0]?.id ?? null);
        }
        current.threadsHydratedRef.current = true;
        return;
      }

      const selected = list.find((thread) => thread.id === current.activeThreadId) ?? null;
      if (selected && selected.last_seq <= 0) {
        current.setActiveThreadId(visible[0]?.id ?? null);
      }
      current.threadsHydratedRef.current = true;
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load threads.";
      current.setThreadError(message);
      current.setThreads([]);
    }
  }, []);

  const loadThreadMessages = useCallback(async (threadId: string, session: SessionT) => {
    const current = argsRef.current;
    const url = current.getSupabaseUrl();
    if (!url) return;
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/messages?select=id,thread_id,seq,role,content_json,engine_id,model_id,run_id,created_at&thread_id=eq.${threadId}&order=seq.asc&limit=1000`,
        {},
        session,
      );
      if (!response.ok) {
        const message = await current.readSupabaseError(response);
        throw new Error(message);
      }
      const rows = (await response.json()) as ThreadMessageT[];
      current.setThreadMessages(rows);
    } catch (error) {
      console.warn("Failed to load messages:", error);
      current.setThreadMessages([]);
    }
  }, []);

  const loadModelRegistry = useCallback(async (session: SessionT): Promise<void> => {
    const current = argsRef.current;
    const url = current.getSupabaseUrl();
    if (!url) return;
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/model_registry?select=id,display_name,sort_order,enabled&enabled=eq.true&order=sort_order.asc,id.asc`,
        {},
        session,
      );
      if (!response.ok) return;
      const rows = (await response.json()) as Array<Partial<ModelRegistryListRow>>;
      const catalog = rows
        .map((row) => {
          const id = typeof row?.id === "string" ? row.id.trim() : "";
          if (!id) return null;
          const label =
            (typeof row.display_name === "string" ? row.display_name.trim() : "") ||
            current.formatModelLabel(id) ||
            id;
          return { id, label, enabled: true } satisfies ModelToggle;
        })
        .filter(Boolean) as ModelToggle[];

      if (!catalog.length) return;
      current.setModelToggles(catalog);
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
