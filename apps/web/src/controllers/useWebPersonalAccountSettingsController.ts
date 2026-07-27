import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { buildCsv } from "../../../../shared/contentFormatting";
import { downloadTextFile } from "../../../../shared/chatUi";
import { parseMessageText } from "../../../../shared/messageMetadataUi";
import { useWebAccountDataExportController } from "../../../../shared/useWebAccountDataExportController";
import { useWebMemoryMutationController } from "../../../../shared/useWebMemoryMutationController";
import { useWebMemorySettingsDataController } from "../../../../shared/useWebMemorySettingsDataController";
import {
  normalizeImportedMemoryContentKey,
  parseExternalMemoryImport,
  type ExternalMemoryImportItem,
} from "../../../../shared/externalMemoryImport";

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

type UseWebPersonalAccountSettingsControllerParams<SessionT> = {
  session: SessionT | null;
  isAccountSettingsActive: boolean;
  getSession: () => SessionT | null;
  ensureSession: () => Promise<SessionT | null>;
  requireSignIn: (intentInput?: unknown) => void;
  onUserMemorySettingsSaved: () => Promise<unknown> | unknown;
};

const DEFAULT_USER_MEMORY_SETTINGS: UserMemorySettings = {
  memory_mode: "auto",
  remember_intent_enabled: true,
  agent_name: "",
  agent_soul: "",
};

function bindToActiveSession<T>(
  activeSessionRef: { current: boolean },
  dispatch: Dispatch<SetStateAction<T>>,
): Dispatch<SetStateAction<T>> {
  return (next) => {
    if (!activeSessionRef.current) return;
    dispatch(next);
  };
}

