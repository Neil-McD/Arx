import { useMemo } from "react";
import { useRailPointerReorder } from "../../shared/useRailPointerReorder";
import type { DesktopCommunityRailActions, DesktopCommunityRailState } from "./desktopCommunityRailContracts";

type DesktopCommunityRailProps = {
  state: DesktopCommunityRailState;
  actions: DesktopCommunityRailActions;
};

export function DesktopCommunityRail(props: DesktopCommunityRailProps) {
  const { state, actions } = props;
  const {
    activePage,
    activeView,
    communities,
    activeCommunityId,
    emptyMessage,
  } = state;
  const communityIds = useMemo(() => communities.map((community) => community.id), [communities]);
  const canReorderCommunities = Boolean(actions.onMoveCommunityToIndex && communities.length > 1);
  const { setContainerElement, getItemBindings, draggingId } = useRailPointerReorder({
    itemIds: communityIds,
    enabled: canReorderCommunities,
    onMoveToIndex: (draggedId, targetIndex) => {
      actions.onMoveCommunityToIndex?.(draggedId, targetIndex);
    },
  });

  return (
    <aside className="rail community-rail" aria-label="Communities">
      <div className="rail-main">
        <button
          type="button"
          className={`community-rail-button${activePage === "discover" ? " active" : ""}`}
          onClick={actions.onOpenDiscover}
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
        <div className="community-rail-list" ref={setContainerElement}>
          {communities.map((community) => {
            const bindings = getItemBindings(community.id);
            return (
              <button
                key={community.id}
                type="button"
                ref={bindings.ref}
                className={`community-rail-button community-rail-community${community.id === activeCommunityId ? " active" : ""}${draggingId === community.id ? " is-dragging" : ""}${canReorderCommunities ? " reorder-enabled" : ""}`}
                onClick={() => actions.onSelectCommunity(community.id)}
                onClickCapture={bindings.onClickCapture}
                onPointerDown={bindings.onPointerDown}
                style={bindings.style}
                title={community.name}
              >
                {community.avatar_url ? (
                  <img
                    className="community-rail-avatar"
                    src={community.avatar_url}
                    alt={community.name}
                    loading="lazy"
                    draggable={false}
                  />
                ) : (
                  <span className="community-rail-initials">{actions.getCommunityInitials(community.name)}</span>
                )}
              </button>
            );
          })}
        </div>
        {emptyMessage && <div className="community-rail-empty">{emptyMessage}</div>}
        <div className="community-rail-divider" />
        <button
          type="button"
          className="community-rail-button community-rail-add"
          onClick={actions.onOpenCreateCommunity}
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
          onClick={actions.onToggleSettings}
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
