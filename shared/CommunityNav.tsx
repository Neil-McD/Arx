import { useEffect, useRef, useState, type FormEvent } from "react";
import { Brain, Check, Hash, Plus, UserPlus, X } from "lucide-react";
import type { CommunityTab } from "./appShellNavigation";
import { CommunityBanner } from "./CommunityBanner";

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
  canViewActiveCommunityPolynet: boolean;
  canManageMembersActiveCommunity: boolean;
  canViewActiveCommunityAnalytics: boolean;
  onSelectTab: (tab: CommunityTab) => void;
  onCopyCommunityJoinLink?: (joinUrl: string) => Promise<void> | void;
  buttonType?: "button" | "submit" | "reset";
  includeButtonTitles?: boolean;
  showSettingsItem?: boolean;
  // Memory belongs in the community context/right-panel path, not the left nav.
  showPolynetItem?: boolean;
  /** Guest mode (public funnel): subtitle line under the banner (the community's promise). */
  subtitle?: string | null;
  /** Guest mode (public funnel): tabs rendered with a lock glyph instead of an indicator dot. */
  lockedTabs?: Partial<Record<CommunityTab, boolean>>;
  channels?: Array<{
    id: string;
    slug: string;
    name: string;
    is_general: boolean;
  }>;
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

export function CommunityNav({
  activeCommunity,
  communityTab,
  tabIndicators = {},
  canViewMembersActiveCommunity,
  canViewActiveCommunitySettings,
  canViewActiveCommunityPolynet,
  canManageMembersActiveCommunity,
  canViewActiveCommunityAnalytics,
  onSelectTab,
  onCopyCommunityJoinLink,
  buttonType,
  includeButtonTitles = false,
  showSettingsItem = true,
  showPolynetItem = false,
  subtitle = null,
  lockedTabs = {},
  channels = [],
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
  const maybeTitle = (label: string): string | undefined => {
    return includeButtonTitles ? label : undefined;
  };
  const showSettingsButton = canViewActiveCommunitySettings && showSettingsItem;
  const showPolynetButton = canViewActiveCommunityPolynet && showPolynetItem;
  const showManagementSection =
    showSettingsButton ||
    showPolynetButton ||
    canManageMembersActiveCommunity ||
    canViewActiveCommunityAnalytics;
  const joinUrl = resolveCommunityJoinUrl(activeCommunity?.slug);
  const canCopyJoinLink = Boolean(canViewMembersActiveCommunity && joinUrl && onCopyCommunityJoinLink);
  const inviteTitle = didCopyJoinLink ? "Copied invite link" : "Copy invite link";
  const displayedChannels = channels.length > 0
    ? channels
    : [{ id: "", slug: "general", name: "General", is_general: true }];

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
        <CommunityBanner
          className="community-nav-banner"
          readyClassName="has-image"
          imageClassName="community-nav-banner-img"
          imageUrl={activeCommunity?.banner_url}
          focusX={activeCommunity?.banner_focus_x}
          focusY={activeCommunity?.banner_focus_y}
          zoom={activeCommunity?.banner_zoom}
          alt=""
          aria-hidden={true}
        />
        {subtitle ? <div className="community-nav-subtitle">{subtitle}</div> : null}
      </div>
      <div className="community-channel-list" aria-label="Channels">
        {displayedChannels.map((channel) => {
          const isSelected =
            communityTab === "chat" &&
            (selectedChannelSlug ?? "general") === channel.slug;
          const indicator = channelIndicators[channel.slug];
          return (
            <button
              key={channel.id || channel.slug}
              className={isSelected ? "nav-item community-channel-item active" : "nav-item community-channel-item"}
              type={buttonType}
              onClick={() => {
                if (onSelectChannel) onSelectChannel(channel);
                else onSelectTab("chat");
              }}
              title={maybeTitle(channel.name)}
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
        {canManageMembersActiveCommunity && onCreateChannel ? (
          <button
            className="nav-item community-channel-add"
            type={buttonType}
            disabled={isAtChannelLimit}
            onClick={() => {
              clearCreateChannelError?.();
              setIsAddChannelOpen(true);
            }}
            title={maybeTitle(
              isAtChannelLimit
                ? `Channel limit reached (${maxActiveChannels})`
                : "Add Channel",
            )}
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
        type={buttonType}
        onClick={() => onSelectTab("ai_feed")}
        title={maybeTitle("AI Feed")}
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
        type={buttonType}
        onClick={() => onSelectTab("resources")}
        title={maybeTitle("Resources")}
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
        type={buttonType}
        onClick={() => onSelectTab("events")}
        title={maybeTitle("Events")}
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
      {showManagementSection && (
        <>
          <div className="community-nav-divider" />
          {showSettingsButton ? (
            <button
              className={communityTab === "settings" ? "nav-item active" : "nav-item"}
              type={buttonType}
              onClick={() => onSelectTab("settings")}
              title={maybeTitle("Settings")}
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
          {showPolynetButton && (
            <button
              className={communityTab === "polynet" ? "nav-item active" : "nav-item"}
              type={buttonType}
              onClick={() => onSelectTab("polynet")}
              title={maybeTitle("Polynet")}
            >
              <span className="nav-icon">
                <Brain size={19} strokeWidth={1.8} />
              </span>
              Polynet
            </button>
          )}
          {canManageMembersActiveCommunity && (
            <button
              className={communityTab === "ai_agent" ? "nav-item active" : "nav-item"}
              type={buttonType}
              onClick={() => onSelectTab("ai_agent")}
              title={maybeTitle("AI Agent")}
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
              type={buttonType}
              onClick={() => onSelectTab("funnel")}
              title={maybeTitle("Funnel")}
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
              type={buttonType}
              onClick={() => onSelectTab("analytics")}
              title={maybeTitle("Analytics")}
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
      )}
      {canCopyJoinLink ? (
        <div className="community-nav-footer">
          <button
            className={`nav-item community-nav-invite${didCopyJoinLink ? " is-copied" : ""}`}
            type={buttonType}
            onClick={() => void handleCopyJoinLink()}
            title={maybeTitle(inviteTitle)}
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
}
