import { useCallback, useEffect, useRef, useState } from "react";

import { formatProviderConnectionErrorMessage } from "../../../../shared/appErrorMappings";
import {
  beginChatgptConnect,
  beginChatgptManualConnect,
  completeCloudChatgptConnect,
  disconnectCloudChatgpt,
  pollCloudChatgptConnect,
  type CloudChatgptConnectionStatus,
} from "../../../../shared/cloudProviderConnectionsGateway";

type SignInIntent = {
  reason: "connect_provider";
  payload: { provider: "chatgpt" };
};

type UseWebProviderConnectionUiControllerParams<TSession> = {
  session: TSession | null;
  getSession: () => TSession | null;
  ensureSession: (session?: TSession | null) => Promise<TSession | null>;
  requireSignIn: (intent?: SignInIntent) => void;
  chatgptConnection: CloudChatgptConnectionStatus;
  onConnectionsUpdated: (connections: { chatgpt: CloudChatgptConnectionStatus }) => void;
  chatgptSecuritySettingsUrl: string;
  getReturnToPath: () => string;
};

type ProviderConnectionModalHostProps = {
  chatgptModal: {
    isOpen: boolean;
    isStarting: boolean;
    verificationUrl: string | null;
    userCode: string | null;
    isPolling: boolean;
    securitySettingsUrl: string;
    manualAuthorizeUrl: string | null;
    manualCallbackInput: string;
    isCompletingManual: boolean;
    error: string | null;
    onStartDeviceFlow: () => void | Promise<void>;
    onOpenVerificationPage: () => void;
    onStartManualFlow: () => void | Promise<void>;
    onOpenManualAuthPage: () => void;
    onChangeManualCallbackInput: (value: string) => void;
    onCompleteManual: () => void | Promise<void>;
    onClose: () => void;
  };
};

export type UseWebProviderConnectionUiControllerResult = {
  applyProviderConnectionLoadError: (message: string | null) => void;
  isConnectingChatgpt: boolean;
  isPollingChatgptConnection: boolean;
  isCompletingChatgptConnection: boolean;
  hasPendingChatgptAuth: boolean;
  chatgptDeviceUserCode: string | null;
  chatgptConnectionError: string | null;
  chatgptConnectionSuccess: string | null;
  handleConnectChatgpt: () => void;
  handleDisconnectChatgpt: () => Promise<void>;
  modalHostProps: ProviderConnectionModalHostProps;
};

