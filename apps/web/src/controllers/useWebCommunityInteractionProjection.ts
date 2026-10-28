import {
  setCloudCommunityChannelPinnedRoot,
} from "../../../../shared/cloudCommunityChannelsGateway";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { AuthSession } from "../auth";
import {
  createCloudCommunityChatLiveClient,
  subscribeCloudCommunityActivityEvents,
  type CloudCommunityChatLiveClient,
} from "../../../../shared/cloudCommunityChatGateway";
import { applyLiveRootWindow, mergeOlderRootPage } from "./communityRootWindows";
import type { CommunityActivityEvent } from "../../../../shared/communityTypes";
import {
  subscribeCloudCommunityAgentServeIssue,
  type CloudCommunityAgentServeIssue,
} from "../../../../shared/cloudCommunityAgentConciergeGateway";
import {
  createCloudCommunityInteractionComposerMessageRows,
  deleteCloudCommunityInteractionMessage,
  editCloudCommunityInteractionMessage,
  listCloudCommunityInteractionReplies,
  listCloudCommunityInteractionRootsPage,
  subscribeCloudCommunityInteractionReplies,
  subscribeCloudCommunityInteractionRoots,
  subscribeCloudCommunityChannelInteractionRoot,
  subscribeCloudCommunityChannelPinnedRoot,
  toggleCloudCommunityInteractionReaction,
  type CommunityInteractionAttachment,
  type CommunityInteractionPendingStatus,
  type CommunityInteractionReplyBundle,
  type CommunityInteractionRootBundle,
} from "../../../../shared/cloudCommunityInteractionsGateway";
const COMMUNITY_INTERACTION_ROOT_LIMIT = 50;
const COMMUNITY_INTERACTION_REPLY_LIMIT = 80;
const MAX_INTERACTION_IDEMPOTENCY_KEY_CHARS = 160;

type EnsureAuthSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

type OptimisticAttachment = {
  id: string;
  name: string;
  type: string;
  mime?: string | null;
  size: number;
  storage_id?: string | null;
  url?: string | null;
  data_url?: string | null;
};

export type CommunityInteractionOptimisticInsert<AttachmentT> = {
  idempotencyKey: string;
  communityId: string;
  channelId: string | null;
  kind: "root" | "reply";
  rootId: string | null;
  replyToMessageId: string | null;
  text: string;
  attachments: AttachmentT[];
  serializedAttachments: unknown[];
  serializedMentions: { userId?: string; agentKey?: string; roleKey?: string }[];
  createdAt: string;
  senderId: string;
};

type PendingCanonicalInteraction<AttachmentT> =
  CommunityInteractionOptimisticInsert<AttachmentT> & {
    status: CommunityInteractionPendingStatus;
  };

type UseWebCommunityInteractionProjectionParams = {
  activeCommunityId: string | null;
  activeChannelId: string | null;
  activeChannelIsGeneral: boolean;
  canonicalSessionUserId: string | null;
  ensureSession: EnsureAuthSession;
  isCommunityChatActive: boolean;
  session: AuthSession | null;
};

export type CommunityInteractionSidecar =
  | { kind: "context" }
  | { kind: "thread"; rootId: string };

function formatProjectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.trim().toLowerCase();
  if (normalized.includes("community_entitlement_required")) {
    return "Join this community to view threads.";
  }
  if (normalized.includes("verified_identity_required") || normalized.includes("convex_auth")) {
    return "Sign in to view community threads.";
  }
  if (normalized.includes("profile_setup_required")) {
    return "Finish your profile to view community threads.";
  }
  return message.trim() || "Failed to load community threads.";
}

export function communityProjectionAccessLost(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /community_channel_(unavailable|inactive|not_found)|community_(forbidden|archived|entitlement_required)|auth_session|convex_auth/i.test(message);
}

function formatPinnedRootError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.trim().toLowerCase();
  if (normalized.includes("community_channel_pin_target_invalid")) {
    return "This post can no longer be pinned in this channel.";
  }
  if (normalized.includes("community_channel_pin_invalid")) {
    return "The pinned post is no longer available.";
  }
  if (normalized.includes("community_forbidden")) {
    return "Only community managers can pin posts.";
  }
  return formatProjectionError(error);
}

function storedIdempotencyKey(rawKey: string, kind: "root" | "reply"): string {
  return `community_composer:${kind}:${rawKey}`.slice(0, MAX_INTERACTION_IDEMPOTENCY_KEY_CHARS);
}

function optimisticAttachment(attachment: OptimisticAttachment): CommunityInteractionAttachment {
  const storageId = String(attachment.storage_id ?? "").trim();
  const dataUrl =
    typeof attachment.data_url === "string" && attachment.data_url.trim()
      ? attachment.data_url.trim()
      : null;
  const url =
    typeof attachment.url === "string" && attachment.url.trim()
      ? attachment.url.trim()
      : null;
  return {
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    mime: attachment.mime ?? null,
    size: Math.max(0, Math.floor(Number(attachment.size) || 0)),
    ...(storageId ? { storage_id: storageId } : null),
    ...(url ? { url } : null),
    ...(dataUrl ? { data_url: dataUrl } : null),
  };
}

