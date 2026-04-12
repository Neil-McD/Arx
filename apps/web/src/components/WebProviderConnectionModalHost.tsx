import { Suspense, lazy } from "react";

import type { UseWebProviderConnectionUiControllerResult } from "../controllers/useWebProviderConnectionUiController";

const WebChatgptConnectModal = lazy(() =>
  import("./WebChatgptConnectModal").then((module) => ({
    default: module.WebChatgptConnectModal,
  })),
);

type WebProviderConnectionModalHostProps = {
  modalHostProps: UseWebProviderConnectionUiControllerResult["modalHostProps"];
};

export function WebProviderConnectionModalHost(props: WebProviderConnectionModalHostProps) {
  const { chatgptModal } = props.modalHostProps;

  return chatgptModal.isOpen ? (
    <Suspense fallback={null}>
      <WebChatgptConnectModal
        isOpen={chatgptModal.isOpen}
        isStarting={chatgptModal.isStarting}
        verificationUrl={chatgptModal.verificationUrl}
        userCode={chatgptModal.userCode}
        isPolling={chatgptModal.isPolling}
        securitySettingsUrl={chatgptModal.securitySettingsUrl}
        manualAuthorizeUrl={chatgptModal.manualAuthorizeUrl}
        manualCallbackInput={chatgptModal.manualCallbackInput}
        isCompletingManual={chatgptModal.isCompletingManual}
        error={chatgptModal.error}
        onStartDeviceFlow={() => void chatgptModal.onStartDeviceFlow()}
        onOpenVerificationPage={chatgptModal.onOpenVerificationPage}
        onStartManualFlow={() => void chatgptModal.onStartManualFlow()}
        onOpenManualAuthPage={chatgptModal.onOpenManualAuthPage}
        onChangeManualCallbackInput={chatgptModal.onChangeManualCallbackInput}
        onCompleteManual={() => void chatgptModal.onCompleteManual()}
        onClose={chatgptModal.onClose}
      />
    </Suspense>
  ) : null;
}
