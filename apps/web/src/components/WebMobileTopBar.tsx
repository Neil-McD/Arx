import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type { MobileRootPage } from "./webShellChromeShared";

type WebMobileTopBarProps = {
  mode: "agent" | "discover" | "community";
  rootPage: MobileRootPage;
  secondaryMode: "discover" | "community";
  showDrawerButton?: boolean;
  showBackButton?: boolean;
  hasActiveCommunity: boolean;
  showMembersRoot: boolean;
  forceCommunityRoot?: boolean;
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
  onSelectRootPage: (page: MobileRootPage) => void;
  onOpenCommunitySelector: () => void;
};

export function WebMobileTopBar({
  rootPage,
  secondaryMode,
  showDrawerButton = true,
  showBackButton = false,
  hasActiveCommunity,
  showMembersRoot,
  forceCommunityRoot = false,
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
  onSelectRootPage,
  onOpenCommunitySelector,
}: WebMobileTopBarProps) {
  const communityLabel = (activeCommunityName ?? "").trim() || "Community";
  const rightModeLabel = secondaryMode === "discover" ? "Discover" : "Community";
  const rootPageLabel =
    rootPage === "threads"
      ? "Threads"
      : rootPage === "agent"
        ? "Agent"
        : rootPage === "members"
          ? "Members"
          : rightModeLabel;
  const getRootPagerLabel = (page: MobileRootPage) => {
    if (page === "threads") return "Threads";
    if (page === "agent") return "Agent";
    if (page === "members") return "Members";
    return rightModeLabel;
  };
  const rootPages: MobileRootPage[] = forceCommunityRoot
    ? ["community"]
    : showMembersRoot
      ? ["threads", "agent", "community", "members"]
      : ["threads", "agent", "community"];
  const drawerLabel =
    rootPage === "threads"
      ? "Back to agent"
      : rootPage === "community" || rootPage === "members"
        ? "Open community panel"
        : "Open threads";

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
            aria-label={drawerLabel}
            title={drawerLabel}
            onClick={onOpenDrawer}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        ) : null}
        {rootPage === "agent" && onStartNewThread ? (
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

      <div className="mobile-topbar-center mobile-topbar-root" aria-label="Mobile pages">
        <div className="mobile-topbar-root-title">{rootPageLabel}</div>
        <div className="mobile-root-pager" role="tablist" aria-label="Mobile page">
          {rootPages.map((page) => {
            const label = getRootPagerLabel(page);
            return (
              <button
                key={page}
                type="button"
                role="tab"
                aria-label={label}
                aria-selected={rootPage === page}
                className={`mobile-root-pager-dot${rootPage === page ? " active" : ""}`}
                onClick={() => onSelectRootPage(page)}
              />
            );
          })}
        </div>
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
              <CommunityAvatar
                className="mobile-community-trigger-avatar"
                imageUrl={activeCommunityAvatarUrl}
                focusX={activeCommunityAvatarFocusX}
                focusY={activeCommunityAvatarFocusY}
                zoom={activeCommunityAvatarZoom}
                name={communityLabel}
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
