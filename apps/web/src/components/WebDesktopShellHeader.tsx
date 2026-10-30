import type { ReactNode } from "react";
import type { WebDesktopShellHeaderProps } from "./webShellChromeShared";
import { isDesktopShellContextualBackPage } from "../../../../shared/appShellNavigation";

// Inside a community (Channels layout) the bar's buttons float over the
// community's page, so they take its theme; trailing is its Display menu, at
// the far right after Messages.
export function WebDesktopShellHeader(
  props: WebDesktopShellHeaderProps & { trailing?: ReactNode; communityTheme?: string | null },
) {
  const hasPublicFunnelBack =
    props.isPublicCommunityFunnel && props.hasBackTargetSnapshot;
  const hasTopbarRightActions =
    !props.isPublicCommunityFunnel &&
    Boolean(props.directMessagesButton || props.trailing);
  const hasContextualAppBack =
    !props.isPublicCommunityFunnel &&
    (isDesktopShellContextualBackPage(props.activePage) ||
      (props.activePage === "discover" && props.hasBackTargetSnapshot));
  if (!hasPublicFunnelBack && !hasContextualAppBack && !hasTopbarRightActions) {
    return null;
  }

  const topbarRightClassName = [
    "topbar-right",
    hasTopbarRightActions ? "topbar-right-island" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className="app-topbar">
      <div className="topbar-left">
        {props.isPublicCommunityFunnel ? (
          props.hasBackTargetSnapshot ? (
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
        ) : hasContextualAppBack ? (
          <button
            className="back-to-workspace"
            onClick={
              props.activePage === "settings"
                ? props.onBackFromSettings
                : props.onBackToCommunity
            }
            title="Back"
            type="button"
          >
            <svg viewBox="0 0 24 24" className="back-icon">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="back-path">{props.backTargetLabel ?? "community"}</span>
          </button>
        ) : null}
      </div>

      <div className={topbarRightClassName}>
        {props.communityTheme && !props.isPublicCommunityFunnel ? (
          <div className="community-theme-scope" data-community-theme={props.communityTheme}>
            {props.directMessagesButton}
            {props.trailing}
          </div>
        ) : (
          <>
            {props.isPublicCommunityFunnel ? null : props.directMessagesButton}
            {props.isPublicCommunityFunnel ? null : props.trailing}
          </>
        )}
      </div>
    </header>
  );
}
