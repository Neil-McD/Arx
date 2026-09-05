import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AuthSession } from "../auth";
import {
  createCloudCommunityChannel,
  deleteCloudCommunityChannel,
  reorderCloudCommunityChannels,
  renameCloudCommunityChannel,
  subscribeCloudCommunityChannels,
  type CloudCommunityChannel,
} from "../../../../shared/cloudCommunityChannelsGateway";
import { createCloudCommunityChatLiveClient } from "../../../../shared/cloudCommunityChatGateway";
import { resolveAuthPresentationIdentity } from "../../../../shared/authSession";

type EnsureAuthSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

type ManageableCommunityChannel = Pick<
  CloudCommunityChannel,
  "id" | "slug" | "name" | "is_general"
>;

type CommunityChannelDeleteCompletionParams = {
  activeCommunityId: string | null;
  onChannelDeleted?: (channel: ManageableCommunityChannel) => void;
};

export function resolveWebCommunityChannelDeleteCompletion(
  paramsRef: { current: CommunityChannelDeleteCompletionParams },
  operationCommunityId: string,
): {
  shouldApply: boolean;
  onChannelDeleted?: (channel: ManageableCommunityChannel) => void;
} {
  const latest = paramsRef.current;
  if (latest.activeCommunityId !== operationCommunityId) {
    return { shouldApply: false };
  }
  return {
    shouldApply: true,
    onChannelDeleted: latest.onChannelDeleted,
  };
}

const GENERAL_FALLBACK_CHANNEL: CloudCommunityChannel = {
  id: "",
  community_id: "",
  system_role: "general",
  is_general: true,
  slug: "general",
  name: "General",
  position: 0,
};

function formatChannelError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("community_channel_limit_reached")) {
    return "This community already has the maximum number of channels.";
  }
  if (message.includes("community_channel_name_required")) {
    return "Enter a channel name.";
  }
  if (message.includes("community_channel_name_too_long")) {
    return "Channel names can be up to 48 characters.";
  }
  if (message.includes("community_channel_name_taken")) {
    return "A channel with that name already exists.";
  }
  if (
    message.includes("community_forbidden") ||
    message.includes("community_manager_required")
  ) {
    return "Only community managers can manage channels.";
  }
  if (message.includes("community_general_channel_immutable")) {
    return "General cannot be renamed or deleted.";
  }
  if (message.includes("community_channel_unavailable")) {
    return "This channel is no longer available.";
  }
  if (message.includes("community_channel_order_stale")) {
    return "The channel list changed. Try moving it again.";
  }
  if (message.includes("auth_session_required")) {
    return "Sign in again to load channels.";
  }
  return "Channels are temporarily unavailable. Try again.";
}

export type WebCommunityChannelResolutionStatus =
  | "loading"
  | "resolved"
  | "not_found"
  | "failed";

export function resolveWebCommunityChannelSelection(args: {
  channels: CloudCommunityChannel[];
  requestedChannelSlug: string | null;
  hasResolvedChannels: boolean;
  channelsError: string | null;
}): {
  status: WebCommunityChannelResolutionStatus;
  selectedChannel: CloudCommunityChannel | null;
  selectedChannelSlug: string;
} {
  const requestedSlug = String(args.requestedChannelSlug ?? "")
    .trim()
    .toLowerCase();
  const generalChannel =
    args.channels.find((channel) => channel.is_general) ?? GENERAL_FALLBACK_CHANNEL;
  if (!requestedSlug || requestedSlug === "general") {
    return {
      status: "resolved",
      selectedChannel: generalChannel,
      selectedChannelSlug: "general",
    };
  }
  const requestedChannel = args.channels.find(
    (channel) => channel.slug === requestedSlug,
  );
  if (requestedChannel) {
    return {
      status: "resolved",
      selectedChannel: requestedChannel,
      selectedChannelSlug: requestedChannel.slug,
    };
  }
  if (args.channelsError) {
    return {
      status: "failed",
      selectedChannel: null,
      selectedChannelSlug: requestedSlug,
    };
  }
  if (!args.hasResolvedChannels) {
    return {
      status: "loading",
      selectedChannel: null,
      selectedChannelSlug: requestedSlug,
    };
  }
  return {
    status: "not_found",
    selectedChannel: null,
    selectedChannelSlug: requestedSlug,
  };
}