export function useWebPersonalAccountSettingsController<SessionT>(
  params: UseWebPersonalAccountSettingsControllerParams<SessionT>,
) {
  const [userMemorySettings, setUserMemorySettings] =
    useState<UserMemorySettings>(DEFAULT_USER_MEMORY_SETTINGS);
  const [isLoadingUserMemorySettings, setIsLoadingUserMemorySettings] =
    useState(false);
  const [personalMemoryItems, setPersonalMemoryItems] = useState<
    PersonalMemoryItem[]
  >([]);
  const [personalMemoryQuery, setPersonalMemoryQuery] = useState("");
  const [personalMemoryError, setPersonalMemoryError] = useState<string | null>(
    null,
  );
  const [isLoadingPersonalMemory, setIsLoadingPersonalMemory] = useState(false);
  const [newPersonalMemoryContent, setNewPersonalMemoryContent] = useState("");
  const [newPersonalMemoryPinned, setNewPersonalMemoryPinned] = useState(false);
  const [isMemoryImportModalOpen, setIsMemoryImportModalOpen] = useState(false);
  const [memoryImportText, setMemoryImportText] = useState("");
  const [memoryImportError, setMemoryImportError] = useState<string | null>(null);
  const [isImportingMemory, setIsImportingMemory] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const activeSessionRef = useRef(Boolean(params.session));
  activeSessionRef.current = Boolean(params.session);
  const forActiveSession = <T,>(dispatch: Dispatch<SetStateAction<T>>) =>
    bindToActiveSession(activeSessionRef, dispatch);

  const memoryImportPlan = useMemo(() => {
    const parsedItems = parseExternalMemoryImport(memoryImportText);
    const existingKeys = new Set(
      personalMemoryItems.map((item) =>
        normalizeImportedMemoryContentKey(item.content),
      ),
    );
    const uniqueKeys = new Set<string>();
    const uniqueItems: ExternalMemoryImportItem[] = [];
    let duplicateCount = 0;
    for (const item of parsedItems) {
      const key = normalizeImportedMemoryContentKey(item.memoryContent);
      if (!key) continue;
      if (existingKeys.has(key) || uniqueKeys.has(key)) {
        duplicateCount += 1;
        continue;
      }
      uniqueKeys.add(key);
      uniqueItems.push(item);
    }
    return { parsedItems, duplicateCount, uniqueItems };
  }, [memoryImportText, personalMemoryItems]);

  const resetMemoryImportModal = useCallback(() => {
    setIsMemoryImportModalOpen(false);
    setMemoryImportText("");
    setMemoryImportError(null);
  }, []);

  const closeMemoryImportModal = useCallback(() => {
    if (isImportingMemory) return;
    resetMemoryImportModal();
  }, [isImportingMemory, resetMemoryImportModal]);

  const {
    loadUserMemorySettings,
    loadPersonalMemoryItems,
    searchPersonalMemoryItems,
  } = useWebMemorySettingsDataController<SessionT>({
    getSession: params.getSession,
    ensureSession: params.ensureSession,
    setIsLoadingUserMemorySettings: forActiveSession(
      setIsLoadingUserMemorySettings,
    ),
    setUserMemorySettings: forActiveSession(setUserMemorySettings),
    setIsLoadingPersonalMemory: forActiveSession(setIsLoadingPersonalMemory),
    setPersonalMemoryError: forActiveSession(setPersonalMemoryError),
    setPersonalMemoryItems: forActiveSession(setPersonalMemoryItems),
  });

  const {
    saveUserMemorySettings,
    createPersonalMemoryItemDirect,
    handleCreatePersonalMemoryItem,
    handleTogglePersonalMemoryPinned,
    handleDeletePersonalMemoryItem,
  } = useWebMemoryMutationController<SessionT>({
    getSession: params.getSession,
    ensureSession: params.ensureSession,
    requireSignIn: params.requireSignIn,
    loadPersonalMemoryItems,
    newPersonalMemoryContent,
    newPersonalMemoryScope: "global",
    newPersonalMemoryPinned,
    setIsLoadingUserMemorySettings: forActiveSession(
      setIsLoadingUserMemorySettings,
    ),
    setUserMemorySettings: forActiveSession(setUserMemorySettings),
    setPersonalMemoryError: forActiveSession(setPersonalMemoryError),
    setNewPersonalMemoryContent: forActiveSession(
      setNewPersonalMemoryContent,
    ),
    setNewPersonalMemoryPinned: forActiveSession(setNewPersonalMemoryPinned),
  });

  const { exportThreadsCsv, exportMessagesCsv, exportMemoryCsv } =
    useWebAccountDataExportController<SessionT>({
      getSession: params.getSession,
      buildCsv,
      downloadTextFile,
      parseMessageText,
      setExportError: forActiveSession(setExportError),
      setIsExporting: forActiveSession(setIsExporting),
    });

  const saveUserMemorySettingsAndRefreshSetup = useCallback(
    async (next: UserMemorySettings): Promise<void> => {
      await saveUserMemorySettings(next);
      await params.onUserMemorySettingsSaved();
    },
    [params.onUserMemorySettingsSaved, saveUserMemorySettings],
  );

  const importExternalMemory = useCallback(async (): Promise<{
    importedCount: number;
    duplicateCount: number;
  } | null> => {
    if (!params.session) {
      params.requireSignIn();
      return null;
    }
    const importItems = memoryImportPlan.uniqueItems;
    if (importItems.length === 0) {
      setMemoryImportError(
        memoryImportPlan.parsedItems.length === 0
          ? "No memories were found in that export."
          : "All parsed memories already exist.",
      );
      return null;
    }
    setMemoryImportError(null);
    setIsImportingMemory(true);
    try {
      let importedCount = 0;
      for (const item of importItems) {
        const created = await createPersonalMemoryItemDirect({
          content: item.memoryContent,
          pinned: false,
        });
        if (created) importedCount += 1;
      }
      await loadPersonalMemoryItems();
      const duplicateCount = memoryImportPlan.duplicateCount;
      resetMemoryImportModal();
      return { importedCount, duplicateCount };
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to import memory.";
      setMemoryImportError(message);
      return null;
    } finally {
      setIsImportingMemory(false);
    }
  }, [
    createPersonalMemoryItemDirect,
    loadPersonalMemoryItems,
    memoryImportPlan,
    params,
    resetMemoryImportModal,
  ]);

  useEffect(() => {
    if (!params.session) {
      setUserMemorySettings(DEFAULT_USER_MEMORY_SETTINGS);
      setIsLoadingUserMemorySettings(false);
      setPersonalMemoryItems([]);
      setPersonalMemoryQuery("");
      setPersonalMemoryError(null);
      setIsLoadingPersonalMemory(false);
      setNewPersonalMemoryContent("");
      setNewPersonalMemoryPinned(false);
      setIsMemoryImportModalOpen(false);
      setMemoryImportText("");
      setMemoryImportError(null);
      setIsImportingMemory(false);
      setExportError(null);
      setIsExporting(false);
      return;
    }
    void loadUserMemorySettings(params.session);
  }, [loadUserMemorySettings, params.session]);

  useEffect(() => {
    if (!params.isAccountSettingsActive) return;
    const query = personalMemoryQuery.trim();
    const handle = window.setTimeout(() => {
      void searchPersonalMemoryItems(query);
    }, 150);
    return () => window.clearTimeout(handle);
  }, [
    params.isAccountSettingsActive,
    params.session,
    personalMemoryQuery,
    searchPersonalMemoryItems,
  ]);

  return {
    personalAgent: {
      settings: userMemorySettings,
      isLoading: isLoadingUserMemorySettings,
      saveSettings: saveUserMemorySettingsAndRefreshSetup,
    },
    personalMemory: {
      error: personalMemoryError,
      isLoading: isLoadingPersonalMemory,
      items: personalMemoryItems,
      query: personalMemoryQuery,
      setQuery: setPersonalMemoryQuery,
      loadItems: loadPersonalMemoryItems,
      togglePinned: handleTogglePersonalMemoryPinned,
      deleteItem: handleDeletePersonalMemoryItem,
      newContent: newPersonalMemoryContent,
      setNewContent: setNewPersonalMemoryContent,
      setNewPinned: setNewPersonalMemoryPinned,
      createItem: handleCreatePersonalMemoryItem,
    },
    personalMemoryUi: {
      personalMemoryItems,
      personalMemoryQuery,
      personalMemoryError,
      isLoadingPersonalMemory,
      newPersonalMemoryContent,
      newPersonalMemoryPinned,
      isMemoryImportModalOpen,
      memoryImportText,
      memoryImportError,
      isImportingMemory,
      memoryImportPlan,
      setMemoryImportText,
      setMemoryImportError,
      setIsMemoryImportModalOpen,
      closeMemoryImportModal,
    },
    importExternalMemory,
    dataExport: {
      error: exportError,
      isExporting,
      exportThreadsCsv,
      exportMessagesCsv,
      exportMemoryCsv,
    },
  };
}
