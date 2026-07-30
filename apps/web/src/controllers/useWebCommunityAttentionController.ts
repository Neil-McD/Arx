import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { AuthSession } from "../auth";
import type { AppPage, CommunityTab } from "../../../../shared/appShellNavigation";
import { acknowledgeCloudCommunityChatRead } from "../../../../shared/cloudCommunityAttentionGateway";
import { useCommunityAttentionController } from "../../../../shared/useCommunityAttentionController";
import { useCommunityTypingPresence } from "../../../../shared/useCommunityTypingPresence";

type EnsureAuthSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

type InteractionRootLike = {
  root: {
    id: string;
    created_at: string;
    last_reply_at?: string | null;
  };
};

type InteractionReplyLike = {
  reply: {
    id: string;
    created_at: string;
  };
};

type TimestampedRow = {
  created_at: string;
};

type UpdatedRow = {
  updated_at: string;
};

type UseWebCommunityAttentionControllerParams = {
  activeCommunityId: string | null;
  activePage: AppPage;
  canPostMessages: boolean;
  communityIds: string[];
  communityTab: CommunityTab;
  ensureSession: EnsureAuthSession;
  session: AuthSession | null;
  chat: {
    hasResolved: boolean;
  };
  interactions: {
    roots: InteractionRootLike[];
    repliesByRootId: Record<string, InteractionReplyLike[]>;
  };
  aiFeed: {
    isLoading: boolean;
    live: TimestampedRow[];
  };
  resources: {
    isLoading: boolean;
    rows: TimestampedRow[];
  };
  events: {
    cacheKey: string | null;
    hasLoadedVisibleRange: boolean;
    isLoading: boolean;
    rows: UpdatedRow[];
  };
};

function latestTimestamp(
  rows: Array<{ timestamp: string | null | undefined; pending?: boolean }>,
): number | null {
  const timestamps = rows
    .filter((row) => !row.pending)
    .map((row) => Date.parse(String(row.timestamp ?? "")))
    .filter((value) => Number.isFinite(value) && value > 0);
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
}