function normalizeChannels(
  communityId: string,
  channels: CloudCommunityChannel[],
): CloudCommunityChannel[] {
  const normalized = channels
    .filter((channel) => String(channel.community_id ?? "").trim() === communityId)
    .slice()
    .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name));
  return normalized.some((channel) => channel.is_general)
    ? normalized
    : [{ ...GENERAL_FALLBACK_CHANNEL, community_id: communityId }, ...normalized];
}

export function buildOptimisticWebCommunityChannelOrder(
  communityId: string,
  channels: CloudCommunityChannel[],
  orderedChannelIds: string[],
): CloudCommunityChannel[] | null {
  const customChannels = channels.filter(
    (channel) => !channel.is_general && Boolean(channel.id),
  );
  const existingIds = new Set(customChannels.map((channel) => channel.id));
  const requestedIds = orderedChannelIds
    .map((channelId) => String(channelId ?? "").trim())
    .filter(Boolean);
  if (
    requestedIds.length !== customChannels.length ||
    new Set(requestedIds).size !== requestedIds.length ||
    requestedIds.some((channelId) => !existingIds.has(channelId))
  ) {
    return null;
  }
  const positions = new Map(requestedIds.map((channelId, index) => [channelId, index + 1]));
  return normalizeChannels(
    communityId,
    channels.map((channel) => channel.is_general
      ? channel
      : { ...channel, position: positions.get(channel.id) ?? channel.position }),
  );
}

export function shouldResetWebCommunityChannelPresentation(args: {
  scopedCommunityId: string | null;
  nextCommunityId: string | null;
  hasSession: boolean;
}): boolean {
  if (!args.hasSession) return true;
  return args.scopedCommunityId !== args.nextCommunityId;
}

