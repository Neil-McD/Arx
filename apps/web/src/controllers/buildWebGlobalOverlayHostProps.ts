import { isBuilderTierFree } from "../../../../shared/builderBilling";
import { EXTERNAL_MEMORY_IMPORT_PROMPT } from "../../../../shared/externalMemoryImport";
import type { AppView, SettingsPage } from "../../../../shared/appShellNavigation";
import type { BuilderCheckoutTier, BuilderUpgradeContext } from "../../../../shared/authResumeState";
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
  openAuthGate: (intentInput?: unknown) => void;
  builderBillingStatus: { builder_tier?: string | null } | null;
  setBuilderUpgradeContext: (value: BuilderUpgradeContext) => void;
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
  inferenceIssueModal: InferenceIssueModalState;
  isInferenceIssueModalRunning: boolean;
  setInferenceIssueModal: (value: InferenceIssueModalState) => void;
  setActiveView: (value: AppView) => void;
  setSettingsPage: (value: SettingsPage) => void;
  threads: Array<{
    id: string;
    project_id?: string | null;
    community_id?: string | null;
  }>;
  enterWorkspaceThread: (args: {
    threadId: string;
    projectId: string | null;
    communityId: string | null;
  }) => void;
  requestModelPickerOpen: () => void;
  isBuilderUpgradeOpen: boolean;
  builderUpgradeContext: BuilderUpgradeContext;
  isStartingBuilderCheckout: boolean;
  builderBillingError: string | null;
  showBuilderUpgradeScrollHint: boolean;
  builderUpgradeModalBodyRef: { current: HTMLDivElement | null };
  updateBuilderUpgradeScrollHint: () => void;
  startBuilderPlanCheckout: (
    tier: BuilderCheckoutTier,
    options: { context: BuilderUpgradeContext },
  ) => void | Promise<void>;
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
          params.openAuthGate();
          return;
        }
        const tier = params.builderBillingStatus?.builder_tier ?? "free";
        if (isBuilderTierFree(tier)) {
          params.setBuilderUpgradeContext("builder");
          params.setBuilderBillingError(
            "Upgrade to Builder or Architect to use personal memory.",
          );
          params.setIsBuilderUpgradeOpen(true);
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
    inferenceIssueModalProps: params.inferenceIssueModal
      ? {
          hasSession: Boolean(params.session),
          inferenceIssueModal: params.inferenceIssueModal,
          isInferenceIssueModalRunning: params.isInferenceIssueModalRunning,
          onClose: () => params.setInferenceIssueModal(null),
          onOpenSettings: (reason) => {
            params.setInferenceIssueModal(null);
            params.setActiveView("settings");
            params.setSettingsPage(
              reason === "workspace_credits" ? "agent" : "account",
            );
          },
          onChangeModel: (threadId) => {
            params.setInferenceIssueModal(null);
            const thread =
              params.threads.find((candidate) => candidate.id === threadId) ?? null;
            const projectId = (thread?.project_id ?? "").trim();
            params.enterWorkspaceThread({
              threadId,
              projectId: projectId || null,
              communityId: thread?.community_id ?? null,
            });
            params.requestModelPickerOpen();
          },
        }
      : null,
    builderUpgradeModalProps: {
      isOpen: params.isBuilderUpgradeOpen,
      builderUpgradeContext: params.builderUpgradeContext,
      builderTier: params.builderBillingStatus?.builder_tier,
      isStartingBuilderCheckout: params.isStartingBuilderCheckout,
      builderBillingError: params.builderBillingError,
      showBuilderUpgradeScrollHint: params.showBuilderUpgradeScrollHint,
      builderUpgradeModalBodyRef: params.builderUpgradeModalBodyRef,
      onClose: () => params.setIsBuilderUpgradeOpen(false),
      onModalBodyScroll: params.updateBuilderUpgradeScrollHint,
      onStartBuilderPlanCheckout: (tier) => {
        if (!params.session) {
          params.setIsBuilderUpgradeOpen(false);
          params.openAuthGate({
            reason: "start_builder_checkout",
            payload: { tier, context: params.builderUpgradeContext },
          });
          return;
        }
        void params.startBuilderPlanCheckout(tier, {
          context: params.builderUpgradeContext,
        });
      },
    },
    communityModalHostProps: params.communityModalHostProps,
    appToast: params.appToast,
  };
}
