import { useCallback, useRef, useState } from "react";

import {
  DEFAULT_EMPTY_THREAD_LANDING,
  normalizeCommunityAgentLanding,
  type CommunityAgentLanding,
} from "../../../../shared/communityAgentLanding";
import {
  normalizeCommunityAgentApps,
  normalizeCommunityAgentSkills,
  type CommunityAgentApp,
  type CommunityAgentSkill,
} from "../../../../shared/communityAgentCapabilities";

type CommunityAgentConfigLike = {
  landing_json: unknown;
  system_prompt: string | null;
  skills_json: unknown;
  apps_json: unknown;
} | null;

export function useWebCommunityAgentConfigUiController() {
  const [isLoadingCommunityAgentConfig, setIsLoadingCommunityAgentConfig] = useState(false);
  const [communityAgentConfigError, setCommunityAgentConfigError] = useState<string | null>(null);
  const communityAgentConfigLoadedCommunityIdRef = useRef<string | null>(null);
  const lastHydratedCommunityAgentConfigRef = useRef<CommunityAgentConfigLike>(null);

  const [communityAgentConfigLanding, setCommunityAgentConfigLanding] = useState<CommunityAgentLanding>(
    DEFAULT_EMPTY_THREAD_LANDING,
  );
  const [communityAgentConfigSystemPrompt, setCommunityAgentConfigSystemPrompt] = useState("");
  const [communityAgentConfigSkills, setCommunityAgentConfigSkills] = useState<CommunityAgentSkill[]>([]);
  const [communityAgentConfigApps, setCommunityAgentConfigApps] = useState<CommunityAgentApp[]>([]);
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
    setCommunityAgentConfigSystemPrompt(row?.system_prompt ?? "");
    setCommunityAgentConfigSkills(normalizeCommunityAgentSkills(row?.skills_json));
    setCommunityAgentConfigApps(normalizeCommunityAgentApps(row?.apps_json));
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
    communityAgentConfigSystemPrompt,
    setCommunityAgentConfigSystemPrompt,
    communityAgentConfigSkills,
    setCommunityAgentConfigSkills,
    communityAgentConfigApps,
    setCommunityAgentConfigApps,
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
