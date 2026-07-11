import type { WebDesktopShellHeaderProps } from "./webShellChromeShared";

export function WebDesktopShellHeader(props: WebDesktopShellHeaderProps) {
  if (props.activePage === "landing" || props.activePage === "onboarding") return null;

  const hasTopbarRightActions =
    !props.isPublicCommunityFunnel &&
    Boolean(
      props.workspaceRightPanelToggle ||
        props.directMessagesButton,
    );
  const topbarRightClassName = [
    "topbar-right",
    props.hasWorkspaceRightPanelControl ? "has-workspace-right-panel-control" : "",
    hasTopbarRightActions ? "topbar-right-island" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className="app-topbar">
      <div className="topbar-left">
        {props.isPublicCommunityFunnel ? (
          props.isPublicFunnelPreviewRoute ? (
            <button
              className="back-to-workspace"
              onClick={props.onExitPublicFunnelPreview}
              title="Exit preview"
              type="button"
            >
              <svg viewBox="0 0 24 24" className="back-icon">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="back-path">exit preview</span>
            </button>
          ) : props.hasBackTargetSnapshot ? (
            <button
              className="back-to-workspace"
              onClick={props.onBackFromPublicFunnel}
              title="Back"
              type="button"
            >
              <svg viewBox="0 0 24 24" className="back-icon">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="back-path">{props.backTargetLabel ?? "back"}</span>
            </button>
          ) : null
        ) : props.activePage === "workspace" ? (
          props.activeView === "settings" ? (
            <button
              className="back-to-workspace"
              onClick={props.onBackFromWorkspaceSettings}
              title="Back"
              type="button"
            >
              <svg viewBox="0 0 24 24" className="back-icon">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="back-path">{props.backTargetLabel ?? "community"}</span>
            </button>
          ) : (
            <>
              <button
                className={`icon-button${props.userWantsSessions ? " active" : ""}`}
                onClick={props.onToggleSessions}
                aria-label="Toggle threads panel"
                title="Toggle threads panel"
                type="button"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M9 4v16" />
                </svg>
              </button>
              <button
                className="new-session-header-btn"
                onClick={props.onStartNewThread}
                title="New thread"
                aria-label="New thread"
                type="button"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </>
          )
        ) : (
          <button
            className="back-to-workspace"
            onClick={props.onBackToCommunity}
            title="Back"
            type="button"
          >
            <svg viewBox="0 0 24 24" className="back-icon">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="back-path">{props.backTargetLabel ?? "community"}</span>
          </button>
        )}
      </div>

      <div className={topbarRightClassName}>
        {props.isPublicCommunityFunnel ? null : (
          <>
            {props.workspaceRightPanelToggle}
            {props.directMessagesButton}
          </>
        )}
      </div>
    </header>
  );
}
