import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { resolveCurrentSession } from "./ensureUsableSession";

import {
  createCloudPersonalMemoryItem,
  deleteCloudPersonalMemoryItem,
  updateCloudPersonalMemoryPinned,
} from "./cloudPersonalMemoryGateway";
import { saveCloudUserMemorySettings } from "./cloudUserSettingsGateway";

type UserMemorySettings = {
  memory_mode: "off" | "suggest" | "auto";
  remember_intent_enabled: boolean;
  agent_name: string;
  agent_soul: string;
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
  ensureSession?: () => Promise<SessionT | null>;
  requireSignIn: (intentInput?: unknown) => void;
  loadPersonalMemoryItems: () => Promise<void>;

  newPersonalMemoryContent: string;
  newPersonalMemoryScope: "global" | "workspace";
  newPersonalMemoryPinned: boolean;

  setIsLoadingUserMemorySettings: Dispatch<SetStateAction<boolean>>;
  setUserMemorySettings: Dispatch<SetStateAction<UserMemorySettings>>;

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
    const session = await resolveCurrentSession(current.getSession, current.ensureSession);
    if (!session) return;
    const normalizedNext = {
      ...next,
      agent_name: String(next.agent_name ?? "").trim(),
      agent_soul: String(next.agent_soul ?? "").trim(),
    };
    current.setIsLoadingUserMemorySettings(true);
    try {
      await saveCloudUserMemorySettings({
        session,
        memoryMode: normalizedNext.memory_mode,
        rememberIntentEnabled: Boolean(normalizedNext.remember_intent_enabled),
        agentName: normalizedNext.agent_name,
        agentSoul: normalizedNext.agent_soul,
      });
      current.setUserMemorySettings(normalizedNext);
    } catch (error) {
      console.warn("Failed to save memory settings:", error);
    } finally {
      current.setIsLoadingUserMemorySettings(false);
    }
  }, []);

  const createPersonalMemoryItemDirect = useCallback(
    async (params: { content: string; pinned: boolean }): Promise<PersonalMemoryItem | null> => {
      const current = argsRef.current;
      const content = params.content.trim();
      if (!content) return null;
      const session = await resolveCurrentSession(current.getSession, current.ensureSession);
      if (!session) return null;
      const rows = (await createCloudPersonalMemoryItem({
        session,
        content,
        scope: "global",
        scopeId: null,
        pinned: Boolean(params.pinned),
        returnRepresentation: true,
      })) as PersonalMemoryItem[] | null;
      return rows?.[0] ?? null;
    },
    [],
  );

  const handleCreatePersonalMemoryItem = useCallback(async (): Promise<void> => {
    const current = argsRef.current;
    const content = current.newPersonalMemoryContent.trim();
    if (!content) return;
    current.setPersonalMemoryError(null);
    try {
      const session = await resolveCurrentSession(current.getSession, current.ensureSession);
      if (!session) {
        current.requireSignIn();
        return;
      }
      await createCloudPersonalMemoryItem({
        session,
        content,
        scope: current.newPersonalMemoryScope,
        scopeId: null,
        pinned: Boolean(current.newPersonalMemoryPinned),
      });
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
      const session = await resolveCurrentSession(current.getSession, current.ensureSession);
      if (!session) {
        current.requireSignIn();
        return;
      }
      await updateCloudPersonalMemoryPinned({
        session,
        id: item.id,
        pinned: !item.pinned,
      });
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
      const session = await resolveCurrentSession(current.getSession, current.ensureSession);
      if (!session) {
        current.requireSignIn();
        return;
      }
      await deleteCloudPersonalMemoryItem({
        session,
        id,
      });
      await current.loadPersonalMemoryItems();
    } catch (error) {
      const message =
        typeof error === "string" ? error : error instanceof Error ? error.message : "Unknown error";
      current.setPersonalMemoryError(message);
    }
  }, []);

  return {
    saveUserMemorySettings,
    createPersonalMemoryItemDirect,
    handleCreatePersonalMemoryItem,
    handleTogglePersonalMemoryPinned,
    handleDeletePersonalMemoryItem,
  };
}
