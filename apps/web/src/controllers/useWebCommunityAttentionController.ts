import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { AuthSession } from "../auth";
import type { AppPage, CommunityTab } from "../../../../shared/appShellNavigation";
import { markCloudCommunityChatReadAt } from "../../../../shared/cloudCommunityAttentionGateway";
import { setCloudCommunityTyping } from "../../../../shared/cloudCommunityChatGateway";
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
    inputValue: string;
    isUserAtBottom: boolean;
    messages: TimestampedRow[];
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
  const typingPresence = useCommunityTypingPresence({
    isEnabled: isCommunityChatActive && chat.hasResolved,
    session,
    ensureSession,
    activeCommunityId,
    canPostMessages,
    inputValue: chat.inputValue,
  });

  const threadTypingLastSentAtRef = useRef(0);
  const signalThreadTyping = useCallback((rootId: string) => {
    if (!session || !activeCommunityId || !rootId || !canPostMessages) return;
    const now = Date.now();
    if (now - threadTypingLastSentAtRef.current < 600) return;
    threadTypingLastSentAtRef.current = now;
    void (async () => {
      try {
        const usableSession = await ensureSession(session);
        if (!usableSession) return;
        await setCloudCommunityTyping({
          session: usableSession,
          communityId: activeCommunityId,
          rootId,
        });
      } catch {
        // Typing is best-effort; message delivery remains independent.
      }
    })();
  }, [activeCommunityId, canPostMessages, ensureSession, session]);

  const {
    attentionByCommunityId,
    markCommunitySurfaceSeen,
  } = useCommunityAttentionController<AuthSession>({
    session,
    ensureSession,
    communityIds,
  });

  const [chatDividerBoundary, setChatDividerBoundary] = useState<number | null>(null);
  const capturedDividerCommunityIdRef = useRef<string | null>(null);
  const activeChatCommunityIdRef = useRef<string | null>(null);
  const chatReadAdvanceTimerRef = useRef<number | null>(null);
  const seenMarkerBySurfaceRef = useRef<Record<string, string>>({});

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

  useEffect(() => {
    const nextCommunityId =
      isCommunityChatActive && activeCommunityId ? activeCommunityId : null;
    const previousCommunityId = activeChatCommunityIdRef.current;
    if (previousCommunityId && previousCommunityId !== nextCommunityId) {
      if (session) {
        void markCloudCommunityChatReadAt({
          session,
          communityId: previousCommunityId,
          seenAtMs: Date.now(),
        }).catch(() => {});
      }
      capturedDividerCommunityIdRef.current = null;
      setChatDividerBoundary(null);
    }
    activeChatCommunityIdRef.current = nextCommunityId;
  }, [activeCommunityId, isCommunityChatActive, session]);

  const handleChatCaughtUp = useCallback(() => {
    if (!activeCommunityId || !session) return;
    if (chatReadAdvanceTimerRef.current !== null) return;
    const communityId = activeCommunityId;
    const currentSession = session;
    chatReadAdvanceTimerRef.current = window.setTimeout(() => {
      chatReadAdvanceTimerRef.current = null;
      void markCloudCommunityChatReadAt({
        session: currentSession,
        communityId,
        seenAtMs: Date.now(),
      }).catch(() => {});
    }, 2000);
  }, [activeCommunityId, session]);

  useEffect(() => {
    const advanceOnHide = () => {
      if (document.visibilityState !== "hidden") return;
      const communityId = activeChatCommunityIdRef.current;
      if (!communityId || !session) return;
      void markCloudCommunityChatReadAt({
        session,
        communityId,
        seenAtMs: Date.now(),
      }).catch(() => {});
    };
    document.addEventListener("visibilitychange", advanceOnHide);
    window.addEventListener("pagehide", advanceOnHide);
    return () => {
      document.removeEventListener("visibilitychange", advanceOnHide);
      window.removeEventListener("pagehide", advanceOnHide);
    };
  }, [session]);

  useEffect(() => {
    return () => {
      if (chatReadAdvanceTimerRef.current !== null) {
        window.clearTimeout(chatReadAdvanceTimerRef.current);
      }
    };
  }, []);

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
    for (const message of chat.messages) {
      timestamps.push({
        timestamp: message.created_at,
        pending: String((message as { id?: string }).id ?? "").startsWith("pending-"),
      });
    }
    return latestTimestamp(timestamps);
  }, [chat.messages, interactions.repliesByRootId, interactions.roots]);

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

  const acknowledgeSurface = useCallback((
    surface: "chat" | "ai_feed" | "resources" | "events",
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
      !isCommunityChatActive
      || !activeCommunityId
      || !chat.hasResolved
      || !chat.isUserAtBottom
      || latestChatActivityAt === null
    ) {
      return;
    }
    acknowledgeSurface("chat", String(latestChatActivityAt), {
      seenAtMs: latestChatActivityAt,
    });
  }, [
    acknowledgeSurface,
    activeCommunityId,
    chat.hasResolved,
    chat.isUserAtBottom,
    isCommunityChatActive,
    latestChatActivityAt,
  ]);

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
    signalThreadTyping,
    attentionByCommunityId,
    chatDividerBoundary,
    handleChatCaughtUp,
  };
}
