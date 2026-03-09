import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

import {
  fetchCloudCommunityAgentConfig,
  saveCloudCommunityAgentConfig,
} from "./cloudCommunityAgentGateway";

type SessionLike = {
  user: {
    id: string;
  };
};

type CommunityAgentConfigLike<LandingT> = {
  id: string;
  community_id: string;
  landing_json: LandingT | null;
  system_prompt: string | null;
  updated_at: string;
};

type UseCommunityAgentConfigControllerArgs<
  SessionT extends SessionLike,
  LandingT,
  ConfigT extends CommunityAgentConfigLike<LandingT>,
> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  communityAgentConfigLanding: LandingT;
  communityAgentConfigSystemPrompt: string;
  normalizeConfigForSave: (config: LandingT) => LandingT | null;
  hydrateConfigEditor: (config: ConfigT | null) => void;
  setLoadedCommunityId: (communityId: string | null) => void;
  markConfigClean: () => void;
  setIsLoadingCommunityAgentConfig: Dispatch<SetStateAction<boolean>>;
  setCommunityAgentConfigError: Dispatch<SetStateAction<string | null>>;
  setIsSavingCommunityAgentConfig: Dispatch<SetStateAction<boolean>>;
  setCommunityAgentConfigSaveError: Dispatch<SetStateAction<string | null>>;
  saveValidationErrorMessage: string;
  loadFailureMessage: string;
  saveFailureMessage: string;
};

type UpsertConfigResponseRow = {
  id: string;
  updated_at: string;
};

export function useCommunityAgentConfigController<
  SessionT extends SessionLike,
  LandingT,
  ConfigT extends CommunityAgentConfigLike<LandingT>,
>(
  args: UseCommunityAgentConfigControllerArgs<SessionT, LandingT, ConfigT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadCommunityAgentConfig = useCallback(async (communityId: string, session: SessionT) => {
    const current = argsRef.current;
    current.setIsLoadingCommunityAgentConfig(true);
    current.setCommunityAgentConfigError(null);
    try {
      const row = await fetchCloudCommunityAgentConfig<SessionT, ConfigT>({
        session,
        communityId,
      });
      current.setLoadedCommunityId(communityId);
      current.hydrateConfigEditor(row);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : current.loadFailureMessage;
      current.setCommunityAgentConfigError(message);
      current.setLoadedCommunityId(communityId);
    } finally {
      current.setIsLoadingCommunityAgentConfig(false);
    }
  }, []);

  const handleSaveCommunityAgentConfig = useCallback(async (): Promise<boolean> => {
    const current = argsRef.current;
    const session = current.session;
    const communityId = current.activeCommunityId;
    if (!session || !communityId) return false;

    const normalized = current.normalizeConfigForSave(current.communityAgentConfigLanding);
    if (!normalized) {
      current.setCommunityAgentConfigSaveError(current.saveValidationErrorMessage);
      return false;
    }

    current.setIsSavingCommunityAgentConfig(true);
    current.setCommunityAgentConfigSaveError(null);
    try {
      const row = (await saveCloudCommunityAgentConfig({
        session,
        communityId,
        landingJson: normalized,
        systemPrompt: current.communityAgentConfigSystemPrompt,
      })) as UpsertConfigResponseRow | null;
      if (!row) return false;
      current.hydrateConfigEditor({
        id: row.id,
        community_id: communityId,
        landing_json: normalized,
        system_prompt: current.communityAgentConfigSystemPrompt,
        updated_at: row.updated_at,
      } as ConfigT);
      current.markConfigClean();
      return true;
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : current.saveFailureMessage;
      current.setCommunityAgentConfigSaveError(message);
      return false;
    } finally {
      current.setIsSavingCommunityAgentConfig(false);
    }
  }, []);

  return {
    loadCommunityAgentConfig,
    handleSaveCommunityAgentConfig,
  };
}
