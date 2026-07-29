import { useCallback } from "react";

export function useWebPersonalMemoryImportAction(params: {
  importExternalMemory: () => Promise<{
    importedCount: number;
    duplicateCount: number;
  } | null>;
  showToast: (message: string) => void;
}) {
  return useCallback(async (): Promise<void> => {
    const result = await params.importExternalMemory();
    if (!result) return;
    const imported =
      `${result.importedCount} memory item${
        result.importedCount === 1 ? "" : "s"
      }`;
    const duplicates =
      result.duplicateCount > 0
        ? ` · skipped ${result.duplicateCount} duplicate${
            result.duplicateCount === 1 ? "" : "s"
          }`
        : "";
    params.showToast(`Imported ${imported}${duplicates}`);
  }, [params.importExternalMemory, params.showToast]);
}
