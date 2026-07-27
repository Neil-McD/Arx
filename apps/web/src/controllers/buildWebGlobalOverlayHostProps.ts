import { EXTERNAL_MEMORY_IMPORT_PROMPT } from "../../../../shared/externalMemoryImport";
import type { SettingsPage } from "../../../../shared/appShellNavigation";
import type { WebGlobalOverlayHostProps } from "../components/WebGlobalOverlayHost";

export function buildWebGlobalOverlayHostProps(params: {
  session: unknown | null;
  accountCommerceStatus: { account_tier?: string | null } | null;
  setAccountCommerceError: (value: string | null) => void;
  setIsFreeAccountInfoOpen: (value: boolean) => void;
  personalMemoryUi: {
    isMemoryImportModalOpen: boolean;
    memoryImportText: string;
    memoryImportPlan: { parsedItems: unknown[]; duplicateCount: number };
    memoryImportError: string | null;
    isImportingMemory: boolean;
    setMemoryImportText: (value: string) => void;
    setMemoryImportError: (value: string | null) => void;
    closeMemoryImportModal: () => void;
  };
  handleImportExternalMemory: () => void | Promise<void>;
  providerConnectionModalHostProps: WebGlobalOverlayHostProps["providerConnectionModalHostProps"];
  onOpenPremiumBilling: () => void;
  isFreeAccountInfoOpen: boolean;
  accountCommerceError: string | null;
  communityModalHostProps: WebGlobalOverlayHostProps["communityModalHostProps"];
  appToast: string | null;
}): WebGlobalOverlayHostProps {
  return {
    memoryImportModalProps: params.personalMemoryUi.isMemoryImportModalOpen
      ? {
          isOpen: params.personalMemoryUi.isMemoryImportModalOpen,
          importPrompt: EXTERNAL_MEMORY_IMPORT_PROMPT,
          importText: params.personalMemoryUi.memoryImportText,
          parsedCount: params.personalMemoryUi.memoryImportPlan.parsedItems.length,
          duplicateCount: params.personalMemoryUi.memoryImportPlan.duplicateCount,
          error: params.personalMemoryUi.memoryImportError,
          isImporting: params.personalMemoryUi.isImportingMemory,
          onChangeImportText: (value) => {
            params.personalMemoryUi.setMemoryImportText(value);
            if (params.personalMemoryUi.memoryImportError) {
              params.personalMemoryUi.setMemoryImportError(null);
            }
          },
          onClose: params.personalMemoryUi.closeMemoryImportModal,
          onImport: () => void params.handleImportExternalMemory(),
        }
      : null,
    providerConnectionModalHostProps: params.providerConnectionModalHostProps,
    freeAccountIncludedModalProps: {
      isOpen: params.isFreeAccountInfoOpen,
      accountAccessError: params.accountCommerceError,
      onClose: () => params.setIsFreeAccountInfoOpen(false),
      onOpenBilling: params.onOpenPremiumBilling,
    },
    communityModalHostProps: params.communityModalHostProps,
    appToast: params.appToast,
  };
}