export function useWebCommunityAttentionModel(
  params: UseWebCommunityAttentionControllerParams,
) {
  const {
    activeCommunityId,
    activePage,
    aiFeed,
    canPostMessages,
    chat,
    communityIds,
    communityTab,
    ensureSession,
    events,
    interactions,
    resources,
    session,
  } = params;
  const isCommunityChatActive =
    activePage === "community" && communityTab === "chat";
  const {
    presence: typingPresence,
    signalTyping,
    clearTyping,
  } = useCommunityTypingPresence({
    isEnabled: isCommunityChatActive && chat.hasResolved,
    session,
    ensureSession,
    activeCommunityId,
    canPostMessages,
  });

  const {
    attentionByCommunityId,
    markCommunitySurfaceSeen,
    refreshCommunityAttention,
  } = useCommunityAttentionController<AuthSession>({
    session,
    ensureSession,
    communityIds,
  });

  const [chatDividerBoundary, setChatDividerBoundary] = useState<number | null>(null);
  const capturedDividerCommunityIdRef = useRef<string | null>(null);
  const seenMarkerBySurfaceRef = useRef<Record<string, string>>({});

  useEffect(() => {
    capturedDividerCommunityIdRef.current = null;
    setChatDividerBoundary(null);
  }, [activeCommunityId]);

  useEffect(() => {
    if (!isCommunityChatActive || !activeCommunityId) return;
    if (capturedDividerCommunityIdRef.current === activeCommunityId) return;
    const indicators = attentionByCommunityId[activeCommunityId];
    if (!indicators) return;
    capturedDividerCommunityIdRef.current = activeCommunityId;
    setChatDividerBoundary(
      typeof indicators.chat_last_seen_at === "number"
        ? indicators.chat_last_seen_at
        : null,
    );
  }, [activeCommunityId, attentionByCommunityId, isCommunityChatActive]);

  const latestChatActivityAt = useMemo(() => {
    const timestamps: Array<{
      timestamp: string | null | undefined;
      pending?: boolean;
    }> = [];
    for (const bundle of interactions.roots) {
      const pending = String(bundle.root.id ?? "").startsWith("pending:");
      timestamps.push({ timestamp: bundle.root.created_at, pending });
      timestamps.push({ timestamp: bundle.root.last_reply_at, pending });
    }
    for (const replies of Object.values(interactions.repliesByRootId)) {
      for (const bundle of replies) {
        timestamps.push({
          timestamp: bundle.reply.created_at,
          pending: String(bundle.reply.id ?? "").startsWith("pending:"),
        });
      }
    }
    return latestTimestamp(timestamps);
  }, [interactions.repliesByRootId, interactions.roots]);

  const latestAiFeedCreatedAt = useMemo(
    () => latestTimestamp(aiFeed.live.map((row) => ({ timestamp: row.created_at }))),
    [aiFeed.live],
  );
  const latestResourcesCreatedAt = useMemo(
    () => latestTimestamp(resources.rows.map((row) => ({ timestamp: row.created_at }))),
    [resources.rows],
  );
  const latestEventsUpdatedAt = useMemo(
    () => latestTimestamp(events.rows.map((row) => ({ timestamp: row.updated_at }))),
    [events.rows],
  );

  useEffect(() => {
    seenMarkerBySurfaceRef.current = {};
  }, [session?.user?.id]);

  const handleChatCaughtUp = useCallback(() => {
    if (
      !isCommunityChatActive
      || !chat.hasResolved
      || !activeCommunityId
      || !session
      || latestChatActivityAt === null
    ) {
      return;
    }
    const communityId = activeCommunityId;
    const throughAtMs = latestChatActivityAt;
    const requestKey = `${communityId}:chat`;
    const marker = String(throughAtMs);
    if (seenMarkerBySurfaceRef.current[requestKey] === marker) return;
    seenMarkerBySurfaceRef.current[requestKey] = marker;
    void (async () => {
      try {
        const usableSession = await ensureSession(session);
        if (!usableSession) throw new Error("auth_session_required");
        await acknowledgeCloudCommunityChatRead({
          session: usableSession,
          communityId,
          throughAtMs,
        });
        await refreshCommunityAttention();
      } catch {
        if (seenMarkerBySurfaceRef.current[requestKey] === marker) {
          delete seenMarkerBySurfaceRef.current[requestKey];
        }
      }
    })();
  }, [
    activeCommunityId,
    chat.hasResolved,
    ensureSession,
    isCommunityChatActive,
    latestChatActivityAt,
    refreshCommunityAttention,
    session,
  ]);

  const acknowledgeSurface = useCallback((
    surface: "ai_feed" | "resources" | "events",
    marker: string,
    options?: {
      seenAtMs?: number;
      optimistic?: boolean;
      refreshAfter?: boolean;
    },
  ) => {
    if (!activeCommunityId) return;
    const requestKey = `${activeCommunityId}:${surface}`;
    if (seenMarkerBySurfaceRef.current[requestKey] === marker) return;
    seenMarkerBySurfaceRef.current[requestKey] = marker;
    void markCommunitySurfaceSeen(activeCommunityId, surface, options).catch(() => {
      if (seenMarkerBySurfaceRef.current[requestKey] === marker) {
        delete seenMarkerBySurfaceRef.current[requestKey];
      }
    });
  }, [activeCommunityId, markCommunitySurfaceSeen]);

  useEffect(() => {
    if (
      activePage !== "community"
      || communityTab !== "ai_feed"
      || !activeCommunityId
      || aiFeed.isLoading
      || latestAiFeedCreatedAt === null
    ) {
      return;
    }
    acknowledgeSurface("ai_feed", String(latestAiFeedCreatedAt));
  }, [
    acknowledgeSurface,
    activeCommunityId,
    activePage,
    aiFeed.isLoading,
    communityTab,
    latestAiFeedCreatedAt,
  ]);

  useEffect(() => {
    if (
      activePage !== "community"
      || communityTab !== "resources"
      || !activeCommunityId
      || resources.isLoading
      || latestResourcesCreatedAt === null
    ) {
      return;
    }
    acknowledgeSurface("resources", String(latestResourcesCreatedAt));
  }, [
    acknowledgeSurface,
    activeCommunityId,
    activePage,
    communityTab,
    latestResourcesCreatedAt,
    resources.isLoading,
  ]);

  useEffect(() => {
    if (
      activePage !== "community"
      || communityTab !== "events"
      || !activeCommunityId
      || events.isLoading
      || !events.hasLoadedVisibleRange
      || !events.cacheKey
      || latestEventsUpdatedAt === null
    ) {
      return;
    }
    acknowledgeSurface(
      "events",
      `${events.cacheKey}:${latestEventsUpdatedAt}`,
      {
        seenAtMs: latestEventsUpdatedAt,
        optimistic: false,
        refreshAfter: true,
      },
    );
  }, [
    acknowledgeSurface,
    activeCommunityId,
    activePage,
    communityTab,
    events.cacheKey,
    events.hasLoadedVisibleRange,
    events.isLoading,
    latestEventsUpdatedAt,
  ]);

  return {
    typingPresence,
    signalTyping,
    clearTyping,
    attentionByCommunityId,
    chatDividerBoundary,
    handleChatCaughtUp,
  };
}
