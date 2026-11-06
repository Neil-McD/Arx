import { useEffect, useRef } from "react";

import type {
  AppPage,
  CommunityTab,
} from "../../../../shared/appShellNavigation";
import type {
  CommunityAgentSurfaceContextV1,
} from "../../../../shared/communityAgentSurfaceContext";
import type { WebCommunityRecord } from "../webAppContracts";

export function useWebCommunityAgentSurfaceController(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  activeCommunity: WebCommunityRecord | null;
  isAuthenticated: boolean;
  publicRouteKind: string;
  hasResolvedCommunities: boolean;
  isOnboardingModalOpen: boolean;
  communityAgentVoiceUiState: string;
  cancelVoiceInput: () => void;
}) {
  const community =
    params.activePage === "community"
      ? params.activeCommunity
      : null;
  const surfaceContext: CommunityAgentSurfaceContextV1 | null =
    params.activePage === "community" && community?.id && community.slug
      ? {
          version: 1,
          kind: "community",
          community_slug: community.slug,
          section: params.communityTab,
        }
      : null;
  const isVisible =
    params.isAuthenticated &&
    params.publicRouteKind === "app" &&
    params.activePage === "community" &&
    params.hasResolvedCommunities &&
    Boolean(surfaceContext) &&
    !params.isOnboardingModalOpen;
  const voiceScopeKey =
    `${params.activePage}:${params.communityTab}:${community?.id ?? "none"}`;
  const previousVoiceScopeKeyRef = useRef(voiceScopeKey);

  useEffect(() => {
    const scopeChanged =
      previousVoiceScopeKeyRef.current !== voiceScopeKey;
    previousVoiceScopeKeyRef.current = voiceScopeKey;
    if (
      params.communityAgentVoiceUiState !== "idle" &&
      (!isVisible || scopeChanged)
    ) {
      params.cancelVoiceInput();
    }
  }, [
    isVisible,
    params.cancelVoiceInput,
    params.communityAgentVoiceUiState,
    voiceScopeKey,
  ]);

  return {
    community,
    surfaceContext,
    isVisible,
  };
}