export function useWebCommunityChannelsController(params: {
  activeCommunityId: string | null;
  requestedChannelSlug: string | null;
  session: AuthSession | null;
  ensureSession: EnsureAuthSession;
  setRequestedChannelSlug: (slug: string | null) => void;
  onChannelCreated?: (channel: CloudCommunityChannel) => void;
  onChannelDeleted?: (channel: ManageableCommunityChannel) => void;
}) {
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const [channels, setChannels] = useState<CloudCommunityChannel[]>([
    GENERAL_FALLBACK_CHANNEL,
  ]);
  const [maxActiveChannels, setMaxActiveChannels] = useState(10);
  const [hasResolvedChannels, setHasResolvedChannels] = useState(false);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [createChannelError, setCreateChannelError] = useState<string | null>(null);
  const [managingChannelId, setManagingChannelId] = useState<string | null>(null);
  const [manageChannelError, setManageChannelError] = useState<string | null>(null);
  const [isReorderingChannels, setIsReorderingChannels] = useState(false);
  const [reorderChannelsError, setReorderChannelsError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const createInFlightCommunityIdRef = useRef<string | null>(null);
  const manageInFlightChannelIdRef = useRef<string | null>(null);
  const reorderInFlightCommunityIdRef = useRef<string | null>(null);
  const lastSubscribedChannelsRef = useRef<CloudCommunityChannel[]>([]);
  const channelScopeCommunityIdRef = useRef<string | null>(null);
  const channelScopeSessionIdentityRef = useRef<string | null>(null);
  const sessionIdentity = resolveAuthPresentationIdentity(params.session);

  useEffect(() => {
    const communityId = String(params.activeCommunityId ?? "").trim();
    const nextCommunityId = communityId || null;
    const shouldResetPresentation = shouldResetWebCommunityChannelPresentation({
      scopedCommunityId: channelScopeCommunityIdRef.current,
      nextCommunityId,
      hasSession: Boolean(sessionIdentity),
    }) || channelScopeSessionIdentityRef.current !== sessionIdentity;
    if (shouldResetPresentation) {
      setChannels([
        { ...GENERAL_FALLBACK_CHANNEL, community_id: communityId },
      ]);
      setMaxActiveChannels(10);
      setHasResolvedChannels(false);
      createInFlightCommunityIdRef.current = null;
      manageInFlightChannelIdRef.current = null;
      reorderInFlightCommunityIdRef.current = null;
      lastSubscribedChannelsRef.current = [];
      setIsCreatingChannel(false);
      setCreateChannelError(null);
      setManagingChannelId(null);
      setManageChannelError(null);
      setIsReorderingChannels(false);
      setReorderChannelsError(null);
    }
    channelScopeCommunityIdRef.current = sessionIdentity ? nextCommunityId : null;
    channelScopeSessionIdentityRef.current = sessionIdentity;
    setChannelsError(null);
    if (!communityId || !sessionIdentity) {
      setIsLoadingChannels(false);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let liveClient: ReturnType<typeof createCloudCommunityChatLiveClient> | null = null;
    setIsLoadingChannels(true);
    void (async () => {
      const usableSession = await params.ensureSession(paramsRef.current.session ?? undefined);
      if (!usableSession || cancelled) {
        if (!cancelled) {
          setIsLoadingChannels(false);
          setChannelsError(formatChannelError(new Error("auth_session_required")));
        }
        return;
      }
      try {
        liveClient = createCloudCommunityChatLiveClient({
          session: usableSession,
          ensureSession: params.ensureSession,
        });
        unsubscribe = subscribeCloudCommunityChannels({
          liveClient,
          communityId,
          onUpdate: (result) => {
            if (cancelled || paramsRef.current.activeCommunityId !== communityId) return;
            const normalizedChannels = normalizeChannels(communityId, result.channels);
            lastSubscribedChannelsRef.current = normalizedChannels;
            setChannels(normalizedChannels);
            setMaxActiveChannels(result.max_active_channels);
            setHasResolvedChannels(true);
            setIsLoadingChannels(false);
            setChannelsError(null);
          },
          onError: (error) => {
            if (cancelled || paramsRef.current.activeCommunityId !== communityId) return;
            setIsLoadingChannels(false);
            setChannelsError(formatChannelError(error));
          },
        });
      } catch (error) {
        if (cancelled || paramsRef.current.activeCommunityId !== communityId) return;
        setIsLoadingChannels(false);
        setChannelsError(formatChannelError(error));
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
      liveClient?.close();
    };
  }, [loadAttempt, params.activeCommunityId, params.ensureSession, sessionIdentity]);

  const normalizedRequestedSlug = String(params.requestedChannelSlug ?? "")
    .trim()
    .toLowerCase();
  const requestedPresentationCommunityId =
    String(params.activeCommunityId ?? "").trim() || null;
  const isPresentationScopedToActiveCommunity =
    Boolean(sessionIdentity) &&
    channelScopeCommunityIdRef.current === requestedPresentationCommunityId &&
    channelScopeSessionIdentityRef.current === sessionIdentity;
  const presentedChannels = isPresentationScopedToActiveCommunity
    ? channels
    : [{
        ...GENERAL_FALLBACK_CHANNEL,
        community_id: requestedPresentationCommunityId ?? "",
      }];
  const presentedHasResolvedChannels =
    isPresentationScopedToActiveCommunity && hasResolvedChannels;
  const presentedChannelsError = isPresentationScopedToActiveCommunity
    ? channelsError
    : null;
  const selection = resolveWebCommunityChannelSelection({
    channels: presentedChannels,
    requestedChannelSlug: normalizedRequestedSlug,
    hasResolvedChannels: presentedHasResolvedChannels,
    channelsError: presentedChannelsError,
  });

  const createChannel = useCallback(async (nameRaw: string, accessMode: "all_members" | "restricted" = "all_members"): Promise<CloudCommunityChannel | null> => {
    const current = paramsRef.current;
    const communityId = String(current.activeCommunityId ?? "").trim();
    const name = String(nameRaw ?? "").trim().replace(/\s+/g, " ");
    if (!communityId || !name || createInFlightCommunityIdRef.current) return null;
    createInFlightCommunityIdRef.current = communityId;
    setIsCreatingChannel(true);
    setCreateChannelError(null);
    try {
      const usableSession = await current.ensureSession(current.session ?? undefined);
      if (!usableSession) throw new Error("auth_session_required");
      const created = await createCloudCommunityChannel({
        accessMode,
        session: usableSession,
        communityId,
        name,
      });
      if (paramsRef.current.activeCommunityId !== communityId) return null;
      setChannels((existing) => normalizeChannels(
        communityId,
        [...existing.filter((channel) => channel.id !== created.id), created],
      ));
      if (current.onChannelCreated) current.onChannelCreated(created);
      else current.setRequestedChannelSlug(created.slug);
      return created;
    } catch (error) {
      if (paramsRef.current.activeCommunityId === communityId) {
        setCreateChannelError(formatChannelError(error));
      }
      return null;
    } finally {
      if (createInFlightCommunityIdRef.current === communityId) {
        createInFlightCommunityIdRef.current = null;
      }
      if (paramsRef.current.activeCommunityId === communityId) {
        setIsCreatingChannel(false);
      }
    }
  }, []);

  const renameChannel = useCallback(async (
    channelIdRaw: string,
    nameRaw: string,
  ): Promise<CloudCommunityChannel | null> => {
    const current = paramsRef.current;
    const communityId = String(current.activeCommunityId ?? "").trim();
    const channelId = String(channelIdRaw ?? "").trim();
    const name = String(nameRaw ?? "").trim().replace(/\s+/g, " ");
    if (!communityId || !channelId || !name || manageInFlightChannelIdRef.current) return null;
    manageInFlightChannelIdRef.current = channelId;
    setManagingChannelId(channelId);
    setManageChannelError(null);
    try {
      const usableSession = await current.ensureSession(current.session ?? undefined);
      if (!usableSession) throw new Error("auth_session_required");
      const renamed = await renameCloudCommunityChannel({
        session: usableSession,
        communityId,
        channelId,
        name,
      });
      if (paramsRef.current.activeCommunityId !== communityId) return null;
      setChannels((existing) => normalizeChannels(
        communityId,
        existing.map((channel) => channel.id === renamed.id ? renamed : channel),
      ));
      return renamed;
    } catch (error) {
      if (paramsRef.current.activeCommunityId === communityId) {
        setManageChannelError(formatChannelError(error));
      }
      return null;
    } finally {
      if (manageInFlightChannelIdRef.current === channelId) {
        manageInFlightChannelIdRef.current = null;
      }
      if (paramsRef.current.activeCommunityId === communityId) {
        setManagingChannelId(null);
      }
    }
  }, []);

  const deleteChannel = useCallback(async (
    channel: ManageableCommunityChannel,
  ): Promise<boolean> => {
    const current = paramsRef.current;
    const communityId = String(current.activeCommunityId ?? "").trim();
    const channelId = String(channel.id ?? "").trim();
    if (!communityId || !channelId || channel.is_general || manageInFlightChannelIdRef.current) {
      return false;
    }
    manageInFlightChannelIdRef.current = channelId;
    setManagingChannelId(channelId);
    setManageChannelError(null);
    try {
      const usableSession = await current.ensureSession(current.session ?? undefined);
      if (!usableSession) throw new Error("auth_session_required");
      const deleted = await deleteCloudCommunityChannel({
        session: usableSession,
        communityId,
        channelId,
      });
      if (deleted.deleted_channel_id !== channelId) {
        throw new Error("community_channel_delete_mismatch");
      }
      const completion = resolveWebCommunityChannelDeleteCompletion(paramsRef, communityId);
      if (!completion.shouldApply) return false;
      setChannels((existing) => normalizeChannels(
        communityId,
        existing.filter((candidate) => candidate.id !== channelId),
      ));
      completion.onChannelDeleted?.(channel);
      return true;
    } catch (error) {
      if (paramsRef.current.activeCommunityId === communityId) {
        setManageChannelError(formatChannelError(error));
      }
      return false;
    } finally {
      if (manageInFlightChannelIdRef.current === channelId) {
        manageInFlightChannelIdRef.current = null;
      }
      if (paramsRef.current.activeCommunityId === communityId) {
        setManagingChannelId(null);
      }
    }
  }, []);

  const reorderChannels = useCallback(async (orderedChannelIdsRaw: string[]): Promise<boolean> => {
    const current = paramsRef.current;
    const communityId = String(current.activeCommunityId ?? "").trim();
    const orderedChannelIds = orderedChannelIdsRaw
      .map((channelId) => String(channelId ?? "").trim())
      .filter(Boolean);
    if (
      !communityId ||
      reorderInFlightCommunityIdRef.current ||
      manageInFlightChannelIdRef.current ||
      createInFlightCommunityIdRef.current
    ) {
      return false;
    }
    const optimisticOrder = buildOptimisticWebCommunityChannelOrder(
      communityId,
      channels,
      orderedChannelIds,
    );
    if (!optimisticOrder) {
      setReorderChannelsError("The channel list changed. Try moving it again.");
      return false;
    }

    reorderInFlightCommunityIdRef.current = communityId;
    setIsReorderingChannels(true);
    setReorderChannelsError(null);
    setChannels(optimisticOrder);
    try {
      const usableSession = await current.ensureSession(current.session ?? undefined);
      if (!usableSession) throw new Error("auth_session_required");
      const reordered = await reorderCloudCommunityChannels({
        session: usableSession,
        communityId,
        orderedChannelIds,
      });
      if (paramsRef.current.activeCommunityId !== communityId) return false;
      setChannels(normalizeChannels(communityId, reordered));
      return true;
    } catch (error) {
      if (paramsRef.current.activeCommunityId === communityId) {
        const subscribed = lastSubscribedChannelsRef.current;
        if (subscribed.length > 0) setChannels(normalizeChannels(communityId, subscribed));
        setReorderChannelsError(formatChannelError(error));
      }
      return false;
    } finally {
      if (reorderInFlightCommunityIdRef.current === communityId) {
        reorderInFlightCommunityIdRef.current = null;
      }
      if (paramsRef.current.activeCommunityId === communityId) {
        setIsReorderingChannels(false);
      }
    }
  }, [channels]);

  const activeChannelId = selection.selectedChannel?.is_general
    ? null
    : String(selection.selectedChannel?.id ?? "").trim() || null;
  const isAtChannelLimit =
    presentedChannels.filter((channel) => Boolean(channel.id)).length >= maxActiveChannels;
  const retryChannels = useCallback(() => {
    setChannelsError(null);
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  return useMemo(() => ({
    channels: presentedChannels,
    selectedChannel: selection.selectedChannel,
    activeChannelId,
    selectedChannelSlug: selection.selectedChannelSlug,
    channelResolutionStatus: selection.status,
    isChannelContextReady: selection.status === "resolved",
    maxActiveChannels,
    isAtChannelLimit,
    hasResolvedChannels: presentedHasResolvedChannels,
    isLoadingChannels:
      Boolean(sessionIdentity && requestedPresentationCommunityId) &&
      (!isPresentationScopedToActiveCommunity || isLoadingChannels),
    channelsError: presentedChannelsError,
    isCreatingChannel,
    createChannelError,
    managingChannelId,
    manageChannelError,
    isReorderingChannels,
    reorderChannelsError,
    clearManageChannelError: () => setManageChannelError(null),
    clearReorderChannelsError: () => setReorderChannelsError(null),
    clearCreateChannelError: () => setCreateChannelError(null),
    retryChannels,
    createChannel,
    renameChannel,
    deleteChannel,
    reorderChannels,
  }), [
    activeChannelId,
    channelsError,
    createChannel,
    createChannelError,
    deleteChannel,
    hasResolvedChannels,
    isAtChannelLimit,
    isCreatingChannel,
    isLoadingChannels,
    isReorderingChannels,
    manageChannelError,
    managingChannelId,
    maxActiveChannels,
    reorderChannels,
    reorderChannelsError,
    presentedChannels,
    presentedChannelsError,
    presentedHasResolvedChannels,
    requestedPresentationCommunityId,
    sessionIdentity,
    retryChannels,
    renameChannel,
    selection.selectedChannel,
    selection.selectedChannelSlug,
    selection.status,
  ]);
}
