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
  pageMode: boolean;
  activePage: AppPage;
  communityTab: CommunityTab;
  activeCommunity: WebCommunityRecord | null;
  isAuthenticated: boolean;
  publicRouteKind: string;
  hasResolvedCommunities: boolean;
  isDirectMessagesOpen: boolean;
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
          // Members and About are layout tabs the agent's context doesn't
          // name; they read as the community itself and its public page.
          section: params.communityTab === "members"
            ? "chat"
            : params.communityTab === "about"
              ? "funnel"
              // The members database is an owner page beside Workflows.
              : params.communityTab === "people"
                ? "workflows"
                : params.communityTab,
        }
      : null;
  const isVisible =
    params.isAuthenticated &&
    params.publicRouteKind === "app" &&
    params.activePage === "community" &&
    params.hasResolvedCommunities &&
    Boolean(surfaceContext) &&
    (params.pageMode || !params.isDirectMessagesOpen) &&
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
      (!isVisible || params.isDirectMessagesOpen || scopeChanged)
    ) {
      params.cancelVoiceInput();
    }
  }, [
    isVisible,
    params.isDirectMessagesOpen,
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
