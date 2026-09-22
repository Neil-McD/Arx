import { useEffect } from "react";

import type { AuthSession } from "../auth";
import type {
  AppPage,
  CommunitySettingsPane,
  CommunityTab,
} from "../../../../shared/appShellNavigation";
import {
  normalizeCommunityAgentDraftForSave,
  type CommunityAgentLanding,
} from "../../../../shared/communityAgentLanding";
import type { CommunityAgentConfig, CommunityFunnelManagerConfig } from "../../../../shared/communityTypes";
import { useCommunityAgentConfigController } from "../../../../shared/useCommunityAgentDraftController";
import { useCommunityAgentConfigLifecycle } from "../../../../shared/useCommunityAgentConfigLifecycle";
import { useCommunityFunnelController } from "../../../../shared/useCommunityFunnelController";
import type { WebCommunityRecord } from "../webAppContracts";
import type { useWebCommunityAdminUiController } from "./useWebCommunityAdminUiController";
import type { useWebCommunityAgentConfigUiController } from "./useWebCommunityAgentConfigUiController";

type EnsureAuthSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

type AgentConfig = CommunityAgentConfig<CommunityAgentLanding>;

export function useWebCommunityAgentAndFunnelController(params: {
  activeCommunityId: string | null;
  activePage: AppPage;
  adminUi: ReturnType<typeof useWebCommunityAdminUiController>;
  agentUi: ReturnType<typeof useWebCommunityAgentConfigUiController>;
  canManageMembers: boolean;
  communitySettingsPane: CommunitySettingsPane;
  communityTab: CommunityTab;
  ensureSession: EnsureAuthSession;
  session: AuthSession | null;
  setCommunities: (
    updater: (current: WebCommunityRecord[]) => WebCommunityRecord[],
  ) => void;
}) {
  const agent = useCommunityAgentConfigController<
    AuthSession,
    CommunityAgentLanding,
    AgentConfig
  >({
    activeCommunityId: params.activeCommunityId,
    session: params.session,
    ensureSession: params.ensureSession,
    communityAgentConfigLanding: params.agentUi.communityAgentConfigLanding,
    communityAgentConfigCommunitySystemPrompt:
      params.agentUi.communityAgentConfigCommunitySystemPrompt,
    normalizeConfigForSave: normalizeCommunityAgentDraftForSave,
    hydrateConfigEditor: params.agentUi.hydrateCommunityAgentEditor,
    setLoadedCommunityId: (communityId) => {
      params.agentUi.communityAgentConfigLoadedCommunityIdRef.current =
        communityId;
    },
    markConfigClean: () => {
      params.agentUi.communityAgentConfigDirtyRef.current = false;
    },
    setIsLoadingCommunityAgentConfig:
      params.agentUi.setIsLoadingCommunityAgentConfig,
    setCommunityAgentConfigError: params.agentUi.setCommunityAgentConfigError,
    setIsSavingCommunityAgentConfig:
      params.agentUi.setIsSavingCommunityAgentConfig,
    setCommunityAgentConfigSaveError:
      params.agentUi.setCommunityAgentConfigSaveError,
    saveValidationErrorMessage: "Add at least one onboarding prompt.",
    loadFailureMessage: "Failed to load community agent settings.",
    saveFailureMessage: "Failed to save community agent changes.",
  });

  const funnel = useCommunityFunnelController<
    AuthSession,
    CommunityFunnelManagerConfig
  >({
    ensureSession: params.ensureSession,
    hydrateEditor: params.adminUi.hydrateCommunityFunnelEditor,
    setLoadedCommunityId: (communityId) => {
      params.adminUi.communityFunnelLoadedCommunityIdRef.current = communityId;
    },
    setIsLoadingCommunityFunnel:
      params.adminUi.setIsLoadingCommunityFunnel,
    setCommunityFunnelError: params.adminUi.setCommunityFunnelError,
    loadFailureMessage: "Failed to load funnel.",
  });

  useCommunityAgentConfigLifecycle<AuthSession>({
    activePage: params.activePage,
    communityTab: params.communityTab,
    communitySettingsPane: params.communitySettingsPane,
    session: params.session,
    activeCommunityId: params.activeCommunityId,
    canManageMembersActiveCommunity: params.canManageMembers,
    loadCommunityAgentConfig: agent.loadCommunityAgentConfig,
    communityAgentConfigLoadedCommunityIdRef:
      params.agentUi.communityAgentConfigLoadedCommunityIdRef,
    setCommunityAgentConfigError: params.agentUi.setCommunityAgentConfigError,
  });

  useEffect(() => {
    const showingEntrySettings = params.communityTab === "settings"
      && params.communitySettingsPane === "community";
    if (params.activePage !== "community" ||
      (params.communityTab !== "funnel" && !showingEntrySettings)) {
      return;
    }
    if (
      !params.session
      || !params.activeCommunityId
      || !params.canManageMembers
    ) {
      params.adminUi.resetCommunityFunnelState();
      return;
    }
    if (
      params.adminUi.communityFunnelLoadedCommunityIdRef.current
      === params.activeCommunityId
    ) {
      return;
    }
    void funnel.loadCommunityFunnelConfig(
      params.activeCommunityId,
      params.session,
    );
  }, [
    funnel.loadCommunityFunnelConfig,
    params.activeCommunityId,
    params.activePage,
    params.adminUi.communityFunnelLoadedCommunityIdRef,
    params.adminUi.resetCommunityFunnelState,
    params.canManageMembers,
    params.communitySettingsPane,
    params.communityTab,
    params.session,
  ]);

  return {
    loadCommunityAgentConfig: agent.loadCommunityAgentConfig,
    handleSaveCommunityAgentConfig: agent.handleSaveCommunityAgentConfig,
    loadCommunityFunnelConfig: funnel.loadCommunityFunnelConfig,
  };
}
