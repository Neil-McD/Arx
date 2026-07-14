import { ArrowLeft } from "lucide-react";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { CommunityPresenceFacepile } from "./CommunityPresenceFacepile";
import type { MobileMemberFace, MobileRootPage } from "./webShellChromeShared";

type WebMobileTopBarProps = {
  mode: "agent" | "discover" | "community";
  rootPage: MobileRootPage;
  isThreadPage?: boolean;
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
  canViewMembers: boolean;
  memberFaces: MobileMemberFace[];
  memberCount: number | null;
  onOpenDrawer: () => void;
  onBack?: (() => void) | null;
  onOpenCommunitySelector: () => void;
  onOpenMembers: () => void;
};

function formatMemberCount(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const count = Math.max(0, Math.floor(value));
  return count.toLocaleString();
}

export function WebMobileTopBar({
  mode,
  rootPage,
  isThreadPage = false,
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
  canViewMembers,
  memberFaces,
  memberCount,
  onOpenDrawer,
  onBack = null,
  onOpenCommunitySelector,
  onOpenMembers,
}: WebMobileTopBarProps) {
  const communityLabel = (activeCommunityName ?? "").trim() || "Community";
  const isAgent = mode === "agent";
  const isDiscover = mode === "discover";
  const selectorLabel = isDiscover ? "Discover" : communityLabel;
  const memberCountLabel = formatMemberCount(memberCount);
  const showMembers =
    !isThreadPage &&
    rootPage === "community" && mode === "community" && hasActiveCommunity && canViewMembers;
  const drawerLabel = isAgent ? "Open threads" : "Open community navigation";

  return (
    <header className={`mobile-topbar${showMembers ? " has-members" : ""}${isThreadPage ? " is-thread-page" : ""}`}>
      <div className="mobile-topbar-left">
        {showBackButton && onBack ? (
          <button
            type="button"
            className="mobile-topbar-icon mobile-topbar-back"
            aria-label="Back to community"
            title="Back to community"
            onClick={onBack}
          >
            <ArrowLeft aria-hidden="true" />
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
      </div>

      <div className="mobile-topbar-center">
        {isThreadPage ? (
          <span className="mobile-topbar-context-label">Thread</span>
        ) : isAgent ? (
          <span className="mobile-topbar-context-label">Polynet AI</span>
        ) : (
          <button
            type="button"
            className="mobile-topbar-community-selector"
            aria-label={hasActiveCommunity ? "Switch community" : "Discover or create community"}
            title={hasActiveCommunity ? "Switch community" : "Discover or create community"}
            onClick={onOpenCommunitySelector}
          >
            {hasActiveCommunity && !isDiscover ? (
              <CommunityAvatar
                className="mobile-topbar-community-avatar"
                imageUrl={activeCommunityAvatarUrl}
                focusX={activeCommunityAvatarFocusX}
                focusY={activeCommunityAvatarFocusY}
                zoom={activeCommunityAvatarZoom}
                name={communityLabel}
                fallback={activeCommunityInitials}
                fallbackClassName="mobile-topbar-community-initials"
              />
            ) : (
              <svg className="mobile-topbar-discover-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="m15.8 8.2-2.5 5.1-5.1 2.5 2.5-5.1 5.1-2.5z" />
              </svg>
            )}
            <span className="mobile-topbar-community-name">{selectorLabel}</span>
            <svg className="mobile-topbar-community-chevron" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m7 9.5 5 5 5-5" />
            </svg>
            {activeCommunityAttentionCount > 0 && !isDiscover ? (
              <span className="mobile-topbar-attention" aria-label={`${activeCommunityAttentionCount} updates`}>
                {activeCommunityAttentionCount > 99 ? "99+" : activeCommunityAttentionCount}
              </span>
            ) : null}
          </button>
        )}
      </div>

      <div className="mobile-topbar-right">
        {showMembers ? (
          <button
            type="button"
            className="mobile-topbar-members"
            aria-label={memberCountLabel === null
              ? "View community members"
              : `View ${memberCountLabel} community ${memberCount === 1 ? "member" : "members"}`}
            title="Community members"
            onClick={onOpenMembers}
          >
            {memberFaces.length > 0 ? (
              <CommunityPresenceFacepile
                faces={memberFaces}
                limit={2}
                compact
                decorative
              />
            ) : (
              <svg className="mobile-topbar-members-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
              </svg>
            )}
            {memberCountLabel !== null ? (
              <span className="mobile-topbar-member-count">{memberCountLabel}</span>
            ) : null}
          </button>
        ) : null}
      </div>
    </header>
  );
}
