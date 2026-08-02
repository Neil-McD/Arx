import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listCloudCommunityAttentionRows,
  markCloudCommunitySurfaceSeen,
  type CloudCommunityAttentionRow,
  type CloudCommunityAttentionSurface,
} from "./cloudCommunityAttentionGateway";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";
import { resolveAuthPresentationIdentity, type AuthSessionLike } from "./authSession";
import { useResumeEpochEffect } from "./useResumeEpochEffect";

type SessionLike = unknown;

export type CommunityAttentionIndicators = {
  chat: boolean;
  ai_feed: boolean;
  resources: boolean;
  events: boolean;
  // Unseen mention-of-me: rides the chat surface visually as the accent dot.
  mentions: boolean;
  chat_last_seen_at?: number | null;
  channels: NonNullable<CloudCommunityAttentionRow["channels"]>;
};

type UseCommunityAttentionControllerArgs<SessionT extends SessionLike> = {
  session: SessionT | null;
  communityIds: string[];
  ensureSession?: EnsureSessionFn<SessionT>;
  resumeEpoch: number;
  pollIntervalMs?: number;
};

type MarkCommunitySurfaceSeenOptions = {
  seenAtMs?: number;
  optimistic?: boolean;
  refreshAfter?: boolean;
};

function buildAttentionMap(
  communityIds: string[],
  rows: CloudCommunityAttentionRow[],
): Record<string, CommunityAttentionIndicators> {
  const next: Record<string, CommunityAttentionIndicators> = {};
  for (const communityId of communityIds) {
    next[communityId] = {
      chat: false,
      ai_feed: false,
      resources: false,
      events: false,
      mentions: false,
      chat_last_seen_at: null,
      channels: [],
    };
  }
  for (const row of rows) {
    const communityId = String(row.community_id ?? "").trim();
    if (!communityId) continue;
    next[communityId] = {
      chat: Boolean(row.chat),
      ai_feed: Boolean(row.ai_feed),
      resources: Boolean(row.resources),
      events: Boolean(row.events),
      mentions: Boolean(row.mentions),
      chat_last_seen_at: typeof row.chat_last_seen_at === "number" ? row.chat_last_seen_at : null,
      channels: Array.isArray(row.channels) ? row.channels : [],
    };
  }
  return next;
}

export function useCommunityAttentionController<SessionT extends SessionLike>(
  args: UseCommunityAttentionControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const [attentionByCommunityId, setAttentionByCommunityId] = useState<
    Record<string, CommunityAttentionIndicators>
  >({});
  const [isLoadingCommunityAttention, setIsLoadingCommunityAttention] = useState(false);
  const [communityAttentionError, setCommunityAttentionError] = useState<string | null>(null);
  const loadGenerationRef = useRef(0);
  const inFlightMarkKeysRef = useRef<Set<string>>(new Set());
  const sessionIdentity = resolveAuthPresentationIdentity(args.session as AuthSessionLike);

  const normalizedCommunityIds = useMemo(
    () =>
      Array.from(new Set(args.communityIds.map((communityId) => String(communityId ?? "").trim()).filter(Boolean))).sort(),
    [args.communityIds],
  );

  const refreshCommunityAttention = useCallback(async () => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(current.session, current.ensureSession);
    const communityIds = Array.from(
      new Set(current.communityIds.map((communityId) => String(communityId ?? "").trim()).filter(Boolean)),
    ).sort();
    const generation = (loadGenerationRef.current += 1);

    if (!usableSession || communityIds.length === 0) {
      setAttentionByCommunityId({});
      setCommunityAttentionError(null);
      setIsLoadingCommunityAttention(false);
      return;
    }

    setIsLoadingCommunityAttention(true);
    setCommunityAttentionError(null);
    try {
      const rows = await listCloudCommunityAttentionRows({
        session: usableSession,
        communityIds,
      });
      if (loadGenerationRef.current !== generation) return;
      const nextAttentionMap = buildAttentionMap(communityIds, rows);
      for (const key of inFlightMarkKeysRef.current) {
        const [communityId, surface] = key.split(":");
        if (
          !communityId ||
          (surface !== "chat" && surface !== "ai_feed" && surface !== "resources" && surface !== "events" && surface !== "mentions")
        ) continue;
        if (!nextAttentionMap[communityId]) continue;
        nextAttentionMap[communityId] = {
          ...nextAttentionMap[communityId],
          [surface]: false,
        };
      }
      setAttentionByCommunityId(nextAttentionMap);
    } catch (error) {
      if (loadGenerationRef.current !== generation) return;
      setCommunityAttentionError(error instanceof Error ? error.message : "Failed to load community attention.");
    } finally {
      if (loadGenerationRef.current === generation) {
        setIsLoadingCommunityAttention(false);
      }
    }
  }, []);

  const markCommunitySurfaceSeen = useCallback(
    async (
      communityIdRaw: string,
      surface: CloudCommunityAttentionSurface,
      options: MarkCommunitySurfaceSeenOptions = {},
    ) => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(current.session, current.ensureSession);
      const communityId = String(communityIdRaw ?? "").trim();
      if (!usableSession || !communityId) return;
      const markerKey =
        typeof options.seenAtMs === "number" && Number.isFinite(options.seenAtMs)
          ? String(Math.floor(options.seenAtMs))
          : "";
      const key = `${communityId}:${surface}:${markerKey}`;
      if (inFlightMarkKeysRef.current.has(key)) return;
      inFlightMarkKeysRef.current.add(key);
      if (options.optimistic !== false) {
        setAttentionByCommunityId((prev) => {
          const currentIndicators = prev[communityId];
          if (!currentIndicators || !currentIndicators[surface]) return prev;
          return {
            ...prev,
            [communityId]: {
              ...currentIndicators,
              [surface]: false,
            },
          };
        });
      }
      try {
        await markCloudCommunitySurfaceSeen({
          session: usableSession,
          communityId,
          surface,
          seenAtMs: options.seenAtMs,
        });
        if (options.refreshAfter) {
          await refreshCommunityAttention();
        }
      } catch (error) {
        void refreshCommunityAttention();
        throw error;
      } finally {
        inFlightMarkKeysRef.current.delete(key);
      }
    },
    [refreshCommunityAttention],
  );

  useEffect(() => {
    void refreshCommunityAttention();
  }, [normalizedCommunityIds, refreshCommunityAttention, sessionIdentity]);

  useResumeEpochEffect(args.resumeEpoch, () => {
    if (!sessionIdentity || normalizedCommunityIds.length === 0) return;
    void refreshCommunityAttention();
  });

  useEffect(() => {
    if (!sessionIdentity || normalizedCommunityIds.length === 0) return;
    const pollIntervalMs = Math.max(15_000, Math.floor(args.pollIntervalMs ?? 30_000));
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshCommunityAttention();
    }, pollIntervalMs);
    return () => window.clearInterval(intervalId);
  }, [args.pollIntervalMs, sessionIdentity, normalizedCommunityIds, refreshCommunityAttention]);

  return {
    attentionByCommunityId,
    isLoadingCommunityAttention,
    communityAttentionError,
    refreshCommunityAttention,
    markCommunitySurfaceSeen,
  };
}
