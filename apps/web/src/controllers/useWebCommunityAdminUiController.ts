import { useCallback, useRef, useState } from "react";

import {
  DEFAULT_COMMUNITY_FUNNEL_CONFIG,
  normalizeCommunityFunnelConfig,
} from "../../../../shared/communityFunnel";
import type { CommunityFunnelConfig } from "../../../../shared/communityTypes";

export function useWebCommunityAdminUiController() {
  const [communityFunnelConfig, setCommunityFunnelConfig] = useState<CommunityFunnelConfig>(
    DEFAULT_COMMUNITY_FUNNEL_CONFIG,
  );
  const [isLoadingCommunityFunnel, setIsLoadingCommunityFunnel] = useState(false);
  const [communityFunnelError, setCommunityFunnelError] = useState<string | null>(null);
  const [isSavingCommunityFunnel, setIsSavingCommunityFunnel] = useState(false);
  const [communityFunnelSaveError, setCommunityFunnelSaveError] = useState<string | null>(null);
  const communityFunnelLoadedCommunityIdRef = useRef<string | null>(null);
  const communityFunnelSavedConfigRef = useRef<CommunityFunnelConfig>(DEFAULT_COMMUNITY_FUNNEL_CONFIG);
  const communityFunnelDirtyRef = useRef(false);

  const markCommunityFunnelDirty = useCallback(() => {
    communityFunnelDirtyRef.current = true;
  }, []);

  const hydrateCommunityFunnelEditor = useCallback((config: CommunityFunnelConfig | null) => {
    const normalized = normalizeCommunityFunnelConfig(config);
    setCommunityFunnelConfig(normalized);
    communityFunnelSavedConfigRef.current = normalized;
    setCommunityFunnelSaveError(null);
    communityFunnelDirtyRef.current = false;
  }, []);

  const handleResetCommunityFunnel = useCallback(() => {
    setCommunityFunnelConfig(communityFunnelSavedConfigRef.current);
    setCommunityFunnelSaveError(null);
    communityFunnelDirtyRef.current = false;
  }, []);

  const resetCommunityFunnelState = useCallback(() => {
    setCommunityFunnelError(null);
    setIsLoadingCommunityFunnel(false);
    communityFunnelLoadedCommunityIdRef.current = null;
    communityFunnelSavedConfigRef.current = DEFAULT_COMMUNITY_FUNNEL_CONFIG;
    setCommunityFunnelConfig(DEFAULT_COMMUNITY_FUNNEL_CONFIG);
    communityFunnelDirtyRef.current = false;
  }, []);

  const [communityMemberMuted, setCommunityMemberMuted] = useState(false);
  const [isLoadingCommunityMemberSettings, setIsLoadingCommunityMemberSettings] = useState(false);
  const [communityMemberSettingsError, setCommunityMemberSettingsError] = useState<string | null>(null);
  const [isLeavingCommunity, setIsLeavingCommunity] = useState(false);

  return {
    communityFunnelConfig,
    setCommunityFunnelConfig,
    isLoadingCommunityFunnel,
    setIsLoadingCommunityFunnel,
    communityFunnelError,
    setCommunityFunnelError,
    isSavingCommunityFunnel,
    setIsSavingCommunityFunnel,
    communityFunnelSaveError,
    setCommunityFunnelSaveError,
    communityFunnelLoadedCommunityIdRef,
    communityFunnelSavedConfigRef,
    communityFunnelDirtyRef,
    markCommunityFunnelDirty,
    hydrateCommunityFunnelEditor,
    handleResetCommunityFunnel,
    resetCommunityFunnelState,
    communityMemberMuted,
    setCommunityMemberMuted,
    isLoadingCommunityMemberSettings,
    setIsLoadingCommunityMemberSettings,
    communityMemberSettingsError,
    setCommunityMemberSettingsError,
    isLeavingCommunity,
    setIsLeavingCommunity,
  };
}
