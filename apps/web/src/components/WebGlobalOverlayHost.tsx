import type { ComponentProps } from "react";
import { BuilderIncludedModal } from "../../../../shared/BuilderIncludedModal";
import { WebCommunityModalHost } from "./WebCommunityModalHost";
import { WebInferenceIssueModal } from "./WebInferenceIssueModal";
import { WebMemoryImportModal } from "./WebMemoryImportModal";
import { WebMessageContextModal } from "./WebMessageContextModal";
import { WebPreviewAccessGateModal } from "./WebPreviewAccessGateModal";
import { WebProjectModalHost } from "./WebProjectModalHost";
import { WebProviderConnectionModalHost } from "./WebProviderConnectionModalHost";
import type { WorkspaceToolBalanceTopupPackId } from "../../../../shared/workspaceCredits";

type InferenceIssueReason =
  | "quota"
  | "workspace_credits"
  | "plan"
  | "provider_connection_required"
  | "misconfigured"
  | "disabled"
  | "unavailable";

type InferenceIssueModalState = {
  reason: InferenceIssueReason;
  threadId: string;
  mode: "respond" | "regenerate";
  message: string | null;
} | null;

type WebMemoryImportModalProps = {
  isOpen: boolean;
  importPrompt: string;
  importText: string;
  parsedCount: number;
  duplicateCount: number;
  error: string | null;
  isImporting: boolean;
  onChangeImportText: (value: string) => void;
  onClose: () => void;
  onImport: () => void;
};

type WebInferenceIssueModalProps = {
  hasSession: boolean;
  inferenceIssueModal: InferenceIssueModalState;
  isInferenceIssueModalRunning: boolean;
  isStartingWorkspaceCreditTopupCheckout?: boolean;
  workspaceCreditTopupError?: string | null;
  onClose: () => void;
  onOpenSettings: (reason: InferenceIssueReason) => void;
  onStartWorkspaceCreditTopupCheckout?: (packId?: WorkspaceToolBalanceTopupPackId) => Promise<void> | void;
};

type PreviewAccessGateModalState = ComponentProps<
  typeof WebPreviewAccessGateModal
>["previewAccessGateModal"];

type WebPreviewAccessGateModalProps = {
  previewAccessGateModal: PreviewAccessGateModalState;
  authError: string | null;
  isRunning: boolean;
  onClose: () => void;
  onContinueToSignIn: () => void;
};

export type WebGlobalOverlayHostProps = {
  messageContextModalProps: ComponentProps<typeof WebMessageContextModal>;
  memoryImportModalProps: WebMemoryImportModalProps | null;
  projectModalHostProps: ComponentProps<typeof WebProjectModalHost>;
  providerConnectionModalHostProps: ComponentProps<
    typeof WebProviderConnectionModalHost
  >["modalHostProps"];
  previewAccessGateModalProps: WebPreviewAccessGateModalProps | null;
  inferenceIssueModalProps: WebInferenceIssueModalProps | null;
  builderIncludedModalProps: ComponentProps<typeof BuilderIncludedModal>;
  communityModalHostProps: ComponentProps<typeof WebCommunityModalHost>["modalHostProps"];
  appToast: string | null;
};

export function WebGlobalOverlayHost(props: WebGlobalOverlayHostProps) {
  return (
    <>
      <WebMessageContextModal {...props.messageContextModalProps} />

      {props.memoryImportModalProps ? (
        <WebMemoryImportModal {...props.memoryImportModalProps} />
      ) : null}

      <WebProjectModalHost {...props.projectModalHostProps} />

      <WebProviderConnectionModalHost
        modalHostProps={props.providerConnectionModalHostProps}
      />

      {props.previewAccessGateModalProps ? (
        <WebPreviewAccessGateModal {...props.previewAccessGateModalProps} />
      ) : null}

      {props.inferenceIssueModalProps ? (
        <WebInferenceIssueModal {...props.inferenceIssueModalProps} />
      ) : null}

      <BuilderIncludedModal {...props.builderIncludedModalProps} />

      <WebCommunityModalHost modalHostProps={props.communityModalHostProps} />

      {props.appToast ? (
        <div className="app-toast" role="status" aria-live="polite">
          <div className="app-toast-inner">{props.appToast}</div>
        </div>
      ) : null}
    </>
  );
}
