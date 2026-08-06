import { useCallback, useEffect, useRef, useState } from "react";

import { formatProviderConnectionErrorMessage } from "../../../../shared/appErrorMappings";
import {
  loadCloudProviderConnections,
  type CloudChatgptConnectionStatus,
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

export function useWebProviderConnectionsController(
  params: UseWebProviderConnectionsControllerParams,
) {
  const getReturnToPath = useCallback(
    () =>
      typeof window === "undefined"
        ? "/"
        : `${window.location.pathname}${window.location.search}`,
    [],
  );
  const [chatgptConnection, setChatgptConnection] =
    useState<CloudChatgptConnectionStatus>(DISCONNECTED_CHATGPT);
  const [isLoadingProviderConnections, setIsLoadingProviderConnections] =
    useState(false);
  const ensureSessionRef = useRef(params.ensureSession);
  const refreshAccountSetupStatusRef = useRef(
    params.refreshAccountSetupStatus,
  );
  const resetSignedOutAccountSetupRef = useRef(
    params.resetSignedOutAccountSetup,
  );
  ensureSessionRef.current = params.ensureSession;
  refreshAccountSetupStatusRef.current = params.refreshAccountSetupStatus;
  resetSignedOutAccountSetupRef.current = params.resetSignedOutAccountSetup;

  const handleConnectionsUpdated = useCallback(
    (connections: { chatgpt: CloudChatgptConnectionStatus }): void => {
      setChatgptConnection(connections.chatgpt);
      void refreshAccountSetupStatusRef.current();
    },
    [],
  );

  const providerConnectionUi =
    useWebProviderConnectionUiController<AuthSession>({
      session: params.session,
      getSession: params.getSession,
      ensureSession: params.ensureSession,
      requireSignIn: params.requireSignIn,
      chatgptConnection,
      onConnectionsUpdated: handleConnectionsUpdated,
      chatgptSecuritySettingsUrl: CHATGPT_SECURITY_SETTINGS_URL,
      getReturnToPath,
    });

  const { applyProviderConnectionLoadError } = providerConnectionUi;
  const loadProviderConnections = useCallback(
    async (session: AuthSession): Promise<void> => {
      const usableSession = await ensureSessionRef.current(session);
      if (!usableSession) return;
      setIsLoadingProviderConnections(true);
      try {
        const result = await loadCloudProviderConnections({
          session: usableSession,
        });
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
    [applyProviderConnectionLoadError],
  );

  useEffect(() => {
    if (!params.session) {
      setChatgptConnection(DISCONNECTED_CHATGPT);
      resetSignedOutAccountSetupRef.current();
      setIsLoadingProviderConnections(false);
      return;
    }

    void (async () => {
      const usableSession = await ensureSessionRef.current(params.session);
      if (!usableSession) return;
      await Promise.all([
        loadProviderConnections(usableSession),
        refreshAccountSetupStatusRef.current(usableSession),
      ]);
    })();
  }, [
    loadProviderConnections,
    params.session,
  ]);

  return {
    chatgptConnection,
    isLoadingProviderConnections,
    providerConnectionUi,
    hasPendingChatgptAuth: providerConnectionUi.hasPendingChatgptAuth,
    loadProviderConnections,
  };
}
