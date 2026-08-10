import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
  completeCloudBuilderKnowledgeSetup,
  listCloudPendingCommunityResourceBuilderChangesets,
} from "../../../../shared/cloudCommunityAdminGateway";
import type { AuthSession } from "../auth";
import {
  buildResourceChangesetCardFromPayload,
  type ResourceChangesetCardModel,
} from "../components/RuntimeResourceChangesetApprovalCards";

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

export function useWebBuilderKnowledgeChangesetController(params: {
  communityId: string | null;
  session: AuthSession | null;
  resumeEpoch: number;
}) {
  const [cards, setCards] = useState<ResourceChangesetCardModel[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.communityId || !params.session) {
      setCards([]);
      setError(null);
      return;
    }
    let cancelled = false;
    let pollId: number | null = null;
    const readPendingChangeset = async () => {
      try {
        const rows = await listCloudPendingCommunityResourceBuilderChangesets<
          AuthSession,
          Record<string, unknown>
        >({
          session: params.session as AuthSession,
          communityId: params.communityId as string,
          limit: 1,
        });
        if (cancelled) return;
        setCards(rows.flatMap((row, index) => {
          const updatedAt = Date.parse(String(row.updated_at ?? ""));
          const card = buildResourceChangesetCardFromPayload(
            row,
            Number.isFinite(updatedAt) ? updatedAt : index,
          );
          return card ? [card] : [];
        }));
        setError(null);
      } catch (readError) {
        if (cancelled) return;
        console.warn("builder_knowledge_changeset_recovery_failed", readError);
        setError("Polynet could not verify the resource draft yet.");
      }
    };
    void readPendingChangeset();
    pollId = window.setInterval(() => {
      void readPendingChangeset();
    }, 1_500);
    return () => {
      cancelled = true;
      if (pollId !== null) window.clearInterval(pollId);
    };
  }, [params.communityId, params.resumeEpoch, params.session]);

  return { cards, error };
}

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
  return useCallback(async (): Promise<boolean> => {
    const community = params.pendingCommunity;
    if (!community) return false;
    const session = await params.ensureSession();
    if (!session) return false;
    const result = await completeCloudBuilderKnowledgeSetup({
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
