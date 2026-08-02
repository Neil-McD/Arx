import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AuthSession } from "../auth";
import {
  createCloudCommunityChannel,
  subscribeCloudCommunityChannels,
  type CloudCommunityChannel,
} from "../../../../shared/cloudCommunityChannelsGateway";
import { createCloudCommunityChatLiveClient } from "../../../../shared/cloudCommunityChatGateway";

type EnsureAuthSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

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
  if (message.includes("community_manager_required")) {
    return "Only community managers can add channels.";
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

export function useWebCommunityChannelsController(params: {
  activeCommunityId: string | null;
  requestedChannelSlug: string | null;
  session: AuthSession | null;
  ensureSession: EnsureAuthSession;
  setRequestedChannelSlug: (slug: string | null) => void;
  onChannelCreated?: (channel: CloudCommunityChannel) => void;
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
  const [loadAttempt, setLoadAttempt] = useState(0);
  const createInFlightCommunityIdRef = useRef<string | null>(null);

  useEffect(() => {
    const communityId = String(params.activeCommunityId ?? "").trim();
    setChannels([
      { ...GENERAL_FALLBACK_CHANNEL, community_id: communityId },
    ]);
    setMaxActiveChannels(10);
    setHasResolvedChannels(false);
    setChannelsError(null);
    createInFlightCommunityIdRef.current = null;
    setIsCreatingChannel(false);
    setCreateChannelError(null);
    if (!communityId || !params.session) {
      setIsLoadingChannels(false);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let liveClient: ReturnType<typeof createCloudCommunityChatLiveClient> | null = null;
    setIsLoadingChannels(true);
    void (async () => {
      const usableSession = await params.ensureSession(params.session ?? undefined);
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
            setChannels(normalizeChannels(communityId, result.channels));
            setMaxActiveChannels(result.max_active_channels);
            setHasResolvedChannels(true);
            setIsLoadingChannels(false);
            setChannelsError(null);
          },
          onError: (error) => {
            if (cancelled || paramsRef.current.activeCommunityId !== communityId) return;
            setHasResolvedChannels(false);
            setIsLoadingChannels(false);
            setChannelsError(formatChannelError(error));
          },
        });
      } catch (error) {
        if (cancelled || paramsRef.current.activeCommunityId !== communityId) return;
        setHasResolvedChannels(false);
        setIsLoadingChannels(false);
        setChannelsError(formatChannelError(error));
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
      liveClient?.close();
    };
  }, [loadAttempt, params.activeCommunityId, params.ensureSession, params.session]);

  const normalizedRequestedSlug = String(params.requestedChannelSlug ?? "")
    .trim()
    .toLowerCase();
  const selection = resolveWebCommunityChannelSelection({
    channels,
    requestedChannelSlug: normalizedRequestedSlug,
    hasResolvedChannels,
    channelsError,
  });

  const createChannel = useCallback(async (nameRaw: string): Promise<CloudCommunityChannel | null> => {
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

  const activeChannelId = selection.selectedChannel?.is_general
    ? null
    : String(selection.selectedChannel?.id ?? "").trim() || null;
  const isAtChannelLimit = channels.filter((channel) => Boolean(channel.id)).length >= maxActiveChannels;
  const retryChannels = useCallback(() => {
    setChannelsError(null);
    setHasResolvedChannels(false);
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  return useMemo(() => ({
    channels,
    selectedChannel: selection.selectedChannel,
    activeChannelId,
    selectedChannelSlug: selection.selectedChannelSlug,
    channelResolutionStatus: selection.status,
    isChannelContextReady: selection.status === "resolved",
    maxActiveChannels,
    isAtChannelLimit,
    hasResolvedChannels,
    isLoadingChannels,
    channelsError,
    isCreatingChannel,
    createChannelError,
    clearCreateChannelError: () => setCreateChannelError(null),
    retryChannels,
    createChannel,
  }), [
    activeChannelId,
    channels,
    channelsError,
    createChannel,
    createChannelError,
    hasResolvedChannels,
    isAtChannelLimit,
    isCreatingChannel,
    isLoadingChannels,
    maxActiveChannels,
    retryChannels,
    selection.selectedChannel,
    selection.selectedChannelSlug,
    selection.status,
  ]);
}
