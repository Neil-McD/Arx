import type { ReactNode } from "react";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type { AccountSetupStatus } from "../../../../shared/accountSetup";
import type { CommunityLaunchSetupStatus } from "../../../../shared/communityLaunchSetup";
import { WebAccountSetupCard } from "../components/WebAccountSetupCard";
import { WebCommunityLaunchSetupCard } from "../components/WebCommunityLaunchSetupCard";
import { WebGuestSignupRail } from "../components/WebGuestSignupRail";

type WorkspaceLandingCommunity = {
  name: string;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

type BuildWebWorkspaceLandingProjectionParams = {
  showGuestSignupRail: boolean;
  activeCommunity: WorkspaceLandingCommunity | null;
  resolvedActiveProjectName: string | null;
  emptyThreadLandingTitle: ReactNode;
  onRequireSignIn: () => void;
  onOpenLandingCommunity: () => void;
  onOpenLandingProject: () => void;
  shouldShowAccountSetupCard: boolean;
  accountSetupStatus: AccountSetupStatus | null;
  onContinueAccountSetup: () => void;
  shouldShowCommunityLaunchSetupCard: boolean;
  communityLaunchSetupStatus: CommunityLaunchSetupStatus | null;
  onContinueCommunityLaunchSetup: () => void;
};

export function buildWebWorkspaceLandingProjection(
  params: BuildWebWorkspaceLandingProjectionParams,
) {
  const guestSignupRail = params.showGuestSignupRail ? (
    <WebGuestSignupRail onSignIn={params.onRequireSignIn} />
  ) : null;

  const emptyThreadAvatar = params.activeCommunity ? (
    <CommunityAvatar
      className="web-empty-thread-avatar"
      imageUrl={params.activeCommunity.avatar_url}
      focusX={params.activeCommunity.avatar_focus_x}
      focusY={params.activeCommunity.avatar_focus_y}
      zoom={params.activeCommunity.avatar_zoom}
      name={params.activeCommunity.name}
      fallbackClassName="web-empty-thread-avatar-fallback"
      imageClassName="web-empty-thread-avatar-image"
      aria-hidden
    />
  ) : null;

  const emptyThreadTitle = params.activeCommunity ? (
    <>
      Welcome to{" "}
      <button
        type="button"
        className="web-empty-thread-link web-empty-thread-title-accent"
        onClick={params.onOpenLandingCommunity}
      >
        {params.activeCommunity.name}
      </button>
    </>
  ) : (
    params.emptyThreadLandingTitle
  );

  const activeProjectName = String(params.resolvedActiveProjectName ?? "").trim();
  const emptyThreadSubtitle = activeProjectName ? (
    <div className="web-empty-thread-subtitle">
      You are in{" "}
      <button
        type="button"
        className="web-empty-thread-link web-empty-thread-subtitle-accent"
        onClick={params.onOpenLandingProject}
      >
        {activeProjectName}
      </button>{" "}
      workspace
    </div>
  ) : null;

  const emptyThreadSetupCard =
    params.shouldShowAccountSetupCard && params.accountSetupStatus ? (
      <WebAccountSetupCard
        status={params.accountSetupStatus}
        onContinueSetup={params.onContinueAccountSetup}
      />
    ) : params.shouldShowCommunityLaunchSetupCard &&
      params.activeCommunity &&
      params.communityLaunchSetupStatus ? (
      <WebCommunityLaunchSetupCard
        status={params.communityLaunchSetupStatus}
        communityName={params.activeCommunity.name}
        onContinueSetup={params.onContinueCommunityLaunchSetup}
      />
    ) : null;

  return {
    emptyThreadClassName: `web-empty-thread${params.activeCommunity ? "" : " web-empty-thread-no-community"}`,
    guestSignupRail,
    emptyThreadAvatar,
    emptyThreadTitle,
    emptyThreadSubtitle,
    emptyThreadSetupCard,
  };
}
