import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { resolveCurrentSession } from "./ensureUsableSession";

import { listCloudPersonalMemoryRowsByScopes } from "./cloudPersonalMemoryGateway";
import { loadCloudUserMemorySettings } from "./cloudUserSettingsGateway";

type UserMemorySettings = {
  memory_mode: "off" | "suggest" | "auto";
  remember_intent_enabled: boolean;
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
  ensureSession?: () => Promise<SessionT | null>;
  setIsLoadingUserMemorySettings: Dispatch<SetStateAction<boolean>>;
  setUserMemorySettings: Dispatch<SetStateAction<UserMemorySettings>>;

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

function normalizeMemoryMode(value: unknown): UserMemorySettings["memory_mode"] {
  if (value === "off" || value === "suggest" || value === "auto") return value;
  return "auto";
}

export function useWebMemorySettingsDataController<SessionT>(
  args: UseWebMemorySettingsDataControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const fetchCloudPersonalMemoryItems = useCallback(async (session: SessionT): Promise<PersonalMemoryItem[]> => {
    const current = argsRef.current;
    const rows = await listCloudPersonalMemoryRowsByScopes({
      session,
      limitPerScope: 1000,
    });
    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      scope: row.scope === "workspace" ? "workspace" : "global",
      scope_id: row.scope_id ?? null,
      pinned: Boolean(row.pinned),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }, []);

  const loadUserMemorySettings = useCallback(async (session: SessionT): Promise<void> => {
    const current = argsRef.current;
    current.setIsLoadingUserMemorySettings(true);
    try {
      const usableSession = await resolveCurrentSession(() => session, current.ensureSession);
      if (!usableSession) {
        current.setUserMemorySettings({ memory_mode: "auto", remember_intent_enabled: true });
        return;
      }
      const row = (await loadCloudUserMemorySettings({
        session: usableSession,
      })) as Partial<UserMemorySettings> | null;
      current.setUserMemorySettings({
        memory_mode: normalizeMemoryMode(row?.memory_mode),
        remember_intent_enabled: row?.remember_intent_enabled !== false,
      });
    } catch {
      current.setUserMemorySettings({ memory_mode: "auto", remember_intent_enabled: true });
    } finally {
      current.setIsLoadingUserMemorySettings(false);
    }
  }, []);

  const loadPersonalMemoryItems = useCallback(async (): Promise<void> => {
    const current = argsRef.current;
    current.setIsLoadingPersonalMemory(true);
    current.setPersonalMemoryError(null);
    try {
      const session = await resolveCurrentSession(current.getSession, current.ensureSession);
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
        const session = await resolveCurrentSession(current.getSession, current.ensureSession);
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
    loadPersonalMemoryItems,
    searchPersonalMemoryItems,
  };
}
