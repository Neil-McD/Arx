import { useState } from "react";

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
  };
}