export function useWebProviderConnectionUiController<TSession>(
  params: UseWebProviderConnectionUiControllerParams<TSession>,
): UseWebProviderConnectionUiControllerResult {
  const {
    session,
    getSession,
    ensureSession,
    requireSignIn,
    chatgptConnection,
    onConnectionsUpdated,
    chatgptSecuritySettingsUrl,
    getReturnToPath,
  } = params;

  const [isChatgptConnectModalOpen, setIsChatgptConnectModalOpen] = useState(false);
  const [chatgptDeviceLoginId, setChatgptDeviceLoginId] = useState<string | null>(null);
  const [chatgptDeviceVerificationUrl, setChatgptDeviceVerificationUrl] = useState<string | null>(null);
  const [chatgptDeviceUserCode, setChatgptDeviceUserCode] = useState<string | null>(null);
  const [chatgptDevicePollIntervalSeconds, setChatgptDevicePollIntervalSeconds] = useState(5);
  const [chatgptManualAuthorizeUrl, setChatgptManualAuthorizeUrl] = useState<string | null>(null);
  const [chatgptManualCallbackInput, setChatgptManualCallbackInput] = useState("");
  const [isConnectingChatgpt, setIsConnectingChatgpt] = useState(false);
  const [isPollingChatgptConnection, setIsPollingChatgptConnection] = useState(false);
  const [isCompletingChatgptConnection, setIsCompletingChatgptConnection] = useState(false);
  const [chatgptConnectionError, setChatgptConnectionError] = useState<string | null>(null);
  const [chatgptConnectionSuccess, setChatgptConnectionSuccess] = useState<string | null>(null);
  const chatgptConnectPollTimeoutRef = useRef<number | null>(null);

  const resetChatgptConnectFlowState = useCallback((): void => {
    if (chatgptConnectPollTimeoutRef.current) {
      window.clearTimeout(chatgptConnectPollTimeoutRef.current);
      chatgptConnectPollTimeoutRef.current = null;
    }
    setChatgptDeviceLoginId(null);
    setChatgptDeviceVerificationUrl(null);
    setChatgptDeviceUserCode(null);
    setChatgptDevicePollIntervalSeconds(5);
    setChatgptManualAuthorizeUrl(null);
    setChatgptManualCallbackInput("");
  }, []);

  const resetProviderConnectionUiState = useCallback((): void => {
    resetChatgptConnectFlowState();
    setIsConnectingChatgpt(false);
    setIsPollingChatgptConnection(false);
    setIsCompletingChatgptConnection(false);
    setIsChatgptConnectModalOpen(false);
    setChatgptConnectionError(null);
    setChatgptConnectionSuccess(null);
  }, [resetChatgptConnectFlowState]);

  useEffect(() => {
    if (session) return;
    resetProviderConnectionUiState();
  }, [resetProviderConnectionUiState, session]);

  const ensureProviderSession = useCallback(
    async (): Promise<TSession | null> => {
      const usableSession = await ensureSession(getSession());
      if (!usableSession) {
        requireSignIn({ reason: "connect_provider", payload: { provider: "chatgpt" } });
        return null;
      }
      return usableSession;
    },
    [ensureSession, getSession, requireSignIn],
  );

  const handleConnectChatgpt = useCallback((): void => {
    if (!getSession()) {
      requireSignIn({ reason: "connect_provider", payload: { provider: "chatgpt" } });
      return;
    }
    setChatgptConnectionError(null);
    setChatgptConnectionSuccess(null);
    if (!chatgptDeviceLoginId && !chatgptManualAuthorizeUrl) {
      resetChatgptConnectFlowState();
    }
    setIsChatgptConnectModalOpen(true);
  }, [chatgptDeviceLoginId, chatgptManualAuthorizeUrl, getSession, requireSignIn, resetChatgptConnectFlowState]);

  const handleStartChatgptDeviceConnect = useCallback(async (): Promise<void> => {
    const session = await ensureProviderSession();
    if (!session) return;
    resetChatgptConnectFlowState();
    setIsConnectingChatgpt(true);
    setChatgptConnectionError(null);
    setChatgptConnectionSuccess(null);
    try {
      const result = await beginChatgptConnect({
        session,
        returnToPath: getReturnToPath(),
      });
      setChatgptDeviceLoginId(result.login_id);
      setChatgptDeviceVerificationUrl(result.verification_url);
      setChatgptDeviceUserCode(result.user_code);
      setChatgptDevicePollIntervalSeconds(Math.max(1, result.poll_interval_seconds || 5));
      setIsChatgptConnectModalOpen(true);
    } catch (error) {
      setChatgptConnectionError(
        formatProviderConnectionErrorMessage(error, "Failed to start ChatGPT sign-in."),
      );
    } finally {
      setIsConnectingChatgpt(false);
    }
  }, [ensureProviderSession, getReturnToPath, resetChatgptConnectFlowState]);

  const handleOpenChatgptAuthorizePage = useCallback(() => {
    if (!chatgptDeviceVerificationUrl) return;
    window.open(chatgptDeviceVerificationUrl, "_blank", "noopener,noreferrer");
  }, [chatgptDeviceVerificationUrl]);

  const handleStartChatgptManualConnect = useCallback(async (): Promise<void> => {
    const session = await ensureProviderSession();
    if (!session) return;
    setIsConnectingChatgpt(true);
    setChatgptConnectionError(null);
    setChatgptConnectionSuccess(null);
    try {
      const result = await beginChatgptManualConnect({
        session,
        returnToPath: getReturnToPath(),
      });
      setChatgptManualAuthorizeUrl(result.authorize_url);
      setChatgptManualCallbackInput("");
      window.open(result.authorize_url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setChatgptConnectionError(
        formatProviderConnectionErrorMessage(error, "Failed to start ChatGPT browser login."),
      );
    } finally {
      setIsConnectingChatgpt(false);
    }
  }, [ensureProviderSession, getReturnToPath]);

  const handleOpenChatgptManualAuthPage = useCallback(() => {
    if (!chatgptManualAuthorizeUrl) return;
    window.open(chatgptManualAuthorizeUrl, "_blank", "noopener,noreferrer");
  }, [chatgptManualAuthorizeUrl]);

  const handlePollChatgptConnect = useCallback(async (): Promise<boolean> => {
    const session = await ensureProviderSession();
    if (!session) return false;
    const loginId = String(chatgptDeviceLoginId ?? "").trim();
    if (!loginId) {
      setChatgptConnectionError("ChatGPT sign-in is not active. Start the connection flow again.");
      return false;
    }
    setIsPollingChatgptConnection(true);
    setChatgptConnectionError(null);
    setChatgptConnectionSuccess(null);
    try {
      const result = await pollCloudChatgptConnect({
        session,
        loginId,
      });
      if (result.status !== "connected") return false;
      onConnectionsUpdated(result);
      setIsChatgptConnectModalOpen(false);
      resetChatgptConnectFlowState();
      setChatgptConnectionSuccess("ChatGPT connected.");
      return true;
    } catch (error) {
      const message = formatProviderConnectionErrorMessage(error, "Failed to complete ChatGPT sign-in.");
      setChatgptConnectionError(message);
      const normalized = message.toLowerCase();
      if (normalized.includes("expired") || normalized.includes("invalid")) {
        resetChatgptConnectFlowState();
      }
      return false;
    } finally {
      setIsPollingChatgptConnection(false);
    }
  }, [chatgptDeviceLoginId, ensureProviderSession, onConnectionsUpdated, resetChatgptConnectFlowState]);

  const handleCompleteChatgptManualConnect = useCallback(async (): Promise<void> => {
    const session = await ensureProviderSession();
    if (!session) return;
    const callbackInput = chatgptManualCallbackInput.trim();
    if (!callbackInput) {
      setChatgptConnectionError("Paste the full localhost callback URL from the browser address bar.");
      return;
    }
    setIsCompletingChatgptConnection(true);
    setChatgptConnectionError(null);
    setChatgptConnectionSuccess(null);
    try {
      const result = await completeCloudChatgptConnect({
        session,
        callbackInput,
      });
      onConnectionsUpdated(result);
      setIsChatgptConnectModalOpen(false);
      resetChatgptConnectFlowState();
      setChatgptConnectionSuccess("ChatGPT connected.");
    } catch (error) {
      setChatgptConnectionError(
        formatProviderConnectionErrorMessage(error, "Failed to complete ChatGPT browser login."),
      );
    } finally {
      setIsCompletingChatgptConnection(false);
    }
  }, [chatgptManualCallbackInput, ensureProviderSession, onConnectionsUpdated, resetChatgptConnectFlowState]);

  const handleDisconnectChatgpt = useCallback(async (): Promise<void> => {
    const session = await ensureProviderSession();
    if (!session) return;
    setIsConnectingChatgpt(true);
    setChatgptConnectionError(null);
    setChatgptConnectionSuccess(null);
    try {
      const result = await disconnectCloudChatgpt({
        session,
      });
      onConnectionsUpdated(result);
      setChatgptConnectionSuccess("ChatGPT disconnected.");
    } catch (error) {
      setChatgptConnectionError(
        formatProviderConnectionErrorMessage(error, "Failed to disconnect ChatGPT."),
      );
    } finally {
      setIsConnectingChatgpt(false);
    }
  }, [ensureProviderSession, onConnectionsUpdated]);

  const handleCloseChatgptConnectModal = useCallback((): void => {
    if (isConnectingChatgpt || isCompletingChatgptConnection) return;
    setIsChatgptConnectModalOpen(false);
    setChatgptConnectionError(null);
    if (!chatgptDeviceLoginId && !chatgptManualAuthorizeUrl) {
      resetChatgptConnectFlowState();
    }
  }, [
    chatgptDeviceLoginId,
    chatgptManualAuthorizeUrl,
    isCompletingChatgptConnection,
    isConnectingChatgpt,
    resetChatgptConnectFlowState,
  ]);

  useEffect(() => {
    if (!chatgptDeviceLoginId || !session || chatgptConnection.connected) return;
    if (isPollingChatgptConnection) return;
    if (chatgptConnectPollTimeoutRef.current) {
      window.clearTimeout(chatgptConnectPollTimeoutRef.current);
      chatgptConnectPollTimeoutRef.current = null;
    }
    const timeoutId = window.setTimeout(() => {
      void handlePollChatgptConnect();
    }, Math.max(1, chatgptDevicePollIntervalSeconds) * 1000);
    chatgptConnectPollTimeoutRef.current = timeoutId;
    return () => {
      if (chatgptConnectPollTimeoutRef.current === timeoutId) {
        window.clearTimeout(timeoutId);
        chatgptConnectPollTimeoutRef.current = null;
      }
    };
  }, [
    chatgptConnection.connected,
    chatgptDeviceLoginId,
    chatgptDevicePollIntervalSeconds,
    session,
    handlePollChatgptConnect,
    isPollingChatgptConnection,
  ]);

  const applyProviderConnectionLoadError = useCallback((message: string | null): void => {
    setChatgptConnectionError(message);
  }, []);

  return {
    applyProviderConnectionLoadError,
    isConnectingChatgpt,
    isPollingChatgptConnection,
    isCompletingChatgptConnection,
    hasPendingChatgptAuth: Boolean(chatgptDeviceLoginId || chatgptManualAuthorizeUrl),
    chatgptDeviceUserCode,
    chatgptConnectionError,
    chatgptConnectionSuccess,
    handleConnectChatgpt,
    handleDisconnectChatgpt,
    modalHostProps: {
      chatgptModal: {
        isOpen: isChatgptConnectModalOpen,
        isStarting: isConnectingChatgpt,
        verificationUrl: chatgptDeviceVerificationUrl,
        userCode: chatgptDeviceUserCode,
        isPolling: isPollingChatgptConnection,
        securitySettingsUrl: chatgptSecuritySettingsUrl,
        manualAuthorizeUrl: chatgptManualAuthorizeUrl,
        manualCallbackInput: chatgptManualCallbackInput,
        isCompletingManual: isCompletingChatgptConnection,
        error: chatgptConnectionError,
        onStartDeviceFlow: handleStartChatgptDeviceConnect,
        onOpenVerificationPage: handleOpenChatgptAuthorizePage,
        onStartManualFlow: handleStartChatgptManualConnect,
        onOpenManualAuthPage: handleOpenChatgptManualAuthPage,
        onChangeManualCallbackInput: setChatgptManualCallbackInput,
        onCompleteManual: handleCompleteChatgptManualConnect,
        onClose: handleCloseChatgptConnectModal,
      },
    },
  };
}
