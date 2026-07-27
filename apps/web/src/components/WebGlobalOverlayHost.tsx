import type { ComponentProps } from "react";
import { FreeAccountIncludedModal } from "../../../../shared/FreeAccountIncludedModal";
import { WebCommunityModalHost } from "./WebCommunityModalHost";
import { WebMemoryImportModal } from "./WebMemoryImportModal";
import { WebProviderConnectionModalHost } from "./WebProviderConnectionModalHost";

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

export type WebGlobalOverlayHostProps = {
  memoryImportModalProps: WebMemoryImportModalProps | null;
  providerConnectionModalHostProps: ComponentProps<
    typeof WebProviderConnectionModalHost
  >["modalHostProps"];
  freeAccountIncludedModalProps: ComponentProps<typeof FreeAccountIncludedModal>;
  communityModalHostProps: ComponentProps<typeof WebCommunityModalHost>["modalHostProps"];
  appToast: string | null;
};

export function WebGlobalOverlayHost(props: WebGlobalOverlayHostProps) {
  return (
    <>
      {props.memoryImportModalProps ? (
        <WebMemoryImportModal {...props.memoryImportModalProps} />
      ) : null}

      <WebProviderConnectionModalHost
        modalHostProps={props.providerConnectionModalHostProps}
      />

      <FreeAccountIncludedModal {...props.freeAccountIncludedModalProps} />

      <WebCommunityModalHost modalHostProps={props.communityModalHostProps} />

      {props.appToast ? (
        <div className="app-toast" role="status" aria-live="polite">
          <div className="app-toast-inner">{props.appToast}</div>
        </div>
      ) : null}
    </>
  );
}
