import { Eye, EyeOff, Settings, UserRound } from "lucide-react";
import type { WebCommunityShellProps } from "./webShellChromeShared";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { setMemberViewOn, useMemberView, useMemberViewInTopBar } from "./memberViewStore";

// The top right holds two buttons, like Substack: inside
// a community the gear opens that community's settings (Your membership for
// members), and your own picture opens your settings, starting on your
// profile. Styled like the Display trigger next to them.

export function WebAccountSettingsButton(props: { communityShell: WebCommunityShellProps; placement: "top" | "bar" }) {
  const shell = props.communityShell;
  const memberView = useMemberView();
  const showMemberView = shell.showDesktopCommunityRail && memberView.offered;
  useMemberViewInTopBar(showMemberView);
  if (!shell.showDesktopCommunityRail) return null;

  const community = shell.activeCommunity;
  const inCommunity = Boolean(community) && shell.destination.kind.startsWith("community_");
  const accountActive = shell.destination.kind === "global_settings";
  const communityActive = inCommunity && shell.communityTab === "settings";
  const showGear = Boolean(inCommunity && community && shell.canViewActiveCommunitySettings);
  const gearLabel = shell.canManageMembersActiveCommunity ? "Community settings" : "Your membership";
  const face = shell.viewerFace ?? null;
  const buttonClass = (active: boolean, extra = "") => (props.placement === "top"
    ? `community-top-nav-icon${extra}${active ? " is-open" : ""}`
    : `icon-button account-settings-bar-button${extra}${active ? " active" : ""}`);

  return (
    <>
      {/* Owners see the page as members do. On, it stays an icon so the bar
          doesn't shift; the page itself says "Member view". */}
      {showMemberView ? (
        <button
          type="button"
          className={buttonClass(memberView.on, ` community-member-view-button${memberView.on ? " is-on" : ""}`)}
          aria-pressed={memberView.on}
          aria-label={memberView.on ? "Exit member view" : "View as member"}
          title={memberView.on ? "Exit member view" : "See this page as members see it"}
          onClick={() => setMemberViewOn(!memberView.on)}
        >
          {memberView.on ? <EyeOff size={20} strokeWidth={2} aria-hidden="true" /> : <Eye size={20} strokeWidth={2} aria-hidden="true" />}
        </button>
      ) : null}
      {showGear ? (
        <button
          type="button"
          className={buttonClass(communityActive)}
          aria-label={gearLabel}
          title={gearLabel}
          aria-current={communityActive ? "page" : undefined}
          onClick={() => shell.onSelectCommunityTab("settings")}
        >
          <Settings size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        className={buttonClass(accountActive, " community-profile-button")}
        aria-label={face?.name ? `Your profile and settings (${face.name})` : "Your profile and settings"}
        title="Your profile and settings"
        aria-current={accountActive ? "page" : undefined}
        onClick={shell.onOpenGlobalSettings}
      >
        <UserAvatar
          className="community-profile-avatar"
          readyClassName="has-image"
          imageClassName="community-profile-avatar-image"
          fallbackClassName="community-profile-avatar-fallback"
          name={face?.name || "You"}
          imageUrl={face?.avatarUrl ?? null}
          focusX={face?.focusX ?? 0.5}
          focusY={face?.focusY ?? 0.5}
          zoom={face?.zoom ?? 1}
          fallback={face?.name ? <span>{shell.communityInitials(face.name)}</span> : <UserRound size={16} strokeWidth={2} />}
          alt=""
          aria-hidden={true}
        />
      </button>
    </>
  );
}
