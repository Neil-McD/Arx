import type { WebDesktopShellHeaderProps } from "./webShellChromeShared";
import { isDesktopShellContextualBackPage } from "../../../../shared/appShellNavigation";

export function WebDesktopShellHeader(props: WebDesktopShellHeaderProps) {
  const hasPublicFunnelBack =
    props.isPublicCommunityFunnel &&
    (props.isPublicFunnelPreviewRoute || props.hasBackTargetSnapshot);
  const hasTopbarRightActions =
    !props.isPublicCommunityFunnel &&
    Boolean(props.directMessagesButton);
  const hasContextualAppBack =
    !props.isPublicCommunityFunnel &&
    isDesktopShellContextualBackPage(props.activePage);
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
          props.isPublicFunnelPreviewRoute ? (
            <a
              className="back-to-workspace"
              href={props.publicFunnelPreviewExitPath ?? "/"}
              title="Exit preview"
            >
              <svg viewBox="0 0 24 24" className="back-icon">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="back-path">exit preview</span>
            </a>
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
        {props.isPublicCommunityFunnel ? null : props.directMessagesButton}
      </div>
    </header>
  );
}
