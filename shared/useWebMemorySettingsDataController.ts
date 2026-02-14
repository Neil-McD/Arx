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

type UseWebMemorySettingsDataControllerArgs<SessionT> = {
  getSession: () => SessionT | null;
  getSupabaseUrl: () => string | null;
  getSupabaseAuthUid: (session: SessionT) => string;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;

  setIsLoadingUserMemorySettings: Dispatch<SetStateAction<boolean>>;
  setUserMemorySettings: Dispatch<SetStateAction<UserMemorySettings>>;

  setIsLoadingUserModelSettings: Dispatch<SetStateAction<boolean>>;
  setUserModelSettings: Dispatch<SetStateAction<UserModelSettings>>;
  setSystemPromptDraft: Dispatch<SetStateAction<string>>;
  setUserModelSettingsError: Dispatch<SetStateAction<string | null>>;

  setIsLoadingPersonalMemory: Dispatch<SetStateAction<boolean>>;
  setPersonalMemoryError: Dispatch<SetStateAction<string | null>>;
  setPersonalMemoryItems: Dispatch<SetStateAction<PersonalMemoryItem[]>>;
};

function sortPersonalMemory(items: PersonalMemoryItem[]): PersonalMemoryItem[] {
  return [...items].sort((left, right) => {
    const pinnedDiff = Number(right.pinned) - Number(left.pinned);
    if (pinnedDiff !== 0) return pinnedDiff;
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
  });
}

export function useWebMemorySettingsDataController<SessionT>(
  args: UseWebMemorySettingsDataControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const fetchCloudPersonalMemoryItems = useCallback(async (session: SessionT): Promise<PersonalMemoryItem[]> => {
    const current = argsRef.current;
    const url = current.getSupabaseUrl();
    if (!url) return [];

    const userId = current.getSupabaseAuthUid(session);
    const baseSelect = "id,content,scope,scope_id,pinned,created_at,updated_at";

    const fetchRows = async (scope: "global" | "workspace"): Promise<PersonalMemoryItem[]> => {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/personal_memory_items?select=${baseSelect}` +
          `&user_id=eq.${encodeURIComponent(userId)}` +
          `&scope=eq.${scope}` +
          `&order=pinned.desc,updated_at.desc` +
          `&limit=1000`,
        {},
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));
      const rows = (await response.json()) as Array<{
        id: string;
        content: string;
        scope: string;
        scope_id: string | null;
        pinned: boolean;
        created_at: string;
        updated_at: string;
      }>;
      return rows.map((row) => ({
        id: row.id,
        content: row.content,
        scope: row.scope === "workspace" ? "workspace" : "global",
        scope_id: row.scope_id ?? null,
        pinned: Boolean(row.pinned),
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
    };

    const [globalRows, workspaceRows] = await Promise.all([fetchRows("global"), fetchRows("workspace")]);
    return [...globalRows, ...workspaceRows];
  }, []);

  const loadUserMemorySettings = useCallback(async (session: SessionT): Promise<void> => {
    const current = argsRef.current;
    const url = current.getSupabaseUrl();
    if (!url) return;
    current.setIsLoadingUserMemorySettings(true);
    try {
      const userId = current.getSupabaseAuthUid(session);
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/user_memory_settings?select=memory_mode,remember_intent_enabled&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
        {},
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));
      const rows = (await response.json()) as Array<Partial<UserMemorySettings>>;
      const row = rows[0];
      const mode = row?.memory_mode;
      current.setUserMemorySettings({
        memory_mode: mode === "suggest" || mode === "auto" ? mode : "off",
        remember_intent_enabled: row?.remember_intent_enabled !== false,
      });
    } catch {
      current.setUserMemorySettings({ memory_mode: "off", remember_intent_enabled: true });
    } finally {
      current.setIsLoadingUserMemorySettings(false);
    }
  }, []);

  const loadUserModelSettings = useCallback(async (session: SessionT): Promise<void> => {
    const current = argsRef.current;
    const url = current.getSupabaseUrl();
    if (!url) return;
    current.setIsLoadingUserModelSettings(true);
    current.setUserModelSettingsError(null);
    try {
      const userId = current.getSupabaseAuthUid(session);
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/user_model_settings?select=system_prompt&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
        {},
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));
      const rows = (await response.json()) as Array<Partial<UserModelSettings>>;
      const prompt = typeof rows[0]?.system_prompt === "string" ? rows[0]!.system_prompt! : "";
      current.setUserModelSettings({ system_prompt: prompt });
      current.setSystemPromptDraft(prompt);
    } catch (error) {
      current.setUserModelSettings({ system_prompt: "" });
      current.setSystemPromptDraft("");
      current.setUserModelSettingsError(
        typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to load system prompt",
      );
    } finally {
      current.setIsLoadingUserModelSettings(false);
    }
  }, []);

  const loadPersonalMemoryItems = useCallback(async (): Promise<void> => {
    const current = argsRef.current;
    current.setIsLoadingPersonalMemory(true);
    current.setPersonalMemoryError(null);
    try {
      const session = current.getSession();
      if (!session) {
        current.setPersonalMemoryItems([]);
        return;
      }
      const items = await fetchCloudPersonalMemoryItems(session);
      current.setPersonalMemoryItems(sortPersonalMemory(items));
    } catch (error) {
      const message =
        typeof error === "string" ? error : error instanceof Error ? error.message : "Unknown error";
      current.setPersonalMemoryError(message);
    } finally {
      current.setIsLoadingPersonalMemory(false);
    }
  }, [fetchCloudPersonalMemoryItems]);

  const searchPersonalMemoryItems = useCallback(
    async (query: string): Promise<void> => {
      const current = argsRef.current;
      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        await loadPersonalMemoryItems();
        return;
      }
      current.setIsLoadingPersonalMemory(true);
      current.setPersonalMemoryError(null);
      try {
        const session = current.getSession();
        if (!session) {
          current.setPersonalMemoryItems([]);
          return;
        }
        const items = await fetchCloudPersonalMemoryItems(session);
        const needle = normalizedQuery.toLowerCase();
        const filtered = items.filter((item) => item.content.toLowerCase().includes(needle));
        current.setPersonalMemoryItems(sortPersonalMemory(filtered));
      } catch (error) {
        const message =
          typeof error === "string" ? error : error instanceof Error ? error.message : "Unknown error";
        current.setPersonalMemoryError(message);
      } finally {
        current.setIsLoadingPersonalMemory(false);
      }
    },
    [fetchCloudPersonalMemoryItems, loadPersonalMemoryItems],
  );

  return {
    loadUserMemorySettings,
    loadUserModelSettings,
    loadPersonalMemoryItems,
    searchPersonalMemoryItems,
  };
}
