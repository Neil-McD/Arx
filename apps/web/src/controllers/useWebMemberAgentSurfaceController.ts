import { useEffect, useRef } from "react";

import type {
  AppPage,
  CommunityTab,
} from "../../../../shared/appShellNavigation";
import type {
  MemberAgentSurfaceContextV1,
} from "../../../../shared/memberAgentSurfaceContext";
import type { WebCommunityRecord } from "../webAppContracts";

export function useWebMemberAgentSurfaceController(params: {
  pageMode: boolean;
  activePage: AppPage;
  communityTab: CommunityTab;
  activeCommunity: WebCommunityRecord | null;
  isAuthenticated: boolean;
  publicRouteKind: string;
  hasResolvedCommunities: boolean;
  isDirectMessagesOpen: boolean;
  isOnboardingModalOpen: boolean;
  memberAgentVoiceUiState: string;
  cancelVoiceInput: () => void;
}) {
  const community =
    params.activePage === "community"
      ? params.activeCommunity
      : null;
  const surfaceContext: MemberAgentSurfaceContextV1 | null =
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
      params.memberAgentVoiceUiState !== "idle" &&
      (!isVisible || params.isDirectMessagesOpen || scopeChanged)
    ) {
      params.cancelVoiceInput();
    }
  }, [
    isVisible,
    params.isDirectMessagesOpen,
    params.cancelVoiceInput,
    params.memberAgentVoiceUiState,
    voiceScopeKey,
  ]);

  return {
    community,
    surfaceContext,
    isVisible,
  };
}
