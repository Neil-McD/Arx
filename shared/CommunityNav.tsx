import { Fragment, memo, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  GitFork,
  GripVertical,
  Hash,
  Plus,
  Settings,
  UserPlus,
  Users,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type { CommunityTab } from "./appShellNavigation";
import { StableFramedMedia } from "./StableFramedMedia";
import { usePointerSortableList } from "./usePointerSortableList";
import { communityChannelCapacity, MAX_TOTAL_COMMUNITY_CHANNELS } from "./communityChannelCapacity";

type CommunityNavCommunityLike = {
  slug?: string | null;
  name?: string | null;
  banner_url?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
} | null;

type CommunityNavChannel = {
  id: string;
  slug: string;
  name: string;
  is_general: boolean;
  position: number;
  access_mode?: "all_members" | "restricted";
};

type CommunityNavProps = {
  memberNextStep?: ReactNode;
  activeCommunity: CommunityNavCommunityLike;
  hideIdentity?: boolean;
  hideIdentitySettings?: boolean;
  communityTab: CommunityTab;
  activeSelectionMode?: "route" | "none";
  tabIndicators?: Partial<Record<CommunityTab, boolean>> & { mentions?: boolean };
  canViewMembersActiveCommunity: boolean;
  canViewActiveCommunitySettings: boolean;
  canManageMembersActiveCommunity: boolean;
  canViewActiveCommunityAnalytics: boolean;
  isLoadingAccess?: boolean;
  onSelectTab: (tab: CommunityTab) => void;
  onCopyCommunityJoinLink?: (joinUrl: string) => Promise<void> | void;
  channels?: CommunityNavChannel[];
  /** Personal pods: one member's own pod, made for them by a workflow. Listed
   *  after the group pods, and folded when there are many. */
  personalPodIds?: string[];
  isLoadingChannels?: boolean;
  selectedChannelSlug?: string | null;
  channelIndicators?: Record<string, { chat: boolean; mentions: boolean }>;
  onSelectChannel?: (channel: CommunityNavChannel) => void;
  onCreateChannel?: (name: string, accessMode?: "all_members" | "restricted") => Promise<unknown>;
  isCreatingChannel?: boolean;
  createChannelError?: string | null;
  clearCreateChannelError?: () => void;
  isAtChannelLimit?: boolean;
  maxActiveChannels?: number;
  onReorderChannels?: (orderedChannelIds: string[], movedChannelId: string) => Promise<boolean> | boolean;
  isReorderingChannels?: boolean;
  reorderChannelsError?: string | null;
  clearReorderChannelsError?: () => void;
};

function moveChannelId(
  ids: string[],
  channelId: string,
  direction: -1 | 1,
): string[] | null {
  const fromIndex = ids.indexOf(channelId);
  const toIndex = fromIndex + direction;
  if (fromIndex < 0 || toIndex < 0 || toIndex >= ids.length) return null;
  const next = ids.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function moveChannelIdToIndex(
  ids: string[],
  channelId: string,
  targetIndexInput: number,
): string[] | null {
  const fromIndex = ids.indexOf(channelId);
  if (fromIndex < 0) return null;
  const targetIndex = Math.max(0, Math.min(ids.length - 1, targetIndexInput));
  if (fromIndex === targetIndex) return null;
  const next = ids.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

const PERSONAL_PODS_SHOWN = 3;

const MODAL_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const COMMUNITY_IDENTITY_HEIGHT_PX = 44;

function trapModalFocus(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== "Tab" || !container) return;
  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR),
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
  if (focusable.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }
  const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
  const target = event.shiftKey
    ? activeIndex <= 0
      ? focusable.at(-1)
      : null
    : activeIndex === -1 || activeIndex === focusable.length - 1
      ? focusable[0]
      : null;
  if (!target) return;
  event.preventDefault();
  target.focus();
}

function resolveCommunityJoinUrl(slugRaw: string | null | undefined): string | null {
  const slug = String(slugRaw ?? "").trim();
  if (!slug) return null;
  const joinPath = `/c/${encodeURIComponent(slug)}`;
  if (typeof window === "undefined") return joinPath;
  return new URL(joinPath, window.location.origin).toString();
}


export const CommunityNav = memo(function CommunityNav({
  activeCommunity,
  hideIdentity = false,
  hideIdentitySettings = false,
  communityTab,
  activeSelectionMode = "route",
  tabIndicators = {},
  canViewMembersActiveCommunity,
  canViewActiveCommunitySettings,
  canManageMembersActiveCommunity,
  canViewActiveCommunityAnalytics,
  isLoadingAccess = false,
  onSelectTab,
  memberNextStep,
  onCopyCommunityJoinLink,
  channels = [],
  personalPodIds,
  isLoadingChannels = false,
  selectedChannelSlug = "general",
  channelIndicators = {},
  onSelectChannel,
  onCreateChannel,
  isCreatingChannel = false,
  createChannelError = null,
  clearCreateChannelError,
  isAtChannelLimit = false,
  maxActiveChannels = MAX_TOTAL_COMMUNITY_CHANNELS,
  onReorderChannels,
  isReorderingChannels = false,
  reorderChannelsError = null,
  clearReorderChannelsError,
}: CommunityNavProps) {
  const [didCopyJoinLink, setDidCopyJoinLink] = useState(false);
  const [isAddChannelOpen, setIsAddChannelOpen] = useState(false);
  const [showAllPersonalPods, setShowAllPersonalPods] = useState(false);
  const [reorderControlsChannelId, setReorderControlsChannelId] = useState<string | null>(null);
  const [channelName, setChannelName] = useState("");
  const [channelAccessMode, setChannelAccessMode] = useState<"all_members" | "restricted">("all_members");
  const { sharedFull, privateFull } = communityChannelCapacity(channels);
  const selectedCapacityFull = channelAccessMode === "all_members" ? sharedFull : privateFull;
  const copyResetTimeoutRef = useRef<number | null>(null);
  const focusRestoreFrameRef = useRef<number | null>(null);
  const communityIdentityFrameRef = useRef<number | null>(null);
  const communityNavRef = useRef<HTMLElement | null>(null);
  const communityBannerHeaderRef = useRef<HTMLDivElement | null>(null);
  const channelNameInputRef = useRef<HTMLInputElement | null>(null);
  const addChannelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const addChannelDialogRef = useRef<HTMLFormElement | null>(null);
  const [isCommunityIdentityCondensed, setIsCommunityIdentityCondensed] = useState(false);
  const showSettingsButton = canViewActiveCommunitySettings && !hideIdentitySettings;
  const showActiveSelection = activeSelectionMode === "route";
  const showManagementSection =
    canManageMembersActiveCommunity ||
    canViewActiveCommunityAnalytics;
  const activeCommunityName = activeCommunity?.name?.trim() || null;
  const activeCommunityBannerUrl = activeCommunity?.banner_url?.trim() || null;
  const joinUrl = resolveCommunityJoinUrl(activeCommunity?.slug);
  const canCopyJoinLink = Boolean(canViewMembersActiveCommunity && joinUrl && onCopyCommunityJoinLink);
  const inviteTitle = didCopyJoinLink ? "Copied invite link" : "Copy invite link";
  const showChannelLoadingSkeleton =
    isLoadingAccess || (isLoadingChannels && channels.every((channel) => !channel.id));
  // Pods: invite-only channels sit in their own group
  // under the shared ones, the same Pods as in Classroom.
  // A member's personal pod is a pod too; with many
  // members they follow the group pods and fold away so they don't bury them.
  const personalPods = new Set(personalPodIds ?? []);
  const isPod = (channel: CommunityNavChannel) => channel.access_mode === "restricted";
  const isPersonalPod = (channel: CommunityNavChannel) => isPod(channel) && personalPods.has(channel.id);
  const groupedChannels = [
    ...channels.filter((channel) => !isPod(channel)),
    ...channels.filter((channel) => isPod(channel) && !isPersonalPod(channel)),
    ...channels.filter(isPersonalPod),
  ];
  const firstPodId = groupedChannels.find(isPod)?.id ?? null;
  // Owners and admins add a channel or a pod from the + beside its group's
  // label, not from one shared "Add Channel" row.
  const canCreateChannels = Boolean(!showChannelLoadingSkeleton && canManageMembersActiveCommunity && onCreateChannel);
  const openCreate = (accessMode: "all_members" | "restricted", trigger: HTMLButtonElement) => {
    addChannelTriggerRef.current = trigger;
    clearCreateChannelError?.();
    setChannelAccessMode(accessMode);
    setIsAddChannelOpen(true);
  };
  const groupLabel = (label: "Channels" | "Pods") => {
    const accessMode = label === "Pods" ? "restricted" : "all_members";
    const full = isAtChannelLimit || (label === "Pods" ? privateFull : sharedFull);
    const noun = label === "Pods" ? "pod" : "channel";
    return (
      <div className={`community-nav-group-label${label === "Channels" ? " is-channels" : ""}`}>
        <span>{label}</span>
        {canCreateChannels ? (
          <button
            type="button"
            className="community-nav-group-add"
            disabled={full}
            aria-label={`New ${noun}`}
            title={full ? `${noun === "pod" ? "Pod" : "Channel"} limit reached` : `New ${noun}`}
            onClick={(event) => openCreate(accessMode, event.currentTarget)}
          >
            <Plus size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    );
  };
  const personalPodChannels = groupedChannels.filter(isPersonalPod);
  // Folded personal pods still show when open or unread.
  const foldedPersonalPods = showAllPersonalPods || personalPodChannels.length <= PERSONAL_PODS_SHOWN
    ? new Set<string>()
    : new Set(personalPodChannels.slice(PERSONAL_PODS_SHOWN)
        .filter((channel) => channel.slug !== selectedChannelSlug && !channelIndicators[channel.slug]?.chat)
        .map((channel) => channel.id));
  const reorderableChannelIds = groupedChannels
    .filter((channel) => !channel.is_general && Boolean(channel.id))
    .map((channel) => channel.id);
  const canReorderChannels = Boolean(
    canManageMembersActiveCommunity && onReorderChannels && reorderableChannelIds.length > 1,
  );
  const commitChannelOrder = (orderedIds: string[] | null, movedChannelId: string) => {
    if (!orderedIds || !onReorderChannels || isReorderingChannels) return;
    clearReorderChannelsError?.();
    void onReorderChannels(orderedIds, movedChannelId);
  };
  const {
    setContainerElement: setChannelListElement,
    getItemBindings: getChannelItemBindings,
    draggingId: draggingChannelId,
  } = usePointerSortableList({
    itemIds: reorderableChannelIds,
    enabled: canReorderChannels && !isReorderingChannels,
    onMoveToIndex: (draggedChannelId, targetIndex) => {
      commitChannelOrder(moveChannelIdToIndex(
        reorderableChannelIds,
        draggedChannelId,
        targetIndex,
      ), draggedChannelId);
    },
  });
  const restoreModalTriggerFocus = (
    target: HTMLElement | null,
    fallback: HTMLElement | null = null,
  ) => {
    if (focusRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(focusRestoreFrameRef.current);
    }
    focusRestoreFrameRef.current = window.requestAnimationFrame(() => {
      const focusTarget = target?.isConnected ? target : fallback?.isConnected ? fallback : null;
      focusTarget?.focus();
      focusRestoreFrameRef.current = null;
    });
  };

  useEffect(() => {
    if (!isAddChannelOpen) return;
    const frame = window.requestAnimationFrame(() => channelNameInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isAddChannelOpen]);

  useEffect(() => {
    if (!isAddChannelOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isCreatingChannel) {
        event.preventDefault();
        event.stopPropagation();
        setIsAddChannelOpen(false);
        setChannelName("");
        clearCreateChannelError?.();
        restoreModalTriggerFocus(addChannelTriggerRef.current);
        return;
      }
      trapModalFocus(event, addChannelDialogRef.current);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isAddChannelOpen, isCreatingChannel]);

  useEffect(() => {
    setIsAddChannelOpen(false);
    setChannelName("");
    setChannelAccessMode("all_members");
    setReorderControlsChannelId(null);
    clearCreateChannelError?.();
    clearReorderChannelsError?.();
  }, [activeCommunity?.slug]);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      if (focusRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(focusRestoreFrameRef.current);
      }
      if (communityIdentityFrameRef.current !== null) {
        window.cancelAnimationFrame(communityIdentityFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setDidCopyJoinLink(false);
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
      copyResetTimeoutRef.current = null;
    }
  }, [joinUrl]);

  useEffect(() => {
    const nav = communityNavRef.current;
    const bannerHeader = communityBannerHeaderRef.current;
    if (hideIdentity || !nav || !activeCommunityBannerUrl || !bannerHeader) {
      setIsCommunityIdentityCondensed(false);
      return;
    }

    const updateIdentitySurface = () => {
      if (communityIdentityFrameRef.current !== null) return;
      communityIdentityFrameRef.current = window.requestAnimationFrame(() => {
        const navTop = nav.getBoundingClientRect().top;
        const bannerBottom = bannerHeader.getBoundingClientRect().bottom;
        setIsCommunityIdentityCondensed(
          bannerBottom <= navTop + COMMUNITY_IDENTITY_HEIGHT_PX,
        );
        communityIdentityFrameRef.current = null;
      });
    };

    updateIdentitySurface();
    nav.addEventListener("scroll", updateIdentitySurface, { passive: true });
    window.addEventListener("resize", updateIdentitySurface);
    const bannerResizeObserver = new ResizeObserver(updateIdentitySurface);
    bannerResizeObserver.observe(bannerHeader);
    return () => {
      nav.removeEventListener("scroll", updateIdentitySurface);
      window.removeEventListener("resize", updateIdentitySurface);
      bannerResizeObserver.disconnect();
      if (communityIdentityFrameRef.current !== null) {
        window.cancelAnimationFrame(communityIdentityFrameRef.current);
        communityIdentityFrameRef.current = null;
      }
    };
  }, [activeCommunityBannerUrl, hideIdentity]);

  const handleCopyJoinLink = async () => {
    if (!joinUrl || !onCopyCommunityJoinLink) return;
    try {
      await onCopyCommunityJoinLink(joinUrl);
      setDidCopyJoinLink(true);
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setDidCopyJoinLink(false);
        copyResetTimeoutRef.current = null;
      }, 1800);
    } catch (error) {
      console.warn("Failed to copy community invite link:", error);
    }
  };

  const closeAddChannel = () => {
    if (isCreatingChannel) return;
    setIsAddChannelOpen(false);
    setChannelName("");
    setChannelAccessMode("all_members");
    clearCreateChannelError?.();
    restoreModalTriggerFocus(addChannelTriggerRef.current);
  };

  const handleCreateChannel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = channelName.trim().replace(/\s+/g, " ");
    if (!normalizedName || !onCreateChannel || isCreatingChannel) return;
    clearCreateChannelError?.();
    const created = await onCreateChannel(normalizedName, channelAccessMode);
    if (!created) return;
    setChannelAccessMode("all_members");
    setIsAddChannelOpen(false);
    setChannelName("");
    restoreModalTriggerFocus(addChannelTriggerRef.current);
  };

  return (
    <aside
      className="community-nav"
      ref={communityNavRef}
      aria-busy={isLoadingAccess || showChannelLoadingSkeleton}
    >
      {activeCommunityName && !hideIdentity ? (
        <div
          className={`community-nav-identity${activeCommunityBannerUrl ? " has-banner" : ""}${!activeCommunityBannerUrl || isCommunityIdentityCondensed ? " is-condensed" : ""}`}
        >
          <span className="community-nav-identity-name" title={activeCommunityName}>
            {activeCommunityName}
          </span>
          {showSettingsButton ? (
            <button
              className={`community-nav-settings${showActiveSelection && communityTab === "settings" ? " active" : ""}`}
              type="button"
              onClick={() => onSelectTab("settings")}
              title="Community settings"
              aria-label={`Open ${activeCommunityName} settings`}
            >
              <Settings size={20} strokeWidth={1.8} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
      {activeCommunityBannerUrl ? (
        <div className="community-nav-header" ref={communityBannerHeaderRef}>
          <StableFramedMedia
            className="community-nav-banner has-image"
            imageClassName="community-nav-banner-img"
            imageUrl={activeCommunityBannerUrl}
            frame={{
              focusX: activeCommunity?.banner_focus_x,
              focusY: activeCommunity?.banner_focus_y,
              zoom: activeCommunity?.banner_zoom,
            }}
            alt=""
            loading="eager"
            fetchPriority="high"
            aria-hidden
          />
        </div>
      ) : null}
      {memberNextStep}
      <div
        className="community-channel-list"
        aria-label="Channels"
        ref={setChannelListElement}
      >
        {groupLabel("Channels")}
        {showChannelLoadingSkeleton ? (
          <div className="community-channel-loading" aria-label="Loading channels">
            <div className="community-channel-loading-row web-skeleton-row" />
            <div className="community-channel-loading-row is-short web-skeleton-row" />
          </div>
        ) : groupedChannels.map((channel) => {
          const isSelected =
            showActiveSelection &&
            communityTab === "chat" &&
            (selectedChannelSlug ?? "general") === channel.slug;
          if (foldedPersonalPods.has(channel.id)) return null;
          const indicator = channelIndicators[channel.slug];
          const sortableBindings = canReorderChannels && !channel.is_general
            ? getChannelItemBindings(channel.id)
            : null;
          return (
            <Fragment key={channel.id || channel.slug}>
            {channel.id && channel.id === firstPodId ? groupLabel("Pods") : null}
            <div
              ref={sortableBindings?.ref}
              style={sortableBindings?.style}
              className={`community-channel-row${draggingChannelId === channel.id ? " is-dragging" : ""}${sortableBindings ? " reorder-enabled" : ""}`}
            >
              <button
                className={isSelected ? "nav-item community-channel-item active" : "nav-item community-channel-item"}
                type="button"
                onPointerDown={sortableBindings?.onPointerDown}
                onClickCapture={sortableBindings?.onClickCapture}
                onClick={() => {
                  if (onSelectChannel) onSelectChannel(channel);
                  else onSelectTab("chat");
                }}
                title={channel.name}
              >
                <span className="nav-icon community-channel-icon" aria-hidden="true">
                  {channel.access_mode !== "restricted" ? <Hash size={17} strokeWidth={1.8} />
                    : personalPods.has(channel.id) ? <UserRound size={17} strokeWidth={1.8} />
                    : <UsersRound size={17} strokeWidth={1.8} />}
                </span>
                <span className="nav-item-label">{channel.name}</span>
                {!isSelected && (indicator?.chat || indicator?.mentions) ? (
                  <span className={`nav-item-dot${indicator.mentions ? " is-mention" : ""}`} aria-hidden="true" />
                ) : null}
              </button>
              {canReorderChannels && !channel.is_general ? (
                <div className="community-channel-reorder">
                  <button
                    type="button"
                    className="community-channel-reorder-trigger"
                    disabled={isReorderingChannels}
                    aria-label={`Reorder ${channel.name}`}
                    aria-expanded={reorderControlsChannelId === channel.id}
                    title="Drag channel or open move controls"
                    onPointerDown={sortableBindings?.onPointerDown}
                    onClickCapture={sortableBindings?.onClickCapture}
                    onClick={(event) => {
                      event.stopPropagation();
                      setReorderControlsChannelId((current) => current === channel.id ? null : channel.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                      event.preventDefault();
                      commitChannelOrder(moveChannelId(
                        reorderableChannelIds,
                        channel.id,
                        event.key === "ArrowUp" ? -1 : 1,
                      ), channel.id);
                    }}
                  >
                    <GripVertical size={15} aria-hidden="true" />
                  </button>
                  {reorderControlsChannelId === channel.id ? (
                    <div className="community-channel-reorder-controls" aria-label={`Move ${channel.name}`}>
                      <button
                        type="button"
                        disabled={reorderableChannelIds[0] === channel.id || isReorderingChannels}
                        onClick={() => commitChannelOrder(moveChannelId(reorderableChannelIds, channel.id, -1), channel.id)}
                        aria-label={`Move ${channel.name} up`}
                        title="Move up"
                      >
                        <ChevronUp size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={reorderableChannelIds.at(-1) === channel.id || isReorderingChannels}
                        onClick={() => commitChannelOrder(moveChannelId(reorderableChannelIds, channel.id, 1), channel.id)}
                        aria-label={`Move ${channel.name} down`}
                        title="Move down"
                      >
                        <ChevronDown size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            </Fragment>
          );
        })}
        {!showChannelLoadingSkeleton && personalPodChannels.length > PERSONAL_PODS_SHOWN ? (
          <button
            type="button"
            className="nav-item community-channel-item community-nav-fold"
            aria-expanded={showAllPersonalPods}
            onClick={() => setShowAllPersonalPods((value) => !value)}
          >
            <span className="nav-icon community-channel-icon" aria-hidden="true">
              {showAllPersonalPods ? <ChevronUp size={17} strokeWidth={1.8} /> : <ChevronDown size={17} strokeWidth={1.8} />}
            </span>
            <span className="nav-item-label">
              {showAllPersonalPods ? "Fewer personal pods" : `${foldedPersonalPods.size} more personal pods`}
            </span>
          </button>
        ) : null}
        {canCreateChannels && !firstPodId ? groupLabel("Pods") : null}
        {reorderChannelsError ? (
          <div className="community-channel-reorder-error" role="status">
            {reorderChannelsError}
          </div>
        ) : null}
      </div>
      <div className="community-nav-divider" aria-hidden="true" />
      {isLoadingAccess ? (
        <div className="community-nav-access-loading community-nav-utility-loading" aria-label="Loading community navigation">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="community-nav-access-loading-row web-skeleton-block" key={index} />
          ))}
        </div>
      ) : null}
      {!isLoadingAccess ? (
        <>
          <button className={showActiveSelection && communityTab === "agent" ? "nav-item active" : "nav-item"} type="button" onClick={() => onSelectTab("agent")} title="Agent">
            <span className="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /></svg></span>
            <span className="nav-item-label">Agent</span>
          </button>
          <button
            className={showActiveSelection && communityTab === "resources" ? "nav-item active" : "nav-item"}
            type="button"
            onClick={() => onSelectTab("resources")}
            title="Knowledge"
          >
            <span className="nav-icon">
              <Brain size={18} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <span className="nav-item-label">Knowledge</span>
            {communityTab !== "resources" && tabIndicators.resources ? <span className="nav-item-dot" aria-hidden="true" /> : null}
          </button>
          <button
            className={showActiveSelection && communityTab === "events" ? "nav-item active" : "nav-item"}
            type="button"
            onClick={() => onSelectTab("events")}
            title="Events"
          >
            <span className="nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 3v4" />
                <path d="M17 3v4" />
                <path d="M4 9h16" />
                <path d="M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
                <path d="M8 13h3" />
                <path d="M13 13h3" />
                <path d="M8 16h3" />
              </svg>
            </span>
            <span className="nav-item-label">Events</span>
            {communityTab !== "events" && tabIndicators.events ? <span className="nav-item-dot" aria-hidden="true" /> : null}
          </button>
        </>
      ) : null}
      {isLoadingAccess ? (
        <>
          <div className="community-nav-divider" />
          <div className="community-nav-access-loading" aria-label="Loading navigation">
            {Array.from({ length: 2 }).map((_, index) => (
              <div className="community-nav-access-loading-row web-skeleton-block" key={index} />
            ))}
          </div>
        </>
      ) : showManagementSection ? (
        <>
          <div className="community-nav-divider" />
          {canManageMembersActiveCommunity && (
            <button
              className={showActiveSelection && communityTab === "workflows" ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => onSelectTab("workflows")}
              title="Workflows"
            >
              <span className="nav-icon" aria-hidden="true">
                <GitFork size={18} strokeWidth={1.7} />
              </span>
              Workflows
            </button>
          )}
          {canManageMembersActiveCommunity && (
            <button
              className={showActiveSelection && communityTab === "people" ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => onSelectTab("people")}
              title="Members"
            >
              <span className="nav-icon" aria-hidden="true">
                <Users size={18} strokeWidth={1.7} />
              </span>
              Members
            </button>
          )}
          {canViewActiveCommunityAnalytics && (
            <button
              className={showActiveSelection && communityTab === "analytics" ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => onSelectTab("analytics")}
              title="Analytics"
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M4 19V5" />
                  <path d="M4 19h16" />
                  <path d="M8 15v-5" />
                  <path d="M12 15v-8" />
                  <path d="M16 15v-3" />
                </svg>
              </span>
              Analytics
            </button>
          )}
        </>
      ) : null}
      {isLoadingAccess ? (
        <div className="community-nav-footer" aria-hidden="true">
          <div className="community-nav-invite-loading web-skeleton-block" />
        </div>
      ) : canCopyJoinLink ? (
        <div className="community-nav-footer">
          <button
            className={`nav-item community-nav-invite${didCopyJoinLink ? " is-copied" : ""}`}
            type="button"
            onClick={() => void handleCopyJoinLink()}
            title={inviteTitle}
            aria-label={inviteTitle}
          >
            <span className="nav-icon">
              {didCopyJoinLink ? (
                <Check size={16} strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <UserPlus size={16} strokeWidth={1.9} aria-hidden="true" />
              )}
            </span>
            <span className="nav-item-label">{didCopyJoinLink ? "Copied" : "Invite people"}</span>
          </button>
        </div>
      ) : null}
      {isAddChannelOpen ? (
        <div
          className="community-channel-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAddChannel();
          }}
        >
          <form
            ref={addChannelDialogRef}
            className="community-channel-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="community-channel-modal-title"
            tabIndex={-1}
            onSubmit={(event) => void handleCreateChannel(event)}
          >
            <div className="community-channel-modal-header">
              <div>
                <h2 id="community-channel-modal-title">{channelAccessMode === "restricted" ? "New pod" : "New channel"}</h2>
                <p>{channelAccessMode === "restricted"
                  ? "A private room. Next you pick who's in it; owners and admins always are."
                  : "Everyone in the community can read and post here."}</p>
              </div>
              <button
                type="button"
                className="community-channel-modal-close"
                onClick={closeAddChannel}
                aria-label={channelAccessMode === "restricted" ? "Close new pod dialog" : "Close new channel dialog"}
                disabled={isCreatingChannel}
              >
                <X size={18} />
              </button>
            </div>
            <label className="community-channel-modal-field">
              <span>{channelAccessMode === "restricted" ? "Pod name" : "Channel name"}</span>
              <input
                ref={channelNameInputRef}
                value={channelName}
                maxLength={48}
                placeholder={channelAccessMode === "restricted" ? "e.g. Agency owners" : "e.g. Product feedback"}
                onChange={(event) => {
                  setChannelName(event.target.value);
                  clearCreateChannelError?.();
                }}
                disabled={isCreatingChannel}
              />
            </label>
            {createChannelError ? (
              <div className="community-channel-modal-error" role="alert">
                {createChannelError}
              </div>
            ) : null}
            <div className="community-channel-modal-actions">
              <button type="button" onClick={closeAddChannel} disabled={isCreatingChannel}>
                Cancel
              </button>
              <button
                type="submit"
                className="is-primary"
                disabled={isCreatingChannel || !channelName.trim() || selectedCapacityFull}
              >
                {isCreatingChannel ? "Creating…" : channelAccessMode === "restricted" ? "Create pod" : "Create channel"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </aside>
  );
});
