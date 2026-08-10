import { useCallback, useRef, useState } from "react";

import {
  DEFAULT_COMMUNITY_FUNNEL_MANAGER_CONFIG,
  normalizeCommunityFunnelManagerConfig,
} from "../../../../shared/communityFunnel";
import type { CommunityFunnelManagerConfig } from "../../../../shared/communityTypes";

export function useWebCommunityAdminUiController() {
  const [communityFunnelConfig, setCommunityFunnelConfig] = useState<CommunityFunnelManagerConfig>(
    DEFAULT_COMMUNITY_FUNNEL_MANAGER_CONFIG,
  );
  const [isLoadingCommunityFunnel, setIsLoadingCommunityFunnel] = useState(false);
  const [communityFunnelError, setCommunityFunnelError] = useState<string | null>(null);
  const communityFunnelLoadedCommunityIdRef = useRef<string | null>(null);

  const hydrateCommunityFunnelEditor = useCallback((config: CommunityFunnelManagerConfig | null) => {
    const normalized = normalizeCommunityFunnelManagerConfig(config);
    setCommunityFunnelConfig(normalized);
  }, []);

  const resetCommunityFunnelState = useCallback(() => {
    setCommunityFunnelError(null);
    setIsLoadingCommunityFunnel(false);
    communityFunnelLoadedCommunityIdRef.current = null;
    setCommunityFunnelConfig(DEFAULT_COMMUNITY_FUNNEL_MANAGER_CONFIG);
  }, []);

  const [communityMemberMuted, setCommunityMemberMuted] = useState(false);
  const [isLoadingCommunityMemberSettings, setIsLoadingCommunityMemberSettings] = useState(false);
  const [communityMemberSettingsError, setCommunityMemberSettingsError] = useState<string | null>(null);
  const [isLeavingCommunity, setIsLeavingCommunity] = useState(false);

  return {
    communityFunnelConfig,
    isLoadingCommunityFunnel,
    setIsLoadingCommunityFunnel,
    communityFunnelError,
    setCommunityFunnelError,
    communityFunnelLoadedCommunityIdRef,
    hydrateCommunityFunnelEditor,
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
