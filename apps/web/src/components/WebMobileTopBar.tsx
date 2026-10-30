import type { ReactNode } from "react";
import { ArrowLeft, Hash, Settings } from "lucide-react";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { CommunityPresenceFacepile } from "./CommunityPresenceFacepile";
import type { MobileMemberFace, MobileRootPage } from "./webShellChromeShared";
import type { CommunityVisualIdentity } from "../../../../shared/communityVisualIdentity";

type WebMobileTopBarProps = {
  mode: "agent" | "discover" | "community" | "settings";
  rootPage: MobileRootPage;
  isThreadPage?: boolean;
  isCommunityHome?: boolean;
  hasCommunityRail?: boolean;
  communityDetailLabel?: string | null;
  showDrawerButton?: boolean;
  showBackButton?: boolean;
  hasActiveCommunity: boolean;
  activeCommunityId?: string | null;
  activeCommunityVisualIdentity?: CommunityVisualIdentity | null;
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
  canOpenCommunitySelector: boolean;
  onOpenCommunitySelector: () => void;
  onOpenMembers: () => void;
  canOpenCommunitySettings?: boolean;
  onOpenCommunitySettings?: (() => void) | null;
  /** The member's Display menu (light/dark, Classroom/Channels); shown on the community home. */
  displayMenu?: ReactNode;
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
  isCommunityHome = false,
  hasCommunityRail = false,
  communityDetailLabel = null,
  showDrawerButton = true,
  showBackButton = false,
  hasActiveCommunity,
  activeCommunityId,
  activeCommunityVisualIdentity,
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
  canOpenCommunitySelector,
  onOpenCommunitySelector,
  onOpenMembers,
  canOpenCommunitySettings = false,
  onOpenCommunitySettings = null,
  displayMenu = null,
}: WebMobileTopBarProps) {
  const communityLabel = (activeCommunityName ?? "").trim() || "Community";
  const isAgent = mode === "agent";
  const isSettings = mode === "settings";
  const memberCountLabel = formatMemberCount(memberCount);
  const showMembers =
    isCommunityHome &&
    !hasCommunityRail &&
    !isThreadPage &&
    rootPage === "community" && mode === "community" && hasActiveCommunity && canViewMembers;
  const drawerLabel = isAgent ? "Open threads" : "Open community navigation";

  const communitySelectorContent = (
    <>
      {hasActiveCommunity ? (
        <CommunityAvatar
          communityId={activeCommunityId}
          visualIdentity={activeCommunityVisualIdentity}
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
      <span className="mobile-topbar-community-name">{communityLabel}</span>
      {canOpenCommunitySelector ? (
        <svg className="mobile-topbar-community-chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m7 9.5 5 5 5-5" />
        </svg>
      ) : null}
      {activeCommunityAttentionCount > 0 ? (
        <span className="mobile-topbar-attention" aria-label={`${activeCommunityAttentionCount} updates`}>
          {activeCommunityAttentionCount > 99 ? "99+" : activeCommunityAttentionCount}
        </span>
      ) : null}
    </>
  );

  return (
    <header className={`mobile-topbar${showMembers ? " has-members" : ""}${isThreadPage ? " is-thread-page" : ""}${isCommunityHome ? " is-community-home" : ""}${hasCommunityRail ? " has-community-rail" : ""}`}>
      <div className="mobile-topbar-left">
        {isCommunityHome && !hasCommunityRail ? (
          <button
            type="button"
            className="mobile-topbar-community-selector mobile-topbar-community-home-selector"
            aria-label="Switch community"
            title="Switch community"
            onClick={onOpenCommunitySelector}
          >
            {communitySelectorContent}
          </button>
        ) : showBackButton && onBack ? (
          <button
            type="button"
            className="mobile-topbar-icon mobile-topbar-back"
            aria-label="Back to community"
            title="Back to community"
            onClick={onBack}
          >
            <ArrowLeft aria-hidden="true" />
          </button>
        ) : showDrawerButton && !hasCommunityRail ? (
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
        {isCommunityHome ? null : isThreadPage ? (
          <span className="mobile-topbar-context-label">Thread</span>
        ) : isAgent ? (
          <span className="mobile-topbar-context-label">Polynet AI</span>
        ) : isSettings ? (
          <span className="mobile-topbar-context-label">Settings</span>
        ) : communityDetailLabel ? (
          <span className="mobile-topbar-context-label mobile-topbar-channel-label">
            <Hash aria-hidden="true" />
            <span>{communityDetailLabel}</span>
          </span>
        ) : (
          canOpenCommunitySelector ? (
            <button
              type="button"
              className="mobile-topbar-community-selector"
              aria-label={hasActiveCommunity ? "Switch community" : "Discover or create community"}
              title={hasActiveCommunity ? "Switch community" : "Discover or create community"}
              onClick={onOpenCommunitySelector}
            >
              {communitySelectorContent}
            </button>
          ) : (
            <div
              className="mobile-topbar-community-selector"
              aria-label={`${communityLabel} community`}
            >
              {communitySelectorContent}
            </div>
          )
        )}
      </div>

      <div className="mobile-topbar-right">
        {isCommunityHome ? displayMenu : null}
        {isCommunityHome && canOpenCommunitySettings && onOpenCommunitySettings ? (
          <button
            type="button"
            className="mobile-topbar-icon mobile-topbar-settings"
            aria-label={`Open ${communityLabel} settings`}
            title="Community settings"
            onClick={onOpenCommunitySettings}
          >
            <Settings aria-hidden="true" />
          </button>
        ) : null}
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
