import { useEffect, type Dispatch, type SetStateAction } from "react";

export function useWebGuestThreadLifecycle<
  SupabaseSessionT,
  GuestStorageT extends { model_id: string },
  ThreadMessageT,
>(params: {
  supabaseSession: SupabaseSessionT | null;
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
  useEffect(() => {
    if (params.supabaseSession) return;
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
  }, [params.supabaseSession, params.publicRouteKind]);

  useEffect(() => {
    if (!params.supabaseSession) return;
    if (params.activeThreadId !== params.guestThreadId) return;
    params.setActiveThreadId(null);
    params.setThreadMessages([]);
  }, [params.supabaseSession, params.activeThreadId]);
}
