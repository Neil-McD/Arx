import { CommunityAvatar } from "../../../../shared/CommunityAvatar";

export type WebOnboardingHandoffPageProps = {
  targetName: string;
  communityAvatarUrl: string | null;
  communityAvatarFocusX: number | null;
  communityAvatarFocusY: number | null;
  communityAvatarZoom: number | null;
  status: "saving" | "preparing" | "starting" | "failed";
  error: string | null;
  onRetry: () => void;
};

export function WebOnboardingHandoffPage(props: WebOnboardingHandoffPageProps) {
  const targetName = props.targetName.trim() || "Polynet";
  const isFailed = props.status === "failed";
  const launchTitle =
    targetName === "Polynet"
      ? "Your Polynet agent is getting oriented"
      : `Your agent is getting oriented to ${targetName}`;
  /* Honest ceremony phases — the detail line reflects what is actually
     happening, never an invented checklist step. */
  const launchDetail =
    props.status === "saving"
      ? "Saving your profile."
      : props.status === "preparing"
        ? "Preparing your workspace."
        : targetName === "Polynet"
          ? "Opening your workspace."
          : "Opening the community workspace.";
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
