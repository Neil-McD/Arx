import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
  buildCloudBuilderKnowledgeResources,
  completeCloudBuilderKnowledgeSetup,
} from "../../../../shared/cloudCommunityAdminGateway";

type BuilderKnowledgeCommunity = {
  id: string;
  slug: string;
  created_at: string;
  builder_knowledge_setup_pending?: boolean;
};

type CommunityShellState = {
  communityId: string;
  communitySlug: string;
  communityTab: "resources";
};

export function useWebBuilderKnowledgeHydrationController<
  SessionT,
  CommunityT extends BuilderKnowledgeCommunity,
>(params: {
  communities: CommunityT[];
  activeCommunityId: string | null;
  resumeEpoch: number;
  getSession: () => SessionT | null;
  applyCommunityShellState: (state: CommunityShellState) => void;
  loadCommunityResources: (
    communityId: string,
    session: SessionT,
  ) => Promise<unknown>;
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
  const [hydratedCommunityId, setHydratedCommunityId] = useState<string | null>(null);
  const getSessionRef = useRef(params.getSession);
  getSessionRef.current = params.getSession;

  useEffect(() => {
    if (!pendingCommunity) {
      setHydratedCommunityId(null);
      return;
    }
    if (params.activeCommunityId !== pendingCommunity.id) {
      setHydratedCommunityId(null);
      params.applyCommunityShellState({
        communityId: pendingCommunity.id,
        communitySlug: pendingCommunity.slug,
        communityTab: "resources",
      });
      return;
    }
    const session = getSessionRef.current();
    if (!session) {
      setHydratedCommunityId(null);
      return;
    }
    let cancelled = false;
    setHydratedCommunityId(null);
    void params.loadCommunityResources(pendingCommunity.id, session)
      .catch((error) => {
        if (!cancelled) {
          console.warn("[builder-knowledge-setup] failed to load sources:", error);
        }
      })
      .finally(() => {
        if (!cancelled) setHydratedCommunityId(pendingCommunity.id);
      });
    return () => {
      cancelled = true;
    };
  }, [
    params.activeCommunityId,
    params.resumeEpoch,
    params.applyCommunityShellState,
    params.loadCommunityResources,
    pendingCommunity?.id,
    pendingCommunity?.slug,
  ]);

  return {
    pendingBuilderKnowledgeCommunity: pendingCommunity,
    hydratedBuilderKnowledgeCommunityId: hydratedCommunityId,
  };
}

export function useWebBuilderKnowledgeCompletionController<
  SessionT,
  CommunityT extends BuilderKnowledgeCommunity,
>(params: {
  pendingCommunity: CommunityT | null;
  ensureSession: () => Promise<SessionT | null>;
  setCommunities: Dispatch<SetStateAction<CommunityT[]>>;
  enterCommunity: (input: {
    communityId: string;
    communitySlug: string;
    communityTab: "chat";
  }) => void;
}) {
  return useCallback(async (mode: "skip" | "build"): Promise<boolean> => {
    const community = params.pendingCommunity;
    if (!community) return false;
    const session = await params.ensureSession();
    if (!session) return false;
    const result = mode === "build"
      ? await buildCloudBuilderKnowledgeResources({
          session,
          communityId: community.id,
        })
      : await completeCloudBuilderKnowledgeSetup({
          session,
          communityId: community.id,
        });
    if (!result.ok) return false;
    params.setCommunities((current) => current.map((candidate) => (
      candidate.id === community.id
        ? { ...candidate, builder_knowledge_setup_pending: false }
        : candidate
    )));
    params.enterCommunity({
      communityId: community.id,
      communitySlug: community.slug,
      communityTab: "chat",
    });
    return true;
  }, [
    params.pendingCommunity,
    params.ensureSession,
    params.setCommunities,
    params.enterCommunity,
  ]);
}
