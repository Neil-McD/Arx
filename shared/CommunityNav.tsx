import type { CommunityTab } from "./appShellNavigation";

type CommunityNavCommunityLike = {
  name?: string | null;
  banner_url?: string | null;
} | null;

type CommunityNavProps = {
  activeCommunity: CommunityNavCommunityLike;
  communityTab: CommunityTab;
  canViewActiveCommunitySettings: boolean;
  canManageMembersActiveCommunity: boolean;
  canViewActiveCommunityAnalytics: boolean;
  activeCommunityOwnerIsPro: boolean | null;
  onSelectTab: (tab: CommunityTab) => void;
  buttonType?: "button" | "submit" | "reset";
  includeButtonTitles?: boolean;
};

export function CommunityNav({
  activeCommunity,
  communityTab,
  canViewActiveCommunitySettings,
  canManageMembersActiveCommunity,
  canViewActiveCommunityAnalytics,
  activeCommunityOwnerIsPro,
  onSelectTab,
  buttonType,
  includeButtonTitles = false,
}: CommunityNavProps) {
  const maybeTitle = (label: string): string | undefined => {
    return includeButtonTitles ? label : undefined;
  };

  return (
    <aside className="community-nav">
      <div className="community-nav-header">
        <div
          className={`community-nav-banner${activeCommunity?.banner_url ? " has-image" : ""}`}
          style={
            activeCommunity?.banner_url
              ? { backgroundImage: `url(${activeCommunity.banner_url})` }
              : undefined
          }
        >
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
        Chat
      </button>
      <button
        className={communityTab === "library" ? "nav-item active" : "nav-item"}
        type={buttonType}
        onClick={() => onSelectTab("library")}
        title={maybeTitle("Library")}
      >
        <span className="nav-icon">
          <svg viewBox="0 0 24 24">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 0 4 23" />
            <path d="M4 5.5V19.5" />
          </svg>
        </span>
        Library
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
        Resources
      </button>
      <button
        className={communityTab === "members" ? "nav-item active" : "nav-item"}
        type={buttonType}
        onClick={() => onSelectTab("members")}
        title={maybeTitle("Members")}
      >
        <span className="nav-icon">
          <svg viewBox="0 0 24 24">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </span>
        Members
      </button>
      {canViewActiveCommunitySettings && (
        <>
          <div className="community-nav-divider" />
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
          {canManageMembersActiveCommunity && (
            <button
              className={`${communityTab === "ai_agent" ? "nav-item active" : "nav-item"}${
                activeCommunityOwnerIsPro === false ? " premium-locked" : ""
              }`}
              type={buttonType}
              onClick={() => onSelectTab("ai_agent")}
              title={activeCommunityOwnerIsPro === false ? "AI Agent (Architect)" : "AI Agent"}
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
              {activeCommunityOwnerIsPro === false && (
                <span className="nav-premium-badge" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 7l4 4 4-6 4 6 4-4-2 13H6L4 7z" />
                  </svg>
                </span>
              )}
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
    </aside>
  );
}
