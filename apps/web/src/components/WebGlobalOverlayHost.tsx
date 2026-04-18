import { Suspense, lazy, type ComponentProps } from "react";
import { BuilderUpgradeModal } from "../../../../shared/BuilderUpgradeModal";
import { WebCommunityModalHost } from "./WebCommunityModalHost";
import { WebMessageContextModal } from "./WebMessageContextModal";
import { WebProjectModalHost } from "./WebProjectModalHost";
import { WebProviderConnectionModalHost } from "./WebProviderConnectionModalHost";

const WebMemoryImportModal = lazy(() =>
  import("./WebMemoryImportModal").then((module) => ({
    default: module.WebMemoryImportModal,
  })),
);

const WebInferenceIssueModal = lazy(() =>
  import("./WebInferenceIssueModal").then((module) => ({
    default: module.WebInferenceIssueModal,
  })),
);

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
  onClose: () => void;
  onChangeModel: (threadId: string) => void;
  onOpenSettings: (reason: InferenceIssueReason) => void;
};

export type WebGlobalOverlayHostProps = {
  messageContextModalProps: ComponentProps<typeof WebMessageContextModal>;
  memoryImportModalProps: WebMemoryImportModalProps | null;
  projectModalHostProps: ComponentProps<typeof WebProjectModalHost>;
  providerConnectionModalHostProps: ComponentProps<
    typeof WebProviderConnectionModalHost
  >["modalHostProps"];
  inferenceIssueModalProps: WebInferenceIssueModalProps | null;
  builderUpgradeModalProps: ComponentProps<typeof BuilderUpgradeModal>;
  communityModalHostProps: ComponentProps<typeof WebCommunityModalHost>["modalHostProps"];
  appToast: string | null;
};

export function WebGlobalOverlayHost(props: WebGlobalOverlayHostProps) {
  return (
    <>
      <WebMessageContextModal {...props.messageContextModalProps} />

      {props.memoryImportModalProps ? (
        <Suspense fallback={null}>
          <WebMemoryImportModal {...props.memoryImportModalProps} />
        </Suspense>
      ) : null}

      <WebProjectModalHost {...props.projectModalHostProps} />

      <WebProviderConnectionModalHost
        modalHostProps={props.providerConnectionModalHostProps}
      />

      {props.inferenceIssueModalProps ? (
        <Suspense fallback={null}>
          <WebInferenceIssueModal {...props.inferenceIssueModalProps} />
        </Suspense>
      ) : null}

      <BuilderUpgradeModal {...props.builderUpgradeModalProps} />

      <WebCommunityModalHost modalHostProps={props.communityModalHostProps} />

      {props.appToast ? (
        <div className="app-toast" role="status" aria-live="polite">
          <div className="app-toast-inner">{props.appToast}</div>
        </div>
      ) : null}
    </>
  );
}
