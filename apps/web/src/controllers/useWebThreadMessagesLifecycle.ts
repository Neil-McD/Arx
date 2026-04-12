import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

export function useWebThreadMessagesLifecycle<SessionT, ThreadMessageT>(params: {
  session: SessionT | null;
  activeThreadId: string | null;
  guestThreadId: string;
  isLoadingThreadRef: MutableRefObject<boolean>;
  workspacePinnedToBottomRef: MutableRefObject<boolean>;
  setIsWorkspaceAtBottom: Dispatch<SetStateAction<boolean>>;
  setLoadingThreadMessagesThreadId: Dispatch<SetStateAction<string | null>>;
  setThreadMessages: Dispatch<SetStateAction<ThreadMessageT[]>>;
  loadThreadMessages: (threadId: string, session: SessionT) => Promise<void>;
}) {
  const session = params.session;

  useEffect(() => {
    if (!session) {
      params.setLoadingThreadMessagesThreadId(null);
      return;
    }
    if (!params.activeThreadId || params.activeThreadId === params.guestThreadId) {
      params.setLoadingThreadMessagesThreadId(null);
      params.setThreadMessages([]);
      return;
    }
    const targetThreadId = params.activeThreadId;
    let cancelled = false;
    params.isLoadingThreadRef.current = true;
    params.workspacePinnedToBottomRef.current = true;
    params.setIsWorkspaceAtBottom(true);
    params.setLoadingThreadMessagesThreadId(targetThreadId);
    params.setThreadMessages([]);
    void (async () => {
      try {
        await params.loadThreadMessages(targetThreadId, session);
      } finally {
        if (!cancelled) {
          params.setLoadingThreadMessagesThreadId((current) => (current === targetThreadId ? null : current));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, params.activeThreadId, params.guestThreadId]);
}
