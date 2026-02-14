type TopbarCommunity = {
  id: string;
  name: string;
  avatar_url?: string | null;
};

type DesktopTopbarProps = {
  activePage: "workspace" | "community" | "discover";
  activeView: "home" | "settings";
  userWantsSessions: boolean;
  backTargetLabel: string | null;
  defaultBackLabel: string;
  activeCommunity: TopbarCommunity | null;
  unreadCount: number;
  getCommunityInitials: (name: string) => string;
  onBackFromWorkspaceSettings: () => void;
  onToggleThreadsPanel: () => void;
  onNewThread: () => void;
  onBackToWorkspace: () => void;
  onOpenCommunity: () => void;
};

export function DesktopTopbar(props: DesktopTopbarProps) {
  const {
    activePage,
    activeView,
    userWantsSessions,
    backTargetLabel,
    defaultBackLabel,
    activeCommunity,
    unreadCount,
    getCommunityInitials,
    onBackFromWorkspaceSettings,
    onToggleThreadsPanel,
    onNewThread,
    onBackToWorkspace,
    onOpenCommunity,
  } = props;

  return (
    <header className="app-topbar" data-tauri-drag-region>
      <div className="topbar-left" data-tauri-drag-region>
        {activePage === "workspace" ? (
          activeView === "settings" ? (
            <button
              className="back-to-workspace"
              data-tauri-drag-region="false"
              onClick={onBackFromWorkspaceSettings}
              title="Back"
            >
              <svg viewBox="0 0 24 24" className="back-icon">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="back-path">{backTargetLabel ?? defaultBackLabel}</span>
            </button>
          ) : (
            <>
              <button
                className={`icon-button${userWantsSessions ? " active" : ""}`}
                data-tauri-drag-region="false"
                onClick={onToggleThreadsPanel}
                aria-label="Toggle threads panel"
                title="Toggle threads panel"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M9 4v16" />
                </svg>
              </button>
              <button
                className="new-session-header-btn"
                data-tauri-drag-region="false"
                onClick={onNewThread}
                title="New thread"
              >
                <svg viewBox="0 0 24 24">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </>
          )
        ) : (
          <button
            className="back-to-workspace"
            data-tauri-drag-region="false"
            onClick={onBackToWorkspace}
            title="Back"
          >
            <svg viewBox="0 0 24 24" className="back-icon">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="back-path">{backTargetLabel ?? defaultBackLabel}</span>
          </button>
        )}
      </div>
      <div className="topbar-right" data-tauri-drag-region>
        {activeCommunity && (
          <button
            className={`icon-button community-btn${activePage === "community" ? " active" : ""}`}
            data-tauri-drag-region="false"
            onClick={onOpenCommunity}
            aria-label="Open community"
            title={activeCommunity.name}
          >
            {activeCommunity.avatar_url ? (
              <img
                className="community-btn-avatar"
                src={activeCommunity.avatar_url}
                alt={activeCommunity.name}
                loading="lazy"
              />
            ) : (
              <span className="community-btn-initials">{getCommunityInitials(activeCommunity.name)}</span>
            )}
            {unreadCount > 0 && activePage !== "community" && (
              <span className="unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
            )}
          </button>
        )}
      </div>
    </header>
  );
}
