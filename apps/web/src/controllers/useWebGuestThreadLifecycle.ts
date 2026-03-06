import { useEffect, type Dispatch, type SetStateAction } from "react";

export function useWebGuestThreadLifecycle<
  CloudSessionT,
  GuestStorageT extends { model_id: string },
  ThreadMessageT,
>(params: {
  session: CloudSessionT | null;
  publicRouteKind: string;
  activeThreadId: string | null;
  guestThreadId: string;
  loadGuestThreadStorage: () => GuestStorageT;
  guestStoredToThreadMessages: (storage: GuestStorageT) => ThreadMessageT[];
  setGuestModelId: Dispatch<SetStateAction<string>>;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
  setWorkspaceWantsNewChatMode: Dispatch<SetStateAction<boolean>>;
  setThreadMessages: Dispatch<SetStateAction<ThreadMessageT[]>>;
}) {
  const session = params.session;

  useEffect(() => {
    if (session) return;
    if (params.publicRouteKind !== "app") return;
    const storage = params.loadGuestThreadStorage();
    params.setGuestModelId(storage.model_id);
    const guestMessages = params.guestStoredToThreadMessages(storage);
    if (guestMessages.length === 0) {
      if (params.activeThreadId !== null) params.setActiveThreadId(null);
      params.setWorkspaceWantsNewChatMode(true);
      params.setThreadMessages([]);
      return;
    }
    if (params.activeThreadId !== params.guestThreadId) params.setActiveThreadId(params.guestThreadId);
    params.setWorkspaceWantsNewChatMode(false);
    params.setThreadMessages(guestMessages);
  }, [session, params.publicRouteKind]);

  useEffect(() => {
    if (!session) return;
    if (params.activeThreadId !== params.guestThreadId) return;
    params.setActiveThreadId(null);
    params.setThreadMessages([]);
  }, [session, params.activeThreadId]);
}
