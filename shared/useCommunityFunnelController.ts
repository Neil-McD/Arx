import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

import {
  fetchCloudCommunityFunnelConfig,
  upsertCloudCommunityFunnelConfig,
} from "./cloudCommunityFunnelGateway";

type SessionLike = {
  user: {
    id: string;
  };
};

type UseCommunityFunnelControllerArgs<SessionT extends SessionLike, ConfigT> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  communityFunnelConfig: ConfigT;
  normalizeConfigForSave: (config: ConfigT) => ConfigT;
  saveConfig?: (params: {
    session: SessionT;
    communityId: string;
    normalizedConfig: ConfigT;
  }) => Promise<ConfigT | null>;
  hydrateEditor: (config: ConfigT | null) => void;
  setLoadedCommunityId: (communityId: string | null) => void;
  markDraftClean: () => void;
  setIsLoadingCommunityFunnel: Dispatch<SetStateAction<boolean>>;
  setCommunityFunnelError: Dispatch<SetStateAction<string | null>>;
  setCommunityFunnelSaveError: Dispatch<SetStateAction<string | null>>;
  setIsSavingCommunityFunnel: Dispatch<SetStateAction<boolean>>;
  loadFailureMessage: string;
  saveFailureMessage: string;
};

export function useCommunityFunnelController<SessionT extends SessionLike, ConfigT>(
  args: UseCommunityFunnelControllerArgs<SessionT, ConfigT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadCommunityFunnelConfig = useCallback(async (communityId: string, session: SessionT) => {
    const current = argsRef.current;
    current.setIsLoadingCommunityFunnel(true);
    current.setCommunityFunnelError(null);
    try {
      const config = await fetchCloudCommunityFunnelConfig<SessionT, ConfigT>({
        session,
        communityId,
      });
      current.hydrateEditor(config);
      current.setLoadedCommunityId(communityId);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : current.loadFailureMessage;
      current.setCommunityFunnelError(message);
      current.hydrateEditor(null);
      current.setLoadedCommunityId(communityId);
    } finally {
      current.setIsLoadingCommunityFunnel(false);
    }
  }, []);

  const handleSaveCommunityFunnel = useCallback(async (): Promise<boolean> => {
    const current = argsRef.current;
    if (!current.session || !current.activeCommunityId) return false;
    current.setIsSavingCommunityFunnel(true);
    current.setCommunityFunnelSaveError(null);
    try {
      const normalized = current.normalizeConfigForSave(current.communityFunnelConfig);
      const saved = current.saveConfig
        ? await current.saveConfig({
            session: current.session,
            communityId: current.activeCommunityId,
            normalizedConfig: normalized,
          })
        : await upsertCloudCommunityFunnelConfig<SessionT, ConfigT>({
            session: current.session,
            communityId: current.activeCommunityId,
            config: normalized,
          });
      current.hydrateEditor(saved ?? normalized);
      current.markDraftClean();
      return true;
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : current.saveFailureMessage;
      current.setCommunityFunnelSaveError(message);
      return false;
    } finally {
      current.setIsSavingCommunityFunnel(false);
    }
  }, []);

  return {
    loadCommunityFunnelConfig,
    handleSaveCommunityFunnel,
  };
}
