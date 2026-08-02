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
  type CloudCommunityChatLiveClient,
} from "../../../../shared/cloudCommunityChatGateway";
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
  toggleCloudCommunityInteractionReaction,
  type CommunityInteractionAttachment,
  type CommunityInteractionPendingStatus,
  type CommunityInteractionReplyBundle,
  type CommunityInteractionRootBundle,
} from "../../../../shared/cloudCommunityInteractionsGateway";
import type { AppShellVariant } from "../../../../shared/webAppRouteState";

const COMMUNITY_INTERACTION_ROOT_LIMIT = 50;
const COMMUNITY_INTERACTION_REPLY_LIMIT = 80;
const INTERACTION_SELECTED_ROOT_STORAGE_PREFIX = "polynet:interaction:selectedRoot:";
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
  canonicalSessionUserId: string | null;
  ensureSession: EnsureAuthSession;
  isCommunityChatActive: boolean;
  session: AuthSession | null;
  shellVariant: AppShellVariant;
};

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

function selectedRootStorageKey(communityId: string, channelId: string | null): string {
  return `${INTERACTION_SELECTED_ROOT_STORAGE_PREFIX}${communityId}:${channelId ?? "general"}`;
}

function readStoredSelectedRoot(communityId: string | null, channelId: string | null): string | null {
  if (!communityId) return null;
  try {
    const value = window.localStorage.getItem(selectedRootStorageKey(communityId, channelId));
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

function writeStoredSelectedRoot(
  communityId: string | null,
  channelId: string | null,
  rootId: string | null,
): void {
  if (!communityId) return;
  try {
    const key = selectedRootStorageKey(communityId, channelId);
    if (rootId) window.localStorage.setItem(key, rootId);
    else window.localStorage.removeItem(key);
  } catch {
    // Storage is a convenience only; the server remains authoritative.
  }
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
      legacy_thread_id: null,
      legacy_message_id: null,
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
      legacy_thread_id: null,
      legacy_message_id: null,
      legacy_target_message_id: null,
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

function rootCreatedAtMs(bundle: CommunityInteractionRootBundle): number {
  const milliseconds = Date.parse(bundle.root.created_at);
  return Number.isFinite(milliseconds) ? milliseconds : 0;
}

function mergeRootWindows(
  current: CommunityInteractionRootBundle[],
  incoming: CommunityInteractionRootBundle[],
): CommunityInteractionRootBundle[] {
  if (current.length === 0) {
    return [...incoming].sort((left, right) => rootCreatedAtMs(right) - rootCreatedAtMs(left));
  }
  if (incoming.length === 0) return current;
  const rootsById = new Map<string, CommunityInteractionRootBundle>();
  for (const bundle of current) rootsById.set(bundle.root.id, bundle);
  for (const bundle of incoming) rootsById.set(bundle.root.id, bundle);
  return Array.from(rootsById.values()).sort(
    (left, right) => rootCreatedAtMs(right) - rootCreatedAtMs(left),
  );
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

export function useWebCommunityInteractionProjection<
  AttachmentT extends OptimisticAttachment,
>(params: UseWebCommunityInteractionProjectionParams) {
  const {
    activeCommunityId,
    activeChannelId,
    canonicalSessionUserId,
    ensureSession,
    isCommunityChatActive,
    session,
    shellVariant,
  } = params;
  const [roots, setRoots] = useState<CommunityInteractionRootBundle[]>([]);
  const [nextBeforeCreatedAt, setNextBeforeCreatedAt] = useState<number | null>(null);
  const [isLoadingOlderRoots, setIsLoadingOlderRoots] = useState(false);
  const [rootChangeReason, setRootChangeReason] =
    useState<"initial" | "newer" | "older" | "reset">("reset");
  const [serveIssue, setServeIssue] = useState<CloudCommunityAgentServeIssue | null>(null);
  const [pending, setPending] = useState<PendingCanonicalInteraction<AttachmentT>[]>([]);
  const [isLoadingRoots, setIsLoadingRoots] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [repliesByRootId, setRepliesByRootId] = useState<
    Record<string, CommunityInteractionReplyBundle[]>
  >({});
  const [repliesErrorByRootId, setRepliesErrorByRootId] =
    useState<Record<string, string | null>>({});
  const [loadingRepliesRootId, setLoadingRepliesRootId] = useState<string | null>(null);

  const rootsRef = useRef<CommunityInteractionRootBundle[]>([]);
  const nextBeforeCreatedAtRef = useRef<number | null>(null);
  const isLoadingOlderRootsRef = useRef(false);
  const pendingRef = useRef<PendingCanonicalInteraction<AttachmentT>[]>([]);
  const activeCommunityIdRef = useRef<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const boundaryRef = useRef<string | null>(null);
  const rootsRequestIdRef = useRef(0);
  const repliesRequestIdRef = useRef<Record<string, number>>({});
  const dismissedServeIssueIdsRef = useRef<Set<string>>(new Set());
  const restoredSelectionBoundaryRef = useRef<string | null>(null);
  const sessionRef = useRef<AuthSession | null>(session);

  sessionRef.current = session;
  rootsRef.current = roots;
  nextBeforeCreatedAtRef.current = nextBeforeCreatedAt;
  isLoadingOlderRootsRef.current = isLoadingOlderRoots;
  pendingRef.current = pending;
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

  const reset = useCallback(() => {
    rootsRequestIdRef.current += 1;
    repliesRequestIdRef.current = {};
    setRoots([]);
    setNextBeforeCreatedAt(null);
    setIsLoadingOlderRoots(false);
    setRootChangeReason("reset");
    setError(null);
    setIsLoadingRoots(false);
    setSelectedRootId(null);
    setRepliesByRootId({});
    setRepliesErrorByRootId({});
    setLoadingRepliesRootId(null);
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
      setSelectedRootId((current) =>
        current && page.roots.some((bundle) => bundle.root.id === current) ? current : null,
      );
    } catch (loadError) {
      if (
        rootsRequestIdRef.current !== requestId
        || activeCommunityIdRef.current !== communityId
        || activeChannelIdRef.current !== channelId
      ) {
        return;
      }
      setError(formatProjectionError(loadError));
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
        mergeRootWindows(
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
              mergeRootWindows(
                current.filter((bundle) => rootMatchesChannel(bundle, activeCommunityId, activeChannelId)),
                incomingRoots,
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
            setIsLoadingRoots(false);
          },
        });
      } catch (subscriptionError) {
        if (!cancelled) {
          setError(formatProjectionError(subscriptionError));
          setIsLoadingRoots(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
      liveClient?.close();
    };
  }, [activeChannelId, activeCommunityId, canonicalSessionUserId, ensureSession]);

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
    if (!selectedRootId || !canonicalSessionUserId) return;
    const rootId = selectedRootId;
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
        unsubscribe = subscribeCloudCommunityInteractionReplies({
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
            setRepliesErrorByRootId((current) => ({
              ...current,
              [rootId]: formatProjectionError(subscriptionError),
            }));
            setLoadingRepliesRootId((current) => (current === rootId ? null : current));
          },
        });
      } catch (subscriptionError) {
        if (!cancelled) {
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
      unsubscribe?.();
      liveClient?.close();
    };
  }, [canonicalSessionUserId, ensureSession, selectedRootId]);

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
        });
        void loadRoots(interaction.communityId, activeSession);
        if (interaction.kind === "reply" && interaction.rootId) {
          void loadReplies(interaction.rootId, activeSession);
        }
      } catch {
        markFailed();
      }
    })();
  }, [loadReplies, loadRoots]);

  const discardPending = useCallback((idempotencyKey: string) => {
    setPending((current) => current.filter((item) => item.idempotencyKey !== idempotencyKey));
  }, []);

  const selectRoot = useCallback((rawRootId: string) => {
    const rootId = String(rawRootId ?? "").trim();
    if (!rootId) return;
    setSelectedRootId((current) => {
      const next = current === rootId ? null : rootId;
      writeStoredSelectedRoot(activeCommunityId, activeChannelId, next);
      if (next && !repliesByRootId[next]) {
        void loadReplies(next);
      }
      return next;
    });
  }, [activeChannelId, activeCommunityId, loadReplies, repliesByRootId]);

  const closeDrawer = useCallback(() => {
    setSelectedRootId(null);
    writeStoredSelectedRoot(activeCommunityId, activeChannelId, null);
  }, [activeChannelId, activeCommunityId]);

  useEffect(() => {
    if (!activeCommunityId) return;
    if (shellVariant === "mobile") return;
    const selectionBoundary = `${activeCommunityId}:${activeChannelId ?? "general"}`;
    if (restoredSelectionBoundaryRef.current === selectionBoundary) return;
    const rootsLoadedForCommunity =
      roots.length > 0 && rootMatchesChannel(roots[0], activeCommunityId, activeChannelId);
    if (!rootsLoadedForCommunity) return;
    restoredSelectionBoundaryRef.current = selectionBoundary;
    const storedRootId = readStoredSelectedRoot(activeCommunityId, activeChannelId);
    if (storedRootId && roots.some((bundle) => bundle.root.id === storedRootId)) {
      setSelectedRootId((current) => current ?? storedRootId);
    }
  }, [activeChannelId, activeCommunityId, roots, shellVariant]);

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
      setSelectedRootId(null);
      writeStoredSelectedRoot(activeCommunityId, activeChannelId, null);
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
  }, [activeChannelId, activeCommunityId, ensureSession, selectedRootId]);

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
      reset();
    }
    void loadRoots(activeCommunityId, sessionRef.current);
  }, [activeCommunityId, loadRoots, requestedBoundary, reset]);

  const insertOptimistic = useCallback((
    interaction: CommunityInteractionOptimisticInsert<AttachmentT>,
  ) => {
    setPending((current) => [
      ...current.filter((item) => item.idempotencyKey !== interaction.idempotencyKey),
      { ...interaction, status: "sending" },
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
  const presentedRepliesByRootId = isPresentationScopedToBoundary ? repliesByRootId : {};
  const presentedSelectedRootId = isPresentationScopedToBoundary ? selectedRootId : null;
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
    repliesByRootId: presentedRepliesByRootId,
    visibleRoots,
    selectedReplies,
    selectedRootId: presentedSelectedRootId,
    isLoadingRoots: Boolean(requestedBoundary) &&
      (!isPresentationScopedToBoundary || isLoadingRoots),
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
    retryPending,
    discardPending,
    insertOptimistic,
    settleOptimistic,
    dismissServeIssue,
  };
}
