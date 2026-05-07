import { EXTERNAL_MEMORY_IMPORT_PROMPT } from "../../../../shared/externalMemoryImport";
import type { AppView, SettingsPage } from "../../../../shared/appShellNavigation";
import type { BuilderUpgradeContextValue } from "../../../../shared/builderBilling";
import type { WorkspaceToolBalanceTopupPackId } from "../../../../shared/workspaceCredits";
import type { WebGlobalOverlayHostProps } from "../components/WebGlobalOverlayHost";

type InferenceIssueModalState = NonNullable<
  WebGlobalOverlayHostProps["inferenceIssueModalProps"]
>["inferenceIssueModal"];

export function buildWebGlobalOverlayHostProps(params: {
  contextModal: WebGlobalOverlayHostProps["messageContextModalProps"]["contextModal"];
  setContextModal: (
    value: WebGlobalOverlayHostProps["messageContextModalProps"]["contextModal"],
  ) => void;
  session: unknown | null;
  createPersonalMemoryItemDirect: (args: {
    content: string;
    pinned: boolean;
  }) => Promise<unknown>;
  showMemoryToastMessage: (message: string) => void;
  requireSignIn: (intentInput?: unknown) => void;
  builderBillingStatus: { builder_tier?: string | null } | null;
  setBuilderUpgradeContext: (value: BuilderUpgradeContextValue) => void;
  setBuilderBillingError: (value: string | null) => void;
  setIsBuilderUpgradeOpen: (value: boolean) => void;
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
  projectModalHostProps: WebGlobalOverlayHostProps["projectModalHostProps"];
  providerConnectionModalHostProps: WebGlobalOverlayHostProps["providerConnectionModalHostProps"];
  previewAccessGateModal: NonNullable<
    WebGlobalOverlayHostProps["previewAccessGateModalProps"]
  >["previewAccessGateModal"];
  previewAccessGateAuthError: string | null;
  isPreviewAccessGateRunning: boolean;
  closePreviewAccessGateModal: () => void;
  continuePreviewAccessGateAuth: () => void;
  inferenceIssueModal: InferenceIssueModalState;
  isInferenceIssueModalRunning: boolean;
  isStartingWorkspaceCreditTopupCheckout: boolean;
  workspaceCreditTopupError: string | null;
  setInferenceIssueModal: (value: InferenceIssueModalState) => void;
  startWorkspaceCreditTopupCheckout: (packId?: WorkspaceToolBalanceTopupPackId) => void | Promise<void>;
  setActiveView: (value: AppView) => void;
  setSettingsPage: (value: SettingsPage) => void;
  isBuilderUpgradeOpen: boolean;
  builderBillingError: string | null;
  communityModalHostProps: WebGlobalOverlayHostProps["communityModalHostProps"];
  appToast: string | null;
}): WebGlobalOverlayHostProps {
  return {
    messageContextModalProps: {
      contextModal: params.contextModal,
      hasSession: Boolean(params.session),
      onClose: () => params.setContextModal(null),
      onSaveSuggestion: (item) => {
        if (!params.session) {
          params.requireSignIn();
          return;
        }
        void params.createPersonalMemoryItemDirect({
          content: item.content,
          pinned: item.pinned,
        })
          .then(() => params.showMemoryToastMessage("Memory updated"))
          .catch((error) =>
            console.warn("Failed to save suggested memory:", error),
          );
      },
    },
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
    projectModalHostProps: params.projectModalHostProps,
    providerConnectionModalHostProps: params.providerConnectionModalHostProps,
    previewAccessGateModalProps: params.previewAccessGateModal
      ? {
          previewAccessGateModal: params.previewAccessGateModal,
          authError: params.previewAccessGateAuthError,
          isRunning: params.isPreviewAccessGateRunning,
          onClose: params.closePreviewAccessGateModal,
          onContinueToSignIn: params.continuePreviewAccessGateAuth,
        }
      : null,
    inferenceIssueModalProps: params.inferenceIssueModal
      ? {
          hasSession: Boolean(params.session),
          inferenceIssueModal: params.inferenceIssueModal,
          isInferenceIssueModalRunning: params.isInferenceIssueModalRunning,
          isStartingWorkspaceCreditTopupCheckout: params.isStartingWorkspaceCreditTopupCheckout,
          workspaceCreditTopupError: params.workspaceCreditTopupError,
          onClose: () => params.setInferenceIssueModal(null),
          onStartWorkspaceCreditTopupCheckout: params.startWorkspaceCreditTopupCheckout,
          onOpenSettings: (reason) => {
            params.setInferenceIssueModal(null);
            params.setActiveView("settings");
            params.setSettingsPage(
              reason === "workspace_credits" || reason === "provider_connection_required" ? "agent" : "account",
            );
          },
        }
      : null,
    builderUpgradeModalProps: {
      isOpen: params.isBuilderUpgradeOpen,
      builderBillingError: params.builderBillingError,
      onClose: () => params.setIsBuilderUpgradeOpen(false),
    },
    communityModalHostProps: params.communityModalHostProps,
    appToast: params.appToast,
  };
}
