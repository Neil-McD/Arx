import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from "react";

import { completeCloudBuilderKnowledgeSetup } from "../../../../shared/cloudCommunityAdminGateway";

// A community that was created and not opened yet is "pending" (the server's
// flag is builder_knowledge_setup_pending, from when a knowledge step sat
// here). The last step of starting a community is shown for it.
type PendingCommunity = {
  id: string;
  slug: string;
  created_at: string;
  builder_knowledge_setup_pending?: boolean;
};

type LaunchTab = "agent" | "chat";

export function useWebPendingCommunityController<CommunityT extends PendingCommunity>(params: {
  communities: CommunityT[];
  activeCommunityId: string | null;
  // Where the community opens behind the step, and after it: Home in design v1.
  tab: LaunchTab;
  applyCommunityShellState: (state: { communityId: string; communitySlug: string; communityTab: LaunchTab }) => void;
}) {
  const pendingCommunity = useMemo(
    () => params.communities
      .filter((community) => community.builder_knowledge_setup_pending === true)
      .slice()
      .sort((left, right) => (
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      ))[0] ?? null,
    [params.communities],
  );

  useEffect(() => {
    if (!pendingCommunity || params.activeCommunityId === pendingCommunity.id) return;
    params.applyCommunityShellState({
      communityId: pendingCommunity.id,
      communitySlug: pendingCommunity.slug,
      communityTab: params.tab,
    });
  }, [
    params.activeCommunityId,
    params.applyCommunityShellState,
    params.tab,
    pendingCommunity?.id,
    pendingCommunity?.slug,
  ]);

  return { pendingCommunity };
}

export function useWebCommunityLaunchCompletionController<
  SessionT,
  CommunityT extends PendingCommunity,
>(params: {
  pendingCommunity: CommunityT | null;
  tab: LaunchTab;
  ensureSession: () => Promise<SessionT | null>;
  setCommunities: Dispatch<SetStateAction<CommunityT[]>>;
  enterCommunity: (input: {
    communityId: string;
    communitySlug: string;
    communityTab: LaunchTab;
  }) => void;
}) {
  return useCallback(async (): Promise<boolean> => {
    const community = params.pendingCommunity;
    if (!community) return false;
    const session = await params.ensureSession();
    if (!session) return false;
    // Clears the flag and has the guide welcome the founder.
    const result = await completeCloudBuilderKnowledgeSetup({
      session,
      communityId: community.id,
    });
    if (!result.ok) throw new Error("Polynet could not finish setup. Try again.");
    params.setCommunities((current) => current.map((candidate) => (
      candidate.id === community.id
        ? { ...candidate, builder_knowledge_setup_pending: false }
        : candidate
    )));
    params.enterCommunity({
      communityId: community.id,
      communitySlug: community.slug,
      communityTab: params.tab,
    });
    return true;
  }, [
    params.pendingCommunity,
    params.tab,
    params.ensureSession,
    params.setCommunities,
    params.enterCommunity,
  ]);
}
