import type { ReactNode } from "react";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { WebChatgptEmptyStateCard } from "../components/WebChatgptEmptyStateCard";
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
  shouldShowEmptyThreadChatgptCard: boolean;
  isConnectingChatgpt: boolean;
  hasPendingChatgptAuth: boolean;
  isPollingChatgptConnection: boolean;
  onConnectChatgpt: () => void;
  onAddOpenAiKey: () => void;
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

  const emptyThreadSubtitle =
    params.activeCommunity && params.resolvedActiveProjectName ? (
      <div className="web-empty-thread-subtitle">
        You are in{" "}
        <button
          type="button"
          className="web-empty-thread-link web-empty-thread-subtitle-accent"
          onClick={params.onOpenLandingProject}
        >
          {params.resolvedActiveProjectName}
        </button>{" "}
        workspace
      </div>
    ) : null;

  const emptyThreadChatgptCard = params.shouldShowEmptyThreadChatgptCard ? (
    <WebChatgptEmptyStateCard
      chatgptButtonLabel={
        params.isConnectingChatgpt
          ? "Starting..."
          : params.hasPendingChatgptAuth || params.isPollingChatgptConnection
            ? "Continue auth"
            : "Connect ChatGPT"
      }
      isChatgptDisabled={params.isConnectingChatgpt}
      onConnectChatgpt={params.onConnectChatgpt}
      onAddOpenAiKey={params.onAddOpenAiKey}
    />
  ) : null;

  return {
    emptyThreadClassName: `web-empty-thread${params.activeCommunity ? "" : " web-empty-thread-no-community"}`,
    guestSignupRail,
    emptyThreadAvatar,
    emptyThreadTitle,
    emptyThreadSubtitle,
    emptyThreadChatgptCard,
  };
}
