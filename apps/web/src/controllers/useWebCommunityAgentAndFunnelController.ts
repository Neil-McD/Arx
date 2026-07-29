import { useEffect } from "react";

import type { AuthSession } from "../auth";
import type {
  AppPage,
  CommunityTab,
} from "../../../../shared/appShellNavigation";
import {
  normalizeCommunityAgentDraftForSave,
  type CommunityAgentLanding,
} from "../../../../shared/communityAgentLanding";
import { normalizeCommunityFunnelConfig } from "../../../../shared/communityFunnel";
import { saveCloudCommunityPublicPresentation } from "../../../../shared/cloudCommunityFunnelGateway";
import type {
  CommunityAgentConfig,
  CommunityFunnelConfig,
} from "../../../../shared/communityTypes";
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
    loadFailureMessage: "Failed to load AI agent config.",
    saveFailureMessage: "Failed to save AI agent changes.",
  });

  const funnel = useCommunityFunnelController<
    AuthSession,
    CommunityFunnelConfig
  >({
    activeCommunityId: params.activeCommunityId,
    session: params.session,
    ensureSession: params.ensureSession,
    communityFunnelConfig: params.adminUi.communityFunnelConfig,
    normalizeConfigForSave: normalizeCommunityFunnelConfig,
    saveConfig: async ({ session, communityId, normalizedConfig }) => {
      const saved = await saveCloudCommunityPublicPresentation<
        AuthSession,
        CommunityFunnelConfig
      >({
        session,
        communityId,
        config: normalizedConfig,
      });
      params.setCommunities((current) =>
        current.map((community) =>
          community.id === communityId
            ? {
                ...community,
                updated_at: saved?.updated_at || community.updated_at,
              }
            : community,
        ),
      );
      return saved?.funnel ?? normalizedConfig;
    },
    hydrateEditor: params.adminUi.hydrateCommunityFunnelEditor,
    setLoadedCommunityId: (communityId) => {
      params.adminUi.communityFunnelLoadedCommunityIdRef.current = communityId;
    },
    markDraftClean: () => {
      params.adminUi.communityFunnelDirtyRef.current = false;
    },
    setIsLoadingCommunityFunnel:
      params.adminUi.setIsLoadingCommunityFunnel,
    setCommunityFunnelError: params.adminUi.setCommunityFunnelError,
    setCommunityFunnelSaveError: params.adminUi.setCommunityFunnelSaveError,
    setIsSavingCommunityFunnel: params.adminUi.setIsSavingCommunityFunnel,
    loadFailureMessage: "Failed to load funnel settings.",
    saveFailureMessage: "Failed to save funnel settings.",
  });

  useCommunityAgentConfigLifecycle<AuthSession>({
    activePage: params.activePage,
    communityTab: params.communityTab,
    session: params.session,
    activeCommunityId: params.activeCommunityId,
    canManageMembersActiveCommunity: params.canManageMembers,
    loadCommunityAgentConfig: agent.loadCommunityAgentConfig,
    communityAgentConfigLoadedCommunityIdRef:
      params.agentUi.communityAgentConfigLoadedCommunityIdRef,
    setCommunityAgentConfigError: params.agentUi.setCommunityAgentConfigError,
  });

  useEffect(() => {
    if (
      params.activePage !== "community"
      || params.communityTab !== "funnel"
    ) {
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
    params.communityTab,
    params.session,
  ]);

  return {
    loadCommunityAgentConfig: agent.loadCommunityAgentConfig,
    handleSaveCommunityAgentConfig: agent.handleSaveCommunityAgentConfig,
    loadCommunityFunnelConfig: funnel.loadCommunityFunnelConfig,
    handleSaveCommunityFunnel: funnel.handleSaveCommunityFunnel,
  };
}
