import { useEffect, useRef, useState } from "react";
import { Brain, Check, UserPlus } from "lucide-react";
import type { CommunityTab } from "./appShellNavigation";
import { getCommunityBannerImageStyle } from "./communityBannerUi";

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
  tabIndicators?: Partial<Record<CommunityTab, boolean>>;
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
  // Desktop reaches memory through the right-rail preview (click -> full graph),
  // so it hides this nav item; mobile keeps it until it has its own memory path.
  showPolynetItem?: boolean;
};

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
  showPolynetItem = true,
}: CommunityNavProps) {
  const [didCopyJoinLink, setDidCopyJoinLink] = useState(false);
  const copyResetTimeoutRef = useRef<number | null>(null);
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

  return (
    <aside className="community-nav">
      <div className="community-nav-header">
        <div
          className={`community-nav-banner${activeCommunity?.banner_url ? " has-image" : ""}`}
        >
          {activeCommunity?.banner_url ? (
            <img
              className="community-nav-banner-img"
              src={activeCommunity.banner_url}
              alt=""
              draggable={false}
              style={getCommunityBannerImageStyle({
                focusX: activeCommunity.banner_focus_x,
                focusY: activeCommunity.banner_focus_y,
                zoom: activeCommunity.banner_zoom,
              })}
            />
          ) : null}
          <div className="community-nav-banner-overlay" />
          <div className="community-nav-name">{activeCommunity?.name ?? "Community"}</div>
        </div>
      </div>
      <button
        className={communityTab === "chat" ? "nav-item active" : "nav-item"}
        type={buttonType}
        onClick={() => onSelectTab("chat")}
        title={maybeTitle("Chat")}
      >
        <span className="nav-icon">
          <svg viewBox="0 0 24 24">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          </svg>
        </span>
        <span className="nav-item-label">Chat</span>
        {communityTab !== "chat" && tabIndicators.chat ? <span className="nav-item-dot" aria-hidden="true" /> : null}
      </button>
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
        {communityTab !== "ai_feed" && tabIndicators.ai_feed ? <span className="nav-item-dot" aria-hidden="true" /> : null}
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
        {communityTab !== "resources" && tabIndicators.resources ? <span className="nav-item-dot" aria-hidden="true" /> : null}
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
        {communityTab !== "events" && tabIndicators.events ? <span className="nav-item-dot" aria-hidden="true" /> : null}
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
    </aside>
  );
}
