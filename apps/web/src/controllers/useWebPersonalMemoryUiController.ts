import { useCallback, useMemo, useState } from "react";

import {
  normalizeImportedMemoryContentKey,
  parseExternalMemoryImport,
  type ExternalMemoryImportItem,
} from "../../../../shared/externalMemoryImport";

type PersonalMemoryItem = {
  id: string;
  content: string;
  scope: "global" | "workspace";
  scope_id: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export function useWebPersonalMemoryUiController() {
  const [personalMemoryItems, setPersonalMemoryItems] = useState<PersonalMemoryItem[]>([]);
  const [personalMemoryQuery, setPersonalMemoryQuery] = useState("");
  const [personalMemoryError, setPersonalMemoryError] = useState<string | null>(null);
  const [isLoadingPersonalMemory, setIsLoadingPersonalMemory] = useState(false);
  const [newPersonalMemoryContent, setNewPersonalMemoryContent] = useState("");
  const [newPersonalMemoryPinned, setNewPersonalMemoryPinned] = useState(false);
  const [isMemoryImportModalOpen, setIsMemoryImportModalOpen] = useState(false);
  const [memoryImportText, setMemoryImportText] = useState("");
  const [memoryImportError, setMemoryImportError] = useState<string | null>(null);
  const [isImportingMemory, setIsImportingMemory] = useState(false);

  const memoryImportPlan = useMemo(() => {
    const parsedItems = parseExternalMemoryImport(memoryImportText);
    const existingKeys = new Set(
      personalMemoryItems.map((item) => normalizeImportedMemoryContentKey(item.content)),
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
    return {
      parsedItems,
      duplicateCount,
      uniqueItems,
    };
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

  return {
    personalMemoryItems,
    setPersonalMemoryItems,
    personalMemoryQuery,
    setPersonalMemoryQuery,
    personalMemoryError,
    setPersonalMemoryError,
    isLoadingPersonalMemory,
    setIsLoadingPersonalMemory,
    newPersonalMemoryContent,
    setNewPersonalMemoryContent,
    newPersonalMemoryPinned,
    setNewPersonalMemoryPinned,
    isMemoryImportModalOpen,
    setIsMemoryImportModalOpen,
    memoryImportText,
    setMemoryImportText,
    memoryImportError,
    setMemoryImportError,
    isImportingMemory,
    setIsImportingMemory,
    memoryImportPlan,
    resetMemoryImportModal,
    closeMemoryImportModal,
  };
}
