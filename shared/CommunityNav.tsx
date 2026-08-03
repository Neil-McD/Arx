import { memo, useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Hash, Plus, UserPlus, X } from "lucide-react";
import type { CommunityTab } from "./appShellNavigation";
import { StableFramedMedia } from "./StableFramedMedia";

type CommunityNavCommunityLike = {
  slug?: string | null;
  name?: string | null;
  banner_url?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
} | null;

type CommunityNavProps = {
  activeCommunity: CommunityNavCommunityLike;
  communityTab: CommunityTab;
  tabIndicators?: Partial<Record<CommunityTab, boolean>> & { mentions?: boolean };
  canViewMembersActiveCommunity: boolean;
  canViewActiveCommunitySettings: boolean;
  canManageMembersActiveCommunity: boolean;
  canViewActiveCommunityAnalytics: boolean;
  isLoadingAccess?: boolean;
  onSelectTab: (tab: CommunityTab) => void;
  onCopyCommunityJoinLink?: (joinUrl: string) => Promise<void> | void;
  /** Guest mode (public funnel): tabs rendered with a lock glyph instead of an indicator dot. */
  lockedTabs?: Partial<Record<CommunityTab, boolean>>;
  channels?: Array<{
    id: string;
    slug: string;
    name: string;
    is_general: boolean;
  }>;
  isLoadingChannels?: boolean;
  selectedChannelSlug?: string | null;
  channelIndicators?: Record<string, { chat: boolean; mentions: boolean }>;
  onSelectChannel?: (channel: {
    id: string;
    slug: string;
    name: string;
    is_general: boolean;
  }) => void;
  onCreateChannel?: (name: string) => Promise<unknown>;
  isCreatingChannel?: boolean;
  createChannelError?: string | null;
  clearCreateChannelError?: () => void;
  isAtChannelLimit?: boolean;
  maxActiveChannels?: number;
};

