import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  markCloudCommunitySurfaceSeen,
  subscribeCloudCommunityAttentionRows,
  type CloudCommunityAttentionRow,
  type CloudCommunityAttentionSurface,
} from "./cloudCommunityAttentionGateway";
import { createCloudCommunityChatLiveClient } from "./cloudCommunityChatGateway";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";
import { resolveAuthPresentationIdentity, type AuthSessionLike } from "./authSession";
import { reuseEquivalentValue } from "./reuseEquivalentValue";

type SessionLike = unknown;

export type CommunityAttentionIndicators = {
  chat: boolean;
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
};

type MarkCommunitySurfaceSeenOptions = {
  seenAtMs?: number;
  optimistic?: boolean;
};

export type InFlightCommunityAttentionMark = {
  communityId: string;
  surface: CloudCommunityAttentionSurface;
  optimistic: boolean;
};

function buildAttentionMap(
  communityIds: string[],
  rows: CloudCommunityAttentionRow[],
): Record<string, CommunityAttentionIndicators> {
  const next: Record<string, CommunityAttentionIndicators> = {};
  for (const communityId of communityIds) {
    next[communityId] = {
      chat: false,
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
      resources: Boolean(row.resources),
      events: Boolean(row.events),
      mentions: Boolean(row.mentions),
      chat_last_seen_at: typeof row.chat_last_seen_at === "number" ? row.chat_last_seen_at : null,
      channels: Array.isArray(row.channels) ? row.channels : [],
    };
  }
  return next;
}

export function applyInFlightCommunityAttentionClears(
  serverAttentionMap: Record<string, CommunityAttentionIndicators>,
  inFlightMarks: Iterable<InFlightCommunityAttentionMark>,
): Record<string, CommunityAttentionIndicators> {
  const nextAttentionMap = { ...serverAttentionMap };
  for (const { communityId, surface, optimistic } of inFlightMarks) {
    if (!optimistic) continue;
    const indicators = nextAttentionMap[communityId];
    if (!indicators || !indicators[surface]) continue;
    nextAttentionMap[communityId] = {
      ...indicators,
      [surface]: false,
    };
  }
  return nextAttentionMap;
}

export function useCommunityAttentionController<SessionT extends SessionLike>(
  args: UseCommunityAttentionControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const [attentionByCommunityId, setAttentionByCommunityId] = useState<
    Record<string, CommunityAttentionIndicators>
  >({});
  const inFlightMarksRef = useRef<Map<string, InFlightCommunityAttentionMark>>(new Map());
  const latestServerAttentionMapRef = useRef<Record<string, CommunityAttentionIndicators>>({});
  const sessionIdentity = resolveAuthPresentationIdentity(args.session as AuthSessionLike);

  const normalizedCommunityIds = useMemo(
    () =>
      Array.from(new Set(args.communityIds.map((communityId) => String(communityId ?? "").trim()).filter(Boolean))).sort(),
    [args.communityIds],
  );

  const normalizedCommunityIdsKey = normalizedCommunityIds.join("\u0000");

  const applyServerRows = useCallback((communityIds: string[], rows: CloudCommunityAttentionRow[]) => {
    const serverAttentionMap = buildAttentionMap(communityIds, rows);
    latestServerAttentionMapRef.current = serverAttentionMap;
    const nextAttentionMap = applyInFlightCommunityAttentionClears(
      serverAttentionMap,
      inFlightMarksRef.current.values(),
    );
    setAttentionByCommunityId((previous) => reuseEquivalentValue(previous, nextAttentionMap));
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
      if (inFlightMarksRef.current.has(key)) return;
      const optimistic = options.optimistic !== false;
      inFlightMarksRef.current.set(key, { communityId, surface, optimistic });
      if (optimistic) {
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
      } catch (error) {
        inFlightMarksRef.current.delete(key);
        setAttentionByCommunityId((previous) =>
          reuseEquivalentValue(
            previous,
            applyInFlightCommunityAttentionClears(
              latestServerAttentionMapRef.current,
              inFlightMarksRef.current.values(),
            ),
          ),
        );
        throw error;
      } finally {
        inFlightMarksRef.current.delete(key);
      }
    },
    [],
  );

  useEffect(() => {
    const communityIds = normalizedCommunityIdsKey
      ? normalizedCommunityIdsKey.split("\u0000")
      : [];
    if (!sessionIdentity || communityIds.length === 0) {
      latestServerAttentionMapRef.current = {};
      setAttentionByCommunityId({});
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let liveClient: ReturnType<typeof createCloudCommunityChatLiveClient> | null = null;
    applyServerRows(communityIds, []);
    void (async () => {
      const current = argsRef.current;
      const usableSession = await resolveUsableSession(current.session, current.ensureSession);
      if (!usableSession || cancelled) return;
      try {
        liveClient = createCloudCommunityChatLiveClient({
          session: usableSession,
          ensureSession: current.ensureSession,
        });
        unsubscribe = subscribeCloudCommunityAttentionRows({
          liveClient,
          communityIds,
          onUpdate: (rows) => {
            if (cancelled) return;
            applyServerRows(communityIds, rows);
          },
        });
      } catch {
        // Attention is presentation state. Community access and navigation
        // remain authoritative when the opportunistic subscription is down.
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
      liveClient?.close();
    };
  }, [applyServerRows, args.ensureSession, normalizedCommunityIdsKey, sessionIdentity]);

  return {
    attentionByCommunityId,
    markCommunitySurfaceSeen,
  };
}
