import { CommunityAvatar } from "../../../../shared/CommunityAvatar";

export type WebOnboardingHandoffPageProps = {
  targetName: string;
  communityAvatarUrl: string | null;
  communityAvatarFocusX: number | null;
  communityAvatarFocusY: number | null;
  communityAvatarZoom: number | null;
  status: "starting" | "failed";
  error: string | null;
  onRetry: () => void;
};

export function WebOnboardingHandoffPage(props: WebOnboardingHandoffPageProps) {
  const targetName = props.targetName.trim() || "Polynet";
  const isFailed = props.status === "failed";
  const launchTitle =
    targetName === "Polynet"
      ? "Polynet is orienting your agent"
      : `Polynet is orienting your ${targetName} lens`;
  const launchDetail =
    targetName === "Polynet" ? "Opening your workspace." : "Opening the community workspace.";
  const failedMessage = "We could not start your guide yet. Try again in a moment.";

  return (
    <div className="polynet-onboarding-handoff-page">
      <section
        className={`polynet-onboarding-launch-shell${isFailed ? " failed" : ""}`}
        aria-busy={!isFailed}
        aria-live="polite"
      >
        <div className="polynet-onboarding-launch-mark" aria-hidden="true">
          {targetName === "Polynet" ? (
            <img src="/favicon.svg" alt="" />
          ) : (
            <CommunityAvatar
              className="polynet-onboarding-launch-community-avatar"
              imageUrl={props.communityAvatarUrl}
              focusX={props.communityAvatarFocusX}
              focusY={props.communityAvatarFocusY}
              zoom={props.communityAvatarZoom}
              name={targetName}
              fallbackClassName="polynet-onboarding-launch-community-fallback"
              imageClassName="polynet-onboarding-launch-community-image"
            />
          )}
        </div>

        <div className="polynet-onboarding-launch-copy">
          <h1>{isFailed ? "Guide did not start" : launchTitle}</h1>
          <p>{isFailed ? failedMessage : launchDetail}</p>
        </div>

        <div className="polynet-onboarding-launch-action">
          {isFailed ? (
            <button type="button" onClick={props.onRetry}>
              Try again
            </button>
          ) : (
            <div className="polynet-onboarding-launch-meter" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
