import {
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Hash,
  Plus,
  Settings,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { CommunityTab } from "./appShellNavigation";
import { CommunityAvatar } from "./CommunityAvatar";
import { CommunitySwitcherMenu } from "./CommunitySwitcherMenu";
import { StableFramedMedia } from "./StableFramedMedia";
import type { CommunityShellCommunity } from "./communityTypes";
import { usePointerSortableList } from "./usePointerSortableList";

type CommunityNavCommunityLike = CommunityShellCommunity | null;

type CommunityNavSwitcher = {
  communities: CommunityShellCommunity[];
  selectedCommunitySlug: string | null;
  attentionByCommunityId: Record<string, boolean>;
  isLoading: boolean;
  onOpenDiscover: () => void;
  onOpenCreate: () => void;
  onSelectCommunity: (community: CommunityShellCommunity) => boolean | void;
};

type CommunityNavChannel = {
  id: string;
  slug: string;
  name: string;
  is_general: boolean;
  position: number;
};

type CommunityNavProps = {
  activeCommunity: CommunityNavCommunityLike;
  communitySwitcher?: CommunityNavSwitcher | null;
  hideIdentity?: boolean;
  hideIdentitySettings?: boolean;
  communityTab: CommunityTab;
  activeSelectionMode?: "route" | "none";
  tabIndicators?: Partial<Record<CommunityTab, boolean>> & {
    mentions?: boolean;
  };
  canViewMembersActiveCommunity: boolean;
  canViewActiveCommunitySettings: boolean;
  canManageMembersActiveCommunity: boolean;
  canViewActiveCommunityAnalytics: boolean;
  memberCount?: number | null;
  onOpenMembers?: () => void;
  isLoadingAccess?: boolean;
  onSelectTab: (tab: CommunityTab) => void;
  onCopyCommunityJoinLink?: (joinUrl: string) => Promise<void> | void;
  /** Guest mode (public funnel): tabs rendered with a lock glyph instead of an indicator dot. */
  lockedTabs?: Partial<Record<CommunityTab, boolean>>;
  channels?: CommunityNavChannel[];
  isLoadingChannels?: boolean;
  selectedChannelSlug?: string | null;
  channelIndicators?: Record<string, { chat: boolean; mentions: boolean }>;
  onSelectChannel?: (channel: CommunityNavChannel) => void;
  onCreateChannel?: (name: string) => Promise<unknown>;
  isCreatingChannel?: boolean;
  createChannelError?: string | null;
  clearCreateChannelError?: () => void;
  isAtChannelLimit?: boolean;
  maxActiveChannels?: number;
  onReorderChannels?: (
    orderedChannelIds: string[],
  ) => Promise<boolean> | boolean;
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

function NavLockGlyph() {
  return (
    <span className="nav-item-lock" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    </span>
  );
}

function resolveCommunityJoinUrl(
  slugRaw: string | null | undefined,
): string | null {
  const slug = String(slugRaw ?? "").trim();
  if (!slug) return null;
  const joinPath = `/c/${encodeURIComponent(slug)}`;
  if (typeof window === "undefined") return joinPath;
  return new URL(joinPath, window.location.origin).toString();
}

function formatMemberCount(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value))
    return null;
  return Math.max(0, Math.floor(value)).toLocaleString();
}