function buildOptimisticRoot<AttachmentT extends OptimisticAttachment>(
  pending: PendingCanonicalInteraction<AttachmentT>,
): CommunityInteractionRootBundle {
  return {
    deduped: false,
    pending: pending.status,
    content_blocks: [],
    embeds: [],
    mentions: [],
    attachments: pending.attachments.map(optimisticAttachment),
    root: {
      id: `pending:${pending.idempotencyKey}`,
      community_id: pending.communityId,
      channel_id: pending.channelId,
      actor_type: "human",
      actor_user_id: pending.senderId,
      actor_agent_key: null,
      kind: "discussion",
      status: "active",
      visibility_scope: "community",
      title: null,
      content_summary: pending.text,
      reply_count: 0,
      reaction_summary: [],
      viewer_emojis: [],
      idempotency_key: storedIdempotencyKey(pending.idempotencyKey, pending.kind),
      last_reply_at: null,
      last_reply_actor_user_id: null,
      pinned_at: null,
      locked_at: null,
      created_at: pending.createdAt,
      updated_at: pending.createdAt,
      edited_at: null,
    },
  };
}

function buildOptimisticReply<AttachmentT extends OptimisticAttachment>(
  pending: PendingCanonicalInteraction<AttachmentT>,
): CommunityInteractionReplyBundle {
  return {
    deduped: false,
    pending: pending.status,
    content_blocks: [],
    embeds: [],
    mentions: [],
    attachments: pending.attachments.map(optimisticAttachment),
    reply: {
      id: `pending:${pending.idempotencyKey}`,
      community_id: pending.communityId,
      channel_id: pending.channelId,
      root_id: pending.rootId ?? "",
      seq: Number.MAX_SAFE_INTEGER,
      actor_type: "human",
      actor_user_id: pending.senderId,
      actor_agent_key: null,
      target_reply_id: pending.replyToMessageId,
      status: "active",
      visibility_scope: "community",
      content_summary: pending.text,
      reaction_summary: [],
      viewer_emojis: [],
      idempotency_key: storedIdempotencyKey(pending.idempotencyKey, pending.kind),
      created_at: pending.createdAt,
      updated_at: pending.createdAt,
      edited_at: null,
    },
  };
}

function appendPendingRoots<AttachmentT extends OptimisticAttachment>(
  roots: CommunityInteractionRootBundle[],
  pending: PendingCanonicalInteraction<AttachmentT>[],
  communityId: string | null,
  channelId: string | null,
): CommunityInteractionRootBundle[] {
  if (!communityId) return roots;
  const storedKeys = new Set(roots.map((bundle) => bundle.root.idempotency_key));
  const optimistic = pending
    .filter(
      (item) =>
        item.kind === "root"
        && item.communityId === communityId
        && item.channelId === channelId
        && !storedKeys.has(storedIdempotencyKey(item.idempotencyKey, "root")),
    )
    .map(buildOptimisticRoot);
  return optimistic.length > 0 ? [...roots, ...optimistic] : roots;
}

function appendPendingReplies<AttachmentT extends OptimisticAttachment>(
  replies: CommunityInteractionReplyBundle[],
  pending: PendingCanonicalInteraction<AttachmentT>[],
  rootId: string | null,
): CommunityInteractionReplyBundle[] {
  if (!rootId) return replies;
  const storedKeys = new Set(replies.map((bundle) => bundle.reply.idempotency_key));
  const optimistic = pending
    .filter(
      (item) =>
        item.kind === "reply"
        && item.rootId === rootId
        && !storedKeys.has(storedIdempotencyKey(item.idempotencyKey, "reply")),
    )
    .map(buildOptimisticReply);
  return optimistic.length > 0 ? [...replies, ...optimistic] : replies;
}

function rootMatchesChannel(
  bundle: CommunityInteractionRootBundle,
  communityId: string,
  channelId: string | null,
): boolean {
  return (
    bundle.root.community_id === communityId &&
    (!channelId || bundle.root.channel_id === channelId)
  );
}

function activityWindowsEqual(
  current: CommunityActivityEvent[],
  incoming: CommunityActivityEvent[],
): boolean {
  return current.length === incoming.length && current.every((event, index) => (
    event.id === incoming[index]?.id &&
    event.actor_user_id === incoming[index]?.actor_user_id &&
    event.created_at === incoming[index]?.created_at
  ));
}

export function useWebCommunityInteractionProjection<
  AttachmentT extends OptimisticAttachment,
