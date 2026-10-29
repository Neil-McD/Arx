import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type { WebCommunityShellProps } from "./webShellChromeShared";

type WebCommunityRailProps = {
  communityShell: WebCommunityShellProps;
  presentation: "desktop" | "mobile-shell";
};

export function WebCommunityRail({
  communityShell,
  presentation,
}: WebCommunityRailProps) {
  const isMobileShell = presentation === "mobile-shell";

  if (
    isMobileShell
      ? !communityShell.showMobileShell
      : !communityShell.showDesktopCommunityRail
  )
    return null;

  return (
    <aside
      className={`rail community-rail${isMobileShell ? " mobile-community-rail" : ""}`}
      aria-label="Communities"
    >
      <div className="rail-main">
        <button
          type="button"
          className={`community-rail-button${
            communityShell.destination.kind === "discover" ? " active" : ""
          }`}
          onClick={communityShell.onOpenDiscover}
          title="Discover communities"
          aria-label="Discover communities"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="community-rail-icon"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M16.5 7.5l-3.2 8.1-8.1 3.2 3.2-8.1 8.1-3.2z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
          </svg>
        </button>
        {communityShell.hasCommunityRailMiddleContent ? (
          <div className="community-rail-divider" />
        ) : null}
        <div
          className="community-rail-list"
          ref={
            isMobileShell
              ? undefined
              : communityShell.setCommunityRailListElement
          }
        >
          {communityShell.railCommunities.map((community) => {
            const bindings = isMobileShell
              ? null
              : communityShell.getCommunityRailItemBindings(community.id);
            const communitySlug = String(community.slug ?? "").trim();
            return (
              <button
                key={community.id}
                type="button"
                ref={bindings?.ref}
                className={`community-rail-button community-rail-community${
                  communitySlug === communityShell.selectedActiveCommunitySlug
                    ? " active"
                    : ""
                }${
                  !isMobileShell &&
                  community.id === communityShell.draggingCommunityId
                    ? " is-dragging"
                    : ""
                }${!isMobileShell && communityShell.canReorderCommunities ? " reorder-enabled" : ""}`}
                onClick={() => {
                  const changed =
                    communityShell.onSelectActiveCommunity(community);
                  if (isMobileShell) {
                    if (communitySlug) {
                      communityShell.onOpenCommunityHome(communitySlug);
                    }
                    return;
                  }
                  if (!changed) return;
                  if (
                    communityShell.destination.kind === "discover" ||
                    communityShell.destination.kind === "global_settings"
                  ) {
                    if (communitySlug) {
                      communityShell.onOpenCommunityChat(communitySlug);
                    }
                  }
                }}
                onClickCapture={bindings?.onClickCapture}
                onPointerDown={bindings?.onPointerDown}
                style={bindings?.style}
                title={community.name}
                aria-current={
                  communitySlug === communityShell.selectedActiveCommunitySlug
                    ? "page"
                    : undefined
                }
              >
                <CommunityAvatar
                  communityId={community.id}
                  visualIdentity={community.visual_identity}
                  className="community-rail-avatar"
                  imageUrl={community.avatar_url}
                  focusX={community.avatar_focus_x}
                  focusY={community.avatar_focus_y}
                  zoom={community.avatar_zoom}
                  name={community.name}
                />
                {communityShell.communityRailAttentionById[community.id] ? (
                  <span className="community-rail-dot" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="community-rail-divider" />
        <button
          type="button"
          className="community-rail-button community-rail-add"
          onClick={communityShell.onOpenCommunityCreateCta}
          title={communityShell.communityCreateCtaTitle}
          aria-label={communityShell.communityCreateCtaTitle}
        >
          {communityShell.communityCreateCtaLabel}
        </button>
      </div>
      {/* Desktop has Settings at the top right now (WebAccountSettingsButton). */}
      {isMobileShell ? <div className="rail-footer">
        <button
          type="button"
          className={`community-rail-button${
            communityShell.destination.kind === "global_settings" ? " active" : ""
          }`}
          onClick={communityShell.onOpenGlobalSettings}
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
      </div> : null}
    </aside>
  );
}