export const CommunityNav = memo(function CommunityNav({
  activeCommunity,
  communitySwitcher = null,
  hideIdentity = false,
  hideIdentitySettings = false,
  communityTab,
  activeSelectionMode = "route",
  tabIndicators = {},
  canViewMembersActiveCommunity,
  canViewActiveCommunitySettings,
  canManageMembersActiveCommunity,
  canViewActiveCommunityAnalytics,
  memberCount = null,
  onOpenMembers,
  isLoadingAccess = false,
  onSelectTab,
  onCopyCommunityJoinLink,
  lockedTabs = {},
  channels = [],
  isLoadingChannels = false,
  selectedChannelSlug = "general",
  channelIndicators = {},
  onSelectChannel,
  onCreateChannel,
  isCreatingChannel = false,
  createChannelError = null,
  clearCreateChannelError,
  isAtChannelLimit = false,
  maxActiveChannels = 10,
  onReorderChannels,
  isReorderingChannels = false,
  reorderChannelsError = null,
  clearReorderChannelsError,
}: CommunityNavProps) {
  const [didCopyJoinLink, setDidCopyJoinLink] = useState(false);
  const [isCommunitySwitcherOpen, setIsCommunitySwitcherOpen] = useState(false);
  const [communitySwitcherStyle, setCommunitySwitcherStyle] =
    useState<CSSProperties>({});
  const [isAddChannelOpen, setIsAddChannelOpen] = useState(false);
  const [reorderControlsChannelId, setReorderControlsChannelId] = useState<
    string | null
  >(null);
  const [channelName, setChannelName] = useState("");
  const copyResetTimeoutRef = useRef<number | null>(null);
  const focusRestoreFrameRef = useRef<number | null>(null);
  const communityIdentityFrameRef = useRef<number | null>(null);
  const communityNavRef = useRef<HTMLElement | null>(null);
  const communitySwitcherTriggerRef = useRef<HTMLButtonElement | null>(null);
  const communitySwitcherPopoverRef = useRef<HTMLDivElement | null>(null);
  const communityBannerHeaderRef = useRef<HTMLDivElement | null>(null);
  const channelNameInputRef = useRef<HTMLInputElement | null>(null);
  const addChannelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const addChannelDialogRef = useRef<HTMLFormElement | null>(null);
  const [isCommunityIdentityCondensed, setIsCommunityIdentityCondensed] =
    useState(false);
  const showSettingsButton =
    canViewActiveCommunitySettings && !hideIdentitySettings;
  const showActiveSelection = activeSelectionMode === "route";
  const showManagementSection =
    canManageMembersActiveCommunity || canViewActiveCommunityAnalytics;
  const memberCountLabel = formatMemberCount(memberCount);
  const showMembersItem = Boolean(
    canViewMembersActiveCommunity && onOpenMembers,
  );
  const activeCommunityName = activeCommunity?.name?.trim() || null;
  const activeCommunityBannerUrl = activeCommunity?.banner_url?.trim() || null;
  const joinUrl = resolveCommunityJoinUrl(activeCommunity?.slug);
  const canCopyJoinLink = Boolean(canViewMembersActiveCommunity && joinUrl && onCopyCommunityJoinLink);
  const inviteTitle = didCopyJoinLink
    ? "Copied invite link"
    : "Copy invite link";
  const showChannelLoadingSkeleton = isLoadingAccess || (isLoadingChannels && channels.every((channel) => !channel.id));
  const reorderableChannelIds = channels
    .filter((channel) => !channel.is_general && Boolean(channel.id))
    .map((channel) => channel.id);
  const canReorderChannels = Boolean(
    canManageMembersActiveCommunity &&
    onReorderChannels &&
    reorderableChannelIds.length > 1,
  );
  const commitChannelOrder = (orderedIds: string[] | null) => {
    if (!orderedIds || !onReorderChannels || isReorderingChannels) return;
    clearReorderChannelsError?.();
    void onReorderChannels(orderedIds);
  };
  const {
    setContainerElement: setChannelListElement,
    getItemBindings: getChannelItemBindings,
    draggingId: draggingChannelId,
  } = usePointerSortableList({
    itemIds: reorderableChannelIds,
    enabled: canReorderChannels && !isReorderingChannels,
    onMoveToIndex: (draggedChannelId, targetIndex) => {
      commitChannelOrder(
        moveChannelIdToIndex(
          reorderableChannelIds,
          draggedChannelId,
          targetIndex,
        ),
      );
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
      const focusTarget = target?.isConnected
        ? target
        : fallback?.isConnected
          ? fallback
          : null;
      focusTarget?.focus();
      focusRestoreFrameRef.current = null;
    });
  };

  useEffect(() => {
    if (!isAddChannelOpen) return;
    const frame = window.requestAnimationFrame(() =>
      channelNameInputRef.current?.focus(),
    );
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
    setIsCommunitySwitcherOpen(false);
    setChannelName("");
    setReorderControlsChannelId(null);
    clearCreateChannelError?.();
    clearReorderChannelsError?.();
  }, [activeCommunity?.slug]);

  useEffect(() => {
    if (!isCommunitySwitcherOpen) return;
    const trigger = communitySwitcherTriggerRef.current;
    if (!trigger) return;

    const updatePosition = () => {
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(320, Math.max(248, rect.width + 56));
      setCommunitySwitcherStyle({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: Math.min(rect.bottom + 8, window.innerHeight - 96),
        width,
      });
    };
    const dismissWithoutFocus = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        (communitySwitcherTriggerRef.current?.contains(target) ||
          communitySwitcherPopoverRef.current?.contains(target))
      )
        return;
      setIsCommunitySwitcherOpen(false);
    };
    const dismissOnResize = () => setIsCommunitySwitcherOpen(false);

    updatePosition();
    document.addEventListener("pointerdown", dismissWithoutFocus, true);
    window.addEventListener("resize", dismissOnResize);
    return () => {
      document.removeEventListener("pointerdown", dismissWithoutFocus, true);
      window.removeEventListener("resize", dismissOnResize);
    };
  }, [isCommunitySwitcherOpen]);

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
    clearCreateChannelError?.();
    restoreModalTriggerFocus(addChannelTriggerRef.current);
  };

  const handleCreateChannel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = channelName.trim().replace(/\s+/g, " ");
    if (!normalizedName || !onCreateChannel || isCreatingChannel) return;
    clearCreateChannelError?.();
    const created = await onCreateChannel(normalizedName);
    if (!created) return;
    setIsAddChannelOpen(false);
    setChannelName("");
    restoreModalTriggerFocus(addChannelTriggerRef.current);
  };

  const closeCommunitySwitcher = (restoreFocus = true) => {
    setIsCommunitySwitcherOpen(false);
    if (restoreFocus) {
      restoreModalTriggerFocus(communitySwitcherTriggerRef.current);
    }
  };

  const communitySwitcherPortal =
    isCommunitySwitcherOpen &&
    communitySwitcher &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            ref={communitySwitcherPopoverRef}
            className="community-switcher-popover"
            style={communitySwitcherStyle}
          >
            <CommunitySwitcherMenu
              presentation="desktop"
              communities={communitySwitcher.communities}
              selectedCommunitySlug={communitySwitcher.selectedCommunitySlug}
              attentionByCommunityId={communitySwitcher.attentionByCommunityId}
              isLoading={communitySwitcher.isLoading}
              onOpenDiscover={communitySwitcher.onOpenDiscover}
              onOpenCreate={communitySwitcher.onOpenCreate}
              onSelectCommunity={communitySwitcher.onSelectCommunity}
              onDismiss={() => closeCommunitySwitcher()}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <aside
        className="community-nav"
        ref={communityNavRef}
        aria-busy={isLoadingAccess || showChannelLoadingSkeleton}
      >
        {activeCommunityName && !hideIdentity ? (
          <div
            className={`community-nav-identity${activeCommunityBannerUrl ? " has-banner" : ""}${!activeCommunityBannerUrl || isCommunityIdentityCondensed ? " is-condensed" : ""}`}
          >
            {communitySwitcher ? (
              <button
                ref={communitySwitcherTriggerRef}
                className={`community-nav-switcher-trigger${
                  isCommunitySwitcherOpen ? " active" : ""
                }`}
                type="button"
                aria-haspopup="menu"
                aria-expanded={isCommunitySwitcherOpen}
                aria-label={`Switch community. Current community: ${activeCommunityName}`}
                title="Switch community"
                onClick={() =>
                  setIsCommunitySwitcherOpen((current) => !current)
                }
              >
                <CommunityAvatar
                  communityId={activeCommunity?.id}
                  visualIdentity={activeCommunity?.visual_identity}
                  className="community-nav-identity-avatar"
                  imageUrl={activeCommunity?.avatar_url}
                  focusX={activeCommunity?.avatar_focus_x}
                  focusY={activeCommunity?.avatar_focus_y}
                  zoom={activeCommunity?.avatar_zoom}
                  name={activeCommunityName}
                  loading="eager"
                />
                <span
                  className="community-nav-identity-name"
                  title={activeCommunityName}
                >
                  {activeCommunityName}
                </span>
                <ChevronDown
                  className="community-nav-switcher-chevron"
                  size={15}
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
              </button>
            ) : (
              <span
                className="community-nav-identity-name"
                title={activeCommunityName}
              >
                {activeCommunityName}
              </span>
            )}
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
        <div
          className="community-channel-list"
          aria-label="Channels"
          ref={setChannelListElement}
        >
          {showChannelLoadingSkeleton ? (
            <div
              className="community-channel-loading"
              aria-label="Loading channels"
            >
              <div className="community-channel-loading-row web-skeleton-row" />
              <div className="community-channel-loading-row is-short web-skeleton-row" />
            </div>
          ) : (
            channels.map((channel) => {
              const isSelected =
                showActiveSelection &&
                communityTab === "chat" &&
                (selectedChannelSlug ?? "general") === channel.slug;
              const indicator = channelIndicators[channel.slug];
              const sortableBindings =
                canReorderChannels && !channel.is_general
                  ? getChannelItemBindings(channel.id)
                  : null;
              return (
                <div
                  key={channel.id || channel.slug}
                  ref={sortableBindings?.ref}
                  style={sortableBindings?.style}
                  className={`community-channel-row${draggingChannelId === channel.id ? " is-dragging" : ""}${sortableBindings ? " reorder-enabled" : ""}`}
                >
                  <button
                    className={
                      isSelected
                        ? "nav-item community-channel-item active"
                        : "nav-item community-channel-item"
                    }
                    type="button"
                    onPointerDown={sortableBindings?.onPointerDown}
                    onClickCapture={sortableBindings?.onClickCapture}
                    onClick={() => {
                      if (onSelectChannel) onSelectChannel(channel);
                      else onSelectTab("chat");
                    }}
                    title={channel.name}
                  >
                    <span
                      className="nav-icon community-channel-icon"
                      aria-hidden="true"
                    >
                      <Hash size={17} strokeWidth={1.8} />
                    </span>
                    <span className="nav-item-label">{channel.name}</span>
                    {lockedTabs.chat ? (
                      <NavLockGlyph />
                    ) : !isSelected &&
                      (indicator?.chat || indicator?.mentions) ? (
                      <span
                        className={`nav-item-dot${indicator.mentions ? " is-mention" : ""}`}
                        aria-hidden="true"
                      />
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
                          setReorderControlsChannelId((current) =>
                            current === channel.id ? null : channel.id,
                          );
                        }}
                        onKeyDown={(event) => {
                          if (
                            event.key !== "ArrowUp" &&
                            event.key !== "ArrowDown"
                          )
                            return;
                          event.preventDefault();
                          commitChannelOrder(
                            moveChannelId(
                              reorderableChannelIds,
                              channel.id,
                              event.key === "ArrowUp" ? -1 : 1,
                            ),
                          );
                        }}
                      >
                        <GripVertical size={15} aria-hidden="true" />
                      </button>
                      {reorderControlsChannelId === channel.id ? (
                        <div
                          className="community-channel-reorder-controls"
                          aria-label={`Move ${channel.name}`}
                        >
                          <button
                            type="button"
                            disabled={
                              reorderableChannelIds[0] === channel.id ||
                              isReorderingChannels
                            }
                            onClick={() =>
                              commitChannelOrder(
                                moveChannelId(
                                  reorderableChannelIds,
                                  channel.id,
                                  -1,
                                ),
                              )
                            }
                            aria-label={`Move ${channel.name} up`}
                            title="Move up"
                          >
                            <ChevronUp size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={
                              reorderableChannelIds.at(-1) === channel.id ||
                              isReorderingChannels
                            }
                            onClick={() =>
                              commitChannelOrder(
                                moveChannelId(
                                  reorderableChannelIds,
                                  channel.id,
                                  1,
                                ),
                              )
                            }
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
              );
            })
          )}
          {reorderChannelsError ? (
            <div className="community-channel-reorder-error" role="status">
              {reorderChannelsError}
            </div>
          ) : null}
          {!showChannelLoadingSkeleton && canManageMembersActiveCommunity && onCreateChannel ? (
            <button
              ref={addChannelTriggerRef}
              className="nav-item community-channel-add"
              type="button"
              disabled={isAtChannelLimit}
              onClick={() => {
                clearCreateChannelError?.();
                setIsAddChannelOpen(true);
              }}
              title={
                isAtChannelLimit
                  ? `Channel limit reached (${maxActiveChannels})`
                  : "Add Channel"
              }
            >
              <span className="nav-icon" aria-hidden="true">
                <Plus size={17} strokeWidth={1.8} />
              </span>
              <span className="nav-item-label">
                {isAtChannelLimit
                  ? `${maxActiveChannels} channel limit`
                  : "Add Channel"}
              </span>
            </button>
          ) : null}
        </div>
        <div className="community-nav-divider" aria-hidden="true" />
        {isLoadingAccess ? (
          <div
            className="community-nav-access-loading community-nav-utility-loading"
            aria-label="Loading community navigation"
          >
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                className="community-nav-access-loading-row web-skeleton-block"
                key={index}
              />
            ))}
          </div>
        ) : showMembersItem ? (
          <button
            className="nav-item community-nav-members"
            type="button"
            onClick={onOpenMembers}
            title="Members"
            aria-label={
              memberCountLabel ? `Members, ${memberCountLabel}` : "Members"
            }
          >
            <span className="nav-icon" aria-hidden="true">
              <Users size={18} strokeWidth={1.7} />
            </span>
            <span className="nav-item-label">Members</span>
            {memberCountLabel ? (
              <span className="community-nav-members-count">
                {memberCountLabel}
              </span>
            ) : null}
          </button>
        ) : null}
        {!isLoadingAccess ? (
          <>
            <button
              className={
                showActiveSelection && communityTab === "resources"
                  ? "nav-item active"
                  : "nav-item"
              }
              type="button"
              onClick={() => onSelectTab("resources")}
              title="Resources"
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M10 13a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07L10 5" />
                  <path d="M14 11a5 5 0 0 0-7.07 0L3.4 14.54a5 5 0 0 0 7.07 7.07L14 19" />
                </svg>
              </span>
              <span className="nav-item-label">Resources</span>
              {lockedTabs.resources ? (
                <NavLockGlyph />
              ) : communityTab !== "resources" && tabIndicators.resources ? (
                <span className="nav-item-dot" aria-hidden="true" />
              ) : null}
            </button>
            <button
              className={
                showActiveSelection && communityTab === "events"
                  ? "nav-item active"
                  : "nav-item"
              }
              type="button"
              onClick={() => onSelectTab("events")}
              title="Events"
            >
              <span className="nav-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
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
              {lockedTabs.events ? (
                <NavLockGlyph />
              ) : communityTab !== "events" && tabIndicators.events ? (
                <span className="nav-item-dot" aria-hidden="true" />
              ) : null}
            </button>
          </>
        ) : null}
        {isLoadingAccess ? (
          <>
            <div className="community-nav-divider" />
            <div
              className="community-nav-access-loading"
              aria-label="Loading navigation"
            >
              {Array.from({ length: 2 }).map((_, index) => (
                <div
                  className="community-nav-access-loading-row web-skeleton-block"
                  key={index}
                />
              ))}
            </div>
          </>
        ) : showManagementSection ? (
          <>
            <div className="community-nav-divider" />
            {canManageMembersActiveCommunity && (
              <button
                className={
                  showActiveSelection && communityTab === "funnel"
                    ? "nav-item active"
                    : "nav-item"
                }
                type="button"
                onClick={() => onSelectTab("funnel")}
                title="Funnel"
              >
                <span className="nav-icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 6h16" />
                    <path d="M7 11h10" />
                    <path d="M10 16h4" />
                  </svg>
                </span>
                Funnel
              </button>
            )}
            {canViewActiveCommunityAnalytics && (
              <button
                className={
                  showActiveSelection && communityTab === "analytics"
                    ? "nav-item active"
                    : "nav-item"
                }
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
              <span className="nav-item-label">
                {didCopyJoinLink ? "Copied" : "Invite people"}
              </span>
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
                  <h2 id="community-channel-modal-title">Add channel</h2>
                  <p>Channels are visible to every community member.</p>
                </div>
                <button
                  type="button"
                  className="community-channel-modal-close"
                  onClick={closeAddChannel}
                  aria-label="Close add channel dialog"
                  disabled={isCreatingChannel}
                >
                  <X size={18} />
                </button>
              </div>
              <label className="community-channel-modal-field">
                <span>Channel name</span>
                <input
                  ref={channelNameInputRef}
                  value={channelName}
                  maxLength={48}
                  placeholder="e.g. Product feedback"
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
                <button
                  type="button"
                  onClick={closeAddChannel}
                  disabled={isCreatingChannel}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="is-primary"
                  disabled={isCreatingChannel || !channelName.trim()}
                >
                  {isCreatingChannel ? "Adding…" : "Add channel"}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </aside>
      {communitySwitcherPortal}
    </>
  );
});
