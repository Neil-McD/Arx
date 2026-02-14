type CommunityRailCommunity = {
  id: string;
  name: string;
  avatar_url?: string | null;
};

type DesktopCommunityRailProps = {
  activePage: "workspace" | "community" | "discover";
  activeView: "home" | "settings";
  communities: CommunityRailCommunity[];
  activeCommunityId: string | null;
  emptyMessage: string | null;
  getCommunityInitials: (name: string) => string;
  onOpenDiscover: () => void;
  onSelectCommunity: (communityId: string) => void;
  onOpenCreateCommunity: () => void;
  onToggleSettings: () => void;
};

export function DesktopCommunityRail(props: DesktopCommunityRailProps) {
  const {
    activePage,
    activeView,
    communities,
    activeCommunityId,
    emptyMessage,
    getCommunityInitials,
    onOpenDiscover,
    onSelectCommunity,
    onOpenCreateCommunity,
    onToggleSettings,
  } = props;

  return (
    <aside className="rail community-rail" aria-label="Communities">
      <div className="rail-main">
        <button
          type="button"
          className={`community-rail-button${activePage === "discover" ? " active" : ""}`}
          onClick={onOpenDiscover}
          title="Discover communities"
          aria-label="Discover communities"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="community-rail-icon">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M16.5 7.5l-3.2 8.1-8.1 3.2 3.2-8.1 8.1-3.2z" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <div className="community-rail-divider" />
        {communities.map((community) => (
          <button
            key={community.id}
            type="button"
            className={`community-rail-button community-rail-community${community.id === activeCommunityId ? " active" : ""}`}
            onClick={() => onSelectCommunity(community.id)}
            title={community.name}
          >
            {community.avatar_url ? (
              <img
                className="community-rail-avatar"
                src={community.avatar_url}
                alt={community.name}
                loading="lazy"
              />
            ) : (
              <span className="community-rail-initials">{getCommunityInitials(community.name)}</span>
            )}
          </button>
        ))}
        {emptyMessage && <div className="community-rail-empty">{emptyMessage}</div>}
        <div className="community-rail-divider" />
        <button
          type="button"
          className="community-rail-button community-rail-add"
          onClick={onOpenCreateCommunity}
          title="Create community"
          aria-label="Create community"
        >
          +
        </button>
      </div>
      <div className="rail-footer">
        <button
          type="button"
          className={`community-rail-button${activeView === "settings" ? " active" : ""}`}
          onClick={onToggleSettings}
          title="Settings"
          aria-label="Settings"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="community-rail-icon"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
