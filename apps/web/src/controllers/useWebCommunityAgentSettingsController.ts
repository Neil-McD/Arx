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
import type { CommunityAgentConfig } from "../../../../shared/communityTypes";
import { useCommunityAgentConfigController } from "../../../../shared/useCommunityAgentDraftController";
import { useCommunityAgentConfigLifecycle } from "../../../../shared/useCommunityAgentConfigLifecycle";
import type { WebCommunityRecord } from "../webAppContracts";
import type { useWebCommunityAgentConfigUiController } from "./useWebCommunityAgentConfigUiController";

type EnsureAuthSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

type AgentConfig = CommunityAgentConfig<CommunityAgentLanding>;

export function useWebCommunityAgentSettingsController(params: {
  activeCommunityId: string | null;
  activePage: AppPage;
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

  return {
    loadCommunityAgentConfig: agent.loadCommunityAgentConfig,
    handleSaveCommunityAgentConfig: agent.handleSaveCommunityAgentConfig,
  };
}
