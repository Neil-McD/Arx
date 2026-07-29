import { useCallback, useEffect, useState } from "react";

import { formatProviderConnectionErrorMessage } from "../../../../shared/appErrorMappings";
import {
  loadCloudProviderConnections,
  type CloudChatgptConnectionStatus,
  type CloudOpenAiConnectionStatus,
} from "../../../../shared/cloudProviderConnectionsGateway";
import type { AuthSession } from "../auth";
import { CHATGPT_SECURITY_SETTINGS_URL } from "../webAppRuntime";
import { useWebProviderConnectionUiController } from "./useWebProviderConnectionUiController";

type ConnectProviderIntent = {
  reason: "connect_provider";
  payload: { provider: "chatgpt" | "openai" };
};

type UseWebProviderConnectionsControllerParams = {
  session: AuthSession | null;
  getSession: () => AuthSession | null;
  ensureSession: (session?: AuthSession | null) => Promise<AuthSession | null>;
  requireSignIn: (intent?: ConnectProviderIntent) => void;
  refreshAccountSetupStatus: (
    session?: AuthSession | null,
  ) => Promise<unknown> | unknown;
  resetSignedOutAccountSetup: () => void;
  getReturnToPath: () => string;
};

const DISCONNECTED_CHATGPT: CloudChatgptConnectionStatus = {
  provider: "chatgpt",
  auth_kind: "oauth_tokens",
  connected: false,
  email: null,
  account_id: null,
  access_token_expires_at: null,
  validated_at: null,
  updated_at: null,
};

const DISCONNECTED_OPENAI: CloudOpenAiConnectionStatus = {
  provider: "openai",
  auth_kind: "api_key",
  connected: false,
  key_last_four: null,
  validated_at: null,
  updated_at: null,
};

export function useWebProviderConnectionsController(
  params: UseWebProviderConnectionsControllerParams,
) {
  const [chatgptConnection, setChatgptConnection] =
    useState<CloudChatgptConnectionStatus>(DISCONNECTED_CHATGPT);
  const [openAiConnection, setOpenAiConnection] =
    useState<CloudOpenAiConnectionStatus>(DISCONNECTED_OPENAI);
  const [isLoadingProviderConnections, setIsLoadingProviderConnections] =
    useState(false);

  const providerConnectionUi =
    useWebProviderConnectionUiController<AuthSession>({
      session: params.session,
      getSession: params.getSession,
      ensureSession: params.ensureSession,
      requireSignIn: params.requireSignIn,
      chatgptConnection,
      onConnectionsUpdated: (connections) => {
        setOpenAiConnection(connections.openai);
        setChatgptConnection(connections.chatgpt);
        void params.refreshAccountSetupStatus();
      },
      chatgptSecuritySettingsUrl: CHATGPT_SECURITY_SETTINGS_URL,
      getReturnToPath: params.getReturnToPath,
    });

  const { applyProviderConnectionLoadError } = providerConnectionUi;
  const loadProviderConnections = useCallback(
    async (session: AuthSession): Promise<void> => {
      const usableSession = await params.ensureSession(session);
      if (!usableSession) return;
      setIsLoadingProviderConnections(true);
      try {
        const result = await loadCloudProviderConnections({
          session: usableSession,
        });
        setOpenAiConnection(result.openai);
        setChatgptConnection(result.chatgpt);
        applyProviderConnectionLoadError(null);
      } catch (error) {
        applyProviderConnectionLoadError(
          formatProviderConnectionErrorMessage(
            error,
            "Failed to load provider connections.",
          ),
        );
      } finally {
        setIsLoadingProviderConnections(false);
      }
    },
    [applyProviderConnectionLoadError, params.ensureSession],
  );

  useEffect(() => {
    if (!params.session) {
      setChatgptConnection(DISCONNECTED_CHATGPT);
      setOpenAiConnection(DISCONNECTED_OPENAI);
      params.resetSignedOutAccountSetup();
      setIsLoadingProviderConnections(false);
      return;
    }

    void (async () => {
      const usableSession = await params.ensureSession(params.session);
      if (!usableSession) return;
      await Promise.all([
        loadProviderConnections(usableSession),
        params.refreshAccountSetupStatus(usableSession),
      ]);
    })();
  }, [
    loadProviderConnections,
    params.ensureSession,
    params.refreshAccountSetupStatus,
    params.resetSignedOutAccountSetup,
    params.session,
  ]);

  const handleConnectCommunityAgentServeProvider = useCallback((): void => {
    void providerConnectionUi.handleConnectChatgpt();
  }, [providerConnectionUi]);

  return {
    chatgptConnection,
    openAiConnection,
    isLoadingProviderConnections,
    providerConnectionUi,
    hasPendingChatgptAuth: providerConnectionUi.hasPendingChatgptAuth,
    handleConnectCommunityAgentServeProvider,
    loadProviderConnections,
  };
}
