import { useCallback, useRef, useState } from "react";

import {
  DEFAULT_EMPTY_THREAD_LANDING,
  normalizeCommunityAgentLanding,
  type CommunityAgentLanding,
} from "../../../../shared/communityAgentLanding";

type CommunityAgentConfigLike = {
  landing_json: unknown;
  community_system_prompt?: string | null;
  system_prompt: string | null;
} | null;

export function useWebCommunityAgentConfigUiController() {
  const [isLoadingCommunityAgentConfig, setIsLoadingCommunityAgentConfig] = useState(false);
  const [communityAgentConfigError, setCommunityAgentConfigError] = useState<string | null>(null);
  const communityAgentConfigLoadedCommunityIdRef = useRef<string | null>(null);
  const lastHydratedCommunityAgentConfigRef = useRef<CommunityAgentConfigLike>(null);

  const [communityAgentConfigLanding, setCommunityAgentConfigLanding] = useState<CommunityAgentLanding>(
    DEFAULT_EMPTY_THREAD_LANDING,
  );
  const [communityAgentConfigCommunitySystemPrompt, setCommunityAgentConfigCommunitySystemPrompt] = useState("");
  const [isSavingCommunityAgentConfig, setIsSavingCommunityAgentConfig] = useState(false);
  const [communityAgentConfigSaveError, setCommunityAgentConfigSaveError] = useState<string | null>(null);
  const communityAgentConfigDirtyRef = useRef(false);

  const markCommunityAgentConfigDirty = useCallback(() => {
    communityAgentConfigDirtyRef.current = true;
  }, []);

  const hydrateCommunityAgentEditor = useCallback((row: CommunityAgentConfigLike) => {
    lastHydratedCommunityAgentConfigRef.current = row;
    const landing = normalizeCommunityAgentLanding(row?.landing_json) ?? DEFAULT_EMPTY_THREAD_LANDING;
    setCommunityAgentConfigLanding(landing);
    setCommunityAgentConfigCommunitySystemPrompt(row?.community_system_prompt ?? row?.system_prompt ?? "");
    setCommunityAgentConfigSaveError(null);
    communityAgentConfigDirtyRef.current = false;
  }, []);

  const handleResetCommunityAgentConfig = useCallback(() => {
    hydrateCommunityAgentEditor(lastHydratedCommunityAgentConfigRef.current);
  }, [hydrateCommunityAgentEditor]);

  return {
    isLoadingCommunityAgentConfig,
    setIsLoadingCommunityAgentConfig,
    communityAgentConfigError,
    setCommunityAgentConfigError,
    communityAgentConfigLoadedCommunityIdRef,
    communityAgentConfigLanding,
    setCommunityAgentConfigLanding,
    communityAgentConfigCommunitySystemPrompt,
    setCommunityAgentConfigCommunitySystemPrompt,
    isSavingCommunityAgentConfig,
    setIsSavingCommunityAgentConfig,
    communityAgentConfigSaveError,
    setCommunityAgentConfigSaveError,
    communityAgentConfigDirtyRef,
    markCommunityAgentConfigDirty,
    hydrateCommunityAgentEditor,
    handleResetCommunityAgentConfig,
  };
}
