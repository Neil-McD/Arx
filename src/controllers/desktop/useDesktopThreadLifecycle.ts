import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { RuntimeClient } from "../../runtime/arp/client";
import type { ThreadServiceThread } from "../../../shared/threadService";

type ThreadLifecycleThread = {
  id: string;
  title: string | null;
  engine_id: string;
  model_id: string | null;
  thread_lane: "chat" | "agent";
  storage_mode: "cloud" | "local";
  project_id: string | null;
  community_id: string | null;
  context_version?: number;
  workspace_path: string | null;
  created_at: number;
  updated_at: number;
  last_event_at: number | null;
  last_seq?: number;
};

type ThreadLifecycleMessage = {
  id: string;
  session_id: string;
  role: string;
  content_json: string;
  created_at: number;
};

type UseDesktopThreadLifecycleArgs<ThreadT extends ThreadLifecycleThread, MessageT extends ThreadLifecycleMessage> = {
  activeThreadId: string | null;
  activeModelId: string | null;
  effectiveCwd: string;
  threads: ThreadT[];
  runtimeClient: RuntimeClient;
  persistThread: (thread: ThreadT) => Promise<ThreadServiceThread | null>;
  deleteThreadRecord: (threadId: string) => Promise<void>;
  createDraftThreadRecord: (threadId: string, nowSec: number) => ThreadT;
  onMissingModel: () => void;
  setThreads: Dispatch<SetStateAction<ThreadT[]>>;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
  setMessages: Dispatch<SetStateAction<MessageT[]>>;
  resetThreadViewStateForDraft: () => void;
  focusChatInput: () => void;
};

export function useDesktopThreadLifecycle<
  ThreadT extends ThreadLifecycleThread,
  MessageT extends ThreadLifecycleMessage,
>(args: UseDesktopThreadLifecycleArgs<ThreadT, MessageT>) {
  const {
    activeThreadId,
    activeModelId,
    effectiveCwd,
    threads,
    runtimeClient,
    persistThread,
    deleteThreadRecord,
    createDraftThreadRecord,
    onMissingModel,
    setThreads,
    setActiveThreadId,
    setMessages,
    resetThreadViewStateForDraft,
    focusChatInput,
  } = args;

  const lastThreadWorkspaceRef = useRef<string | null>(null);
  const activeThread = activeThreadId
    ? threads.find((thread) => thread.id === activeThreadId) ?? null
    : null;

  useEffect(() => {
    if (!activeThreadId) return;
    if ((activeThread?.storage_mode ?? "local") !== "local") return;
    const nextWorkspace = effectiveCwd;
    if (!nextWorkspace) return;
    if (lastThreadWorkspaceRef.current === nextWorkspace) return;
    lastThreadWorkspaceRef.current = nextWorkspace;
    void runtimeClient.setThreadWorkspace(activeThreadId, nextWorkspace).catch(() => {
      // Non-fatal; workspace is best-effort metadata.
    });
  }, [activeThread?.storage_mode, activeThreadId, effectiveCwd, runtimeClient]);

  const enterDraftThread = useCallback(() => {
    // ChatGPT-like: "New chat" is a draft (no thread row until first send).
    if (!activeThreadId) {
      focusChatInput();
      return;
    }
    setActiveThreadId(null);
    resetThreadViewStateForDraft();
    focusChatInput();
  }, [activeThreadId, focusChatInput, resetThreadViewStateForDraft, setActiveThreadId]);

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      try {
        await deleteThreadRecord(threadId);
      } catch {
        return;
      }
      setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
      if (activeThreadId === threadId) {
        const remaining = threads.filter((thread) => thread.id !== threadId);
        const selectable = remaining.filter((thread) => (thread.last_seq ?? 0) > 0);
        setActiveThreadId(selectable.length > 0 ? selectable[0].id : null);
        setMessages([]);
      }
    },
    [activeThreadId, deleteThreadRecord, setActiveThreadId, setMessages, setThreads, threads],
  );

  const ensureThreadId = useCallback(async (): Promise<string | null> => {
    if (activeThreadId) return activeThreadId;
    if (!activeModelId) {
      onMissingModel();
      return null;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const threadId = crypto.randomUUID();
    const thread = createDraftThreadRecord(threadId, nowSec);

    let persistedThread: ThreadT | null = null;
    try {
      persistedThread = (await persistThread(thread)) as ThreadT | null;
    } catch {
      return null;
    }
    if (!persistedThread) return null;

    setThreads((prev) => [persistedThread, ...prev.filter((item) => item.id !== persistedThread.id)]);
    setActiveThreadId(persistedThread.id);

    if (persistedThread.storage_mode === "local") {
      const nextWorkspace = effectiveCwd;
      if (nextWorkspace) {
        try {
          await runtimeClient.setThreadWorkspace(persistedThread.id, nextWorkspace);
          lastThreadWorkspaceRef.current = nextWorkspace;
        } catch {
          // best-effort
        }
      } else {
        lastThreadWorkspaceRef.current = null;
      }
    } else {
      lastThreadWorkspaceRef.current = null;
    }

    return persistedThread.id;
  }, [
    activeModelId,
    activeThreadId,
    createDraftThreadRecord,
    persistThread,
    effectiveCwd,
    onMissingModel,
    runtimeClient,
    setActiveThreadId,
    setThreads,
  ]);

  return {
    ensureThreadId,
    enterDraftThread,
    handleDeleteThread,
  };
}