function NavLockGlyph() {
  return (
    <span className="nav-item-lock" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    </span>
  );
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
  communityTab,
  tabIndicators = {},
  canViewMembersActiveCommunity,
  canViewActiveCommunitySettings,
  canManageMembersActiveCommunity,
  canViewActiveCommunityAnalytics,
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
}: CommunityNavProps) {
  const [didCopyJoinLink, setDidCopyJoinLink] = useState(false);
  const [isAddChannelOpen, setIsAddChannelOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const copyResetTimeoutRef = useRef<number | null>(null);
  const channelNameInputRef = useRef<HTMLInputElement | null>(null);
  const showSettingsButton = canViewActiveCommunitySettings;
  const showManagementSection =
    showSettingsButton ||
    canManageMembersActiveCommunity ||
    canViewActiveCommunityAnalytics;
  const joinUrl = resolveCommunityJoinUrl(activeCommunity?.slug);
  const canCopyJoinLink = Boolean(canViewMembersActiveCommunity && joinUrl && onCopyCommunityJoinLink);
  const inviteTitle = didCopyJoinLink ? "Copied invite link" : "Copy invite link";
  const showChannelLoadingSkeleton =
    isLoadingAccess || (isLoadingChannels && channels.every((channel) => !channel.id));

  useEffect(() => {
    if (!isAddChannelOpen) return;
    const frame = window.requestAnimationFrame(() => channelNameInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isAddChannelOpen]);

  useEffect(() => {
    setIsAddChannelOpen(false);
    setChannelName("");
    clearCreateChannelError?.();
  }, [activeCommunity?.slug]);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
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
  };

  return (
    <aside className="community-nav">
      <div className="community-nav-header">
        <StableFramedMedia
          className={`community-nav-banner${activeCommunity?.banner_url ? " has-image" : ""}`}
          imageClassName="community-nav-banner-img"
          imageUrl={activeCommunity?.banner_url}
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
      <div className="community-channel-list" aria-label="Channels">
        {showChannelLoadingSkeleton ? (
          <div className="community-channel-loading" aria-label="Loading channels">
            <div className="community-channel-loading-row web-skeleton-row" />
            <div className="community-channel-loading-row is-short web-skeleton-row" />
          </div>
        ) : channels.map((channel) => {
          const isSelected =
            communityTab === "chat" &&
            (selectedChannelSlug ?? "general") === channel.slug;
          const indicator = channelIndicators[channel.slug];
          return (
            <button
              key={channel.id || channel.slug}
              className={isSelected ? "nav-item community-channel-item active" : "nav-item community-channel-item"}
              type="button"
              onClick={() => {
                if (onSelectChannel) onSelectChannel(channel);
                else onSelectTab("chat");
              }}
              title={channel.name}
            >
              <span className="nav-icon community-channel-icon" aria-hidden="true">
                <Hash size={17} strokeWidth={1.8} />
              </span>
              <span className="nav-item-label">{channel.name}</span>
              {lockedTabs.chat ? <NavLockGlyph /> : !isSelected && (indicator?.chat || indicator?.mentions) ? (
                <span className={`nav-item-dot${indicator.mentions ? " is-mention" : ""}`} aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
        {!showChannelLoadingSkeleton && canManageMembersActiveCommunity && onCreateChannel ? (
          <button
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
              {isAtChannelLimit ? `${maxActiveChannels} channel limit` : "Add Channel"}
            </span>
          </button>
        ) : null}
      </div>
      <button
        className={communityTab === "ai_feed" ? "nav-item active" : "nav-item"}
        type="button"
        onClick={() => onSelectTab("ai_feed")}
        title="AI Feed"
      >
        <span className="nav-icon">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 7h16" />
            <path d="M4 12h12" />
            <path d="M4 17h8" />
            <circle cx="18" cy="17" r="2" />
          </svg>
        </span>
        <span className="nav-item-label">AI Feed</span>
        {lockedTabs.ai_feed ? <NavLockGlyph /> : communityTab !== "ai_feed" && tabIndicators.ai_feed ? <span className="nav-item-dot" aria-hidden="true" /> : null}
      </button>
      <button
        className={communityTab === "resources" ? "nav-item active" : "nav-item"}
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
        {lockedTabs.resources ? <NavLockGlyph /> : communityTab !== "resources" && tabIndicators.resources ? <span className="nav-item-dot" aria-hidden="true" /> : null}
      </button>
      <button
        className={communityTab === "events" ? "nav-item active" : "nav-item"}
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
        {lockedTabs.events ? <NavLockGlyph /> : communityTab !== "events" && tabIndicators.events ? <span className="nav-item-dot" aria-hidden="true" /> : null}
      </button>
      {isLoadingAccess ? (
        <>
          <div className="community-nav-divider" />
          <div className="community-nav-access-loading" aria-label="Loading navigation">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="community-nav-access-loading-row web-skeleton-block" key={index} />
            ))}
          </div>
        </>
      ) : showManagementSection ? (
        <>
          <div className="community-nav-divider" />
          {showSettingsButton ? (
            <button
              className={communityTab === "settings" ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => onSelectTab("settings")}
              title="Settings"
            >
              <span className="nav-icon">
                <svg
                  viewBox="0 0 24 24"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ strokeWidth: 1.5 }}
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </span>
              Settings
            </button>
          ) : null}
          {canManageMembersActiveCommunity && (
            <button
              className={communityTab === "ai_agent" ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => onSelectTab("ai_agent")}
              title="AI Agent"
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24">
                  <circle cx="6" cy="7" r="2" />
                  <circle cx="6" cy="17" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="18" cy="7" r="2" />
                  <circle cx="18" cy="17" r="2" />
                  <path d="M7.5 8.3L10.5 10.7" />
                  <path d="M7.5 15.7L10.5 13.3" />
                  <path d="M13.5 10.7L16.5 8.3" />
                  <path d="M13.5 13.3L16.5 15.7" />
                </svg>
              </span>
              AI Agent
            </button>
          )}
          {canManageMembersActiveCommunity && (
            <button
              className={communityTab === "funnel" ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => onSelectTab("funnel")}
              title="Funnel"
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
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
              className={communityTab === "analytics" ? "nav-item active" : "nav-item"}
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
            className="community-channel-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="community-channel-modal-title"
            onSubmit={(event) => void handleCreateChannel(event)}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeAddChannel();
            }}
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
              <button type="button" onClick={closeAddChannel} disabled={isCreatingChannel}>
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
  );
});
