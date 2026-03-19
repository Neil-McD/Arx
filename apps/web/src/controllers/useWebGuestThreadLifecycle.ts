import { useEffect, type Dispatch, type SetStateAction } from "react";

export function useWebGuestThreadLifecycle<
  CloudSessionT,
  GuestStorageT extends { model_id: string },
  ThreadMessageT,
>(params: {
  session: CloudSessionT | null;
  publicRouteKind: string;
  activeThreadId: string | null;
  workspaceWantsNewChat: boolean;
  guestThreadId: string;
  loadGuestThreadStorage: () => GuestStorageT;
  guestStoredToThreadMessages: (storage: GuestStorageT) => ThreadMessageT[];
  applyGuestWorkspaceState: (state: { guestThreadId: string; hasMessages: boolean }) => void;
  syncWorkspaceSelection: (state: { threadId: string | null; wantsNewChat: boolean }) => void;
  setGuestModelId: Dispatch<SetStateAction<string>>;
  setThreadMessages: Dispatch<SetStateAction<ThreadMessageT[]>>;
}) {
  const session = params.session;

  useEffect(() => {
    if (session) return;
    if (params.publicRouteKind !== "app") return;
    if (params.activeThreadId && params.activeThreadId !== params.guestThreadId) return;
    if (params.workspaceWantsNewChat) return;
    const storage = params.loadGuestThreadStorage();
    params.setGuestModelId(storage.model_id);
    const guestMessages = params.guestStoredToThreadMessages(storage);
    params.applyGuestWorkspaceState({
      guestThreadId: params.guestThreadId,
      hasMessages: guestMessages.length > 0,
    });
    if (guestMessages.length === 0) {
      params.setThreadMessages([]);
      return;
    }
    params.setThreadMessages(guestMessages);
  }, [
    session,
    params.publicRouteKind,
    params.activeThreadId,
    params.guestThreadId,
    params.workspaceWantsNewChat,
  ]);

  useEffect(() => {
    if (!session) return;
    if (params.activeThreadId !== params.guestThreadId) return;
    params.syncWorkspaceSelection({ threadId: null, wantsNewChat: true });
    params.setThreadMessages([]);
  }, [session, params.activeThreadId, params.guestThreadId]);
}
