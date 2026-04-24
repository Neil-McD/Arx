import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type { WebCommunityShellProps } from "./webShellChromeShared";

type WebDesktopCommunityRailProps = {
  communityShell: WebCommunityShellProps;
};

export function WebDesktopCommunityRail(props: WebDesktopCommunityRailProps) {
  const { communityShell } = props;

  if (!communityShell.showDesktopCommunityRail) return null;

  return (
    <aside className="rail community-rail" aria-label="Communities">
      <div className="rail-main">
        <button
          type="button"
          className={`community-rail-button${
            communityShell.activePage === "discover" ? " active" : ""
          }`}
          onClick={communityShell.onOpenDiscover}
          title="Discover communities"
          aria-label="Discover communities"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="community-rail-icon">
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
          ref={communityShell.setCommunityRailListElement}
        >
          {communityShell.railCommunities.map((community) => {
            const bindings = communityShell.getCommunityRailItemBindings(
              community.id,
            );
            return (
              <button
                key={community.id}
                type="button"
                ref={bindings.ref}
                className={`community-rail-button community-rail-community${
                  String(community.slug ?? "").trim() ===
                  communityShell.selectedActiveCommunitySlug
                    ? " active"
                    : ""
                }${
                  community.id === communityShell.draggingCommunityId
                    ? " is-dragging"
                    : ""
                }${communityShell.canReorderCommunities ? " reorder-enabled" : ""}`}
                onClick={() => {
                  const changed =
                    communityShell.onSelectActiveCommunity(community);
                  if (!changed) return;
                  if (communityShell.activePage === "discover") {
                    const nextCommunitySlug = String(
                      community.slug ?? "",
                    ).trim();
                    if (nextCommunitySlug) {
                      communityShell.onOpenCommunityChat(nextCommunitySlug);
                    }
                  }
                }}
                onClickCapture={bindings.onClickCapture}
                onPointerDown={bindings.onPointerDown}
                style={bindings.style}
                title={community.name}
              >
                <CommunityAvatar
                  className="community-rail-avatar"
                  imageUrl={community.avatar_url}
                  focusX={community.avatar_focus_x}
                  focusY={community.avatar_focus_y}
                  zoom={community.avatar_zoom}
                  name={community.name}
                  fallback={communityShell.communityInitials(community.name)}
                  fallbackClassName="community-rail-initials"
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
          onClick={communityShell.onOpenBuilderUpgrade}
          title={communityShell.builderRailCtaTitle}
          aria-label={communityShell.builderRailCtaTitle}
        >
          {communityShell.builderRailCtaLabel}
        </button>
      </div>
      <div className="rail-footer">
        <button
          type="button"
          className={`community-rail-button${
            communityShell.activeView === "settings" ? " active" : ""
          }`}
          onClick={communityShell.onToggleWorkspaceSettings}
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