>(params: UseWebCommunityInteractionProjectionParams) {
  const {
    activeCommunityId,
    activeChannelId,
    activeChannelIsGeneral,
    canonicalSessionUserId,
    ensureSession,
    isCommunityChatActive,
    session,
  } = params;
  const [roots, setRoots] = useState<CommunityInteractionRootBundle[]>([]);
  const [activityEvents, setActivityEvents] = useState<CommunityActivityEvent[]>([]);
  const [nextBeforeCreatedAt, setNextBeforeCreatedAt] = useState<number | null>(null);
  const [isLoadingOlderRoots, setIsLoadingOlderRoots] = useState(false);
  const [rootChangeReason, setRootChangeReason] =
    useState<"initial" | "newer" | "older" | "reset">("reset");
  const [serveIssue, setServeIssue] = useState<CloudCommunityAgentServeIssue | null>(null);
  const [pending, setPending] = useState<PendingCanonicalInteraction<AttachmentT>[]>([]);
  const [isLoadingRoots, setIsLoadingRoots] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidecar, setSidecar] = useState<CommunityInteractionSidecar>({ kind: "context" });
  const selectedRootId = sidecar.kind === "thread" ? sidecar.rootId : null;
  const [selectedRoot, setSelectedRoot] = useState<CommunityInteractionRootBundle | null>(null);
  const [repliesByRootId, setRepliesByRootId] = useState<
    Record<string, CommunityInteractionReplyBundle[]>
  >({});
  const [repliesErrorByRootId, setRepliesErrorByRootId] =
    useState<Record<string, string | null>>({});
  const [loadingRepliesRootId, setLoadingRepliesRootId] = useState<string | null>(null);
  const [pinnedRoot, setPinnedRoot] = useState<CommunityInteractionRootBundle | null>(null);
  const [isUpdatingPinnedRoot, setIsUpdatingPinnedRoot] = useState(false);
  const [pinnedRootError, setPinnedRootError] = useState<string | null>(null);

  const rootsRef = useRef<CommunityInteractionRootBundle[]>([]);
  const activityEventsRef = useRef<CommunityActivityEvent[]>([]);
  const repliesByRootIdRef = useRef<Record<string, CommunityInteractionReplyBundle[]>>({});
  const nextBeforeCreatedAtRef = useRef<number | null>(null);
  const isLoadingOlderRootsRef = useRef(false);
  const pendingRef = useRef<PendingCanonicalInteraction<AttachmentT>[]>([]);
  const activeCommunityIdRef = useRef<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const boundaryRef = useRef<string | null>(null);
  const rootsRequestIdRef = useRef(0);
  const repliesRequestIdRef = useRef<Record<string, number>>({});
  const dismissedServeIssueIdsRef = useRef<Set<string>>(new Set());
  const sessionRef = useRef<AuthSession | null>(session);
  const lastSubscribedPinnedRootRef = useRef<CommunityInteractionRootBundle | null>(null);
  const pinnedRootRef = useRef<CommunityInteractionRootBundle | null>(null);
  const pinMutationBoundaryRef = useRef<string | null>(null);

  sessionRef.current = session;
  rootsRef.current = roots;
  activityEventsRef.current = activityEvents;
  repliesByRootIdRef.current = repliesByRootId;
  nextBeforeCreatedAtRef.current = nextBeforeCreatedAt;
  isLoadingOlderRootsRef.current = isLoadingOlderRoots;
  pendingRef.current = pending;
  pinnedRootRef.current = pinnedRoot;
  activeCommunityIdRef.current = activeCommunityId;
  activeChannelIdRef.current = activeChannelId;

  useEffect(() => {
    setPending((current) => {
      if (current.length === 0) return current;
      const rootKeys = new Set(roots.map((bundle) => bundle.root.idempotency_key).filter(Boolean));
      const replyKeys = new Set<string>();
      for (const replies of Object.values(repliesByRootId)) {
        for (const bundle of replies) {
          if (bundle.reply.idempotency_key) replyKeys.add(bundle.reply.idempotency_key);
        }
      }
      const next = current.filter((item) => {
        const storedKey = storedIdempotencyKey(item.idempotencyKey, item.kind);
        return item.kind === "root" ? !rootKeys.has(storedKey) : !replyKeys.has(storedKey);
      });
      return next.length === current.length ? current : next;
    });
  }, [repliesByRootId, roots]);

  const reset = useCallback((isNextBoundaryLoading = false) => {
    rootsRequestIdRef.current += 1;
    repliesRequestIdRef.current = {};
    setRoots([]);
    setActivityEvents([]);
    setNextBeforeCreatedAt(null);
    setIsLoadingOlderRoots(false);
    setRootChangeReason("reset");
    setError(null);
    setIsLoadingRoots(isNextBoundaryLoading);
    setSidecar({ kind: "context" });
    setSelectedRoot(null);
    setRepliesByRootId({});
    setRepliesErrorByRootId({});
    setLoadingRepliesRootId(null);
    lastSubscribedPinnedRootRef.current = null;
    pinMutationBoundaryRef.current = null;
    setPinnedRoot(null);
    setIsUpdatingPinnedRoot(false);
    setPinnedRootError(null);
  }, []);

  const loadReplies = useCallback(async (
    rawRootId: string,
    activeSession: AuthSession | null = sessionRef.current,
  ) => {
    const rootId = String(rawRootId ?? "").trim();
    if (!rootId) return;
    const usableSession = await ensureSession(activeSession ?? undefined);
    if (!usableSession) return;
    const requestId = (repliesRequestIdRef.current[rootId] ?? 0) + 1;
    repliesRequestIdRef.current = { ...repliesRequestIdRef.current, [rootId]: requestId };
    setLoadingRepliesRootId(rootId);
    setRepliesErrorByRootId((current) => ({ ...current, [rootId]: null }));
    try {
      const replies = await listCloudCommunityInteractionReplies<AuthSession>({
        session: usableSession,
        rootId,
        limit: COMMUNITY_INTERACTION_REPLY_LIMIT,
      });
      if (repliesRequestIdRef.current[rootId] !== requestId) return;
      setRepliesByRootId((current) => ({ ...current, [rootId]: replies }));
    } catch (loadError) {
      if (repliesRequestIdRef.current[rootId] !== requestId) return;
      if (communityProjectionAccessLost(loadError)) setRepliesByRootId(current => ({ ...current, [rootId]: [] }));
      setRepliesErrorByRootId((current) => ({
        ...current,
        [rootId]: formatProjectionError(loadError),
      }));
    } finally {
      if (repliesRequestIdRef.current[rootId] === requestId) {
        setLoadingRepliesRootId((current) => (current === rootId ? null : current));
      }
    }
  }, [ensureSession]);

  const loadRoots = useCallback(async (
    rawCommunityId: string | null = activeCommunityId,
    activeSession: AuthSession | null = sessionRef.current,
  ) => {
    const communityId = String(rawCommunityId ?? "").trim();
    const channelId = activeChannelId;
    if (!communityId) {
      reset();
      return;
    }
    const usableSession = await ensureSession(activeSession ?? undefined);
    if (!usableSession) return;
    const requestId = rootsRequestIdRef.current + 1;
    rootsRequestIdRef.current = requestId;
    setIsLoadingRoots(true);
    setError(null);
    try {
      const page = await listCloudCommunityInteractionRootsPage<AuthSession>({
        session: usableSession,
        communityId,
        channelId,
        limit: COMMUNITY_INTERACTION_ROOT_LIMIT,
      });
      if (
        rootsRequestIdRef.current !== requestId
        || activeCommunityIdRef.current !== communityId
        || activeChannelIdRef.current !== channelId
      ) {
        return;
      }
      setRootChangeReason("initial");
      setRoots(page.roots);
      setNextBeforeCreatedAt(page.nextBeforeCreatedAt);
    } catch (loadError) {
      if (
        rootsRequestIdRef.current !== requestId
        || activeCommunityIdRef.current !== communityId
        || activeChannelIdRef.current !== channelId
      ) {
        return;
      }
      setError(formatProjectionError(loadError));
      if (communityProjectionAccessLost(loadError)) {
        setRoots([]); setSelectedRoot(null); setRepliesByRootId({}); setPinnedRoot(null); setSidecar({ kind: "context" });
      }
    } finally {
      if (
        rootsRequestIdRef.current === requestId
        && activeCommunityIdRef.current === communityId
        && activeChannelIdRef.current === channelId
      ) {
        setIsLoadingRoots(false);
      }
    }
  }, [activeChannelId, activeCommunityId, ensureSession, reset]);

  const loadOlderRoots = useCallback(async (
    rawCommunityId: string | null = activeCommunityId,
    activeSession: AuthSession | null = sessionRef.current,
  ) => {
    const communityId = String(rawCommunityId ?? "").trim();
    const channelId = activeChannelId;
    const beforeCreatedAt = nextBeforeCreatedAtRef.current;
    if (
      !communityId
      || beforeCreatedAt === null
      || isLoadingOlderRootsRef.current
    ) {
      return;
    }
    const usableSession = await ensureSession(activeSession ?? undefined);
    if (!usableSession) return;
    setIsLoadingOlderRoots(true);
    try {
      const page = await listCloudCommunityInteractionRootsPage<AuthSession>({
        session: usableSession,
        communityId,
        channelId,
        beforeCreatedAt,
        limit: COMMUNITY_INTERACTION_ROOT_LIMIT,
      });
      if (
        activeCommunityIdRef.current !== communityId ||
        activeChannelIdRef.current !== channelId
      ) return;
      setRootChangeReason("older");
      setRoots((current) =>
        mergeOlderRootPage(
          current.filter((bundle) => rootMatchesChannel(bundle, communityId, channelId)),
          page.roots,
        ),
      );
      setNextBeforeCreatedAt(page.nextBeforeCreatedAt);
    } catch {
      // Keep the loaded window usable; the next upward scroll retries.
    } finally {
      if (
        activeCommunityIdRef.current === communityId &&
        activeChannelIdRef.current === channelId
      ) {
        setIsLoadingOlderRoots(false);
      }
    }
  }, [activeChannelId, activeCommunityId, ensureSession]);

  useEffect(() => {
    if (!activeCommunityId || !canonicalSessionUserId) return;
    const hasCurrentRoots = rootsRef.current.some((bundle) =>
      rootMatchesChannel(bundle, activeCommunityId, activeChannelId)
    );
    if (!hasCurrentRoots) {
      setIsLoadingRoots(true);
    }
    setError(null);
    let cancelled = false;
    let liveClient: CloudCommunityChatLiveClient | null = null;
    let unsubscribe: (() => void) | null = null;
    let unsubscribePinnedRoot: (() => void) | null = null;
    setPinnedRootError(null);
    void (async () => {
      const usableSession = await ensureSession(sessionRef.current);
      if (!usableSession || cancelled) return;
      try {
        liveClient = createCloudCommunityChatLiveClient({
          session: usableSession,
          ensureSession,
        });
        unsubscribe = subscribeCloudCommunityInteractionRoots({
          liveClient,
          communityId: activeCommunityId,
          channelId: activeChannelId,
          limit: COMMUNITY_INTERACTION_ROOT_LIMIT,
          onUpdate: (incomingRoots) => {
            if (
              cancelled ||
              activeCommunityIdRef.current !== activeCommunityId ||
              activeChannelIdRef.current !== activeChannelId
            ) return;
            const hadLoadedRoots = rootsRef.current.some(
              (bundle) => rootMatchesChannel(bundle, activeCommunityId, activeChannelId),
            );
            setRootChangeReason(hadLoadedRoots ? "newer" : "initial");
            setRoots((current) =>
              applyLiveRootWindow(
                current.filter((bundle) => rootMatchesChannel(bundle, activeCommunityId, activeChannelId)),
                incomingRoots,
                COMMUNITY_INTERACTION_ROOT_LIMIT,
              ),
            );
            setIsLoadingRoots(false);
            setError(null);
          },
          onError: (subscriptionError) => {
            if (
              cancelled ||
              activeCommunityIdRef.current !== activeCommunityId ||
              activeChannelIdRef.current !== activeChannelId
            ) return;
            setError(formatProjectionError(subscriptionError));
            if (communityProjectionAccessLost(subscriptionError)) {
              ++rootsRequestIdRef.current;
              setRoots([]); setSelectedRoot(null); setRepliesByRootId({}); setPinnedRoot(null); setSidecar({ kind: "context" });
            }
            setIsLoadingRoots(false);
          },
        });
        unsubscribePinnedRoot = subscribeCloudCommunityChannelPinnedRoot({
          liveClient,
          communityId: activeCommunityId,
          channelId: activeChannelId,
          onUpdate: (nextPinnedRoot) => {
            if (
              cancelled ||
              activeCommunityIdRef.current !== activeCommunityId ||
              activeChannelIdRef.current !== activeChannelId
            ) return;
            lastSubscribedPinnedRootRef.current = nextPinnedRoot;
            const boundary = `${activeCommunityId}:${activeChannelId ?? "general"}`;
            if (pinMutationBoundaryRef.current === boundary) {
              setPinnedRootError(null);
              return;
            }
            setPinnedRoot(nextPinnedRoot);
            setPinnedRootError(null);
          },
          onError: (subscriptionError) => {
            if (
              cancelled ||
              activeCommunityIdRef.current !== activeCommunityId ||
              activeChannelIdRef.current !== activeChannelId
            ) return;
            const boundary = `${activeCommunityId}:${activeChannelId ?? "general"}`;
            if (pinMutationBoundaryRef.current === boundary) return;
            setPinnedRoot(null);
            setPinnedRootError(formatPinnedRootError(subscriptionError));
          },
        });
      } catch (subscriptionError) {
        if (!cancelled) {
          lastSubscribedPinnedRootRef.current = null;
          setPinnedRoot(null);
          setPinnedRootError(formatPinnedRootError(subscriptionError));
          setError(formatProjectionError(subscriptionError));
          setIsLoadingRoots(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
      unsubscribePinnedRoot?.();
      liveClient?.close();
    };
  }, [activeChannelId, activeCommunityId, canonicalSessionUserId, ensureSession]);

  useEffect(() => {
    if (
      !isCommunityChatActive ||
      !activeChannelIsGeneral ||
      !activeCommunityId ||
      !canonicalSessionUserId
    ) {
      setActivityEvents([]);
      return;
    }
    const communityId = activeCommunityId;
    const channelId = activeChannelId;
    const expectedBoundary = `${canonicalSessionUserId}:${communityId}:${channelId ?? "general"}`;
    let cancelled = false;
    let liveClient: CloudCommunityChatLiveClient | null = null;
    let unsubscribe: (() => void) | null = null;
    setActivityEvents([]);
    void (async () => {
      const usableSession = await ensureSession(sessionRef.current);
      if (!usableSession || cancelled) return;
      try {
        liveClient = createCloudCommunityChatLiveClient({
          session: usableSession,
          ensureSession,
        });
        unsubscribe = subscribeCloudCommunityActivityEvents<CommunityActivityEvent>({
          liveClient,
          communityId,
          type: "member_joined",
          limit: 50,
          onUpdate: (rows) => {
            if (
              cancelled ||
              boundaryRef.current !== expectedBoundary ||
              activeCommunityIdRef.current !== communityId ||
              activeChannelIdRef.current !== channelId
            ) return;
            const nextRows = rows.filter((row) => (
              row.community_id === communityId && row.type === "member_joined"
            ));
            if (activityWindowsEqual(activityEventsRef.current, nextRows)) return;
            const hadLoadedTimeline =
              activityEventsRef.current.length > 0 ||
              rootsRef.current.some((bundle) => (
                rootMatchesChannel(bundle, communityId, channelId)
              ));
            setRootChangeReason(hadLoadedTimeline ? "newer" : "initial");
            setActivityEvents(nextRows);
          },
          onError: () => {
            if (!cancelled && boundaryRef.current === expectedBoundary) {
              setActivityEvents([]);
            }
          },
        });
      } catch {
        if (!cancelled && boundaryRef.current === expectedBoundary) {
          setActivityEvents([]);
        }
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
      liveClient?.close();
    };
  }, [
    activeChannelId,
    activeChannelIsGeneral,
    activeCommunityId,
    canonicalSessionUserId,
    ensureSession,
    isCommunityChatActive,
  ]);

  useEffect(() => {
    if (
      !isCommunityChatActive
      || !activeCommunityId
      || !canonicalSessionUserId
    ) {
      setServeIssue(null);
      return;
    }
    let cancelled = false;
    let liveClient: CloudCommunityChatLiveClient | null = null;
    let unsubscribe: (() => void) | null = null;
    void (async () => {
      const usableSession = await ensureSession(sessionRef.current);
      if (!usableSession || cancelled) return;
      try {
        liveClient = createCloudCommunityChatLiveClient({
          session: usableSession,
          ensureSession,
        });
        unsubscribe = subscribeCloudCommunityAgentServeIssue({
          liveClient,
          communityId: activeCommunityId,
          onUpdate: (issue) => {
            if (cancelled) return;
            if (issue && !dismissedServeIssueIdsRef.current.has(issue.id)) {
              setServeIssue(issue);
              return;
            }
            setServeIssue(null);
          },
          onError: (subscriptionError) => {
            if (!cancelled) {
              console.warn("community_agent_serve_issue_subscription_failed", subscriptionError);
              setServeIssue(null);
            }
          },
        });
      } catch (subscriptionError) {
        if (!cancelled) {
          console.warn("community_agent_serve_issue_subscription_failed", subscriptionError);
          setServeIssue(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
      liveClient?.close();
    };
  }, [activeCommunityId, canonicalSessionUserId, ensureSession, isCommunityChatActive]);

  useEffect(() => {
    if (!selectedRootId || !canonicalSessionUserId || !activeCommunityId) {
      setSelectedRoot(null);
      return;
    }
    const rootId = selectedRootId;
    const communityId = activeCommunityId;
    const channelId = activeChannelId;
    if (!repliesByRootIdRef.current[rootId]) {
      setLoadingRepliesRootId(rootId);
    }
    setRepliesErrorByRootId((current) => ({ ...current, [rootId]: null }));
    let cancelled = false;
    let liveClient: CloudCommunityChatLiveClient | null = null;
    let unsubscribeRoot: (() => void) | null = null;
    let unsubscribeReplies: (() => void) | null = null;
    void (async () => {
      const usableSession = await ensureSession(sessionRef.current);
      if (!usableSession || cancelled) {
        if (!cancelled) {
          setSelectedRoot(null);
          setSidecar((current) =>
            current.kind === "thread" && current.rootId === rootId
              ? { kind: "context" }
              : current,
          );
        }
        return;
      }
      try {
        liveClient = createCloudCommunityChatLiveClient({
          session: usableSession,
          ensureSession,
        });
        unsubscribeRoot = subscribeCloudCommunityChannelInteractionRoot({
          liveClient,
          communityId,
          channelId,
          rootId,
          onUpdate: (root) => {
            if (
              cancelled ||
              activeCommunityIdRef.current !== communityId ||
              activeChannelIdRef.current !== channelId
            ) return;
            setSelectedRoot(root);
            if (!root) {
              setSidecar((current) =>
                current.kind === "thread" && current.rootId === rootId
                  ? { kind: "context" }
                  : current,
              );
            }
          },
          onError: () => {
            if (cancelled) return;
            setSelectedRoot(null);
            setSidecar((current) =>
              current.kind === "thread" && current.rootId === rootId
                ? { kind: "context" }
                : current,
            );
          },
        });
        unsubscribeReplies = subscribeCloudCommunityInteractionReplies({
          liveClient,
          rootId,
          limit: COMMUNITY_INTERACTION_REPLY_LIMIT,
          onUpdate: (replies) => {
            if (cancelled) return;
            setRepliesByRootId((current) => ({ ...current, [rootId]: replies }));
            setLoadingRepliesRootId((current) => (current === rootId ? null : current));
            setRepliesErrorByRootId((current) => ({ ...current, [rootId]: null }));
          },
          onError: (subscriptionError) => {
            if (cancelled) return;
            if (communityProjectionAccessLost(subscriptionError)) {
              repliesRequestIdRef.current[rootId] = (repliesRequestIdRef.current[rootId] ?? 0) + 1;
              setRepliesByRootId(current => ({ ...current, [rootId]: [] }));
            }
            setRepliesErrorByRootId((current) => ({
              ...current,
              [rootId]: formatProjectionError(subscriptionError),
            }));
            setLoadingRepliesRootId((current) => (current === rootId ? null : current));
          },
        });
      } catch (subscriptionError) {
        if (!cancelled) {
          setSelectedRoot(null);
          setSidecar((current) =>
            current.kind === "thread" && current.rootId === rootId
              ? { kind: "context" }
              : current,
          );
          setRepliesErrorByRootId((current) => ({
            ...current,
            [rootId]: formatProjectionError(subscriptionError),
          }));
          setLoadingRepliesRootId((current) => (current === rootId ? null : current));
        }
      }
    })();
    return () => {
      cancelled = true;
      unsubscribeRoot?.();
      unsubscribeReplies?.();
      liveClient?.close();
    };
  }, [activeChannelId, activeCommunityId, canonicalSessionUserId, ensureSession, selectedRootId]);

  const retryPending = useCallback((idempotencyKey: string) => {
    const interaction = pendingRef.current.find((item) => item.idempotencyKey === idempotencyKey);
    if (!interaction) return;
    setPending((current) =>
      current.map((item) =>
        item.idempotencyKey === idempotencyKey ? { ...item, status: "sending" } : item,
      ),
    );
    const markFailed = () =>
      setPending((current) =>
        current.map((item) =>
          item.idempotencyKey === idempotencyKey ? { ...item, status: "failed" } : item,
        ),
      );
    void (async () => {
      const activeSession = sessionRef.current;
      if (!activeSession) {
        markFailed();
        return;
      }
      try {
        await createCloudCommunityInteractionComposerMessageRows<AuthSession>({
          session: activeSession,
          communityId: interaction.communityId,
          channelId: interaction.channelId,
          idempotencyKey: interaction.idempotencyKey,
          text: interaction.text,
          rootId: interaction.rootId,
          replyToMessageId: interaction.replyToMessageId,
          attachments: interaction.serializedAttachments,
          mentions: interaction.serializedMentions,
        });
      } catch {
        markFailed();
      }
    })();
  }, []);

  const discardPending = useCallback((idempotencyKey: string) => {
    setPending((current) => current.filter((item) => item.idempotencyKey !== idempotencyKey));
  }, []);

  const selectRoot = useCallback((rawRootId: string) => {
    const rootId = String(rawRootId ?? "").trim();
    if (!rootId) return;
    if (selectedRootId === rootId) {
      setSidecar({ kind: "context" });
      setSelectedRoot(null);
      return;
    }
    setSelectedRoot(
      rootsRef.current.find((bundle) => bundle.root.id === rootId)
        ?? (pinnedRootRef.current?.root.id === rootId ? pinnedRootRef.current : null),
    );
    setSidecar({ kind: "thread", rootId });
  }, [selectedRootId]);

  const closeDrawer = useCallback(() => {
    setSidecar({ kind: "context" });
    setSelectedRoot(null);
  }, []);



  const toggleReaction = useCallback(async (
    targetType: "root" | "reply",
    targetId: string,
    emoji: string,
  ) => {
    const usableSession = await ensureSession(sessionRef.current);
    if (!usableSession) return;
    try {
      await toggleCloudCommunityInteractionReaction<AuthSession>({
        session: usableSession,
        targetType,
        targetId,
        emoji,
      });
    } catch {
      // The live projection remains authoritative.
    }
  }, [ensureSession]);

  const editMessage = useCallback(async (
    targetType: "root" | "reply",
    targetId: string,
    text: string,
  ) => {
    const usableSession = await ensureSession(sessionRef.current);
    if (!usableSession) return;
    try {
      await editCloudCommunityInteractionMessage<AuthSession>({
        session: usableSession,
        targetType,
        targetId,
        text,
      });
    } catch {
      // The live projection remains authoritative.
    }
  }, [ensureSession]);

  const deleteMessage = useCallback(async (
    targetType: "root" | "reply",
    targetId: string,
  ) => {
    const usableSession = await ensureSession(sessionRef.current);
    if (!usableSession) return;
    if (targetType === "root" && selectedRootId === targetId) {
      setSidecar({ kind: "context" });
      setSelectedRoot(null);
    }
    try {
      await deleteCloudCommunityInteractionMessage<AuthSession>({
        session: usableSession,
        targetType,
        targetId,
      });
    } catch {
      // The live projection remains authoritative.
    }
  }, [ensureSession, selectedRootId]);

  const setPinnedRootId = useCallback(async (rootIdRaw: string | null): Promise<boolean> => {
    const communityId = String(activeCommunityIdRef.current ?? "").trim();
    const channelId = activeChannelIdRef.current;
    const boundary = communityId
      ? `${communityId}:${channelId ?? "general"}`
      : null;
    const rootId = String(rootIdRaw ?? "").trim() || null;
    if (!boundary || pinMutationBoundaryRef.current) return false;
    const usableSession = await ensureSession(sessionRef.current);
    if (!usableSession) return false;

    pinMutationBoundaryRef.current = boundary;
    setIsUpdatingPinnedRoot(true);
    setPinnedRootError(null);
    const optimisticPinnedRoot = rootId
      ? rootsRef.current.find((bundle) => bundle.root.id === rootId) ?? null
      : null;
    if (!rootId || optimisticPinnedRoot) setPinnedRoot(optimisticPinnedRoot);
    try {
      await setCloudCommunityChannelPinnedRoot<AuthSession>({
        session: usableSession,
        communityId,
        channelId,
        rootId,
      });
      return true;
    } catch (pinError) {
      if (
        activeCommunityIdRef.current === communityId &&
        activeChannelIdRef.current === channelId
      ) {
        setPinnedRoot(lastSubscribedPinnedRootRef.current);
        setPinnedRootError(formatPinnedRootError(pinError));
      }
      return false;
    } finally {
      if (pinMutationBoundaryRef.current === boundary) {
        pinMutationBoundaryRef.current = null;
      }
      if (
        activeCommunityIdRef.current === communityId &&
        activeChannelIdRef.current === channelId
      ) {
        const subscribedRoot = lastSubscribedPinnedRootRef.current;
        if ((subscribedRoot?.root.id ?? null) === rootId) {
          setPinnedRoot(subscribedRoot);
        }
        setIsUpdatingPinnedRoot(false);
      }
    }
  }, [ensureSession]);

  const normalizedSessionUserId = String(canonicalSessionUserId ?? "").trim();
  const requestedBoundary =
    session &&
    normalizedSessionUserId &&
    activeCommunityId
      ? `${normalizedSessionUserId}:${activeCommunityId}:${activeChannelId ?? "general"}`
      : null;

  useEffect(() => {
    if (!requestedBoundary || !activeCommunityId) {
      boundaryRef.current = null;
      reset();
      return;
    }
    if (boundaryRef.current !== requestedBoundary) {
      boundaryRef.current = requestedBoundary;
      reset(true);
    }
  }, [activeCommunityId, requestedBoundary, reset]);

  const insertOptimistic = useCallback((
    interaction: CommunityInteractionOptimisticInsert<AttachmentT>,
  ) => {
    setPending((current) => [
      ...current.filter((item) => item.idempotencyKey !== interaction.idempotencyKey),
      { ...interaction,
        serializedAttachments: structuredClone(interaction.serializedAttachments),
        serializedMentions: structuredClone(interaction.serializedMentions),
        status: "sending" },
    ]);
  }, []);

  const settleOptimistic = useCallback((
    settlement: { idempotencyKey: string; status: "failed" },
  ) => {
    setPending((current) =>
      current.map((item) =>
        item.idempotencyKey === settlement.idempotencyKey
          ? { ...item, status: settlement.status }
          : item,
      ),
    );
  }, []);

  const dismissServeIssue = useCallback((rawIssueId: string) => {
    const issueId = String(rawIssueId ?? "").trim();
    if (issueId) dismissedServeIssueIdsRef.current.add(issueId);
    setServeIssue((current) => (current?.id === issueId ? null : current));
  }, []);

  const isPresentationScopedToBoundary = Boolean(
    requestedBoundary && boundaryRef.current === requestedBoundary,
  );
  const presentedRoots = isPresentationScopedToBoundary ? roots : [];
  const presentedActivityEvents =
    isPresentationScopedToBoundary && activeChannelIsGeneral
      ? activityEvents
      : [];
  const presentedRepliesByRootId = isPresentationScopedToBoundary ? repliesByRootId : {};
  const presentedSelectedRootId = isPresentationScopedToBoundary ? selectedRootId : null;
  const presentedSelectedRoot = isPresentationScopedToBoundary ? selectedRoot : null;
  const visibleRoots = useMemo(
    () => appendPendingRoots(
      isPresentationScopedToBoundary ? roots : [],
      pending,
      activeCommunityId,
      activeChannelId,
    ),
    [activeChannelId, activeCommunityId, isPresentationScopedToBoundary, pending, roots],
  );
  const selectedReplies = useMemo(
    () => appendPendingReplies(
      presentedSelectedRootId
        ? presentedRepliesByRootId[presentedSelectedRootId] ?? []
        : [],
      pending,
      presentedSelectedRootId,
    ),
    [pending, presentedRepliesByRootId, presentedSelectedRootId],
  );

  return {
    roots: presentedRoots,
    activityEvents: presentedActivityEvents,
    repliesByRootId: presentedRepliesByRootId,
    visibleRoots,
    selectedReplies,
    selectedRootId: presentedSelectedRootId,
    selectedRoot: presentedSelectedRoot,
    sidecar: isPresentationScopedToBoundary ? sidecar : { kind: "context" } as CommunityInteractionSidecar,
    pinnedRoot: isPresentationScopedToBoundary ? pinnedRoot : null,
    isUpdatingPinnedRoot,
    pinnedRootError: isPresentationScopedToBoundary ? pinnedRootError : null,
    isLoadingRoots:
      !requestedBoundary || !isPresentationScopedToBoundary || isLoadingRoots,
    isLoadingSelectedReplies:
      presentedSelectedRootId !== null && loadingRepliesRootId === presentedSelectedRootId,
    error: isPresentationScopedToBoundary ? error : null,
    selectedRepliesError:
      presentedSelectedRootId ? repliesErrorByRootId[presentedSelectedRootId] ?? null : null,
    rootChangeReason,
    canLoadOlderRoots: isPresentationScopedToBoundary && nextBeforeCreatedAt !== null,
    isLoadingOlderRoots: isPresentationScopedToBoundary && isLoadingOlderRoots,
    serveIssue: isPresentationScopedToBoundary ? serveIssue : null,
    loadRoots,
    loadReplies,
    loadOlderRoots,
    selectRoot,
    closeDrawer,
    toggleReaction,
    editMessage,
    deleteMessage,
    setPinnedRootId,
    retryPending,
    discardPending,
    insertOptimistic,
    settleOptimistic,
    dismissServeIssue,
  };
}
