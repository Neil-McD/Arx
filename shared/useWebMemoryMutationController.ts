import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

type UserMemorySettings = {
  memory_mode: "off" | "suggest" | "auto";
  remember_intent_enabled: boolean;
};

type UserModelSettings = {
  system_prompt: string;
};

type PersonalMemoryItem = {
  id: string;
  content: string;
  scope: "global" | "workspace";
  scope_id: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

type UseWebMemoryMutationControllerArgs<SessionT> = {
  getSession: () => SessionT | null;
  getSupabaseUrl: () => string | null;
  getSupabaseAuthUid: (session: SessionT) => string;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;
  openAuthGate: (intentInput?: unknown) => void;
  loadPersonalMemoryItems: () => Promise<void>;

  newPersonalMemoryContent: string;
  newPersonalMemoryScope: "global" | "workspace";
  newPersonalMemoryPinned: boolean;

  setIsLoadingUserMemorySettings: Dispatch<SetStateAction<boolean>>;
  setUserMemorySettings: Dispatch<SetStateAction<UserMemorySettings>>;

  setIsSavingUserModelSettings: Dispatch<SetStateAction<boolean>>;
  setUserModelSettings: Dispatch<SetStateAction<UserModelSettings>>;
  setUserModelSettingsError: Dispatch<SetStateAction<string | null>>;

  setPersonalMemoryError: Dispatch<SetStateAction<string | null>>;
  setNewPersonalMemoryContent: Dispatch<SetStateAction<string>>;
  setNewPersonalMemoryPinned: Dispatch<SetStateAction<boolean>>;
};

export function useWebMemoryMutationController<SessionT>(
  args: UseWebMemoryMutationControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const saveUserMemorySettings = useCallback(async (next: UserMemorySettings): Promise<void> => {
    const current = argsRef.current;
    const session = current.getSession();
    const url = session ? current.getSupabaseUrl() : null;
    if (!session || !url) return;
    current.setIsLoadingUserMemorySettings(true);
    try {
      const userId = current.getSupabaseAuthUid(session);
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/user_memory_settings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({
            user_id: userId,
            memory_mode: next.memory_mode,
            remember_intent_enabled: Boolean(next.remember_intent_enabled),
          }),
        },
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));
      current.setUserMemorySettings(next);
    } catch (error) {
      console.warn("Failed to save memory settings:", error);
    } finally {
      current.setIsLoadingUserMemorySettings(false);
    }
  }, []);

  const saveUserModelSettings = useCallback(async (next: UserModelSettings): Promise<void> => {
    const current = argsRef.current;
    const session = current.getSession();
    const url = session ? current.getSupabaseUrl() : null;
    if (!session || !url) return;
    current.setIsSavingUserModelSettings(true);
    current.setUserModelSettingsError(null);
    try {
      const userId = current.getSupabaseAuthUid(session);
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/user_model_settings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            user_id: userId,
            system_prompt: String(next.system_prompt ?? ""),
          }),
        },
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));
      current.setUserModelSettings({ system_prompt: String(next.system_prompt ?? "") });
    } catch (error) {
      current.setUserModelSettingsError(
        typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to save system prompt",
      );
    } finally {
      current.setIsSavingUserModelSettings(false);
    }
  }, []);

  const createPersonalMemoryItemDirect = useCallback(
    async (params: { content: string; pinned: boolean }): Promise<PersonalMemoryItem | null> => {
      const current = argsRef.current;
      const content = params.content.trim();
      if (!content) return null;
      const session = current.getSession();
      const url = session ? current.getSupabaseUrl() : null;
      if (!session || !url) return null;
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/personal_memory_items?select=id,content,scope,scope_id,pinned,created_at,updated_at`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({
            user_id: current.getSupabaseAuthUid(session),
            content,
            scope: "global",
            scope_id: null,
            pinned: Boolean(params.pinned),
          }),
        },
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));
      const rows = (await response.json()) as PersonalMemoryItem[];
      return rows[0] ?? null;
    },
    [],
  );

  const handleCreatePersonalMemoryItem = useCallback(async (): Promise<void> => {
    const current = argsRef.current;
    const content = current.newPersonalMemoryContent.trim();
    if (!content) return;
    current.setPersonalMemoryError(null);
    try {
      const session = current.getSession();
      const url = session ? current.getSupabaseUrl() : null;
      if (!session || !url) {
        current.openAuthGate({ reason: "create_memory", payload: { content, pinned: Boolean(current.newPersonalMemoryPinned) } });
        return;
      }
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/personal_memory_items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            user_id: current.getSupabaseAuthUid(session),
            content,
            scope: current.newPersonalMemoryScope,
            scope_id: null,
            pinned: Boolean(current.newPersonalMemoryPinned),
          }),
        },
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));
      current.setNewPersonalMemoryContent("");
      current.setNewPersonalMemoryPinned(false);
      await current.loadPersonalMemoryItems();
    } catch (error) {
      const message =
        typeof error === "string" ? error : error instanceof Error ? error.message : "Unknown error";
      current.setPersonalMemoryError(message);
    }
  }, []);

  const handleTogglePersonalMemoryPinned = useCallback(async (item: PersonalMemoryItem): Promise<void> => {
    const current = argsRef.current;
    current.setPersonalMemoryError(null);
    try {
      const session = current.getSession();
      const url = session ? current.getSupabaseUrl() : null;
      if (!session || !url) {
        current.openAuthGate({ reason: "toggle_memory_pinned", payload: { id: item.id, pinned: !item.pinned } });
        return;
      }
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/personal_memory_items?id=eq.${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            pinned: !item.pinned,
            updated_at: new Date().toISOString(),
          }),
        },
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));
      await current.loadPersonalMemoryItems();
    } catch (error) {
      const message =
        typeof error === "string" ? error : error instanceof Error ? error.message : "Unknown error";
      current.setPersonalMemoryError(message);
    }
  }, []);

  const handleDeletePersonalMemoryItem = useCallback(async (id: string): Promise<void> => {
    const current = argsRef.current;
    current.setPersonalMemoryError(null);
    try {
      const session = current.getSession();
      const url = session ? current.getSupabaseUrl() : null;
      if (!session || !url) {
        current.openAuthGate({ reason: "delete_memory", payload: { id } });
        return;
      }
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/personal_memory_items?id=eq.${encodeURIComponent(id)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));
      await current.loadPersonalMemoryItems();
    } catch (error) {
      const message =
        typeof error === "string" ? error : error instanceof Error ? error.message : "Unknown error";
      current.setPersonalMemoryError(message);
    }
  }, []);

  return {
    saveUserMemorySettings,
    saveUserModelSettings,
    createPersonalMemoryItemDirect,
    handleCreatePersonalMemoryItem,
    handleTogglePersonalMemoryPinned,
    handleDeletePersonalMemoryItem,
  };
}
