import { StableAvatar } from "../../../../shared/StableAvatar";
import { getCommunityAvatarImageStyle } from "../../../../shared/communityAvatarUi";

type WebMobileTopBarProps = {
  mode: "agent" | "discover" | "community";
  secondaryMode: "discover" | "community";
  showDrawerButton?: boolean;
  showBackButton?: boolean;
  hasActiveCommunity: boolean;
  activeCommunityName: string | null;
  activeCommunityAvatarUrl: string | null;
  activeCommunityAvatarFocusX?: number | null;
  activeCommunityAvatarFocusY?: number | null;
  activeCommunityAvatarZoom?: number | null;
  activeCommunityInitials: string;
  activeCommunityAttentionCount: number;
  onOpenDrawer: () => void;
  onBack?: (() => void) | null;
  onStartNewThread?: (() => void) | null;
  onSelectMode: (mode: "agent" | "discover" | "community") => void;
  onOpenCommunitySelector: () => void;
};

export function WebMobileTopBar({
  mode,
  secondaryMode,
  showDrawerButton = true,
  showBackButton = false,
  hasActiveCommunity,
  activeCommunityName,
  activeCommunityAvatarUrl,
  activeCommunityAvatarFocusX,
  activeCommunityAvatarFocusY,
  activeCommunityAvatarZoom,
  activeCommunityInitials,
  activeCommunityAttentionCount,
  onOpenDrawer,
  onBack = null,
  onStartNewThread = null,
  onSelectMode,
  onOpenCommunitySelector,
}: WebMobileTopBarProps) {
  const communityLabel = (activeCommunityName ?? "").trim() || "Community";
  const rightModeLabel = secondaryMode === "discover" ? "Discover" : "Community";
  const isRightModeActive = mode === "discover" || mode === "community";

  return (
    <header className="mobile-topbar">
      <div className="mobile-topbar-left">
        {showBackButton && onBack ? (
          <button
            type="button"
            className="mobile-topbar-icon mobile-topbar-back"
            aria-label="Back to workspace"
            title="Back to workspace"
            onClick={onBack}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 18 9 12l6-6" />
            </svg>
          </button>
        ) : showDrawerButton ? (
          <button
            type="button"
            className="mobile-topbar-icon"
            aria-label={mode === "community" ? "Open community panel" : "Open threads panel"}
            title={mode === "community" ? "Open community panel" : "Open threads panel"}
            onClick={onOpenDrawer}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        ) : null}
        {mode === "agent" && onStartNewThread ? (
          <button
            type="button"
            className="new-session-header-btn mobile-topbar-new-thread"
            aria-label="New thread"
            title="New thread"
            onClick={onStartNewThread}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="mobile-topbar-center" role="tablist" aria-label="View mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "agent"}
          className={`mobile-topbar-mode${mode === "agent" ? " active" : ""}`}
          onClick={() => onSelectMode("agent")}
        >
          Agent
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isRightModeActive}
          className={`mobile-topbar-mode${isRightModeActive ? " active" : ""}`}
          onClick={() => onSelectMode(secondaryMode)}
        >
          {rightModeLabel}
        </button>
      </div>

      <div className="mobile-topbar-right">
        <button
          type="button"
          className={`mobile-community-trigger${hasActiveCommunity ? "" : " is-empty"}`}
          aria-label={hasActiveCommunity ? "Switch community" : "Discover or create community"}
          title={hasActiveCommunity ? "Switch community" : "Discover or create community"}
          onClick={onOpenCommunitySelector}
        >
          {hasActiveCommunity ? (
            <>
              <StableAvatar
                className="mobile-community-trigger-avatar"
                imageUrl={activeCommunityAvatarUrl}
                imageStyle={getCommunityAvatarImageStyle({
                  focusX: activeCommunityAvatarFocusX,
                  focusY: activeCommunityAvatarFocusY,
                  zoom: activeCommunityAvatarZoom,
                })}
                alt={communityLabel}
                fallback={activeCommunityInitials}
                fallbackClassName="mobile-community-trigger-initials"
              />
              <svg className="mobile-community-trigger-chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
              {activeCommunityAttentionCount > 0 ? (
                <span className="unread-badge">{activeCommunityAttentionCount}</span>
              ) : null}
            </>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
